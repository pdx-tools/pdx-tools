use crate::{Eu5Error, Eu5ErrorKind, MeltOptions, SaveHeader, melt};
use jomini::{
    Encoding, TextDeserializer, Utf8Encoding,
    binary::{
        BinaryDeserializerBuilder, BinaryFlavor, TokenResolver, de::BinaryReaderDeserializer,
    },
    text::de::TextReaderDeserializer,
};
use rawzip::{FileReader, RangeReader, ReaderAt, ZipArchiveEntryWayfinder};
use std::{
    fs::File,
    io::{Read, Write},
    ops::Range,
};

/// Entrypoint for parsing Eu5 saves
#[derive(Debug, Clone)]
pub struct Eu5File<R> {
    kind: Eu5FileKind<R>,
}

impl Eu5File<()> {
    /// Creates a Eu5 file from a slice of data
    pub fn from_slice(data: &[u8]) -> Result<Eu5File<&'_ [u8]>, Eu5Error> {
        let header = SaveHeader::from_slice(data)?;

        let archive = rawzip::ZipArchive::with_max_search_space(64 * 1024)
            .locate_in_slice(data)
            .map_err(|(_, e)| Eu5ErrorKind::Zip(e));

        let header_len = header.header_len() as u64;
        match archive {
            Ok(archive) => {
                let archive = archive.into_reader();
                let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
                let zip = Eu5Zip::try_from_archive(archive, &mut buf, header.clone())?;
                Ok(Eu5File {
                    kind: Eu5FileKind::Zip(zip),
                })
            }
            _ if header.kind().is_binary() => Ok(Eu5File {
                kind: Eu5FileKind::Uncompressed(SaveDataKind::Binary(SaveData::new(
                    header,
                    SaveBody::with_offset(data, header_len),
                ))),
            }),
            _ => Ok(Eu5File {
                kind: Eu5FileKind::Uncompressed(SaveDataKind::Text(SaveData::new(
                    header,
                    SaveBody::with_offset(data, header_len),
                ))),
            }),
        }
    }

    pub fn from_file(mut file: File) -> Result<Eu5File<FileReader>, Eu5Error> {
        let mut buf = [0u8; SaveHeader::SIZE];
        file.read_exact(&mut buf)?;
        let header = SaveHeader::from_slice(&buf)?;
        let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];

        let archive =
            rawzip::ZipArchive::with_max_search_space(64 * 1024).locate_in_file(file, &mut buf);

        match archive {
            Ok(archive) => {
                let zip = Eu5Zip::try_from_archive(archive, &mut buf, header.clone())?;
                Ok(Eu5File {
                    kind: Eu5FileKind::Zip(zip),
                })
            }
            Err((file, _)) => {
                let reader = FileReader::from(file);
                if header.kind().is_binary() {
                    let body = SaveBody::with_offset(reader, header.header_len() as u64);
                    Ok(Eu5File {
                        kind: Eu5FileKind::Uncompressed(SaveDataKind::Binary(SaveData::new(
                            header, body,
                        ))),
                    })
                } else {
                    let body = SaveBody::with_offset(reader, header.header_len() as u64);
                    Ok(Eu5File {
                        kind: Eu5FileKind::Uncompressed(SaveDataKind::Text(SaveData::new(
                            header, body,
                        ))),
                    })
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
pub enum Eu5FileKind<R> {
    Uncompressed(SaveDataKind<R>),
    Zip(Eu5Zip<R>),
}

impl<R> Eu5File<R> {
    pub fn kind(&self) -> &Eu5FileKind<R> {
        &self.kind
    }

    pub fn kind_mut(&mut self) -> &mut Eu5FileKind<R> {
        &mut self.kind
    }

    pub fn header(&self) -> &SaveHeader {
        match self.kind() {
            Eu5FileKind::Zip(archive) => archive.header(),
            Eu5FileKind::Uncompressed(x) => x.header(),
        }
    }
}

impl<R: ReaderAt> Eu5File<R> {
    pub fn gamestate(&self) -> Result<SaveBodyKind<Box<dyn Read + '_>>, Eu5Error> {
        match self.kind() {
            Eu5FileKind::Zip(archive) => {
                let gamestate = archive.gamestate()?;
                match gamestate {
                    SaveBodyKind::Text(body) => {
                        let reader = body.into_inner();
                        Ok(SaveBodyKind::Text(SaveBody::new(
                            Box::new(reader) as Box<dyn Read>
                        )))
                    }
                    SaveBodyKind::Binary(x) => {
                        let reader = x.into_inner();
                        Ok(SaveBodyKind::Binary(SaveBody::new(
                            Box::new(reader) as Box<dyn Read>
                        )))
                    }
                }
            }
            Eu5FileKind::Uncompressed(SaveDataKind::Text(x)) => Ok(SaveBodyKind::Text(
                SaveBody::new(Box::new(x.body().cursor()) as Box<dyn Read>),
            )),
            Eu5FileKind::Uncompressed(SaveDataKind::Binary(x)) => Ok(SaveBodyKind::Binary(
                SaveBody::new(Box::new(x.body().cursor()) as Box<dyn Read>),
            )),
        }
    }

    pub fn meta(&self) -> Eu5MetaKind<RangeReader<&R>> {
        match self.kind() {
            Eu5FileKind::Zip(archive) => archive.meta(),
            Eu5FileKind::Uncompressed(x) => x.meta(),
        }
    }
}

impl<R: ReaderAt> Eu5File<R> {
    pub fn melt<Resolver, Writer>(
        &self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self.kind() {
            Eu5FileKind::Zip(archive) => archive.melt(options, resolver, &mut output),
            Eu5FileKind::Uncompressed(SaveDataKind::Text(x)) => x.melt(&mut output),
            Eu5FileKind::Uncompressed(SaveDataKind::Binary(x)) => {
                x.melt(options, resolver, &mut output)
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct Eu5Zip<R> {
    pub(crate) archive: rawzip::ZipArchive<R>,
    pub(crate) metadata: Range<usize>,
    pub(crate) gamestate: ZipArchiveEntryWayfinder,
    pub(crate) header: SaveHeader,
}

impl<R> Eu5Zip<R> {
    pub fn header(&self) -> &SaveHeader {
        &self.header
    }

    pub fn gamestate_uncompressed_hint(&self) -> u64 {
        self.gamestate.uncompressed_size_hint()
    }
}

impl<R> Eu5Zip<R>
where
    R: ReaderAt,
{
    pub fn try_from_archive(
        archive: rawzip::ZipArchive<R>,
        buf: &mut [u8],
        header: SaveHeader,
    ) -> Result<Self, Eu5Error> {
        let mut offset = archive.directory_offset();
        // let offset = archive.base_offset();
        let mut entries = archive.entries(buf);
        let mut gamestate = None;

        while let Some(entry) = entries.next_entry().map_err(Eu5ErrorKind::Zip)? {
            offset = offset.min(entry.local_header_offset());
            if entry.file_path().as_ref() == b"gamestate" {
                gamestate = Some(entry.wayfinder());
                break;
            };
        }

        match gamestate {
            Some(gamestate) => Ok(Eu5Zip {
                archive,
                metadata: SaveHeader::SIZE..offset as usize,
                gamestate,
                header,
            }),
            None => Err(Eu5ErrorKind::ZipMissingEntry.into()),
        }
    }

    pub fn melt<Resolver, Writer>(
        &self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self.gamestate()? {
            SaveBodyKind::Text(mut save_body) => {
                let mut new_header = self.header.clone();
                new_header.set_kind(crate::SaveHeaderKind::Text);
                new_header.write(&mut output)?;
                std::io::copy(&mut save_body, &mut output)?;
                Ok(melt::MeltedDocument::new())
            }
            SaveBodyKind::Binary(mut save_body) => melt::melt(
                &mut save_body,
                &mut output,
                resolver,
                options,
                self.header.clone(),
            ),
        }
    }

    pub fn meta(&self) -> Eu5MetaKind<RangeReader<&R>> {
        let archive_ref = self.archive.get_ref();
        let meta_reader = RangeReader::new(
            archive_ref,
            self.metadata.start as u64..self.metadata.end as u64,
        );
        if self.header.kind().is_text() {
            Eu5MetaKind::Text(Eu5Meta::new(meta_reader, self.header.clone()))
        } else {
            Eu5MetaKind::Binary(Eu5Meta::new(meta_reader, self.header.clone()))
        }
    }

    pub fn gamestate(&self) -> Result<SaveBodyKind<ZipEntry<&R>>, Eu5Error> {
        let zip_entry = self
            .archive
            .get_entry(self.gamestate)
            .map_err(Eu5ErrorKind::Zip)?;
        let reader = CompressedFileReader::from_compressed(zip_entry.reader())?;
        if self.header.kind().is_text() {
            Ok(SaveBodyKind::Text(SaveBody::new(ZipEntry { reader })))
        } else {
            Ok(SaveBodyKind::Binary(SaveBody::new(ZipEntry { reader })))
        }
    }
}

#[derive(Debug, Clone)]
pub struct TextEncoding;

#[derive(Debug, Clone)]
pub struct BinaryEncoding;

// `SaveData` is composed of a save header with a body
#[derive(Debug, Clone)]
pub struct SaveData<E, R> {
    header: SaveHeader,
    body: SaveBody<E, R>,
}

impl<E, R> SaveData<E, R> {
    fn new(header: SaveHeader, body: SaveBody<E, R>) -> Self {
        SaveData { header, body }
    }

    pub fn header(&self) -> &SaveHeader {
        &self.header
    }

    pub fn body(&self) -> &SaveBody<E, R> {
        &self.body
    }

    pub fn body_mut(&mut self) -> &mut SaveBody<E, R> {
        &mut self.body
    }
}

impl<E, R: ReaderAt> SaveData<E, R> {
    pub fn meta(&self) -> SaveBody<E, RangeReader<&R>> {
        let meta_reader = RangeReader::new(
            self.body.get_ref(),
            SaveHeader::SIZE as u64..SaveHeader::SIZE as u64 + self.header.metadata_len(),
        );

        SaveBody::new(meta_reader)
    }
}

impl<R: ReaderAt> SaveData<BinaryEncoding, R> {
    pub fn melt<Resolver, Writer>(
        &self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        melt::melt(
            &mut self.body().cursor(),
            &mut output,
            resolver,
            options,
            self.header.clone(),
        )
    }
}

impl<R: ReaderAt> SaveData<BinaryEncoding, R> {
    pub fn deserializer<'res, RES: TokenResolver>(
        &self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, impl Read + '_> {
        binary_deserializer(resolver, self.body.cursor())
    }
}

impl<R: ReaderAt> SaveData<TextEncoding, R> {
    pub fn melt<Writer>(&self, mut output: Writer) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Writer: Write,
    {
        let mut new_header = self.header.clone();
        new_header.set_kind(crate::SaveHeaderKind::Text);
        new_header.write(&mut output)?;
        std::io::copy(&mut self.body().cursor(), &mut output)?;
        Ok(melt::MeltedDocument::new())
    }
}

impl<R: ReaderAt> SaveData<TextEncoding, R> {
    pub fn deserializer(&self) -> Eu5TextDeserializer<impl Read + '_> {
        text_deserializer(self.body.cursor())
    }
}

#[derive(Debug, Clone)]
pub enum SaveDataKind<R> {
    Text(SaveData<TextEncoding, R>),
    Binary(SaveData<BinaryEncoding, R>),
}

impl<R> SaveDataKind<R> {
    pub fn header(&self) -> &SaveHeader {
        match self {
            SaveDataKind::Text(data) => data.header(),
            SaveDataKind::Binary(data) => data.header(),
        }
    }

    pub fn as_ref(&self) -> SaveDataKind<&R> {
        match self {
            SaveDataKind::Text(data) => {
                SaveDataKind::Text(SaveData::new(data.header().clone(), data.body().as_ref()))
            }
            SaveDataKind::Binary(data) => {
                SaveDataKind::Binary(SaveData::new(data.header().clone(), data.body().as_ref()))
            }
        }
    }
}

/// Result of extracting metadata - encoded variant tells us the encoding type
pub enum Eu5MetaKind<R> {
    Text(Eu5Meta<TextEncoding, R>),
    Binary(Eu5Meta<BinaryEncoding, R>),
}

impl<R: ReaderAt> SaveDataKind<R> {
    pub fn meta(&self) -> Eu5MetaKind<RangeReader<&R>> {
        let header = self.header().clone();

        // Get the body base offset and reader
        let (body_offset, reader) = match self {
            SaveDataKind::Text(data) => (data.body.base_offset(), data.body.get_ref()),
            SaveDataKind::Binary(data) => (data.body.base_offset(), data.body.get_ref()),
        };

        // Metadata starts right after the header, accounting for the body offset
        let metadata_range = body_offset..body_offset + header.metadata_len();

        let meta_reader = RangeReader::new(reader, metadata_range.clone());

        if header.kind().is_text() {
            Eu5MetaKind::Text(Eu5Meta::new(meta_reader, header))
        } else {
            Eu5MetaKind::Binary(Eu5Meta::new(meta_reader, header))
        }
    }

    pub fn gamestate(&self) -> SaveBodyKind<&R> {
        match self {
            SaveDataKind::Text(data) => SaveBodyKind::Text(data.body.as_ref()),
            SaveDataKind::Binary(data) => SaveBodyKind::Binary(data.body.as_ref()),
        }
    }
}

/// Metadata (header + body)
#[derive(Debug, Clone)]
pub struct Eu5Meta<E, R> {
    reader: R,
    header: SaveHeader,
    _encoding: std::marker::PhantomData<E>,
}

impl<E, R> Eu5Meta<E, R> {
    pub fn new(reader: R, header: SaveHeader) -> Self {
        Eu5Meta {
            reader,
            header,
            _encoding: std::marker::PhantomData,
        }
    }

    pub fn header(&self) -> &SaveHeader {
        &self.header
    }
}

impl<R: Read> Read for Eu5Meta<TextEncoding, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}

impl<R: Read> Read for Eu5Meta<BinaryEncoding, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}

impl<R: Read> Eu5Meta<TextEncoding, R> {
    pub fn melt<Writer>(&mut self, mut output: Writer) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Writer: Write,
    {
        let mut new_header = self.header.clone();
        new_header.set_kind(crate::SaveHeaderKind::Text);
        new_header.write(&mut output)?;
        std::io::copy(&mut self.reader, &mut output)?;
        Ok(melt::MeltedDocument::new())
    }

    pub fn deserializer(&mut self) -> Eu5TextDeserializer<&mut R> {
        text_deserializer(&mut self.reader)
    }
}

impl<R: Read> Eu5Meta<BinaryEncoding, R> {
    pub fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        melt::melt(
            &mut self.reader,
            output,
            resolver,
            options,
            self.header.clone(),
        )
    }
}

impl<R: Read> Eu5Meta<BinaryEncoding, R> {
    pub fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, &mut R> {
        binary_deserializer(resolver, &mut self.reader)
    }
}

#[derive(Debug, Clone)]
pub enum SaveBodyKind<R> {
    Text(SaveBody<TextEncoding, R>),
    Binary(SaveBody<BinaryEncoding, R>),
}

impl<R: Read> Read for SaveBodyKind<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            SaveBodyKind::Text(body) => body.read(buf),
            SaveBodyKind::Binary(body) => body.read(buf),
        }
    }
}

/// Save body with an encoding (no header).
#[derive(Debug, Clone)]
pub struct SaveBody<E, R> {
    reader: R,
    base_offset: u64,
    encoding: std::marker::PhantomData<E>,
}

impl<R> SaveBody<(), R> {
    pub fn new<E>(reader: R) -> SaveBody<E, R> {
        SaveBody {
            reader,
            base_offset: 0,
            encoding: std::marker::PhantomData,
        }
    }

    pub fn with_offset<E>(reader: R, base_offset: u64) -> SaveBody<E, R> {
        SaveBody {
            reader,
            base_offset,
            encoding: std::marker::PhantomData,
        }
    }
}

impl<R, E> SaveBody<E, R> {
    pub fn get_ref(&self) -> &R {
        &self.reader
    }

    fn into_inner(self) -> R {
        self.reader
    }

    pub fn as_ref(&self) -> SaveBody<E, &R> {
        SaveBody::with_offset(&self.reader, self.base_offset)
    }

    pub fn as_mut(&mut self) -> SaveBody<E, &mut R> {
        SaveBody::with_offset(&mut self.reader, self.base_offset)
    }

    pub fn base_offset(&self) -> u64 {
        self.base_offset
    }
}

impl<E, R: ReaderAt> SaveBody<E, R> {
    pub fn cursor(&self) -> ReaderAtCursor<'_, R> {
        ReaderAtCursor::new_at(&self.reader, self.base_offset)
    }
}

impl<R: Read, E> Read for SaveBody<E, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}

impl<R: Read> SaveBody<TextEncoding, R> {
    pub fn deserializer(&mut self) -> Eu5TextDeserializer<&mut R> {
        text_deserializer(&mut self.reader)
    }
}

impl<R: Read> SaveBody<BinaryEncoding, R> {
    pub fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, &mut R> {
        binary_deserializer(resolver, &mut self.reader)
    }
}

/// Wrapper around decompressed zip gamestate that implements Read and provides deserializer
#[derive(Debug)]
pub struct ZipEntry<R> {
    reader: CompressedFileReader<rawzip::ZipReader<R>>,
}

impl<R: ReaderAt> Read for ZipEntry<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.reader.read(buf)
    }
}

/// Wrapper that adapts ReaderAt to the Read trait
pub struct ReaderAtCursor<'a, R> {
    reader: &'a R,
    position: u64,
}

impl<'a, R: ReaderAt> ReaderAtCursor<'a, R> {
    fn new_at(reader: &'a R, position: u64) -> Self {
        ReaderAtCursor { reader, position }
    }
}

impl<'a, R: ReaderAt> Read for ReaderAtCursor<'a, R> {
    #[inline]
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let pos = self.position;
        let n = self.reader.read_at(buf, pos)?;
        self.position += n as u64;
        Ok(n)
    }
}

/// Type alias for Eu5 text deserializer
///
/// A lazy way to avoid the need to reimplement deserializer
pub type Eu5TextDeserializer<R> = TextReaderDeserializer<R, Utf8Encoding>;
pub type Eu5BinaryDeserializer<'res, RES, R> = BinaryReaderDeserializer<'res, RES, Eu5Flavor, R>;

pub fn text_deserializer<R: Read>(reader: R) -> Eu5TextDeserializer<R> {
    TextDeserializer::from_utf8_reader(jomini::text::TokenReader::new(reader))
}

pub fn binary_deserializer<'res, RES, R>(
    resolver: &'res RES,
    reader: R,
) -> Eu5BinaryDeserializer<'res, RES, R>
where
    RES: TokenResolver,
    R: Read,
{
    BinaryDeserializerBuilder::with_flavor(Eu5Flavor::new()).from_reader(reader, resolver)
}

#[derive(Debug, Clone, Copy)]
pub struct Eu5Flavor(Utf8Encoding);
impl Eu5Flavor {
    pub fn new() -> Self {
        Eu5Flavor(Utf8Encoding::new())
    }
}

impl Default for Eu5Flavor {
    fn default() -> Self {
        Eu5Flavor::new()
    }
}

impl BinaryFlavor for Eu5Flavor {
    fn visit_f32(&self, data: [u8; 4]) -> f32 {
        debug_assert!(false, "first save with f32 data");
        f32::from_bits(u32::from_le_bytes(data))
    }

    fn visit_f64(&self, data: [u8; 8]) -> f64 {
        let x = i64::from_le_bytes(data) as f64;
        let eps = f64::from(f32::EPSILON);
        (x + (eps * x.signum())).trunc() / 100_000.0
    }
}

impl Encoding for Eu5Flavor {
    fn decode<'a>(&self, data: &'a [u8]) -> std::borrow::Cow<'a, str> {
        self.0.decode(data)
    }
}

#[derive(Debug)]
pub struct CompressedFileReader<R> {
    reader: flate2::read::DeflateDecoder<R>,
}

impl<R: Read> CompressedFileReader<R> {
    pub fn from_compressed(reader: R) -> Result<Self, Eu5Error>
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

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::rstest;

    #[rstest]
    #[case([3, 176, 63, 231, 0, 0, 0, 0], 38797.10723)]
    #[case([254, 3, 0, 0, 0, 0, 0, 0], 0.01022)]
    #[case([85, 98, 0, 0, 0, 0, 0, 0], 0.25173)]
    #[case([65, 0, 0, 0, 0, 0, 0, 0], 0.00065)]
    #[case([4, 0, 0, 0, 0, 0, 0, 0], 0.00004)]
    fn test_flavor_f64(#[case] input: [u8; 8], #[case] expected: f64) {
        let flavor = Eu5Flavor::new();
        let result = flavor.visit_f64(input);
        assert_eq!(expected, result);
    }
}
