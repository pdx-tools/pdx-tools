use crate::{
    CountryId, GameData, GameProvince, ProvinceId, ProvinceKind, Vic3MapSave, color::fallback_color,
};
use pdx_map::{GpuColor, LocationArrays, LocationFlags, LocationId};
use serde::Serialize;
use std::collections::HashMap;

/// How a country looks on the map and in the interface
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct CountryDisplay {
    pub tag: String,
    pub name: String,
    /// Map color as a CSS hex string (eg: "#c9385d")
    pub color: String,
}

/// The data that describes the province under the cursor
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct ProvinceDetails {
    #[cfg_attr(feature = "tsify", tsify(type = "number"))]
    pub province_id: ProvinceId,
    pub kind: ProvinceDetailsKind,
    pub region_name: Option<String>,
    pub owner: Option<CountryDisplay>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ProvinceDetailsKind {
    Land,
    Sea,
    Lake,
    Impassable,
}

#[derive(Debug, Clone)]
struct CountryStyle {
    tag: String,
    name: String,
    color: [u8; 3],
    decentralized: bool,
}

const PARCHMENT: GpuColor = GpuColor::from_rgb(211, 199, 173);

/// The world of a save: which country owns each province of the map.
///
/// The save identifies a country with a numeric id. The interface
/// identifies a country with its tag, as the other Vic3 views do.
#[derive(Debug)]
pub struct Vic3World {
    game: GameData,
    countries: HashMap<CountryId, CountryStyle>,

    /// The owner country id of each province, indexed by province id
    owners: Vec<Option<CountryId>>,
    controllers: Vec<Option<CountryId>>,
    overlords: HashMap<CountryId, CountryId>,

    /// The capital province of each country id
    capitals: HashMap<CountryId, ProvinceId>,
    province_indices: HashMap<ProvinceId, usize>,
}

impl Vic3World {
    pub fn new(save: &Vic3MapSave, game: GameData) -> Self {
        let countries = save
            .countries
            .iter()
            .map(|(id, country)| {
                let tag = country.definition.clone();
                let color = country
                    .map_color
                    .map(|x| x.0)
                    .or_else(|| game.color(&tag))
                    .unwrap_or_else(|| fallback_color(&tag));
                let name = country
                    .dynamic_name
                    .as_ref()
                    .and_then(|x| x.dynamic_country_name.as_deref())
                    .and_then(|key| game.localize(key))
                    .or_else(|| game.localize(&tag))
                    .map(String::from)
                    .unwrap_or_else(|| tag.clone());
                (
                    *id,
                    CountryStyle {
                        tag,
                        name,
                        color,
                        decentralized: country.country_type.as_deref() == Some("decentralized"),
                    },
                )
            })
            .collect();

        let max_province = game
            .provinces
            .iter()
            .map(|x| x.id)
            .max()
            .unwrap_or(ProvinceId::new(0));
        let mut owners = vec![None; max_province.value() as usize + 1];
        let mut controllers = vec![None; owners.len()];
        for (state_id, state) in &save.states {
            let Some(country) = state.country() else {
                continue;
            };
            for id in state.provinces.ids() {
                if let Some(owner) = owners.get_mut(id.value() as usize) {
                    *owner = Some(country);
                    controllers[id.value() as usize] = save.controllers.get(state_id).copied();
                }
            }
        }

        let capitals = save
            .countries
            .iter()
            .filter_map(|(id, country)| {
                let state = save.states.get(&country.capital()?)?;
                Some((*id, state.capital()?))
            })
            .collect();

        let province_indices = game
            .provinces
            .iter()
            .enumerate()
            .filter(|(_, x)| x.id.value() != 0)
            .map(|(idx, x)| (x.id, idx))
            .collect();

        Self {
            game,
            countries,
            owners,
            controllers,
            overlords: save.overlords.clone(),
            capitals,
            province_indices,
        }
    }

    pub fn game(&self) -> &GameData {
        &self.game
    }

    /// The owner country id of the province
    fn owner(&self, province: &GameProvince) -> Option<CountryId> {
        self.owners
            .get(province.id.value() as usize)
            .copied()
            .flatten()
    }

    fn country_color(&self, id: CountryId) -> GpuColor {
        let mut id = id;
        // Limit the search to stop if the subject relationships contain a cycle.
        for _ in 0..self.overlords.len() {
            let Some(overlord) = self.overlords.get(&id) else {
                break;
            };
            if !self.countries.contains_key(overlord) {
                break;
            }
            id = *overlord;
        }
        let color = self
            .countries
            .get(&id)
            .map(|x| x.color)
            .unwrap_or_else(|| fallback_color(&id.to_string()));
        GpuColor::from(color)
    }

    fn is_decentralized(&self, owner: Option<CountryId>) -> bool {
        owner
            .and_then(|id| self.countries.get(&id))
            .is_some_and(|country| country.decentralized)
    }

    /// Colors for the political map. Subjects use the color of their
    /// overlord. Occupied provinces have stripes in the controller color.
    pub fn political_location_arrays(&self) -> LocationArrays {
        let len = self.game.provinces.len();
        let mut ids = Vec::with_capacity(len);
        let mut fills = Vec::with_capacity(len);
        let mut stripes = Vec::with_capacity(len);
        let mut borders = Vec::with_capacity(len);

        for province in &self.game.provinces {
            ids.push(LocationId::new(province.id.value()));
            let fill = match province.kind {
                ProvinceKind::Sea | ProvinceKind::Lake => GpuColor::WATER,
                ProvinceKind::Land if province.impassable => GpuColor::IMPASSABLE,
                ProvinceKind::Land if self.is_decentralized(self.owner(province)) => PARCHMENT,
                ProvinceKind::Land => match self.owner(province) {
                    Some(owner) => self.country_color(owner),
                    None => GpuColor::UNOWNED,
                },
            };
            fills.push(fill);
            let border = if province.kind == ProvinceKind::Land && !province.impassable {
                self.owner(province)
                    .and_then(|owner| self.countries.get(&owner))
                    .map(|country| GpuColor::from(country.color))
                    .unwrap_or(fill)
            } else {
                fill
            };
            borders.push(border);
            let stripe = if province.kind == ProvinceKind::Land
                && !province.impassable
                && !self.is_decentralized(self.owner(province))
                && self.owner(province).is_some()
            {
                self.controllers
                    .get(province.id.value() as usize)
                    .copied()
                    .flatten()
                    .map(|controller| self.country_color(controller))
                    .unwrap_or(fill)
            } else {
                fill
            };
            stripes.push(stripe);
        }

        let mut arrays = LocationArrays::from_locations(&ids);
        arrays.set_primary_colors(&fills);
        arrays.set_secondary_colors(&stripes);
        arrays.set_border_colors(&borders);
        arrays.set_flags(&self.location_flags(None));
        arrays
    }

    /// Flags for each location. The provinces of the countries with the tag
    /// `highlight` are highlighted.
    pub fn location_flags(&self, highlight: Option<&str>) -> Vec<LocationFlags> {
        self.game
            .provinces
            .iter()
            .map(|province| {
                let owner = self.owner(province);
                let mut flags = match province.kind {
                    ProvinceKind::Sea => LocationFlags::WATER,
                    ProvinceKind::Lake => LocationFlags::LAKE,
                    ProvinceKind::Land if province.impassable => LocationFlags::IMPASSABLE,
                    ProvinceKind::Land if owner.is_none() => LocationFlags::UNOWNED,
                    ProvinceKind::Land => LocationFlags::empty(),
                };

                let owner_tag = owner
                    .and_then(|x| self.countries.get(&x))
                    .map(|x| x.tag.as_str());
                if highlight.is_some() && owner_tag == highlight {
                    flags.set(LocationFlags::HIGHLIGHTED);
                }
                flags
            })
            .collect()
    }

    fn country(&self, id: CountryId) -> CountryDisplay {
        let style = self.countries.get(&id);
        let tag = style
            .map(|x| x.tag.clone())
            .unwrap_or_else(|| id.to_string());
        let color = style
            .map(|x| x.color)
            .unwrap_or_else(|| fallback_color(&tag));
        CountryDisplay {
            name: style.map(|x| x.name.clone()).unwrap_or_else(|| tag.clone()),
            tag,
            color: format!("#{:02x}{:02x}{:02x}", color[0], color[1], color[2]),
        }
    }

    /// Countries that own at least one province, sorted by tag
    pub fn landed_countries(&self) -> Vec<CountryDisplay> {
        let mut ids: Vec<_> = self.owners.iter().flatten().copied().collect();
        ids.sort_unstable();
        ids.dedup();
        let mut result: Vec<_> = ids.into_iter().map(|id| self.country(id)).collect();
        result.sort_by(|a, b| a.tag.cmp(&b.tag));
        result.dedup_by(|a, b| a.tag == b.tag);
        result
    }

    pub fn province(&self, province_id: ProvinceId) -> Option<ProvinceDetails> {
        let province = &self.game.provinces[*self.province_indices.get(&province_id)?];
        let kind = match province.kind {
            ProvinceKind::Sea => ProvinceDetailsKind::Sea,
            ProvinceKind::Lake => ProvinceDetailsKind::Lake,
            ProvinceKind::Land if province.impassable => ProvinceDetailsKind::Impassable,
            ProvinceKind::Land => ProvinceDetailsKind::Land,
        };

        Some(ProvinceDetails {
            province_id,
            kind,
            region_name: self.game.region(province.region_id).map(|x| x.name.clone()),
            owner: self.owner(province).map(|x| self.country(x)),
        })
    }

    /// The capital province of the country with the tag, so that the map
    /// can center on it. A tag can belong to more than one country (eg: a
    /// dead country), so the result is from a country that owns land.
    pub fn capital_province(&self, tag: &str) -> Option<ProvinceId> {
        let mut candidates: Vec<_> = self
            .countries
            .iter()
            .filter(|(_, x)| x.tag == tag)
            .filter_map(|(id, _)| self.capitals.get(id).map(|capital| (*id, *capital)))
            .collect();
        candidates.sort_unstable();
        candidates
            .iter()
            .find(|(id, capital)| {
                self.owners.get(capital.value() as usize).copied().flatten() == Some(*id)
            })
            .or(candidates.first())
            .map(|(_, capital)| *capital)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CountryColor, GameRegion, SaveColor, SaveCountry, SaveState, StateId, save::ProvinceRanges,
    };

    fn save() -> Vic3MapSave {
        let country = |tag: &str, capital, map_color| SaveCountry {
            definition: String::from(tag),
            country_type: None,
            capital: Some(StateId::new(capital)),
            map_color,
            dynamic_name: None,
        };
        let state = |country, capital, provinces: Vec<u32>| SaveState {
            country: Some(CountryId::new(country)),
            capital: Some(ProvinceId::new(capital)),
            provinces: ProvinceRanges { provinces },
        };

        Vic3MapSave {
            countries: HashMap::from([
                (CountryId::new(1), country("FRA", 10, None)),
                (
                    CountryId::new(2),
                    country("GER", 20, Some(SaveColor([1, 2, 3]))),
                ),
            ]),
            states: HashMap::from([
                (StateId::new(10), state(1, 2, vec![1, 1])),
                (StateId::new(20), state(2, 3, vec![3, 0])),
                (StateId::new(30), state(2, 4, vec![4, 0])),
            ]),
            ..Vic3MapSave::default()
        }
    }

    fn game() -> GameData {
        let province = |id, kind, impassable, region_id| GameProvince {
            id: ProvinceId::new(id),
            kind,
            impassable,
            region_id,
        };
        let mut game = GameData {
            provinces: vec![
                province(1, ProvinceKind::Land, false, 100),
                province(2, ProvinceKind::Land, false, 100),
                province(3, ProvinceKind::Land, false, 200),
                province(4, ProvinceKind::Land, true, 200),
                province(5, ProvinceKind::Sea, false, 300),
                province(6, ProvinceKind::Land, false, 400),
            ],
            regions: vec![
                GameRegion {
                    id: 100,
                    name: String::from("Ile de France"),
                },
                GameRegion {
                    id: 200,
                    name: String::from("Brandenburg"),
                },
            ],
            colors: vec![
                CountryColor {
                    key: String::from("FRA"),
                    color: [0, 0, 255],
                },
                CountryColor {
                    key: String::from("GER"),
                    color: [100, 100, 100],
                },
            ],
            localization: vec![(String::from("FRA"), String::from("France"))],
        };
        game.sort();
        game
    }

    #[test]
    fn test_political_colors() {
        let world = Vic3World::new(&save(), game());
        let arrays = world.political_location_arrays();
        let buffers = arrays.buffers();
        let primary = buffers.primary_colors();
        let flags = buffers.state_flags();
        let france = GpuColor::from([0, 0, 255]);

        // The color of the save replaces the color of the country definition
        let germany = GpuColor::from([1, 2, 3]);

        assert_eq!(primary, buffers.secondary_colors());
        assert_eq!(&primary[..3], &[france, france, germany]);
        assert_eq!(primary[3], GpuColor::IMPASSABLE);
        assert!(flags[3].contains(LocationFlags::IMPASSABLE));
        assert_eq!(primary[4], GpuColor::WATER);
        assert!(flags[4].contains(LocationFlags::WATER));
        assert_eq!(primary[5], GpuColor::UNOWNED);
        assert!(flags[5].contains(LocationFlags::UNOWNED));
        assert_eq!(buffers.location_ids()[2], LocationId::new(3));
    }

    #[test]
    fn test_highlight_and_details() {
        let world = Vic3World::new(&save(), game());
        let highlighted: Vec<_> = world
            .location_flags(Some("FRA"))
            .iter()
            .map(|x| x.contains(LocationFlags::HIGHLIGHTED))
            .collect();
        assert_eq!(highlighted, vec![true, true, false, false, false, false]);

        let details = world.province(ProvinceId::new(2)).unwrap();
        assert_eq!(details.region_name.as_deref(), Some("Ile de France"));
        let owner = details.owner.unwrap();
        assert_eq!((owner.tag.as_str(), owner.name.as_str()), ("FRA", "France"));
        assert_eq!(
            world
                .province(ProvinceId::new(3))
                .unwrap()
                .owner
                .unwrap()
                .color,
            "#010203"
        );
        assert_eq!(world.province(ProvinceId::new(6)).unwrap().owner, None);
        assert_eq!(world.capital_province("FRA"), Some(ProvinceId::new(2)));
        assert_eq!(world.capital_province("GER"), Some(ProvinceId::new(3)));

        let tags: Vec<_> = world
            .landed_countries()
            .into_iter()
            .map(|x| x.tag)
            .collect();
        assert_eq!(tags, vec!["FRA", "GER"]);
    }

    #[test]
    fn test_subject_colors() {
        let mut save = save();
        let mut overlord = save.countries[&CountryId::new(1)].clone();
        overlord.definition = String::from("GBR");
        overlord.map_color = Some(SaveColor([200, 20, 30]));
        save.countries.insert(CountryId::new(3), overlord);
        save.overlords = HashMap::from([
            (CountryId::new(1), CountryId::new(2)),
            (CountryId::new(2), CountryId::new(3)),
        ]);
        let world = Vic3World::new(&save, game());
        let arrays = world.political_location_arrays();
        assert_eq!(
            &arrays.buffers().primary_colors()[..3],
            &[GpuColor::from([200, 20, 30]); 3]
        );
        assert_eq!(
            arrays.buffers().border_colors()[0],
            GpuColor::from([0, 0, 255])
        );
        assert_eq!(
            arrays.buffers().border_colors()[2],
            GpuColor::from([1, 2, 3])
        );
        assert_eq!(
            world
                .province(ProvinceId::new(1))
                .unwrap()
                .owner
                .unwrap()
                .tag,
            "FRA"
        );
        assert_eq!(
            world.location_flags(Some("FRA"))[0],
            LocationFlags::HIGHLIGHTED
        );
    }

    #[test]
    fn test_decentralized_colors() {
        let mut save = save();
        save.countries
            .get_mut(&CountryId::new(1))
            .unwrap()
            .country_type = Some(String::from("decentralized"));
        save.countries
            .get_mut(&CountryId::new(2))
            .unwrap()
            .country_type = Some(String::from("unrecognized"));
        let world = Vic3World::new(&save, game());
        let arrays = world.political_location_arrays();
        let buffers = arrays.buffers();
        assert_eq!(&buffers.primary_colors()[..2], &[PARCHMENT; 2]);
        assert_eq!(buffers.primary_colors()[2], GpuColor::from([1, 2, 3]));
        assert!(!buffers.state_flags()[0].contains(LocationFlags::UNOWNED));
        assert_eq!(buffers.border_colors()[0], GpuColor::from([0, 0, 255]));
        assert!(!buffers.state_flags()[2].contains(LocationFlags::UNOWNED));
        assert_eq!(
            world
                .province(ProvinceId::new(1))
                .unwrap()
                .owner
                .unwrap()
                .tag,
            "FRA"
        );
    }

    #[test]
    fn test_occupation_stripes() {
        let mut save = save();
        save.controllers = HashMap::from([
            (StateId::new(20), CountryId::new(1)),
            (StateId::new(30), CountryId::new(1)),
        ]);
        let world = Vic3World::new(&save, game());
        let arrays = world.political_location_arrays();
        let buffers = arrays.buffers();
        assert_eq!(buffers.primary_colors()[2], GpuColor::from([1, 2, 3]));
        assert_eq!(buffers.secondary_colors()[2], GpuColor::from([0, 0, 255]));
        assert_eq!(buffers.border_colors()[2], buffers.primary_colors()[2]);
        assert_eq!(buffers.secondary_colors()[3], GpuColor::IMPASSABLE);
        assert_eq!(
            world
                .province(ProvinceId::new(3))
                .unwrap()
                .owner
                .unwrap()
                .tag,
            "GER"
        );
    }
}
