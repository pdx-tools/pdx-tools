use crate::{flavor::Vic3Flavor, SaveHeader, Vic3Error, Vic3ErrorKind, Vic3Melter};
use jomini::{
    binary::{BinaryDeserializerBuilder, FailedResolveStrategy, TokenResolver},
    text::ObjectReader,
    BinaryDeserializer, BinaryTape, TextDeserializer, TextTape, Utf8Encoding,
};
use serde::Deserialize;
use std::io::Cursor;
use zip::result::ZipError;

enum FileKind<'a> {
    Text(&'a [u8]),
    Binary(&'a [u8]),
    Zip {
        archive: Vic3ZipFiles<'a>,
        gamestate: VerifiedIndex,
        is_text: bool,
    },
}

/// The encoding of a save file
pub enum Encoding {
    /// plaintext
    Text,

    /// plain binary
    Binary,

    /// text that requires decompression
    TextZip,

    /// binary that requires decompression
    BinaryZip,
}

/// Entrypoint for parsing Vic3 saves
///
/// Only consumes enough data to determine encoding of the file
pub struct Vic3File<'a> {
    header: SaveHeader,
    kind: FileKind<'a>,
}

impl<'a> Vic3File<'a> {
    /// Creates a Vic3 file from a slice of data
    pub fn from_slice(data: &[u8]) -> Result<Vic3File, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        let data = &data[header.header_len()..];

        let reader = Cursor::new(data);
        match zip::ZipArchive::new(reader) {
            Ok(mut zip) => {
                let files = Vic3ZipFiles::new(&mut zip, data);
                let gamestate_idx = files
                    .gamestate_index()
                    .ok_or(Vic3ErrorKind::ZipMissingEntry)?;

                let is_text = !header.kind().is_binary();
                Ok(Vic3File {
                    header,
                    kind: FileKind::Zip {
                        archive: files,
                        gamestate: gamestate_idx,
                        is_text,
                    },
                })
            }
            Err(ZipError::InvalidArchive(_)) => {
                if header.kind().is_binary() {
                    Ok(Vic3File {
                        header,
                        kind: FileKind::Binary(data),
                    })
                } else {
                    Ok(Vic3File {
                        header,
                        kind: FileKind::Text(data),
                    })
                }
            }
            Err(e) => Err(Vic3ErrorKind::ZipArchive(e).into()),
        }
    }

    /// Return first line header
    pub fn header(&self) -> &SaveHeader {
        &self.header
    }

    pub fn encoding(&self) -> Encoding {
        match &self.kind {
            FileKind::Text(_) => Encoding::Text,
            FileKind::Binary(_) => Encoding::Binary,
            FileKind::Zip { is_text: true, .. } => Encoding::TextZip,
            FileKind::Zip { is_text: false, .. } => Encoding::BinaryZip,
        }
    }

    /// Returns the size of the file
    ///
    /// The size includes the inflated size of the zip
    pub fn size(&self) -> usize {
        match &self.kind {
            FileKind::Text(x) | FileKind::Binary(x) => x.len(),
            FileKind::Zip { gamestate, .. } => gamestate.size,
        }
    }

    /// Parses the entire file
    ///
    /// If the file is a zip, the zip contents will be inflated into the zip
    /// sink before being parsed
    pub fn parse(&self, zip_sink: &'a mut Vec<u8>) -> Result<Vic3ParsedFile<'a>, Vic3Error> {
        match &self.kind {
            FileKind::Text(x) => {
                let text = Vic3Text::from_raw(x)?;
                Ok(Vic3ParsedFile {
                    kind: Vic3ParsedFileKind::Text(text),
                })
            }
            FileKind::Binary(x) => {
                let binary = Vic3Binary::from_raw(x, self.header.clone())?;
                Ok(Vic3ParsedFile {
                    kind: Vic3ParsedFileKind::Binary(binary),
                })
            }
            FileKind::Zip {
                archive,
                gamestate,
                is_text,
                ..
            } => {
                let zip = archive.retrieve_file(*gamestate);
                zip.read_to_end(zip_sink)?;

                if *is_text {
                    let text = Vic3Text::from_raw(zip_sink)?;
                    Ok(Vic3ParsedFile {
                        kind: Vic3ParsedFileKind::Text(text),
                    })
                } else {
                    let binary = Vic3Binary::from_raw(zip_sink, self.header.clone())?;
                    Ok(Vic3ParsedFile {
                        kind: Vic3ParsedFileKind::Binary(binary),
                    })
                }
            }
        }
    }
}

/// Contains the parsed Vic3 file
pub enum Vic3ParsedFileKind<'a> {
    /// The Vic3 file as text
    Text(Vic3Text<'a>),

    /// The Vic3 file as binary
    Binary(Vic3Binary<'a>),
}

/// An Vic3 file that has been parsed
pub struct Vic3ParsedFile<'a> {
    kind: Vic3ParsedFileKind<'a>,
}

impl<'a> Vic3ParsedFile<'a> {
    /// Returns the file as text
    pub fn as_text(&self) -> Option<&Vic3Text> {
        match &self.kind {
            Vic3ParsedFileKind::Text(x) => Some(x),
            _ => None,
        }
    }

    /// Returns the file as binary
    pub fn as_binary(&self) -> Option<&Vic3Binary> {
        match &self.kind {
            Vic3ParsedFileKind::Binary(x) => Some(x),
            _ => None,
        }
    }

    /// Returns the kind of file (binary or text)
    pub fn kind(&self) -> &Vic3ParsedFileKind {
        &self.kind
    }

    /// Prepares the file for deserialization into a custom structure
    pub fn deserializer(&self) -> Vic3Deserializer {
        match &self.kind {
            Vic3ParsedFileKind::Text(x) => Vic3Deserializer {
                kind: Vic3DeserializerKind::Text(x),
            },
            Vic3ParsedFileKind::Binary(x) => Vic3Deserializer {
                kind: Vic3DeserializerKind::Binary(x.deserializer()),
            },
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct VerifiedIndex {
    data_start: usize,
    data_end: usize,
    size: usize,
}

#[derive(Debug, Clone)]
struct Vic3ZipFiles<'a> {
    archive: &'a [u8],
    gamestate_index: Option<VerifiedIndex>,
}

impl<'a> Vic3ZipFiles<'a> {
    pub fn new(archive: &mut zip::ZipArchive<Cursor<&'a [u8]>>, data: &'a [u8]) -> Self {
        let mut gamestate_index = None;

        for index in 0..archive.len() {
            if let Ok(file) = archive.by_index_raw(index) {
                let size = file.size() as usize;
                let data_start = file.data_start() as usize;
                let data_end = data_start + file.compressed_size() as usize;

                if file.name() == "gamestate" {
                    gamestate_index = Some(VerifiedIndex {
                        data_start,
                        data_end,
                        size,
                    })
                }
            }
        }

        Self {
            archive: data,
            gamestate_index,
        }
    }

    pub fn retrieve_file(&self, index: VerifiedIndex) -> Vic3ZipFile {
        let raw = &self.archive[index.data_start..index.data_end];
        Vic3ZipFile {
            raw,
            size: index.size,
        }
    }

    pub fn gamestate_index(&self) -> Option<VerifiedIndex> {
        self.gamestate_index
    }
}

struct Vic3ZipFile<'a> {
    raw: &'a [u8],
    size: usize,
}

impl<'a> Vic3ZipFile<'a> {
    pub fn read_to_end(&self, buf: &mut Vec<u8>) -> Result<(), Vic3Error> {
        let start_len = buf.len();
        buf.resize(start_len + self.size(), 0);
        let body = &mut buf[start_len..];
        crate::deflate::inflate_exact(self.raw, body).map_err(Vic3ErrorKind::from)?;
        Ok(())
    }

    pub fn size(&self) -> usize {
        self.size
    }
}

/// A parsed Vic3 text document
pub struct Vic3Text<'a> {
    tape: TextTape<'a>,
}

impl<'a> Vic3Text<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        Self::from_raw(&data[..header.header_len()])
    }

    pub(crate) fn from_raw(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let tape = TextTape::from_slice(data).map_err(Vic3ErrorKind::Parse)?;
        Ok(Vic3Text { tape })
    }

    pub fn reader(&self) -> ObjectReader<Utf8Encoding> {
        self.tape.utf8_reader()
    }

    pub fn deserialize<T>(&self) -> Result<T, Vic3Error>
    where
        T: Deserialize<'a>,
    {
        let result =
            TextDeserializer::from_utf8_tape(&self.tape).map_err(Vic3ErrorKind::Deserialize)?;
        Ok(result)
    }
}

/// A parsed Vic3 binary document
pub struct Vic3Binary<'a> {
    tape: BinaryTape<'a>,
    header: SaveHeader,
}

impl<'a> Vic3Binary<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        Self::from_raw(&data[..header.header_len()], header)
    }

    pub(crate) fn from_raw(data: &'a [u8], header: SaveHeader) -> Result<Self, Vic3Error> {
        let tape = BinaryTape::from_slice(data).map_err(Vic3ErrorKind::Parse)?;
        Ok(Vic3Binary { tape, header })
    }

    pub fn deserializer<'b>(&'b self) -> Vic3BinaryDeserializer<'a, 'b> {
        Vic3BinaryDeserializer {
            builder: BinaryDeserializer::builder_flavor(Vic3Flavor::new()),
            tape: &self.tape,
        }
    }

    pub fn melter<'b>(&'b self) -> Vic3Melter<'a, 'b> {
        Vic3Melter::new(&self.tape, &self.header)
    }
}

enum Vic3DeserializerKind<'a, 'b> {
    Text(&'b Vic3Text<'a>),
    Binary(Vic3BinaryDeserializer<'a, 'b>),
}

/// A deserializer for custom structures
pub struct Vic3Deserializer<'a, 'b> {
    kind: Vic3DeserializerKind<'a, 'b>,
}

impl<'a, 'b> Vic3Deserializer<'a, 'b> {
    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        if let Vic3DeserializerKind::Binary(x) = &mut self.kind {
            x.on_failed_resolve(strategy);
        }
        self
    }

    pub fn build<T, R>(&self, resolver: &'a R) -> Result<T, Vic3Error>
    where
        R: TokenResolver,
        T: Deserialize<'a>,
    {
        match &self.kind {
            Vic3DeserializerKind::Text(x) => x.deserialize(),
            Vic3DeserializerKind::Binary(x) => x.build(resolver),
        }
    }
}

/// Deserializes binary data into custom structures
pub struct Vic3BinaryDeserializer<'a, 'b> {
    builder: BinaryDeserializerBuilder<Vic3Flavor>,
    tape: &'b BinaryTape<'a>,
}

impl<'a, 'b> Vic3BinaryDeserializer<'a, 'b> {
    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        self.builder.on_failed_resolve(strategy);
        self
    }

    pub fn build<T, R>(&self, resolver: &'a R) -> Result<T, Vic3Error>
    where
        R: TokenResolver,
        T: Deserialize<'a>,
    {
        let result = self
            .builder
            .from_tape(self.tape, resolver)
            .map_err(|e| match e.kind() {
                jomini::ErrorKind::Deserialize(e2) => match e2.kind() {
                    &jomini::DeserializeErrorKind::UnknownToken { token_id } => {
                        Vic3ErrorKind::UnknownToken { token_id }
                    }
                    _ => Vic3ErrorKind::Deserialize(e),
                },
                _ => Vic3ErrorKind::Deserialize(e),
            })?;
        Ok(result)
    }
}
