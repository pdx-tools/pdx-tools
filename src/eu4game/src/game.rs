use crate::GameProvince;
pub use eu4game_data::LATEST_MINOR;
use eu4save::{CountryTag, ProvinceId};
use schemas::{
    eu4::Terrain,
    flatbuffers::{Follow, Vector},
};
use std::{cmp::Ordering, collections::HashMap};

#[derive(Debug)]
pub struct LocalizedCountry {
    pub name: String,
    pub adjective: String,
}

#[derive(Debug)]
pub struct GameReligion<'a> {
    pub index: usize,
    pub id: &'a str,
    pub name: &'a str,
    pub color: [u8; 3],
    pub allowed_conversions: Vec<&'a str>,
    pub negotiate_convert_on_dominant_religion: bool,
    pub force_convert_on_break: bool,
}

#[derive(Debug)]
pub struct LandUnit<'a> {
    pub name: &'a str,
    pub kind: LandUnitKind,
}

#[derive(Debug)]
pub enum LandUnitKind {
    Infantry,
    Cavalry,
    Artillery,
}

#[derive(Debug)]
pub struct NavalUnit<'a> {
    pub name: &'a str,
    pub kind: NavalUnitKind,
}

#[derive(Debug)]
pub enum NavalUnitKind {
    HeavyShip,
    LightShip,
    Galley,
    Transport,
}

#[derive(Debug)]
pub struct TerrainInfo {
    pub terrain: Terrain,
    pub local_development_cost: f32,
}

#[derive(Debug)]
pub struct EntryStringList<'a> {
    pub key: &'a str,
    pub list: Vec<&'a str>,
}

#[derive(Debug)]
pub struct Game<'a> {
    data: schemas::eu4::Game<'a>,
}

impl<'a> Game<'a> {
    #[cfg(feature = "embedded")]
    pub fn new(version: &eu4save::models::SavegameVersion) -> Self {
        Self::from_flatbuffer(eu4game_data::game_data(version.second))
    }

    pub fn from_flatbuffer(data: &'a [u8]) -> Self {
        let fb = schemas::eu4::root_as_game(data).unwrap();
        Self { data: fb }
    }

    pub fn localize(&self, key: &str) -> Option<&str> {
        let localization = self.data.localization().unwrap();
        binary_search_by(&localization, |x| x.key_compare_with_value(key))
            .ok()
            .and_then(|x| localization.get(x).value())
    }

    pub fn localize_building(&self, key: &str) -> Option<&str> {
        let needle = format!("building_{}", key);
        self.localize(&needle)
    }

    pub fn localize_country_ref(&self, tag: &CountryTag) -> Option<&str> {
        let countries = self.data.countries().unwrap();
        let idx = binary_search_by(&countries, |x| x.key_compare_with_value(tag.as_str()));
        idx.ok().and_then(|x| countries.get(x).name())
    }

    pub fn localize_country(&self, tag: &CountryTag) -> Option<String> {
        self.localize_country_ref(tag).map(String::from)
    }

    pub fn localize_trade_company(&self, key: &str) -> String {
        let trade_companies = self.data.trade_companies().unwrap();
        let idx = binary_search_by(&trade_companies, |x| x.key_compare_with_value(key));
        let res = idx
            .ok()
            .and_then(|x| trade_companies.get(x).value())
            .unwrap_or(key);
        String::from(res)
    }

    pub fn localize_personality(&self, key: &str) -> String {
        let personalities = self.data.personalities().unwrap();
        let idx = binary_search_by(&personalities, |x| x.key_compare_with_value(key));
        let res = idx
            .ok()
            .and_then(|x| personalities.get(x).value())
            .unwrap_or(key);
        String::from(res)
    }

    pub fn advisor_ids(&self) -> impl Iterator<Item = &'a str> + 'a {
        let advisors = self.data.advisors().unwrap();
        advisors.iter().map(|x| x.key())
    }

    pub fn localize_advisor(&self, key: &str) -> String {
        let advisors = self.data.advisors().unwrap();
        let idx = binary_search_by(&advisors, |x| x.key_compare_with_value(key));
        let res = idx
            .ok()
            .and_then(|x| advisors.get(x).value())
            .unwrap_or(key);
        String::from(res)
    }

    pub fn get_province(&self, key: &ProvinceId) -> Option<GameProvince> {
        let provs = self.data.provinces().unwrap();
        let idx = binary_search_by(&provs, |x| x.key_compare_with_value(key.as_u16())).ok()?;
        let x = provs.get(idx);
        Some(GameProvince {
            id: ProvinceId::new(x.id() as i32),
            province_is_on_an_island: x.province_is_on_an_island(),
            terrain: x.terrain(),
            center_x: x.center_x(),
            center_y: x.center_y(),
        })
    }

    /// Count of provinces (includes placeholder ones found in save files)
    pub fn total_provinces(&self) -> usize {
        self.data.total_provinces() as usize
    }

    /// Iterator provinces (excludes placholder ones)
    pub fn provinces(&self) -> impl Iterator<Item = GameProvince> + 'a {
        let provs = self.data.provinces().unwrap();
        provs.iter().map(|x| GameProvince {
            id: ProvinceId::new(x.id() as i32),
            province_is_on_an_island: x.province_is_on_an_island(),
            terrain: x.terrain(),
            center_x: x.center_x(),
            center_y: x.center_y(),
        })
    }

    pub fn religion(&self, key: &str) -> Option<GameReligion<'a>> {
        let religions = self.data.religions().unwrap();
        let idx = binary_search_by(&religions, |x| x.key_compare_with_value(key)).ok()?;
        let res = religions.get(idx);

        Some(GameReligion {
            index: idx,
            id: res.key(),
            name: res.name(),
            color: res.color().0,
            allowed_conversions: res.allowed_conversion().iter().flatten().collect(),
            force_convert_on_break: res.force_convert_on_break(),
            negotiate_convert_on_dominant_religion: res.negotiate_convert_on_dominant_religion(),
        })
    }

    pub fn continent_provinces(
        &self,
        continent: &str,
    ) -> Option<impl Iterator<Item = ProvinceId> + 'a> {
        let continents = self.data.continents().unwrap();
        let idx = binary_search_by(&continents, |x| x.key_compare_with_value(continent)).ok()?;

        let res = continents
            .get(idx)
            .value()
            .unwrap()
            .iter()
            .map(|x| ProvinceId::new(x as i32));
        Some(res)
    }

    pub fn continents(
        &self,
    ) -> impl Iterator<Item = (&'a str, impl Iterator<Item = ProvinceId> + 'a)> + 'a {
        self.data.continents().unwrap().iter().map(|x| {
            (
                x.key(),
                x.value()
                    .unwrap()
                    .iter()
                    .map(|id| ProvinceId::new(id as i32)),
            )
        })
    }

    pub fn superregions(
        &self,
    ) -> impl Iterator<Item = (&'a str, impl Iterator<Item = &'a str> + 'a)> + 'a {
        self.data
            .superregions()
            .unwrap()
            .iter()
            .map(|x| (x.key(), x.value().unwrap().iter()))
    }

    pub fn regions(
        &self,
    ) -> impl Iterator<Item = (&'a str, impl Iterator<Item = &'a str> + 'a)> + 'a {
        self.data
            .regions()
            .unwrap()
            .iter()
            .map(|x| (x.key(), x.value().unwrap().iter()))
    }

    pub fn areas(
        &self,
    ) -> impl Iterator<Item = (&'a str, impl Iterator<Item = ProvinceId> + 'a)> + 'a {
        self.data.areas().unwrap().iter().map(|x| {
            (
                x.key(),
                x.value()
                    .unwrap()
                    .iter()
                    .map(|id| ProvinceId::new(id as i32)),
            )
        })
    }

    pub fn area_provinces(&self, area: &str) -> Option<impl Iterator<Item = ProvinceId> + '_> {
        let areas = self.data.areas().unwrap();
        let idx = binary_search_by(&areas, |x| x.key_compare_with_value(area)).ok()?;

        let res = areas
            .get(idx)
            .value()
            .unwrap()
            .iter()
            .map(|x| ProvinceId::new(x as i32));
        Some(res)
    }

    pub fn region_provinces(&self, region: &str) -> Option<impl Iterator<Item = ProvinceId> + '_> {
        let regions = self.data.regions().unwrap();
        let idx = binary_search_by(&regions, |x| x.key_compare_with_value(region)).ok()?;

        let res = regions
            .get(idx)
            .value()
            .unwrap()
            .iter()
            .flat_map(|area| self.area_provinces(area))
            .flatten();
        Some(res)
    }

    pub fn region_areas(&self, region: &str) -> Option<impl Iterator<Item = &'a str> + 'a> {
        let regions = self.data.regions().unwrap();
        let idx = binary_search_by(&regions, |x| x.key_compare_with_value(region)).ok()?;

        let res = regions.get(idx).value().unwrap().iter();
        Some(res)
    }

    pub fn superregion_regions(
        &self,
        superregion: &str,
    ) -> Option<impl Iterator<Item = &'a str> + 'a> {
        let superregions = self.data.superregions().unwrap();
        let idx =
            binary_search_by(&superregions, |x| x.key_compare_with_value(superregion)).ok()?;

        let res = superregions.get(idx).value().unwrap().iter();
        Some(res)
    }

    pub fn culture_group_cultures(
        &self,
        group: &str,
    ) -> Option<impl Iterator<Item = &'a str> + 'a> {
        let culture_groups = self.data.culture_groups().unwrap();
        let idx = binary_search_by(&culture_groups, |x| x.key_compare_with_value(group)).ok()?;

        let res = culture_groups.get(idx).value().unwrap().iter();
        Some(res)
    }

    pub fn culture_groups(&self) -> impl Iterator<Item = EntryStringList<'a>> + 'a {
        self.data
            .culture_groups()
            .unwrap()
            .iter()
            .map(|group| EntryStringList {
                key: group.key(),
                list: group.value().unwrap().iter().collect(),
            })
    }

    pub fn province_area(&self, id: &ProvinceId) -> Option<&str> {
        let areas = self.data.areas().unwrap();
        areas
            .iter()
            .find(|entry| entry.value().unwrap().iter().any(|p| p == id.as_u16()))
            .map(|entry| entry.key())
    }

    pub fn province_area_lookup(&self) -> HashMap<ProvinceId, &str> {
        self.areas()
            .flat_map(|(area, provs)| provs.map(move |p| (p, area)))
            .collect()
    }

    pub fn land_units(&self) -> impl Iterator<Item = LandUnit<'_>> {
        self.data.land_units().unwrap().iter().map(|x| LandUnit {
            name: x.name(),
            kind: match x.kind() {
                schemas::eu4::LandUnitKind::Cavalry => LandUnitKind::Cavalry,
                schemas::eu4::LandUnitKind::Artillery => LandUnitKind::Artillery,
                _ => LandUnitKind::Infantry,
            },
        })
    }

    pub fn naval_units(&self) -> impl Iterator<Item = NavalUnit<'_>> {
        self.data.naval_units().unwrap().iter().map(|x| NavalUnit {
            name: x.name(),
            kind: match x.kind() {
                schemas::eu4::NavalUnitKind::HeavyShip => NavalUnitKind::HeavyShip,
                schemas::eu4::NavalUnitKind::LightShip => NavalUnitKind::LightShip,
                schemas::eu4::NavalUnitKind::Galley => NavalUnitKind::Galley,
                _ => NavalUnitKind::Transport,
            },
        })
    }

    pub fn terrain_infos(&self) -> impl Iterator<Item = TerrainInfo> + 'a {
        self.data.terrain().unwrap().iter().map(|x| TerrainInfo {
            terrain: x.id(),
            local_development_cost: x.local_development_cost(),
        })
    }

    pub fn terrain_info(&self, terrain: schemas::eu4::Terrain) -> Option<TerrainInfo> {
        self.terrain_infos().find(|x| x.terrain == terrain)
    }
}

pub fn binary_search_by<'a, 'b: 'a, T, F>(haystack: &'b Vector<T>, mut f: F) -> Result<usize, usize>
where
    F: FnMut(T::Inner) -> Ordering,
    T: Follow<'a> + 'a,
{
    let mut size = haystack.len();
    let mut left = 0;
    let mut right = size;
    while left < right {
        let mid = left + size / 2;
        let cmp = f(haystack.get(mid));
        if cmp == Ordering::Less {
            left = mid + 1;
        } else if cmp == Ordering::Greater {
            right = mid;
        } else {
            return Ok(mid);
        }

        size = right - left;
    }
    Err(left)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_129_game() {
        let game = Game::from_flatbuffer(eu4game_data::game_data(29));
        assert_eq!(game.total_provinces(), 4693);
        assert_eq!(game.provinces().count(), 3677);
    }

    #[test]
    fn test_130_game() {
        let game = Game::from_flatbuffer(eu4game_data::game_data(30));
        assert_eq!(game.total_provinces(), 4789);
        assert_eq!(game.provinces().count(), 3722);
    }

    #[test]
    fn test_131_game() {
        let game = Game::from_flatbuffer(eu4game_data::game_data(31));
        assert_eq!(game.total_provinces(), 4941);
        assert_eq!(game.provinces().count(), 3925);
    }

    #[test]
    fn test_132_game() {
        let game = Game::from_flatbuffer(eu4game_data::game_data(32));
        assert_eq!(game.total_provinces(), 4941);
        assert_eq!(game.provinces().count(), 3925);
    }
}
