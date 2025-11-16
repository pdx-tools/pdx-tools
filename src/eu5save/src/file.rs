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
        match self.gamestate().map_err(Eu5ErrorKind::from)? {
            SaveContentKind::Text(mut save_body) => {
                let mut new_header = self.header().clone();
                new_header.set_kind(crate::SaveHeaderKind::Text);
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

impl<R: ReaderAt> Eu5Melt for &'_ SaveData<BinaryEncoding, R> {
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
        melt::melt(
            &mut self.body().cursor(),
            &mut output,
            resolver,
            options,
            self.header().clone(),
        )
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
