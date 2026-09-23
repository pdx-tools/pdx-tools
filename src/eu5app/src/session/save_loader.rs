use arena_serde::ArenaDeserialize;
use eu5save::{
    Eu5BinaryDeserialization, Eu5BinaryDeserializer, Eu5BinaryFormat, Eu5DebugFile, Eu5File,
    Eu5TextDeserializer, ReaderAt, SaveContentKind, SaveMetadata, SaveMetadataKind,
    models::{GameVersion, Gamestate, Metadata, ZipPrelude},
};
use jomini::{
    TextDeserializer,
    binary::{BinaryFormatDeserializer, TokenResolver},
    common::PdsDate,
    text::TokenReader,
};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    rc::Rc,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Eu5DateComponents {
    pub year: i16,
    pub month: u8,
    pub day: u8,
}

impl From<eu5save::Eu5Date> for Eu5DateComponents {
    fn from(date: eu5save::Eu5Date) -> Self {
        Self {
            year: date.year(),
            month: date.month(),
            day: date.day(),
        }
    }
}

impl Eu5DateComponents {
    /// The date at 08:00, or `None` when the components are not a calendar
    /// date.
    pub fn to_date(&self) -> Option<eu5save::Eu5Date> {
        eu5save::Eu5Date::from_ymd_opt(self.year, self.month, self.day)
    }
}

/// A reader that copies every byte it reads to an observer.
struct TeeReader<'a, W> {
    reader: Box<dyn Read + 'a>,
    observer: &'a mut W,
}

impl<W> std::fmt::Debug for TeeReader<'_, W> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TeeReader").finish()
    }
}

impl<W: Write> Read for TeeReader<'_, W> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.reader.read(buf)?;
        self.observer.write_all(&buf[..n])?;
        Ok(n)
    }
}

/// Loads a save in two steps: [`open`](Self::open) reads the metadata and
/// [`parse`](Self::parse) reads the gamestate.
///
/// The decompressed content of both steps is also written to an observer
/// `W`, so a caller can, for example, hash the save with a
/// [`SaveCheckSummer`](crate::SaveCheckSummer) while it is read. The default
/// observer discards the content.
#[derive(Debug)]
pub struct Eu5SaveLoader<R, RES, W = std::io::Sink> {
    resolver: RES,
    meta: Rc<Eu5SaveMetadata>,
    archive: Eu5File<R>,
    arena: bumpalo::Bump,
    observer: W,
}

impl Eu5SaveLoader<(), ()> {
    pub fn open<R: ReaderAt, RES: TokenResolver>(
        file: Eu5File<R>,
        resolver: RES,
    ) -> Result<Eu5SaveLoader<R, RES>, Eu5LoadError> {
        Self::open_with(file, resolver, std::io::sink())
    }

    /// Open a save and write its decompressed content to `observer` as the
    /// content is read.
    #[tracing::instrument(name = "eu5.meta.parse", skip_all)]
    pub fn open_with<R: ReaderAt, RES: TokenResolver, W: Write>(
        file: Eu5File<R>,
        resolver: RES,
        mut observer: W,
    ) -> Result<Eu5SaveLoader<R, RES, W>, Eu5LoadError> {
        let arena = bumpalo::Bump::with_capacity(100 * 1024 * 1024);
        let meta = {
            let meta = match file.meta().map_err(Eu5LoadError::MetaExtraction)? {
                SaveMetadataKind::Text(text) => {
                    let header = text.header().clone();
                    let reader = TeeReader {
                        reader: Box::new(text),
                        observer: &mut observer,
                    };
                    let mut text = SaveMetadata::<eu5save::TextEncoding, _>::new(reader, header);
                    ZipPrelude::deserialize_in_arena(&mut text.deserializer(), &arena)
                }
                SaveMetadataKind::Binary(bin) => {
                    let header = bin.header().clone();
                    let reader = TeeReader {
                        reader: Box::new(bin),
                        observer: &mut observer,
                    };
                    let mut bin = SaveMetadata::<eu5save::BinaryEncoding, _>::new(reader, header);
                    let mut deser = bin.deserializer(&resolver);
                    ZipPrelude::deserialize_in_arena(&mut deser, &arena)
                }
            };

            let meta = meta.map_err(Eu5LoadError::MetaDeserialization)?;
            Eu5SaveMetadata::from(&meta.metadata)
        };

        Ok(Eu5SaveLoader {
            resolver,
            meta: Rc::new(meta),
            archive: file,
            arena,
            observer,
        })
    }
}

/// The gamestate stream of a save, with the encoding it is in.
enum GamestateReader<'a, W> {
    Text(TeeReader<'a, W>),
    Binary(TeeReader<'a, W>),
}

impl<'a, W: Write> GamestateReader<'a, W> {
    fn text_deserializer(reader: TeeReader<'a, W>) -> Eu5TextDeserializer<'a> {
        TextDeserializer::from_utf8_reader(TokenReader::new(reader))
    }

    fn binary_deserializer<'res, RES: TokenResolver>(
        reader: TeeReader<'a, W>,
        resolver: &'res RES,
    ) -> Eu5BinaryDeserializer<'a, 'res, RES> {
        BinaryFormatDeserializer::from_reader(reader, Eu5BinaryFormat::new(resolver))
    }
}

impl<R: ReaderAt, RES: TokenResolver, W: Write> Eu5SaveLoader<R, RES, W> {
    pub fn meta(&self) -> Rc<Eu5SaveMetadata> {
        self.meta.clone()
    }

    /// Open the gamestate stream with the observer between it and the reader.
    fn gamestate_reader<'a>(
        archive: &'a Eu5File<R>,
        observer: &'a mut W,
    ) -> Result<GamestateReader<'a, W>, Eu5LoadError> {
        let content = archive
            .gamestate()
            .map_err(Eu5LoadError::GamestateExtraction)?;

        // Read with a dynamic dispatch read implementation. This is not
        // technically required, but it significantly helps out compile times.
        Ok(match content {
            SaveContentKind::Text(x) => GamestateReader::Text(TeeReader {
                reader: Box::new(x),
                observer,
            }),
            SaveContentKind::Binary(x) => GamestateReader::Binary(TeeReader {
                reader: Box::new(x),
                observer,
            }),
        })
    }

    #[tracing::instrument(name = "eu5.gamestate.parse", skip_all)]
    pub fn parse(mut self) -> Result<Eu5LoadedSave<W>, Eu5LoadError> {
        let resolver = eu5save::SaveResolver::from_file(&self.archive, self.resolver)
            .map_err(Eu5LoadError::StringLookup)?;

        let game = match Self::gamestate_reader(&self.archive, &mut self.observer)? {
            GamestateReader::Text(x) => {
                let mut deser = GamestateReader::text_deserializer(x);
                Gamestate::deserialize_in_arena(&mut deser, &self.arena)
            }
            GamestateReader::Binary(x) => {
                let mut deser = GamestateReader::binary_deserializer(x, &resolver);
                Gamestate::deserialize_in_arena(&mut deser, &self.arena)
            }
        };

        let game = game.map_err(Eu5LoadError::GamestateDeserialization)?;

        // We need to extend the lifetime of the gamestate to 'static, since it
        // is will be stored as a sibling field alongside the arena that owns
        // its data. This is safe as the gamestate is immutable and the
        // gamestate won't live longer than the arena.
        let game = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(game) };

        Ok(Eu5LoadedSave::new(self.arena, game, self.observer))
    }
}

#[cfg(feature = "track-parse")]
impl<R: ReaderAt, RES: TokenResolver, W: Write> Eu5SaveLoader<R, RES, W> {
    /// Like [`parse`](Self::parse) but wraps the deserializer with
    /// [`arena_serde::tracked::Deserializer`] so that deserialization errors include the
    /// field path (e.g. `culture_manager.database.?.name`).
    #[tracing::instrument(name = "eu5.gamestate.parse_tracked", skip_all)]
    pub fn parse_tracked(mut self) -> Result<Eu5LoadedSave<W>, Eu5LoadError> {
        let resolver = eu5save::SaveResolver::from_file(&self.archive, self.resolver)
            .map_err(Eu5LoadError::StringLookup)?;

        let mut path_buf = Vec::new();
        let track = arena_serde::tracked::Track::new_with(&mut path_buf);

        let game = match Self::gamestate_reader(&self.archive, &mut self.observer)? {
            GamestateReader::Text(x) => {
                let mut deser = GamestateReader::text_deserializer(x);
                let tracked = arena_serde::tracked::Deserializer::new(&mut deser, &track);
                Gamestate::deserialize_in_arena(tracked, &self.arena)
            }
            GamestateReader::Binary(x) => {
                let mut deser = GamestateReader::binary_deserializer(x, &resolver);
                let tracked = arena_serde::tracked::Deserializer::new(&mut deser, &track);
                Gamestate::deserialize_in_arena(tracked, &self.arena)
            }
        };

        let game = game.map_err(|e| Eu5LoadError::GamestateDeserializationAt {
            path: track.path().to_string(),
            source: e,
        })?;

        let game = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(game) };
        Ok(Eu5LoadedSave::new(self.arena, game, self.observer))
    }
}

/// Loads an uncompressed text save from a forward-only reader.
///
/// It has the same two steps as [`Eu5SaveLoader`]: [`open_with`](Self::open_with)
/// reads the metadata and [`parse`](Self::parse) reads the gamestate. The
/// metadata of a text save is also the start of the gamestate, so the
/// loader keeps the metadata bytes and puts them back in front of the
/// stream when it parses the gamestate. Use this loader when the save
/// arrives as a stream, such as a Zstd-compressed upload, so that the save
/// does not need a buffer in memory before it is parsed.
///
/// The observer `W` receives the same bytes as it does from
/// [`Eu5SaveLoader`] on an uncompressed save: the metadata at open, then the
/// whole body at parse. A save has the same hash whichever loader reads it.
#[derive(Debug)]
pub struct Eu5DebugSaveLoader<R, W = std::io::Sink> {
    file: Eu5DebugFile<R>,
    meta: Rc<Eu5SaveMetadata>,
    meta_bytes: Vec<u8>,
    arena: bumpalo::Bump,
    observer: W,
}

impl Eu5DebugSaveLoader<()> {
    pub fn open<R: Read>(reader: R) -> Result<Eu5DebugSaveLoader<R>, Eu5LoadError> {
        Self::open_with(reader, std::io::sink())
    }

    /// Open a text save and write its content to `observer` as the content
    /// is read. The observer does not receive the save header.
    #[tracing::instrument(name = "eu5.meta.parse", skip_all)]
    pub fn open_with<R: Read, W: Write>(
        reader: R,
        mut observer: W,
    ) -> Result<Eu5DebugSaveLoader<R, W>, Eu5LoadError> {
        let mut file = Eu5DebugFile::from_reader(reader).map_err(Eu5LoadError::Header)?;
        let header = file.header().clone();

        let mut meta_bytes = Vec::new();
        (&mut file)
            .take(header.metadata_len())
            .read_to_end(&mut meta_bytes)
            .and_then(|_| observer.write_all(&meta_bytes))
            .map_err(Eu5LoadError::MetaRead)?;

        let arena = bumpalo::Bump::with_capacity(100 * 1024 * 1024);
        let meta = {
            let mut text =
                SaveMetadata::<eu5save::TextEncoding, _>::new(meta_bytes.as_slice(), header);
            let meta = ZipPrelude::deserialize_in_arena(&mut text.deserializer(), &arena)
                .map_err(Eu5LoadError::MetaDeserialization)?;
            Eu5SaveMetadata::from(&meta.metadata)
        };

        Ok(Eu5DebugSaveLoader {
            file,
            meta: Rc::new(meta),
            meta_bytes,
            arena,
            observer,
        })
    }
}

impl<R: Read, W: Write> Eu5DebugSaveLoader<R, W> {
    pub fn meta(&self) -> Rc<Eu5SaveMetadata> {
        self.meta.clone()
    }

    #[tracing::instrument(name = "eu5.gamestate.parse", skip_all)]
    pub fn parse(self) -> Result<Eu5LoadedSave<W>, Eu5LoadError> {
        let Self {
            file,
            meta_bytes,
            arena,
            mut observer,
            ..
        } = self;

        let game = {
            let reader = TeeReader {
                reader: Box::new(std::io::Cursor::new(meta_bytes).chain(file)),
                observer: &mut observer,
            };
            let mut deser = GamestateReader::text_deserializer(reader);
            Gamestate::deserialize_in_arena(&mut deser, &arena)
                .map_err(Eu5LoadError::GamestateDeserialization)?
        };

        // See `Eu5SaveLoader::parse` for why this is safe.
        let game = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(game) };
        Ok(Eu5LoadedSave::new(arena, game, observer))
    }
}

/// Loads a save in any form that a client sends.
///
/// A save that is not a zip archive is sent as one Zstd stream, and the
/// stream decodes through [`Eu5DebugSaveLoader`] without a buffer. Any other
/// save is parsed in place with [`Eu5SaveLoader`].
#[derive(Debug)]
pub enum Eu5AnySaveLoader<D: AsRef<[u8]>, RES, W = std::io::Sink> {
    Stream(Eu5DebugSaveLoader<pdx_zstd::Decoder<std::io::Cursor<D>>, W>),
    File(Eu5SaveLoader<std::io::Cursor<D>, RES, W>),
}

impl Eu5AnySaveLoader<&[u8], (), ()> {
    pub fn open<D: AsRef<[u8]>, RES: TokenResolver>(
        data: D,
        resolver: RES,
    ) -> Result<Eu5AnySaveLoader<D, RES>, Eu5LoadError> {
        Self::open_with(data, resolver, std::io::sink())
    }

    /// Open a save and write its decompressed content to `observer` as the
    /// content is read.
    pub fn open_with<D: AsRef<[u8]>, RES: TokenResolver, W: Write>(
        data: D,
        resolver: RES,
        observer: W,
    ) -> Result<Eu5AnySaveLoader<D, RES, W>, Eu5LoadError> {
        if pdx_zstd::is_zstd_compressed(data.as_ref()) {
            let decoder = pdx_zstd::Decoder::new(std::io::Cursor::new(data))
                .map_err(Eu5LoadError::Decompress)?;
            let loader = Eu5DebugSaveLoader::open_with(decoder, observer)?;
            Ok(Eu5AnySaveLoader::Stream(loader))
        } else {
            let file = Eu5File::from_slice(data).map_err(Eu5LoadError::Header)?;
            let loader = Eu5SaveLoader::open_with(file, resolver, observer)?;
            Ok(Eu5AnySaveLoader::File(loader))
        }
    }
}

impl<D: AsRef<[u8]>, RES: TokenResolver, W: Write> Eu5AnySaveLoader<D, RES, W> {
    pub fn meta(&self) -> Rc<Eu5SaveMetadata> {
        match self {
            Eu5AnySaveLoader::Stream(loader) => loader.meta(),
            Eu5AnySaveLoader::File(loader) => loader.meta(),
        }
    }

    pub fn parse(self) -> Result<Eu5LoadedSave<W>, Eu5LoadError> {
        match self {
            Eu5AnySaveLoader::Stream(loader) => loader.parse(),
            Eu5AnySaveLoader::File(loader) => loader.parse(),
        }
    }
}

#[derive(Debug)]
pub struct Eu5LoadedSave<W = std::io::Sink> {
    arena: bumpalo::Bump,
    game: Option<Gamestate<'static>>,
    observer: W,
}

impl<W> Eu5LoadedSave<W> {
    fn new(arena: bumpalo::Bump, game: Gamestate<'static>, observer: W) -> Self {
        Self {
            arena,
            game: Some(game),
            observer,
        }
    }

    pub fn arena(&self) -> &bumpalo::Bump {
        &self.arena
    }

    /// Drop the gamestate and return the observer.
    pub fn into_observer(self) -> W {
        self.observer
    }

    /// Take ownership of the gamestate out of the loaded save.
    ///
    /// But tie it to the lifetime of the loaded save's arena.
    pub fn take_gamestate(&mut self) -> Gamestate<'_> {
        self.game.take().expect("Gamestate already taken")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Eu5LoadError {
    #[error("Unable to decompress save: {0}")]
    Decompress(#[source] pdx_zstd::Error),

    #[error("Unable to read save header: {0}")]
    Header(#[source] eu5save::EnvelopeError),

    #[error("Unable to read metadata: {0}")]
    MetaRead(#[source] std::io::Error),

    #[error("Unable to extract metadata: {0}")]
    MetaExtraction(#[source] eu5save::EnvelopeError),

    #[error("Unable to deserialize metadata: {0}")]
    MetaDeserialization(#[source] jomini::Error),

    #[error("Unable to extract gamestate: {0}")]
    GamestateExtraction(#[source] eu5save::EnvelopeError),

    #[error("Unable to deserialize gamestate: {0}")]
    GamestateDeserialization(#[source] jomini::Error),

    #[cfg(feature = "track-parse")]
    #[error("Unable to deserialize gamestate at {path}: {source}")]
    GamestateDeserializationAt {
        path: String,
        #[source]
        source: jomini::Error,
    },

    #[error("Unable to parse string lookup: {0}")]
    StringLookup(#[source] eu5save::Eu5Error),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Eu5SaveMetadata {
    pub version: GameVersion,
    pub date: Eu5DateComponents,
    /// The id the game gives a campaign when it starts. Every save of the
    /// campaign carries it, whichever player wrote the save.
    pub playthrough_id: String,
    pub playthrough_name: String,
    pub player_country_name: Option<String>,
}

impl From<&Metadata<'_>> for Eu5SaveMetadata {
    fn from(meta: &Metadata<'_>) -> Self {
        Self {
            version: meta.version,
            date: meta.date.into(),
            playthrough_id: meta.playthrough_id.to_str().to_owned(),
            playthrough_name: meta.name().unwrap_or_default().to_owned(),
            player_country_name: meta
                .player_country_name
                .as_ref()
                .map(|x| x.to_str().to_owned()),
        }
    }
}
