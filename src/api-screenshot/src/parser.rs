use anyhow::{Context, Result};
use eu4game::shared::{Eu4Parser, Eu4SaveOutput};
use eu4save::{
    models::{Eu4Save, Meta},
    query::Query,
    Encoding, PdsDate, SegmentedResolver,
};

/// Parsed save file metadata (fast)
#[derive(Debug)]
pub struct SaveMetadata {
    pub minor_version: u16,
    pub is_multiplayer: bool,
    pub player_tag: Option<String>,
    pub date: String,
}

impl SaveMetadata {
    pub fn from_meta(meta: &Meta) -> Self {
        Self {
            minor_version: meta.savegame_version.second,
            is_multiplayer: meta.multiplayer,
            player_tag: Some(meta.player.as_str().to_string()),
            date: meta.date.iso_8601().to_string(),
        }
    }
}

/// Parsed save file with full game state
pub struct ParsedSave {
    pub save: Eu4Save,
    pub encoding: Encoding,
    pub query: Query,
    pub metadata: SaveMetadata,
}

/// Parse only metadata from save file (fast)
pub fn parse_metadata(data: &[u8], resolver: &SegmentedResolver) -> Result<SaveMetadata> {
    let meta =
        eu4game::shared::parse_meta(data, resolver).context("Failed to parse save metadata")?;

    Ok(SaveMetadata::from_meta(&meta))
}

/// Parse full save file (slow)
pub fn parse_full_save(data: &[u8], resolver: &SegmentedResolver) -> Result<ParsedSave> {
    let Eu4SaveOutput {
        save,
        encoding,
        hash: _,
    } = Eu4Parser::new()
        .parse_with(data, resolver)
        .context("Failed to parse save file")?;

    let metadata = SaveMetadata::from_meta(&save.meta);
    let query = Query::from_save(save.clone());

    Ok(ParsedSave {
        save,
        encoding,
        query,
        metadata,
    })
}
