use crate::{
    flavor::Vic3Flavor, savefile::Vic3Save, SaveHeader, Vic3Error, Vic3ErrorKind, Vic3Melter,
};
use jomini::{
    binary::{FailedResolveStrategy, TokenResolver},
    text::ObjectReader,
    BinaryDeserializer, BinaryTape, TextDeserializer, TextTape, Utf8Encoding,
};
use serde::{de::DeserializeOwned, Deserialize};
use std::io::Cursor;
use zip::result::ZipError;

#[derive(Debug, Clone, Copy)]
pub enum Vic3ZipMeta<'a> {
    Raw(&'a [u8]),
    Entry(VerifiedIndex),
}

#[derive(Clone, Debug)]
pub struct Vic3Zip<'a> {
    pub archive: Vic3ZipFiles<'a>,
    pub meta: Vic3ZipMeta<'a>,
    pub gamestate: VerifiedIndex,
    pub is_text: bool,
}

pub enum FileKind<'a> {
    Text(Vic3Text<'a>),
    Binary(Vic3Binary<'a>),
    Zip(Vic3Zip<'a>),
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
                let metadata_preamble = &data[..zip.offset() as usize];
                let files = Vic3ZipFiles::new(&mut zip, data);
                let gamestate_idx = files
                    .gamestate_index()
                    .ok_or(Vic3ErrorKind::ZipMissingEntry)?;

                let meta = if !metadata_preamble.is_empty() {
                    Vic3ZipMeta::Raw(metadata_preamble)
                } else {
                    let meta_idx = files.meta_index().ok_or(Vic3ErrorKind::ZipMissingEntry)?;
                    Vic3ZipMeta::Entry(meta_idx)
                };

                let is_text = !header.kind().is_binary();
                Ok(Vic3File {
                    header,
                    kind: FileKind::Zip(Vic3Zip {
                        archive: files,
                        meta,
                        gamestate: gamestate_idx,
                        is_text,
                    }),
                })
            }
            Err(ZipError::InvalidArchive(_)) => {
                if header.kind().is_binary() {
                    Ok(Vic3File {
                        header,
                        kind: FileKind::Binary(Vic3Binary::new(data)),
                    })
                } else {
                    Ok(Vic3File {
                        header,
                        kind: FileKind::Text(Vic3Text::new(data)),
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

    pub fn kind(&self) -> &FileKind<'_> {
        &self.kind
    }

    pub fn encoding(&self) -> Encoding {
        match &self.kind {
            FileKind::Text(_) => Encoding::Text,
            FileKind::Binary(_) => Encoding::Binary,
            FileKind::Zip(Vic3Zip { is_text: true, .. }) => Encoding::TextZip,
            FileKind::Zip(Vic3Zip { is_text: false, .. }) => Encoding::BinaryZip,
        }
    }

    /// Returns the size of the file
    ///
    /// The size includes the inflated size of the zip
    pub fn size(&self) -> usize {
        match &self.kind {
            FileKind::Text(Vic3Text { data }) | FileKind::Binary(Vic3Binary { data }) => data.len(),
            FileKind::Zip(Vic3Zip { gamestate, .. }) => gamestate.size,
        }
    }

    pub fn meta(&self) -> Result<Vic3Meta<'a>, Vic3Error> {
        match &self.kind {
            FileKind::Text(x) => {
                let x = x.data;
                let len = self.header.metadata_len() as usize;
                let data = if len * 2 > x.len() {
                    x
                } else {
                    &x[..len.min(x.len())]
                };

                Ok(Vic3Meta {
                    kind: Vic3MetaKind::TextRaw(data),
                    header: self.header.clone(),
                })
            }
            FileKind::Binary(x) => {
                let x = x.data;
                let metadata = x.get(..self.header.metadata_len() as usize).unwrap_or(x);
                Ok(Vic3Meta {
                    kind: Vic3MetaKind::BinaryRaw(metadata),
                    header: self.header.clone(),
                })
            }
            FileKind::Zip(Vic3Zip {
                meta: Vic3ZipMeta::Raw(data),
                is_text: true,
                ..
            }) => Ok(Vic3Meta {
                kind: Vic3MetaKind::TextRaw(data),
                header: self.header.clone(),
            }),
            FileKind::Zip(Vic3Zip {
                archive,
                meta: Vic3ZipMeta::Entry(entry),
                is_text: true,
                ..
            }) => {
                let mut data = Vec::new();
                archive.retrieve_file(*entry).read_to_end(&mut data)?;
                Ok(Vic3Meta {
                    kind: Vic3MetaKind::TextEntry(data),
                    header: self.header.clone(),
                })
            }
            FileKind::Zip(Vic3Zip {
                meta: Vic3ZipMeta::Raw(data),
                is_text: false,
                ..
            }) => Ok(Vic3Meta {
                kind: Vic3MetaKind::BinaryRaw(data),
                header: self.header.clone(),
            }),
            FileKind::Zip(Vic3Zip {
                archive,
                meta: Vic3ZipMeta::Entry(entry),
                is_text: false,
                ..
            }) => {
                let mut data = Vec::new();
                archive.retrieve_file(*entry).read_to_end(&mut data)?;
                Ok(Vic3Meta {
                    kind: Vic3MetaKind::BinaryEntry(data),
                    header: self.header.clone(),
                })
            }
        }
    }

    /// Parses the entire file
    ///
    /// If the file is a zip, the zip contents will be inflated into the zip
    /// sink before being parsed
    pub fn parse(&self, zip_sink: &'a mut Vec<u8>) -> Result<Vic3ParsedFile<'a>, Vic3Error> {
        match &self.kind {
            FileKind::Text(x) => {
                let text = Vic3ParsedText::from_raw(x.data)?;
                Ok(Vic3ParsedFile {
                    kind: Vic3ParsedFileKind::Text(text),
                })
            }
            FileKind::Binary(x) => {
                let binary = Vic3ParsedBinary::from_raw(x.data, self.header.clone())?;
                Ok(Vic3ParsedFile {
                    kind: Vic3ParsedFileKind::Binary(binary),
                })
            }
            FileKind::Zip(Vic3Zip {
                archive,
                gamestate,
                is_text,
                ..
            }) => {
                let zip = archive.retrieve_file(*gamestate);
                zip.read_to_end(zip_sink)?;

                if *is_text {
                    let text = Vic3ParsedText::from_raw(zip_sink)?;
                    Ok(Vic3ParsedFile {
                        kind: Vic3ParsedFileKind::Text(text),
                    })
                } else {
                    let binary = Vic3ParsedBinary::from_raw(zip_sink, self.header.clone())?;
                    Ok(Vic3ParsedFile {
                        kind: Vic3ParsedFileKind::Binary(binary),
                    })
                }
            }
        }
    }

    pub fn deserialize_save<R>(&self, resolver: &R) -> Result<Vic3Save, Vic3Error>
    where
        R: TokenResolver,
    {
        match self.kind() {
            FileKind::Text(x) => x.deserialize(),
            FileKind::Binary(x) => Ok(x.deserialize::<Vic3Save, _>(resolver)?.normalize()),
            FileKind::Zip(Vic3Zip {
                archive,
                gamestate,
                is_text,
                ..
            }) => {
                let gamestate_file = archive.retrieve_file(*gamestate);
                let max_size = gamestate_file.size();

                let mut zip_sink = Vec::with_capacity(max_size);
                gamestate_file.read_to_end(&mut zip_sink)?;

                let save: Vic3Save = if *is_text {
                    Vic3Text::new(&zip_sink).deserialize()
                } else {
                    Ok(Vic3Binary::new(&zip_sink)
                        .deserialize::<Vic3Save, _>(resolver)?
                        .normalize())
                }?;

                Ok(save)
            }
        }
    }

    pub fn melter(&self) -> Vic3Melter<'a> {
        match &self.kind {
            FileKind::Text(x) => Vic3Melter::new_text(x.data, self.header.clone()),
            FileKind::Binary(x) => Vic3Melter::new_binary(x.data, self.header.clone()),
            FileKind::Zip(x) => Vic3Melter::new_zip((*x).clone(), self.header.clone()),
        }
    }
}

pub struct Vic3Meta<'a> {
    header: SaveHeader,
    kind: Vic3MetaKind<'a>,
}

pub enum Vic3MetaData<'a> {
    Text(&'a [u8]),
    Binary(&'a [u8]),
}

enum Vic3MetaKind<'a> {
    TextRaw(&'a [u8]),
    TextEntry(Vec<u8>),
    BinaryRaw(&'a [u8]),
    BinaryEntry(Vec<u8>),
}

impl<'a> Vic3Meta<'a> {
    pub fn header(&self) -> &SaveHeader {
        &self.header
    }

    pub fn kind(&self) -> Vic3MetaData {
        match &self.kind {
            Vic3MetaKind::TextRaw(x) => Vic3MetaData::Text(x),
            Vic3MetaKind::TextEntry(x) => Vic3MetaData::Text(x.as_slice()),
            Vic3MetaKind::BinaryRaw(x) => Vic3MetaData::Binary(x),
            Vic3MetaKind::BinaryEntry(x) => Vic3MetaData::Binary(x.as_slice()),
        }
    }

    pub fn parse(&self) -> Result<Vic3ParsedFile, Vic3Error> {
        match self.kind() {
            Vic3MetaData::Text(x) => Vic3ParsedText::from_raw(x).map(|kind| Vic3ParsedFile {
                kind: Vic3ParsedFileKind::Text(kind),
            }),

            Vic3MetaData::Binary(x) => {
                Vic3ParsedBinary::from_raw(x, self.header.clone()).map(|kind| Vic3ParsedFile {
                    kind: Vic3ParsedFileKind::Binary(kind),
                })
            }
        }
    }

    pub fn melter(&self) -> Vic3Melter {
        match self.kind() {
            Vic3MetaData::Text(x) => Vic3Melter::new_text(x, self.header.clone()),
            Vic3MetaData::Binary(x) => Vic3Melter::new_binary(x, self.header.clone()),
        }
    }
}

/// Contains the parsed Vic3 file
pub enum Vic3ParsedFileKind<'a> {
    /// The Vic3 file as text
    Text(Vic3ParsedText<'a>),

    /// The Vic3 file as binary
    Binary(Vic3ParsedBinary<'a>),
}

/// An Vic3 file that has been parsed
pub struct Vic3ParsedFile<'a> {
    kind: Vic3ParsedFileKind<'a>,
}

impl<'a> Vic3ParsedFile<'a> {
    /// Returns the file as text
    pub fn as_text(&self) -> Option<&Vic3ParsedText> {
        match &self.kind {
            Vic3ParsedFileKind::Text(x) => Some(x),
            _ => None,
        }
    }

    /// Returns the file as binary
    pub fn as_binary(&self) -> Option<&Vic3ParsedBinary> {
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
    pub fn deserializer<'b, RES>(&'b self, resolver: &'b RES) -> Vic3Deserializer<RES>
    where
        RES: TokenResolver,
    {
        match &self.kind {
            Vic3ParsedFileKind::Text(x) => Vic3Deserializer {
                kind: Vic3DeserializerKind::Text(x),
            },
            Vic3ParsedFileKind::Binary(x) => Vic3Deserializer {
                kind: Vic3DeserializerKind::Binary(x.deserializer(resolver)),
            },
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct VerifiedIndex {
    data_start: usize,
    data_end: usize,
    pub size: usize,
}

#[derive(Debug, Clone)]
pub struct Vic3ZipFiles<'a> {
    archive: &'a [u8],
    gamestate_index: Option<VerifiedIndex>,
    meta_index: Option<VerifiedIndex>,
}

impl<'a> Vic3ZipFiles<'a> {
    pub fn new(archive: &mut zip::ZipArchive<Cursor<&'a [u8]>>, data: &'a [u8]) -> Self {
        let mut gamestate_index = None;
        let mut meta_index = None;

        for index in 0..archive.len() {
            if let Ok(file) = archive.by_index_raw(index) {
                let size = file.size() as usize;
                let data_start = file.data_start() as usize;
                let data_end = data_start + file.compressed_size() as usize;
                let index = VerifiedIndex {
                    data_start,
                    data_end,
                    size,
                };

                if file.name() == "gamestate" {
                    gamestate_index = Some(index);
                } else if file.name() == "meta" {
                    meta_index = Some(index);
                }
            }
        }

        Self {
            archive: data,
            gamestate_index,
            meta_index,
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

    pub fn meta_index(&self) -> Option<VerifiedIndex> {
        self.meta_index
    }
}

pub struct Vic3ZipFile<'a> {
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

    pub fn reader(&self) -> crate::deflate::DeflateReader<'a> {
        crate::deflate::DeflateReader::new(self.raw, crate::deflate::CompressionMethod::Deflate)
    }

    pub fn size(&self) -> usize {
        self.size
    }
}

pub struct Vic3Text<'a> {
    data: &'a [u8],
}

impl<'a> Vic3Text<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Vic3Text { data }
    }

    pub fn deserialize<T>(&self) -> Result<T, Vic3Error>
    where
        T: DeserializeOwned,
    {
        let reader = jomini::text::TokenReader::new(self.data);
        let mut deser = jomini::text::de::TextDeserializer::from_utf8_reader(reader);
        let result = serde_path_to_error::deserialize(&mut deser)
            .map_err(|e| Vic3ErrorKind::DeserializeDebug(e.to_string()))?;
        Ok(result)
    }
}

/// A parsed Vic3 text document
pub struct Vic3ParsedText<'a> {
    tape: TextTape<'a>,
}

impl<'a> Vic3ParsedText<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        Self::from_raw(&data[..header.header_len()])
    }

    pub(crate) fn from_raw(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let tape = TextTape::from_slice(data).map_err(Vic3ErrorKind::Parse)?;
        Ok(Vic3ParsedText { tape })
    }

    pub fn reader(&self) -> ObjectReader<Utf8Encoding> {
        self.tape.utf8_reader()
    }

    pub fn deserialize<T>(&self) -> Result<T, Vic3Error>
    where
        T: Deserialize<'a>,
    {
        let deser = TextDeserializer::from_utf8_tape(&self.tape);
        let result = deser.deserialize().map_err(Vic3ErrorKind::Deserialize)?;
        Ok(result)
    }
}

pub struct Vic3Binary<'a> {
    data: &'a [u8],
}

impl<'a> Vic3Binary<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Vic3Binary { data }
    }

    pub fn deserialize<T, R>(&self, resolver: &R) -> Result<T, Vic3Error>
    where
        R: TokenResolver,
        T: DeserializeOwned,
    {
        let mut deser = jomini::binary::de::BinaryDeserializer::builder_flavor(Vic3Flavor::new())
            .from_slice(self.data, resolver);
        let result = serde_path_to_error::deserialize(&mut deser)
            .map_err(|e| Vic3ErrorKind::DeserializeDebug(e.to_string()))?;
        Ok(result)
    }
}

/// A parsed Vic3 binary document
pub struct Vic3ParsedBinary<'data> {
    tape: BinaryTape<'data>,
    #[allow(dead_code)]
    header: SaveHeader,
}

impl<'data> Vic3ParsedBinary<'data> {
    pub fn from_slice(data: &'data [u8]) -> Result<Self, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        Self::from_raw(&data[..header.header_len()], header)
    }

    pub(crate) fn from_raw(data: &'data [u8], header: SaveHeader) -> Result<Self, Vic3Error> {
        let tape = BinaryTape::from_slice(data).map_err(Vic3ErrorKind::Parse)?;
        Ok(Vic3ParsedBinary { tape, header })
    }

    pub fn deserializer<'b, RES>(
        &'b self,
        resolver: &'b RES,
    ) -> Vic3BinaryDeserializer<'data, 'b, RES>
    where
        RES: TokenResolver,
    {
        Vic3BinaryDeserializer {
            deser: BinaryDeserializer::builder_flavor(Vic3Flavor::new())
                .from_tape(&self.tape, resolver),
        }
    }
}

enum Vic3DeserializerKind<'data, 'tape, RES> {
    Text(&'tape Vic3ParsedText<'data>),
    Binary(Vic3BinaryDeserializer<'data, 'tape, RES>),
}

/// A deserializer for custom structures
pub struct Vic3Deserializer<'data, 'tape, RES> {
    kind: Vic3DeserializerKind<'data, 'tape, RES>,
}

impl<'data, 'tape, RES> Vic3Deserializer<'data, 'tape, RES>
where
    RES: TokenResolver,
{
    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        if let Vic3DeserializerKind::Binary(x) = &mut self.kind {
            x.on_failed_resolve(strategy);
        }
        self
    }

    pub fn deserialize<T>(&self) -> Result<T, Vic3Error>
    where
        T: Deserialize<'data>,
    {
        match &self.kind {
            Vic3DeserializerKind::Text(x) => x.deserialize(),
            Vic3DeserializerKind::Binary(x) => x.deserialize(),
        }
    }
}

/// Deserializes binary data into custom structures
pub struct Vic3BinaryDeserializer<'data, 'tape, RES> {
    deser: BinaryDeserializer<'tape, 'data, 'tape, RES, Vic3Flavor>,
}

impl<'data, 'tape, RES> Vic3BinaryDeserializer<'data, 'tape, RES>
where
    RES: TokenResolver,
{
    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        self.deser.on_failed_resolve(strategy);
        self
    }

    pub fn deserialize<T>(&self) -> Result<T, Vic3Error>
    where
        T: Deserialize<'data>,
    {
        let result = self.deser.deserialize().map_err(|e| match e.kind() {
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
