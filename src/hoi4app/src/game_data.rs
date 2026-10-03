use serde::{Deserialize, Serialize};

/// The type of terrain that a province has, as given in `map/definition.csv`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProvinceKind {
    Land,
    Sea,
    Lake,
}

/// A province that is drawn on the map.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameProvince {
    /// The province id. Zero when the color in `provinces.bmp` is not in
    /// `map/definition.csv`.
    pub id: u32,
    pub kind: ProvinceKind,

    /// The state that contains the province. Zero when no state contains the
    /// province (eg: sea provinces).
    pub state_id: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    pub id: u32,

    /// The English name of the state
    pub name: String,

    /// Impassable states (eg: the Sahara) have no owner on the map
    pub impassable: bool,
}

/// The map color of a country tag or of a cosmetic tag
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

    /// The states, sorted by id
    pub states: Vec<GameState>,

    /// The map colors, sorted by key
    pub colors: Vec<CountryColor>,

    /// English names of countries, sorted by key
    pub localization: Vec<(String, String)>,
}

impl GameData {
    pub fn state(&self, id: u32) -> Option<&GameState> {
        self.states
            .binary_search_by_key(&id, |x| x.id)
            .ok()
            .map(|idx| &self.states[idx])
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
        self.states.sort_by_key(|x| x.id);
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
