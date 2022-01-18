use eu4save::{CountryTag, ProvinceId};

#[derive(Debug, Clone, PartialEq)]
pub struct GameProvince {
    pub id: ProvinceId,
    pub terrain: schemas::eu4::Terrain,
    pub province_is_on_an_island: bool,
    pub center_x: u16,
    pub center_y: u16,
}

#[derive(Debug, Clone, PartialEq)]
pub struct GameCountry {
    pub tag: CountryTag,
    pub culturegfx: String,
}
