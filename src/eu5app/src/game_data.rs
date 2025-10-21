pub mod hexcolor;
pub mod models;
pub mod optimized;

pub use optimized::OptimizedGameData;

#[cfg(not(target_family = "wasm"))]
pub mod source;

#[cfg(not(target_family = "wasm"))]
pub use source::SourceGameData;

use crate::models::GameLocationData;

pub trait GameDataProvider {
    fn locations(&self) -> Result<Vec<GameLocationData>, Box<dyn std::error::Error>>;
    fn west_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>>;
    fn east_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>>;
}

// Unified API - enum on native, type alias on WASM
#[cfg(not(target_family = "wasm"))]
pub enum Eu5GameData {
    Optimized(OptimizedGameData),
    Source(SourceGameData),
}

#[cfg(target_family = "wasm")]
pub type Eu5GameData = OptimizedGameData;

#[cfg(not(target_family = "wasm"))]
impl Eu5GameData {
    /// Open game data from an arbitrary path (auto-detects type)
    pub fn open(path: impl AsRef<std::path::Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();

        if path.is_file() {
            // Attempt optimized data first
            let data = std::fs::read(path)?;
            if let Ok(bundle) = OptimizedGameData::open(data.clone()) {
                return Ok(Self::Optimized(bundle));
            }
            // Fall back to treating it as a source bundle zip
            return Ok(Self::Source(SourceGameData::from_source_bundle(path)?));
        }

        // Directory - treat as raw game install or extracted bundle
        Ok(Self::Source(SourceGameData::from_directory(path)?))
    }
}

#[cfg(not(target_family = "wasm"))]
impl GameDataProvider for Eu5GameData {
    fn locations(&self) -> Result<Vec<GameLocationData>, Box<dyn std::error::Error>> {
        match self {
            Self::Optimized(data) => data.locations(),
            Self::Source(data) => data.locations(),
        }
    }

    fn west_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        match self {
            Self::Optimized(data) => data.west_texture(dst),
            Self::Source(data) => data.west_texture(dst),
        }
    }

    fn east_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        match self {
            Self::Optimized(data) => data.east_texture(dst),
            Self::Source(data) => data.east_texture(dst),
        }
    }
}
