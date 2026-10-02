use serde::{Deserialize, Serialize};

/// The id of a province in `map/definition.csv`
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProvinceId(u32);

impl ProvinceId {
    pub const fn new(id: u32) -> Self {
        ProvinceId(id)
    }

    pub const fn value(self) -> u32 {
        self.0
    }
}

/// The id of a state in `history/states`
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StateId(u32);

impl StateId {
    pub const fn new(id: u32) -> Self {
        StateId(id)
    }

    pub const fn value(self) -> u32 {
        self.0
    }
}

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
    /// The province id. `None` when the color in `provinces.bmp` is not in
    /// `map/definition.csv`.
    pub id: Option<ProvinceId>,
    pub kind: ProvinceKind,

    /// The state that contains the province. `None` when no state contains
    /// the province (eg: sea provinces).
    pub state_id: Option<StateId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameState {
    pub id: StateId,

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
///
/// The states, colors, and localization are sorted by key, so that the
/// lookup functions can use binary search. Thus, the fields are private and
/// all constructors (including deserialization) sort them.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(from = "GameDataParts")]
pub struct GameData {
    provinces: Vec<GameProvince>,
    states: Vec<GameState>,
    colors: Vec<CountryColor>,
    localization: Vec<(String, String)>,
}

/// The serialized form of [`GameData`], which can be in any order. The field
/// order must match [`GameData`].
#[derive(Deserialize)]
struct GameDataParts {
    provinces: Vec<GameProvince>,
    states: Vec<GameState>,
    colors: Vec<CountryColor>,
    localization: Vec<(String, String)>,
}

impl From<GameDataParts> for GameData {
    fn from(parts: GameDataParts) -> Self {
        GameData::new(
            parts.provinces,
            parts.states,
            parts.colors,
            parts.localization,
        )
    }
}

impl GameData {
    /// Create the game data. The `provinces` are indexed by the location
    /// index of the map texture. The other lists can be in any order. When a
    /// key occurs more than one time, the first entry is kept.
    pub fn new(
        provinces: Vec<GameProvince>,
        mut states: Vec<GameState>,
        mut colors: Vec<CountryColor>,
        mut localization: Vec<(String, String)>,
    ) -> Self {
        states.sort_by_key(|x| x.id);
        states.dedup_by_key(|x| x.id);
        colors.sort_by(|a, b| a.key.cmp(&b.key));
        colors.dedup_by(|a, b| a.key == b.key);
        localization.sort_by(|a, b| a.0.cmp(&b.0));
        localization.dedup_by(|a, b| a.0 == b.0);
        GameData {
            provinces,
            states,
            colors,
            localization,
        }
    }

    /// The provinces, indexed by the location index of the map texture
    pub fn provinces(&self) -> &[GameProvince] {
        &self.provinces
    }

    /// The states, sorted by id
    pub fn states(&self) -> &[GameState] {
        &self.states
    }

    /// The map colors, sorted by key
    pub fn colors(&self) -> &[CountryColor] {
        &self.colors
    }

    pub fn state(&self, id: StateId) -> Option<&GameState> {
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
}

/// Dimensions of the map and the highest location index in the textures
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMetadata {
    pub width: u32,
    pub height: u32,
    pub max_location_index: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_sorts() {
        let color = |key: &str, x| CountryColor {
            key: String::from(key),
            color: [x, x, x],
        };
        let parts = (
            Vec::<GameProvince>::new(),
            Vec::<GameState>::new(),
            vec![color("SOV", 1), color("GER", 2)],
            vec![(String::from("SOV"), String::from("Soviet Union"))],
        );
        let bytes = postcard::to_allocvec(&parts).unwrap();
        let game: GameData = postcard::from_bytes(&bytes).unwrap();
        assert_eq!(game.color("GER"), Some([2, 2, 2]));
        assert_eq!(game.color("SOV"), Some([1, 1, 1]));
        assert_eq!(game.localize("SOV"), Some("Soviet Union"));
    }
}
