use eu4save::{CountryTag, ProvinceId};
use schemas::eu4::Terrain;

#[derive(Debug, Clone, PartialEq)]
pub struct GameProvince {
    pub id: ProvinceId,
    pub terrain: schemas::eu4::Terrain,
    pub province_is_on_an_island: bool,
    pub center_x: u16,
    pub center_y: u16,
}

impl GameProvince {
    pub fn is_habitable(&self) -> bool {
        !matches!(self.terrain, Terrain::Wasteland | Terrain::Ocean)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct GameCountry {
    pub tag: CountryTag,
    pub culturegfx: String,
}
