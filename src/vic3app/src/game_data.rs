use crate::ProvinceId;
use serde::{Deserialize, Serialize};

/// The type of a province, as given in `map_data/default.map`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProvinceKind {
    Land,
    Sea,
    Lake,
}

/// A province that is drawn on the map.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameProvince {
    /// The province id that the save uses. Zero when the color in
    /// `provinces.png` has no id.
    pub id: ProvinceId,
    pub kind: ProvinceKind,

    /// The impassable provinces (eg: mountains) are in a state, but the map
    /// does not show an owner for them.
    pub impassable: bool,

    /// The id of the state region that contains the province. Zero when no
    /// state region contains the province (eg: lakes).
    pub region_id: u32,
}

/// A state region of `map_data/state_regions`
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameRegion {
    pub id: u32,

    /// The English name of the state region
    pub name: String,
}

/// The map color of a country tag
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CountryColor {
    pub key: String,
    pub color: [u8; 3],
}

/// Game data that the save worker needs to color the map and describe
/// provinces.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GameData {
    /// The provinces, indexed by the location index of the map texture
    pub provinces: Vec<GameProvince>,

    /// The state regions, sorted by id
    pub regions: Vec<GameRegion>,

    /// The map colors, sorted by key
    pub colors: Vec<CountryColor>,

    /// English names of countries (tags and dynamic names), sorted by key
    pub localization: Vec<(String, String)>,
}

impl GameData {
    pub fn region(&self, id: u32) -> Option<&GameRegion> {
        self.regions
            .binary_search_by_key(&id, |x| x.id)
            .ok()
            .map(|idx| &self.regions[idx])
    }

    pub fn color(&self, key: &str) -> Option<[u8; 3]> {
        self.colors
            .binary_search_by(|x| x.key.as_str().cmp(key))
            .ok()
            .map(|idx| self.colors[idx].color)
    }

    pub fn localize(&self, key: &str) -> Option<&str> {
        self.localization
            .binary_search_by(|(k, _)| k.as_str().cmp(key))
            .ok()
            .map(|idx| self.localization[idx].1.as_str())
    }

    /// Sort the lists so that the lookup functions can use binary search.
    pub fn sort(&mut self) {
        self.regions.sort_by_key(|x| x.id);
        self.colors.sort_by(|a, b| a.key.cmp(&b.key));
        self.colors.dedup_by(|a, b| a.key == b.key);
        self.localization.sort_by(|a, b| a.0.cmp(&b.0));
        self.localization.dedup_by(|a, b| a.0 == b.0);
    }
}

/// Dimensions of the map and the highest location index in the textures
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMetadata {
    pub width: u32,
    pub height: u32,
    pub max_location_index: u16,
}
