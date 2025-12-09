use bumpalo_serde::ArenaDeserialize;
use eu5save::{
    Eu5BinaryDeserialization, Eu5Date, Eu5File, ReaderAt,
    models::{GameVersion, Gamestate, ZipPrelude},
};
use jomini::binary::TokenResolver;
use serde::{Deserialize, Serialize};
use std::rc::Rc;

#[derive(Debug)]
pub struct Eu5SaveLoader<R, RES> {
    resolver: RES,
    meta: Rc<Eu5SaveMetadata>,
    archive: Eu5File<R>,
    arena: bumpalo::Bump,
}

impl Eu5SaveLoader<(), ()> {
    #[tracing::instrument(name = "eu5.meta.parse", skip_all)]
    pub fn open<R: ReaderAt, RES: TokenResolver>(
        file: Eu5File<R>,
        resolver: RES,
    ) -> Result<Eu5SaveLoader<R, RES>, Eu5LoadError> {
        let arena = bumpalo::Bump::with_capacity(100 * 1024 * 1024);
        let meta = {
            let meta = match file.meta().map_err(Eu5LoadError::MetaExtraction)? {
                eu5save::SaveMetadataKind::Text(mut text) => {
                    ZipPrelude::deserialize_in_arena(&mut text.deserializer(), &arena)
                }
                eu5save::SaveMetadataKind::Binary(mut bin) => {
                    let mut deser = bin.deserializer(&resolver);
                    ZipPrelude::deserialize_in_arena(&mut deser, &arena)
                }
            };

            let meta = meta.map_err(Eu5LoadError::MetaDeserialization)?;
            Eu5SaveMetadata {
                version: meta.metadata.version,
                date: meta.metadata.date,
                playthrough_name: meta.metadata.playthrough_name.to_string(),
            }
        };

        Ok(Eu5SaveLoader {
            resolver,
            meta: Rc::new(meta),
            archive: file,
            arena,
        })
    }
}

impl<R: ReaderAt, RES: TokenResolver> Eu5SaveLoader<R, RES> {
    pub fn meta(&self) -> Rc<Eu5SaveMetadata> {
        self.meta.clone()
    }

    #[tracing::instrument(name = "eu5.gamestate.parse", skip_all)]
    pub fn parse(self) -> Result<Eu5LoadedSave, Eu5LoadError> {
        let game_content = self
            .archive
            .gamestate()
            .map_err(Eu5LoadError::GamestateExtraction)?;

        let resolver = eu5save::SaveResolver::from_file(&self.archive, self.resolver)
            .map_err(Eu5LoadError::StringLookup)?;

        // Deserialize with a dynamic dispatch read implementation. This is not
        // technically required, but it significantly helps out compile times.
        let game = match game_content {
            eu5save::SaveContentKind::Text(mut x) => {
                Gamestate::deserialize_in_arena(&mut x.deserializer(), &self.arena)
            }
            eu5save::SaveContentKind::Binary(mut x) => {
                let mut deser = x.deserializer(&resolver);
                Gamestate::deserialize_in_arena(&mut deser, &self.arena)
            }
        };

        let game = game.map_err(Eu5LoadError::GamestateDeserialization)?;

        // We need to extend the lifetime of the gamestate to 'static, since it
        // is will be stored as a sibling field alongside the arena that owns
        // its data. This is safe as the gamestate is immutable and the
        // gamestate won't live longer than the arena.
        let game = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(game) };

        Ok(Eu5LoadedSave {
            arena: self.arena,
            game,
        })
    }
}

#[derive(Debug)]
pub struct Eu5LoadedSave {
    arena: bumpalo::Bump,
    pub game: Gamestate<'static>,
}

impl Eu5LoadedSave {
    pub fn into_parts(self) -> (bumpalo::Bump, Gamestate<'static>) {
        (self.arena, self.game)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Eu5LoadError {
    #[error("Unable to extract metadata: {0}")]
    MetaExtraction(#[source] eu5save::EnvelopeError),

    #[error("Unable to deserialize metadata: {0}")]
    MetaDeserialization(#[source] jomini::Error),

    #[error("Unable to extract gamestate: {0}")]
    GamestateExtraction(#[source] eu5save::EnvelopeError),

    #[error("Unable to deserialize gamestate: {0}")]
    GamestateDeserialization(#[source] jomini::Error),

    #[error("Session creation: {0}")]
    SessionCreation(#[source] Box<dyn std::error::Error>),

    #[error("Unable to parse string lookup: {0}")]
    StringLookup(#[source] eu5save::Eu5Error),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eu5SaveMetadata {
    pub version: GameVersion,
    pub date: Eu5Date,
    pub playthrough_name: String,
}
