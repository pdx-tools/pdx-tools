use jomini::JominiDeserialize;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
pub struct SpriteFile {
    #[serde(alias = "spriteTypes")]
    pub sprite_types: RootSpriteType,
}

#[derive(Debug, JominiDeserialize)]
pub struct RootSpriteType {
    #[jomini(duplicated, alias = "spriteType")]
    pub sprite_types: Vec<SpriteType>,
}

#[derive(Debug, Deserialize)]
pub struct SpriteType {
    pub name: String,
    pub texturefile: PathBuf,
}

pub fn parse_sprites(data: &[u8]) -> Vec<SpriteType> {
    let interface: SpriteFile = jomini::TextDeserializer::from_windows1252_slice(data).unwrap();
    interface.sprite_types.sprite_types
}
