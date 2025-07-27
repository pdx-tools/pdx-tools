use crate::{
    flavor::Vic3Flavor, melt, savefile::Vic3Save, MeltOptions, MeltedDocument, SaveHeader,
    Vic3Error, Vic3ErrorKind,
};
use jomini::{binary::TokenResolver, text::ObjectReader, TextDeserializer, TextTape, Utf8Encoding};
use rawzip::{FileReader, ReaderAt, ZipArchiveEntryWayfinder, ZipVerifier};
use serde::de::DeserializeOwned;
use std::{
    collections::HashMap,
    fs::File,
    io::{Cursor, Read, Seek, Write},
    ops::Range,
};

/// Describes the format of the save before decoding
#[derive(Debug, Clone, Copy, Eq, PartialEq)]
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
pub struct Vic3File {}

impl Vic3File {
    /// Creates a Vic3 file from a slice of data
    pub fn from_slice(data: &[u8]) -> Result<Vic3SliceFile, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        let data = &data[header.header_len()..];

        let archive = rawzip::ZipArchive::with_max_search_space(64 * 1024)
            .locate_in_slice(data)
            .map_err(|(_, e)| Vic3ErrorKind::Zip(e));

        match archive {
            Ok(archive) => {
                let archive = archive.into_reader();
                let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
                let zip = Vic3Zip::try_from_archive(archive, &mut buf, header.clone())?;
                Ok(Vic3SliceFile {
                    header,
                    kind: Vic3SliceFileKind::Zip(Box::new(zip)),
                })
            }
            _ if header.kind().is_binary() => Ok(Vic3SliceFile {
                header: header.clone(),
                kind: Vic3SliceFileKind::Binary(Vic3Binary {
                    reader: data,
                    header,
                }),
            }),
            _ => Ok(Vic3SliceFile {
                header,
                kind: Vic3SliceFileKind::Text(Vic3Text(data)),
            }),
        }
    }

    pub fn from_file(mut file: File) -> Result<Vic3FsFile<FileReader>, Vic3Error> {
        let mut buf = [0u8; SaveHeader::SIZE];
        file.read_exact(&mut buf)?;
        let header = SaveHeader::from_slice(&buf)?;
        let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];

        let archive =
            rawzip::ZipArchive::with_max_search_space(64 * 1024).locate_in_file(file, &mut buf);

        match archive {
            Ok(archive) => {
                let zip = Vic3Zip::try_from_archive(archive, &mut buf, header.clone())?;
                Ok(Vic3FsFile {
                    header,
                    kind: Vic3FsFileKind::Zip(Box::new(zip)),
                })
            }
            Err((mut file, _)) => {
                file.seek(std::io::SeekFrom::Start(SaveHeader::SIZE as u64))?;
                if header.kind().is_binary() {
                    Ok(Vic3FsFile {
                        header: header.clone(),
                        kind: Vic3FsFileKind::Binary(Vic3Binary {
                            header,
                            reader: file,
                        }),
                    })
                } else {
                    Ok(Vic3FsFile {
                        header,
                        kind: Vic3FsFileKind::Text(file),
                    })
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum Vic3SliceFileKind<'a> {
    Text(Vic3Text<'a>),
    Binary(Vic3Binary<&'a [u8]>),
    Zip(Box<Vic3Zip<&'a [u8]>>),
}

#[derive(Debug, Clone)]
pub struct Vic3SliceFile<'a> {
    header: SaveHeader,
    kind: Vic3SliceFileKind<'a>,
}

impl<'a> Vic3SliceFile<'a> {
    pub fn kind(&self) -> &Vic3SliceFileKind {
        &self.kind
    }

    pub fn kind_mut(&'a mut self) -> &'a mut Vic3SliceFileKind<'a> {
        &mut self.kind
    }

    pub fn encoding(&self) -> Encoding {
        match &self.kind {
            Vic3SliceFileKind::Text(_) => Encoding::Text,
            Vic3SliceFileKind::Binary(_) => Encoding::Binary,
            Vic3SliceFileKind::Zip(_) if self.header.kind().is_text() => Encoding::TextZip,
            Vic3SliceFileKind::Zip(_) => Encoding::BinaryZip,
        }
    }

    pub fn parse_save<R>(&self, resolver: R) -> Result<Vic3Save, Vic3Error>
    where
        R: TokenResolver,
    {
        if matches!(self.encoding(), Encoding::Binary | Encoding::BinaryZip) && resolver.is_empty()
        {
            return Err(Vic3ErrorKind::NoTokens.into());
        }

        match &self.kind {
            Vic3SliceFileKind::Text(data) => data.deserializer().deserialize(),
            Vic3SliceFileKind::Binary(data) => data.clone().deserializer(resolver).deserialize(),
            Vic3SliceFileKind::Zip(archive) => {
                let game: Vic3Save = archive.deserialize_gamestate(&resolver)?;
                Ok(game)
            }
        }
    }

    pub fn melt<Resolver, Writer>(
        &self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match &self.kind {
            Vic3SliceFileKind::Text(data) => {
                let mut new_header = self.header.clone();
                new_header.set_kind(crate::SaveHeaderKind::Text);
                new_header.write(&mut output)?;
                output.write_all(data.0)?;
                Ok(MeltedDocument::new())
            }
            Vic3SliceFileKind::Binary(data) => data.clone().melt(options, resolver, output),
            Vic3SliceFileKind::Zip(zip) => zip.melt(options, resolver, output),
        }
    }
}

pub enum Vic3FsFileKind<R> {
    Text(File),
    Binary(Vic3Binary<File>),
    Zip(Box<Vic3Zip<R>>),
}

pub struct Vic3FsFile<R> {
    header: SaveHeader,
    kind: Vic3FsFileKind<R>,
}

impl<R> Vic3FsFile<R> {
    pub fn kind(&self) -> &Vic3FsFileKind<R> {
        &self.kind
    }

    pub fn kind_mut(&mut self) -> &mut Vic3FsFileKind<R> {
        &mut self.kind
    }

    pub fn encoding(&self) -> Encoding {
        match &self.kind {
            Vic3FsFileKind::Text(_) => Encoding::Text,
            Vic3FsFileKind::Binary(_) => Encoding::Binary,
            Vic3FsFileKind::Zip(_) if self.header.kind().is_text() => Encoding::TextZip,
            Vic3FsFileKind::Zip(_) => Encoding::BinaryZip,
        }
    }
}

impl<R> Vic3FsFile<R>
where
    R: ReaderAt,
{
    pub fn parse_save<RES>(&mut self, resolver: RES) -> Result<Vic3Save, Vic3Error>
    where
        RES: TokenResolver,
    {
        if matches!(self.encoding(), Encoding::Binary | Encoding::BinaryZip) && resolver.is_empty()
        {
            return Err(Vic3ErrorKind::NoTokens.into());
        }

        match &mut self.kind {
            Vic3FsFileKind::Text(file) => {
                let reader = jomini::text::TokenReader::new(file);
                let mut deserializer = TextDeserializer::from_utf8_reader(reader);
                Ok(deserializer.deserialize()?)
            }
            Vic3FsFileKind::Binary(file) => {
                let result = file.deserializer(resolver).deserialize()?;
                Ok(result)
            }
            Vic3FsFileKind::Zip(archive) => {
                let game: Vic3Save = archive.deserialize_gamestate(resolver)?;
                Ok(game)
            }
        }
    }

    pub fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match &mut self.kind {
            Vic3FsFileKind::Text(file) => {
                let mut new_header = self.header.clone();
                new_header.set_kind(crate::SaveHeaderKind::Text);
                new_header.write(&mut output)?;
                std::io::copy(file, &mut output)?;
                Ok(MeltedDocument::new())
            }
            Vic3FsFileKind::Binary(data) => data.melt(options, resolver, output),
            Vic3FsFileKind::Zip(zip) => zip.melt(options, resolver, output),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Vic3Zip<R> {
    pub(crate) archive: rawzip::ZipArchive<R>,
    pub(crate) metadata: Vic3MetaKind,
    pub(crate) gamestate: ZipArchiveEntryWayfinder,
    pub(crate) header: SaveHeader,
}

impl<R> Vic3Zip<R>
where
    R: ReaderAt,
{
    pub fn try_from_archive(
        archive: rawzip::ZipArchive<R>,
        buf: &mut [u8],
        header: SaveHeader,
    ) -> Result<Self, Vic3Error> {
        let offset = archive.base_offset();
        let mut entries = archive.entries(buf);
        let mut gamestate = None;
        let mut metadata = None;

        while let Some(entry) = entries.next_entry().map_err(Vic3ErrorKind::Zip)? {
            match entry.file_path().as_ref() {
                b"gamestate" => gamestate = Some(entry.wayfinder()),
                b"meta" => metadata = Some(entry.wayfinder()),
                _ => {}
            };
        }

        match (gamestate, metadata) {
            (Some(gamestate), Some(metadata)) => Ok(Vic3Zip {
                archive,
                gamestate,
                metadata: Vic3MetaKind::Zip(metadata),
                header,
            }),
            (Some(gamestate), None) => Ok(Vic3Zip {
                archive,
                gamestate,
                metadata: Vic3MetaKind::Inlined(0..offset as usize),
                header,
            }),
            _ => Err(Vic3ErrorKind::ZipMissingEntry.into()),
        }
    }

    pub fn deserialize_gamestate<T, RES>(&self, resolver: RES) -> Result<T, Vic3Error>
    where
        T: DeserializeOwned,
        RES: TokenResolver,
    {
        let zip_entry = self
            .archive
            .get_entry(self.gamestate)
            .map_err(Vic3ErrorKind::Zip)?;
        let reader = CompressedFileReader::from_compressed(zip_entry.reader())?;
        let reader = zip_entry.verifying_reader(reader);
        let encoding = if self.header.kind().is_binary() {
            Encoding::Binary
        } else {
            Encoding::Text
        };
        let data: T = Vic3Modeller::from_reader(reader, &resolver, encoding).deserialize()?;
        Ok(data)
    }

    pub fn meta(&self) -> Result<Vic3Entry<'_, rawzip::ZipReader<'_, R>, R>, Vic3Error> {
        let kind = match &self.metadata {
            Vic3MetaKind::Inlined(x) => {
                let mut entry = vec![0u8; x.len()];
                self.archive
                    .get_ref()
                    .read_exact_at(&mut entry, x.start as u64)?;
                Vic3EntryKind::Inlined(Cursor::new(entry))
            }
            Vic3MetaKind::Zip(wayfinder) => {
                let zip_entry = self
                    .archive
                    .get_entry(*wayfinder)
                    .map_err(Vic3ErrorKind::Zip)?;
                let reader = CompressedFileReader::from_compressed(zip_entry.reader())?;
                let reader = zip_entry.verifying_reader(reader);
                Vic3EntryKind::Zip(reader)
            }
        };

        Ok(Vic3Entry {
            inner: kind,
            header: self.header.clone(),
        })
    }

    pub fn melt<Resolver, Writer>(
        &self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        let zip_entry = self
            .archive
            .get_entry(self.gamestate)
            .map_err(Vic3ErrorKind::Zip)?;
        let reader = CompressedFileReader::from_compressed(zip_entry.reader())?;
        let mut reader = zip_entry.verifying_reader(reader);

        if self.header.kind().is_text() {
            let mut new_header = self.header.clone();
            new_header.set_kind(crate::SaveHeaderKind::Text);
            new_header.write(&mut output)?;
            std::io::copy(&mut reader, &mut output)?;
            Ok(MeltedDocument::new())
        } else {
            melt::melt(
                &mut reader,
                &mut output,
                resolver,
                options,
                self.header.clone(),
            )
        }
    }
}

/// Describes the format of the metadata section of the save
#[derive(Debug, Clone)]
pub enum Vic3MetaKind {
    Inlined(Range<usize>),
    Zip(ZipArchiveEntryWayfinder),
}

#[derive(Debug)]
pub struct Vic3Entry<'archive, R, ReadAt> {
    inner: Vic3EntryKind<'archive, R, ReadAt>,
    header: SaveHeader,
}

#[derive(Debug)]
pub enum Vic3EntryKind<'archive, R, ReadAt> {
    Inlined(Cursor<Vec<u8>>),
    Zip(ZipVerifier<'archive, CompressedFileReader<R>, ReadAt>),
}

impl<R, ReadAt> Read for Vic3Entry<'_, R, ReadAt>
where
    R: Read,
    ReadAt: ReaderAt,
{
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match &mut self.inner {
            Vic3EntryKind::Inlined(data) => data.read(buf),
            Vic3EntryKind::Zip(reader) => reader.read(buf),
        }
    }
}

impl<'archive, R, ReadAt> Vic3Entry<'archive, R, ReadAt>
where
    R: Read,
    ReadAt: ReaderAt,
{
    pub fn deserializer<'a, RES>(
        &'a mut self,
        resolver: RES,
    ) -> Vic3Modeller<&'a mut Vic3Entry<'archive, R, ReadAt>, RES>
    where
        RES: TokenResolver,
    {
        let encoding = if self.header.kind().is_text() {
            Encoding::Text
        } else {
            Encoding::Binary
        };
        Vic3Modeller::from_reader(self, resolver, encoding)
    }

    pub fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        if self.header.kind().is_text() {
            let mut new_header = self.header.clone();
            new_header.set_kind(crate::SaveHeaderKind::Text);
            new_header.write(&mut output)?;
            std::io::copy(self, &mut output)?;
            Ok(MeltedDocument::new())
        } else {
            let header = self.header.clone();
            melt::melt(self, &mut output, resolver, options, header)
        }
    }
}

/// A parsed Vic3 text document
pub struct Vic3ParsedText<'a> {
    tape: TextTape<'a>,
}

impl<'a> Vic3ParsedText<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let header = SaveHeader::from_slice(data)?;
        Self::from_raw(&data[header.header_len()..])
    }

    pub fn from_raw(data: &'a [u8]) -> Result<Self, Vic3Error> {
        let tape = TextTape::from_slice(data).map_err(Vic3ErrorKind::Parse)?;
        Ok(Vic3ParsedText { tape })
    }

    pub fn reader(&self) -> ObjectReader<Utf8Encoding> {
        self.tape.utf8_reader()
    }
}

#[derive(Debug, Clone)]
pub struct Vic3Text<'a>(&'a [u8]);

impl Vic3Text<'_> {
    pub fn get_ref(&self) -> &[u8] {
        self.0
    }

    pub fn deserializer(&self) -> Vic3Modeller<&[u8], HashMap<u16, String>> {
        Vic3Modeller {
            reader: self.0,
            resolver: HashMap::new(),
            encoding: Encoding::Text,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Vic3Binary<R> {
    reader: R,
    header: SaveHeader,
}

impl<R> Vic3Binary<R>
where
    R: Read,
{
    pub fn get_ref(&self) -> &R {
        &self.reader
    }

    pub fn deserializer<RES>(&mut self, resolver: RES) -> Vic3Modeller<&'_ mut R, RES> {
        Vic3Modeller {
            reader: &mut self.reader,
            resolver,
            encoding: Encoding::Binary,
        }
    }

    pub fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        melt::melt(
            &mut self.reader,
            &mut output,
            resolver,
            options,
            self.header.clone(),
        )
    }
}

#[derive(Debug)]
pub struct Vic3Modeller<Reader, Resolver> {
    reader: Reader,
    resolver: Resolver,
    encoding: Encoding,
}

impl<Reader: Read, Resolver: TokenResolver> Vic3Modeller<Reader, Resolver> {
    pub fn from_reader(reader: Reader, resolver: Resolver, encoding: Encoding) -> Self {
        Vic3Modeller {
            reader,
            resolver,
            encoding,
        }
    }

    pub fn encoding(&self) -> Encoding {
        self.encoding
    }

    pub fn deserialize<T>(&mut self) -> Result<T, Vic3Error>
    where
        T: DeserializeOwned,
    {
        T::deserialize(self)
    }

    pub fn into_inner(self) -> Reader {
        self.reader
    }
}

impl<'de, 'a: 'de, Reader: Read, Resolver: TokenResolver> serde::de::Deserializer<'de>
    for &'a mut Vic3Modeller<Reader, Resolver>
{
    type Error = Vic3Error;

    fn deserialize_any<V>(self, _visitor: V) -> Result<V::Value, Self::Error>
    where
        V: serde::de::Visitor<'de>,
    {
        Err(Vic3Error::new(Vic3ErrorKind::DeserializeImpl {
            msg: String::from("only struct supported"),
        }))
    }

    fn deserialize_struct<V>(
        self,
        name: &'static str,
        fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Self::Error>
    where
        V: serde::de::Visitor<'de>,
    {
        if matches!(self.encoding, Encoding::Binary) {
            use jomini::binary::BinaryFlavor;
            let flavor = Vic3Flavor::new();
            let mut deser = flavor
                .deserializer()
                .from_reader(&mut self.reader, &self.resolver);
            Ok(deser.deserialize_struct(name, fields, visitor)?)
        } else {
            let reader = jomini::text::TokenReader::new(&mut self.reader);
            let mut deser = TextDeserializer::from_utf8_reader(reader);
            Ok(deser.deserialize_struct(name, fields, visitor)?)
        }
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map enum identifier ignored_any
    }
}

#[derive(Debug)]
pub struct CompressedFileReader<R> {
    reader: flate2::read::DeflateDecoder<R>,
}

impl<R: Read> CompressedFileReader<R> {
    pub fn from_compressed(reader: R) -> Result<Self, Vic3Error>
    where
        R: Read,
    {
        let inflater = flate2::read::DeflateDecoder::new(reader);
        Ok(CompressedFileReader { reader: inflater })
    }
}

impl<R> std::io::Read for CompressedFileReader<R>
where
    R: Read,
{
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}
