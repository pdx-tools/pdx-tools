use crate::{Eu5Error, Eu5ErrorKind, MeltOptions, melt};
use jomini::{
    Encoding, Utf8Encoding,
    binary::{
        BinaryDeserializerBuilder, BinaryFlavor, TokenResolver, de::BinaryReaderDeserializer,
    },
    text::de::TextReaderDeserializer,
};
use serde::de::DeserializeOwned;
use std::io::{Read, Write};

pub use jomini::envelope::JominiFile as Eu5File;
pub use jomini::envelope::*;

/// Type alias for Eu5 text deserializer
///
/// A lazy way to avoid the need to reimplement deserializer
pub type Eu5TextDeserializer<R> = TextReaderDeserializer<R, Utf8Encoding>;
pub type Eu5BinaryDeserializer<'res, RES, R> = BinaryReaderDeserializer<'res, RES, Eu5Flavor, R>;

pub trait Eu5BinaryDeserialization {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, impl Read + '_>;
}

impl<R: ReaderAt> Eu5BinaryDeserialization for &'_ SaveData<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Eu5Flavor::new())
            .from_reader(self.body().cursor(), resolver)
    }
}

impl<R: Read> Eu5BinaryDeserialization for SaveContent<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Eu5Flavor::new()).from_reader(self, resolver)
    }
}

impl<R: Read> Eu5BinaryDeserialization for SaveMetadata<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Eu5Flavor::new()).from_reader(self, resolver)
    }
}

pub trait Eu5Melt {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write;
}

pub trait Eu5TextMelt {
    fn melt<Writer>(&mut self, output: Writer) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Writer: Write;
}

impl<R: ReaderAt> Eu5Melt for &'_ Eu5File<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self.kind() {
            JominiFileKind::Uncompressed(SaveDataKind::Text(x)) => (&mut (&*x)).melt(output),
            JominiFileKind::Uncompressed(SaveDataKind::Binary(x)) => melt::melt(
                &mut x.body().cursor(),
                &mut output,
                resolver,
                options,
                self.header().clone(),
            ),
            JominiFileKind::Zip(x) => Eu5Melt::melt(&mut (&*x), options, resolver, output),
        }
    }
}

/// Save resolver that takes the save specific string lookup table and layers it
/// over the EU5 game tokens.
#[derive(Debug)]
pub struct SaveResolver<R> {
    inner: R,
    string_lookup: Vec<&'static str>,
    #[expect(dead_code)]
    lookup_data: Vec<u8>,
}

impl<R> SaveResolver<R> {
    pub fn from_file(file: &Eu5File<impl ReaderAt>, inner: R) -> Result<Self, Eu5Error> {
        match file.kind() {
            JominiFileKind::Zip(x) => SaveResolver::create(x, inner),
            _ => Ok(Self {
                inner,
                string_lookup: Vec::new(),
                lookup_data: Vec::new(),
            }),
        }
    }

    pub fn create(file: &JominiZip<impl ReaderAt>, inner: R) -> Result<Self, Eu5Error> {
        let mut lookup_data = Vec::new();
        let string_lookup = if file.header().version() == 2 {
            file.read_entry("string_lookup")
                .map_err(Eu5ErrorKind::from)?
                .read_to_end(&mut lookup_data)?;

            // extend lifetime on lookup data
            let data = lookup_data.as_slice();
            let lookup_data: &'static [u8] = unsafe { std::mem::transmute(data) };
            string_lookup_parse(lookup_data)
        } else {
            Vec::new()
        };

        Ok(Self {
            inner,
            string_lookup,
            lookup_data,
        })
    }
}

impl<R: TokenResolver> TokenResolver for SaveResolver<R> {
    fn resolve(&self, token_id: u16) -> Option<&str> {
        self.inner.resolve(token_id)
    }

    fn lookup(&self, index: u32) -> Option<&str> {
        self.string_lookup.get(index as usize).copied()
    }

    fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }
}

impl<R: ReaderAt> Eu5Melt for &'_ JominiZip<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        let resolver = SaveResolver::create(self, resolver)?;
        match self.gamestate().map_err(Eu5ErrorKind::from)? {
            SaveContentKind::Text(mut save_body) => {
                let mut new_header = self.header().clone();
                new_header.set_kind(SaveHeaderKind::Text);
                new_header.write(&mut output)?;
                std::io::copy(&mut save_body, &mut output)?;
                Ok(melt::MeltedDocument::new())
            }
            SaveContentKind::Binary(mut save_body) => melt::melt(
                &mut save_body,
                &mut output,
                resolver,
                options,
                self.header().clone(),
            ),
        }
    }
}

impl<R: Read> Eu5Melt for SaveMetadataKind<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self {
            SaveMetadataKind::Text(x) => x.melt(output),
            SaveMetadataKind::Binary(x) => x.melt(options, resolver, output),
        }
    }
}

impl<R: ReaderAt> Eu5TextMelt for &'_ SaveData<TextEncoding, R> {
    fn melt<Writer>(&mut self, mut output: Writer) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Writer: Write,
    {
        let mut new_header = self.header().clone();
        new_header.set_kind(SaveHeaderKind::Text);
        new_header.write(&mut output)?;
        std::io::copy(&mut self.body().cursor(), &mut output)?;
        Ok(melt::MeltedDocument::new())
    }
}

impl<R: Read> Eu5TextMelt for SaveMetadata<TextEncoding, R> {
    fn melt<Writer>(&mut self, mut output: Writer) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Writer: Write,
    {
        let mut new_header = self.header().clone();
        new_header.set_kind(SaveHeaderKind::Text);
        new_header.write(&mut output)?;
        std::io::copy(self, &mut output)?;
        Ok(melt::MeltedDocument::new())
    }
}

impl<R: Read> Eu5Melt for SaveMetadata<BinaryEncoding, R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Eu5Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        let header = self.header().clone();
        melt::melt(self, output, resolver, options, header)
    }
}

pub trait DeserializeEu5 {
    fn deserialize<T>(&mut self, resolver: impl TokenResolver) -> Result<T, Eu5Error>
    where
        T: DeserializeOwned;
}

impl<R: ReaderAt> DeserializeEu5 for &'_ Eu5File<R> {
    fn deserialize<T>(&mut self, resolver: impl TokenResolver) -> Result<T, Eu5Error>
    where
        T: DeserializeOwned,
    {
        match self.kind() {
            JominiFileKind::Uncompressed(SaveDataKind::Text(x)) => {
                Ok(x.deserializer().deserialize()?)
            }
            JominiFileKind::Uncompressed(SaveDataKind::Binary(x)) => {
                Ok((&*x).deserializer(&resolver).deserialize()?)
            }
            JominiFileKind::Zip(x) => Ok(match x.gamestate().map_err(Eu5ErrorKind::Envelope)? {
                SaveContentKind::Text(mut x) => x.deserializer().deserialize()?,
                SaveContentKind::Binary(mut x) => x.deserializer(&resolver).deserialize()?,
            }),
        }
    }
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

fn string_lookup_parse(mut data: &[u8]) -> Vec<&'_ str> {
    let mut result = Vec::new();
    data = data.get(5..).unwrap_or_default();

    while !data.is_empty() {
        let Some((len, rest)) = data.split_first_chunk::<2>() else {
            break;
        };
        let len = u16::from_le_bytes(*len) as usize;
        let Some((chunk, rest)) = rest.split_at_checked(len) else {
            break;
        };

        result.push(std::str::from_utf8(chunk).unwrap_or_default());
        data = rest;
    }

    result
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
