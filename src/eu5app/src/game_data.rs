pub mod error;
pub mod optimized;

#[cfg(feature = "game-install")]
pub mod game_install;

pub use error::GameDataError;
pub use optimized::OptimizedGameBundle;

use eu5save::hash::FxHashMap;
use pdx_map::R16;

use crate::GameLocation;

/// EU5 game data
pub struct GameData {
    locations: Vec<GameLocation>,
    localization: FxHashMap<String, String>,
}

impl GameData {
    pub fn new(locations: Vec<GameLocation>, localization: FxHashMap<String, String>) -> Self {
        Self {
            locations,
            localization,
        }
    }

    pub fn localized_country_name(&self, tag: &str) -> Option<&str> {
        self.localization.get(tag).map(|s| s.as_str())
    }

    pub fn locations(&self) -> &[GameLocation] {
        &self.locations
    }

    pub fn localization(&self) -> &FxHashMap<String, String> {
        &self.localization
    }
}

impl std::fmt::Debug for GameData {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OwnedGameData")
            .field("locations_count", &self.locations.len())
            .field("localization_count", &self.localization.len())
            .finish()
    }
}

/// Provides access to map textures.
pub trait TextureProvider {
    /// Get west hemisphere texture as a slice.
    fn west_texture(&self) -> &[R16];

    /// Get east hemisphere texture as a slice.
    fn east_texture(&self) -> &[R16];

    /// Get expected size of west texture.
    fn west_texture_size(&self) -> usize;

    /// Get expected size of east texture.
    fn east_texture_size(&self) -> usize;
}
