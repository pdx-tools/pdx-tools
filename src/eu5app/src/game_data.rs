pub mod error;
pub mod optimized;

#[cfg(feature = "game-install")]
pub mod game_install;

pub use error::GameDataError;
pub use optimized::OptimizedGameBundle;

use eu5save::hash::FxHashMap;
use pdx_map::R16;
use serde::{Deserialize, Serialize};

use crate::GameLocation;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct GoodsData {
    pub goods: FxHashMap<String, GoodData>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LocalizationsData {
    pub countries: FxHashMap<String, String>,
    pub goods: FxHashMap<String, String>,
    pub buildings: FxHashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GoodData {
    pub color_hex: String,
    pub default_market_price: f64,
    pub transport_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LocalizedGoodData {
    pub key: String,
    pub name: String,
    pub color_hex: String,
    pub default_market_price: f64,
    pub transport_cost: f64,
}

/// EU5 game data
pub struct GameData {
    pub locations: Vec<GameLocation>,
    pub localization: FxHashMap<String, String>,
    pub goods_localization: FxHashMap<String, String>,
    pub building_localization: FxHashMap<String, String>,
    pub goods: FxHashMap<String, GoodData>,
}

impl GameData {
    pub fn localized_country_name(&self, tag: &str) -> Option<&str> {
        self.localization.get(tag).map(|s| s.as_str())
    }

    pub fn good(&self, name: &str) -> Option<&GoodData> {
        self.goods.get(name)
    }

    pub fn localized_good_name(&self, key: &str) -> String {
        self.goods_localization
            .get(key)
            .cloned()
            .unwrap_or_else(|| key.to_string())
    }

    pub fn localized_building_name(&self, key: &str) -> String {
        self.building_localization
            .get(key)
            .cloned()
            .unwrap_or_else(|| key.to_string())
    }

    pub fn localized_good(&self, key: &str) -> Option<LocalizedGoodData> {
        self.goods.get(key).map(|good| LocalizedGoodData {
            key: key.to_string(),
            name: self.localized_good_name(key),
            color_hex: good.color_hex.clone(),
            default_market_price: good.default_market_price,
            transport_cost: good.transport_cost,
        })
    }
}

impl std::fmt::Debug for GameData {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OwnedGameData")
            .field("locations_count", &self.locations.len())
            .field("localization_count", &self.localization.len())
            .field("goods_localization_count", &self.goods_localization.len())
            .field(
                "building_localization_count",
                &self.building_localization.len(),
            )
            .field("goods_count", &self.goods.len())
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
