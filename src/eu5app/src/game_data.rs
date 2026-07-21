pub mod error;
pub mod optimized;

#[cfg(feature = "game-install")]
pub mod game_install;

pub use error::GameDataError;
pub use optimized::{OptimizedGameBundle, OptimizedLocalizationBundle, OptimizedMapBundle};

use eu5save::hash::FxHashMap;
use pdx_map::{R16, TopologyIndex};
use serde::{Deserialize, Serialize};

use crate::GameLocation;
use crate::color::Srgb;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct GoodsData {
    pub goods: FxHashMap<String, GoodData>,
}

/// On-disk bundle format for the flat localization map. Constructs a
/// runtime [`Localization`] on load.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LocalizationsData {
    pub entries: FxHashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GoodData {
    pub color_hex: Srgb,
    pub default_market_price: f64,
    pub transport_cost: f64,
}

/// Opaque flat key/value display-name lookup table.
#[derive(Debug, Clone, Default)]
pub struct Localization {
    entries: FxHashMap<String, String>,
}

impl Localization {
    pub fn new(entries: FxHashMap<String, String>) -> Self {
        Self { entries }
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.entries.get(key).map(String::as_str)
    }
}

/// EU5 game data: gameplay/lookup data only.
pub struct GameData {
    pub locations: Vec<GameLocation>,
    pub goods: FxHashMap<String, GoodData>,
    pub topology: TopologyIndex,
}

impl GameData {
    pub fn good(&self, name: &str) -> Option<&GoodData> {
        self.goods.get(name)
    }
}

impl std::fmt::Debug for GameData {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OwnedGameData")
            .field("locations_count", &self.locations.len())
            .field("goods_count", &self.goods.len())
            .field("topology_len", &self.topology.len())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn localization_get_returns_value_for_known_key() {
        let mut entries = FxHashMap::default();
        entries.insert("workshop".to_string(), "Workshop".to_string());
        entries.insert("SWE".to_string(), "Sweden".to_string());
        let loc = Localization::new(entries);

        assert_eq!(loc.get("workshop"), Some("Workshop"));
        assert_eq!(loc.get("SWE"), Some("Sweden"));
    }

    #[test]
    fn localization_get_returns_none_for_missing_key() {
        let loc = Localization::default();
        assert_eq!(loc.get("missing"), None);
    }
}
