pub mod error;
pub mod optimized;

#[cfg(feature = "game-install")]
pub mod game_install;

pub use error::GameDataError;
pub use optimized::OptimizedGameBundle;

use crate::GameLocationData;
use eu5save::hash::FxHashMap;

/// EU5 game data
pub struct GameData {
    locations: FxHashMap<String, GameLocationData>,
    localization: FxHashMap<String, String>,
}

impl GameData {
    /// Create from owned HashMaps
    pub(crate) fn new(
        locations: FxHashMap<String, GameLocationData>,
        localization: FxHashMap<String, String>,
    ) -> Self {
        Self {
            locations,
            localization,
        }
    }

    pub fn locations(&self) -> &FxHashMap<String, GameLocationData> {
        &self.locations
    }

    pub fn localization(&self) -> &FxHashMap<String, String> {
        &self.localization
    }
}

impl GameDataProvider for GameData {
    fn lookup_location(&self, name: &str) -> Option<GameLocationData> {
        self.locations.get(name).copied()
    }

    fn localized_country_name(&self, tag: &str) -> Option<&str> {
        self.localization.get(tag).map(|s| s.as_str())
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
    /// Load west hemisphere texture, returning owned data.
    /// Pass an empty Vec for new allocation, or pass existing Vec to reuse buffer.
    fn load_west_texture(&mut self, dst: Vec<u8>) -> Result<Vec<u8>, GameDataError>;

    /// Load east hemisphere texture, returning owned data.
    /// Pass an empty Vec for new allocation, or pass existing Vec to reuse buffer.
    fn load_east_texture(&mut self, dst: Vec<u8>) -> Result<Vec<u8>, GameDataError>;

    /// Get expected size of west texture.
    fn west_texture_size(&self) -> usize;

    /// Get expected size of east texture.
    fn east_texture_size(&self) -> usize;
}

/// Provides query-based access to EU5 game data
pub trait GameDataProvider {
    /// Look up a location by name
    fn lookup_location(&self, name: &str) -> Option<GameLocationData>;

    /// Look up country localized name by tag.
    fn localized_country_name(&self, tag: &str) -> Option<&str>;
}

// Blanket implementation for boxed trait objects
impl GameDataProvider for Box<dyn GameDataProvider> {
    fn lookup_location(&self, name: &str) -> Option<GameLocationData> {
        (**self).lookup_location(name)
    }

    fn localized_country_name(&self, tag: &str) -> Option<&str> {
        (**self).localized_country_name(tag)
    }
}
