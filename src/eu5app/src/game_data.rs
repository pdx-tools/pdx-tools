pub mod error;
pub mod optimized;

#[cfg(feature = "game-install")]
pub mod game_install;

pub use error::GameDataError;
pub use optimized::{OptimizedGameBundle, OptimizedLocalizationBundle, OptimizedMapBundle};

use eu5save::hash::FxHashMap;
use eu5save::models::GoodName;
use pdx_map::R16;
use serde::{Deserialize, Serialize};

use crate::GameLocation;
use crate::color::Srgb;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct GoodsData {
    pub goods: FxHashMap<String, GoodData>,
}

/// On-disk bundle format for the three localization maps. Constructs a
/// runtime [`Localization`] on load.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LocalizationsData {
    pub countries: FxHashMap<String, String>,
    pub goods: FxHashMap<String, String>,
    pub buildings: FxHashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GoodData {
    pub color_hex: Srgb,
    pub default_market_price: f64,
    pub transport_cost: f64,
}

/// Display-name lookup tables, separated from
#[derive(Debug, Clone, Default)]
pub struct Localization {
    countries: FxHashMap<String, String>,
    goods: FxHashMap<String, String>,
    buildings: FxHashMap<String, String>,
}

impl Localization {
    pub fn new(
        countries: FxHashMap<String, String>,
        goods: FxHashMap<String, String>,
        buildings: FxHashMap<String, String>,
    ) -> Self {
        Self {
            countries,
            goods,
            buildings,
        }
    }

    pub fn country(&self, tag: &str) -> Option<&str> {
        self.countries.get(tag).map(String::as_str)
    }

    pub fn good(&self, good: GoodName<'_>) -> Option<&str> {
        self.goods.get(good.to_str()).map(String::as_str)
    }

    pub fn building(&self, key: &str) -> Option<&str> {
        self.buildings.get(key).map(String::as_str)
    }
}

/// EU5 game data: gameplay/lookup data only.
pub struct GameData {
    pub locations: Vec<GameLocation>,
    pub goods: FxHashMap<String, GoodData>,
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
