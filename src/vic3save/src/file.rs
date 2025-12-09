use crate::{flavor::Vic3Flavor, melt, MeltOptions, Vic3Error, Vic3ErrorKind};
use jomini::{
    binary::{de::BinaryReaderDeserializer, BinaryDeserializerBuilder, TokenResolver},
    text::de::TextReaderDeserializer,
    Utf8Encoding,
};
use serde::de::DeserializeOwned;
use std::io::{Read, Write};

pub use jomini::envelope::JominiFile as Vic3File;
pub use jomini::envelope::*;

/// Type alias for Vic3 text deserializer
///
/// A lazy way to avoid the need to reimplement deserializer
pub type Vic3TextDeserializer<R> = TextReaderDeserializer<R, Utf8Encoding>;
pub type Vic3BinaryDeserializer<'res, RES, R> = BinaryReaderDeserializer<'res, RES, Vic3Flavor, R>;

pub trait Vic3BinaryDeserialization {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Vic3BinaryDeserializer<'res, RES, impl Read + '_>;
}

impl<R: ReaderAt> Vic3BinaryDeserialization for &'_ SaveData<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Vic3BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Vic3Flavor::new())
            .from_reader(self.body().cursor(), resolver)
    }
}

impl<R: Read> Vic3BinaryDeserialization for SaveContent<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Vic3BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Vic3Flavor::new()).from_reader(self, resolver)
    }
}

impl<R: Read> Vic3BinaryDeserialization for SaveMetadata<BinaryEncoding, R> {
    fn deserializer<'res, RES: TokenResolver>(
        &mut self,
        resolver: &'res RES,
    ) -> Vic3BinaryDeserializer<'res, RES, impl Read + '_> {
        BinaryDeserializerBuilder::with_flavor(Vic3Flavor::new()).from_reader(self, resolver)
    }
}

pub trait Vic3Melt {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write;
}

pub trait Vic3TextMelt {
    fn melt<Writer>(&mut self, output: Writer) -> Result<melt::MeltedDocument, Vic3Error>
    where
        Writer: Write;
}

impl<R: ReaderAt> Vic3Melt for &'_ Vic3File<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self.gamestate().map_err(Vic3ErrorKind::from)? {
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

impl<R: ReaderAt> Vic3Melt for &'_ JominiZip<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        match self.gamestate().map_err(Vic3ErrorKind::from)? {
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

impl<R: ReaderAt> Vic3Melt for &'_ SaveData<BinaryEncoding, R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        mut output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
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

impl<R: Read> Vic3Melt for SaveMetadataKind<R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
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

impl<R: ReaderAt> Vic3TextMelt for &'_ SaveData<TextEncoding, R> {
    fn melt<Writer>(&mut self, mut output: Writer) -> Result<melt::MeltedDocument, Vic3Error>
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

impl<R: Read> Vic3TextMelt for SaveMetadata<TextEncoding, R> {
    fn melt<Writer>(&mut self, mut output: Writer) -> Result<melt::MeltedDocument, Vic3Error>
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

impl<R: Read> Vic3Melt for SaveMetadata<BinaryEncoding, R> {
    fn melt<Resolver, Writer>(
        &mut self,
        options: MeltOptions,
        resolver: Resolver,
        output: Writer,
    ) -> Result<melt::MeltedDocument, Vic3Error>
    where
        Resolver: TokenResolver,
        Writer: Write,
    {
        let header = self.header().clone();
        melt::melt(self, output, resolver, options, header)
    }
}

pub trait DeserializeVic3 {
    fn deserialize<T>(&mut self, resolver: impl TokenResolver) -> Result<T, Vic3Error>
    where
        T: DeserializeOwned;
}

impl<R: ReaderAt> DeserializeVic3 for &'_ Vic3File<R> {
    fn deserialize<T>(&mut self, resolver: impl TokenResolver) -> Result<T, Vic3Error>
    where
        T: DeserializeOwned,
    {
        if self.header().kind().is_binary() && resolver.is_empty() {
            return Err(Vic3ErrorKind::NoTokens.into());
        }

        match self.kind() {
            JominiFileKind::Uncompressed(SaveDataKind::Text(x)) => Ok(x
                .deserializer()
                .deserialize()
                .map_err(Vic3ErrorKind::Deserialize)?),
            JominiFileKind::Uncompressed(SaveDataKind::Binary(x)) => Ok((&*x)
                .deserializer(&resolver)
                .deserialize()
                .map_err(Vic3ErrorKind::Deserialize)?),
            JominiFileKind::Zip(x) => Ok(match x.gamestate().map_err(Vic3ErrorKind::Envelope)? {
                SaveContentKind::Text(mut x) => x
                    .deserializer()
                    .deserialize()
                    .map_err(Vic3ErrorKind::Deserialize)?,
                SaveContentKind::Binary(mut x) => x
                    .deserializer(&resolver)
                    .deserialize()
                    .map_err(Vic3ErrorKind::Deserialize)?,
            }),
        }
    }
}
