use crate::{GameData, GameProvince, ProvinceId, ProvinceKind, StateId, color::fallback_color};
use hoi4save::{
    CountryTag,
    models::{Country, Hoi4Save},
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
    pub province_id: u32,
    pub kind: ProvinceDetailsKind,
    pub state_id: Option<u32>,
    pub state_name: Option<String>,
    pub owner: Option<CountryDisplay>,
    /// Only present when the controller is not the owner
    pub controller: Option<CountryDisplay>,
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
    name: String,
    color: [u8; 3],
}

/// Who owns and controls a province, indexed like the provinces of the game
/// data
#[derive(Debug, Clone, Copy)]
struct ProvinceControl {
    kind: ProvinceDetailsKind,
    owner: Option<CountryTag>,

    /// The controller, or the owner when no other country controls the
    /// province
    controller: Option<CountryTag>,
}

/// The world of a save: which country owns and controls each province of the
/// map.
#[derive(Debug)]
pub struct Hoi4World {
    game: GameData,
    countries: HashMap<CountryTag, CountryStyle>,
    control: Vec<ProvinceControl>,
    landed: Vec<CountryTag>,
    capitals: HashMap<CountryTag, ProvinceId>,
    province_indices: HashMap<ProvinceId, usize>,
}

impl Hoi4World {
    pub fn new(save: &Hoi4Save, game: GameData) -> Self {
        let countries = save
            .countries
            .iter()
            .map(|(tag, country)| (*tag, country_style(&game, *tag, country)))
            .collect();

        let control = game
            .provinces()
            .iter()
            .map(|province| province_control(save, &game, province))
            .collect();

        let mut landed: Vec<_> = save.states.values().filter_map(|x| x.owner).collect();
        landed.sort_unstable();
        landed.dedup();

        // The first land province of each state
        let mut state_provinces = HashMap::new();
        for province in game.provinces() {
            if let (Some(id), Some(state_id), ProvinceKind::Land) =
                (province.id, province.state_id, province.kind)
            {
                state_provinces.entry(state_id).or_insert(id);
            }
        }

        let capitals = save
            .countries
            .iter()
            .filter_map(|(tag, country)| {
                let province = state_provinces.get(&StateId::new(country.capital))?;
                Some((*tag, *province))
            })
            .collect();

        let province_indices = game
            .provinces()
            .iter()
            .enumerate()
            .filter_map(|(idx, x)| Some((x.id?, idx)))
            .collect();

        Self {
            game,
            countries,
            control,
            landed,
            capitals,
            province_indices,
        }
    }

    pub fn game(&self) -> &GameData {
        &self.game
    }

    fn country_rgb(&self, tag: CountryTag) -> [u8; 3] {
        self.countries
            .get(&tag)
            .map_or_else(|| fallback_color(tag.as_str()), |x| x.color)
    }

    fn country_color(&self, tag: CountryTag) -> GpuColor {
        GpuColor::from(self.country_rgb(tag))
    }

    /// Location arrays for the political map. As in the game, a province has
    /// the color of the country that controls it, so the fill shows the
    /// front lines. The political borders follow the owners, so an occupied
    /// country keeps its borders.
    pub fn political_location_arrays(&self) -> LocationArrays {
        let len = self.game.provinces().len();
        let mut ids = Vec::with_capacity(len);
        let mut fills = Vec::with_capacity(len);
        let mut borders = Vec::with_capacity(len);

        for (province, control) in self.game.provinces().iter().zip(&self.control) {
            ids.push(LocationId::new(province.id.map_or(0, ProvinceId::value)));
            let (fill, border) = match (control.kind, control.owner) {
                (ProvinceDetailsKind::Sea | ProvinceDetailsKind::Lake, _) => {
                    (GpuColor::WATER, GpuColor::WATER)
                }
                (ProvinceDetailsKind::Impassable, _) => {
                    (GpuColor::IMPASSABLE, GpuColor::IMPASSABLE)
                }
                (ProvinceDetailsKind::Land, Some(owner)) => {
                    let border = self.country_color(owner);
                    let fill = control.controller.map_or(border, |x| self.country_color(x));
                    (fill, border)
                }
                (ProvinceDetailsKind::Land, None) => (GpuColor::UNOWNED, GpuColor::UNOWNED),
            };
            fills.push(fill);
            borders.push(border);
        }

        // The game does not show stripes, so the secondary colors are the
        // same as the fill.
        let mut arrays = LocationArrays::from_locations(&ids);
        arrays.set_primary_colors(&fills);
        arrays.set_secondary_colors(&fills);
        arrays.set_border_colors(&borders);
        arrays.set_flags(&self.location_flags(None));
        arrays
    }

    /// Flags for each location. The provinces that `highlight` owns are
    /// highlighted.
    pub fn location_flags(&self, highlight: Option<CountryTag>) -> Vec<LocationFlags> {
        self.control
            .iter()
            .map(|control| {
                let mut flags = match (control.kind, control.owner) {
                    (ProvinceDetailsKind::Sea, _) => LocationFlags::WATER,
                    (ProvinceDetailsKind::Lake, _) => LocationFlags::LAKE,
                    (ProvinceDetailsKind::Impassable, _) => LocationFlags::IMPASSABLE,
                    (ProvinceDetailsKind::Land, Some(_)) => LocationFlags::empty(),
                    (ProvinceDetailsKind::Land, None) => LocationFlags::UNOWNED,
                };

                if highlight.is_some() && control.owner == highlight {
                    flags.set(LocationFlags::HIGHLIGHTED);
                }
                flags
            })
            .collect()
    }

    pub fn country(&self, tag: CountryTag) -> CountryDisplay {
        let [r, g, b] = self.country_rgb(tag);
        let name = self
            .countries
            .get(&tag)
            .map_or_else(|| tag.to_string(), |x| x.name.clone());
        CountryDisplay {
            tag: tag.to_string(),
            name,
            color: format!("#{r:02x}{g:02x}{b:02x}"),
        }
    }

    /// Countries that own at least one state
    pub fn landed_countries(&self) -> Vec<CountryDisplay> {
        self.landed.iter().map(|tag| self.country(*tag)).collect()
    }

    pub fn province(&self, province_id: ProvinceId) -> Option<ProvinceDetails> {
        let idx = *self.province_indices.get(&province_id)?;
        let province = &self.game.provinces()[idx];
        let control = self.control[idx];
        let state = province.state_id.and_then(|x| self.game.state(x));
        let controller = control.controller.filter(|x| Some(*x) != control.owner);
        Some(ProvinceDetails {
            province_id: province_id.value(),
            kind: control.kind,
            state_id: state.map(|x| x.id.value()),
            state_name: state.map(|x| x.name.clone()),
            owner: control.owner.map(|x| self.country(x)),
            controller: controller.map(|x| self.country(x)),
        })
    }

    /// A province in the capital state of the country, so that the map can
    /// center on it.
    pub fn capital_province(&self, tag: CountryTag) -> Option<ProvinceId> {
        self.capitals.get(&tag).copied()
    }
}

fn province_control(save: &Hoi4Save, game: &GameData, province: &GameProvince) -> ProvinceControl {
    let game_state = province.state_id.and_then(|x| game.state(x));
    let kind = match province.kind {
        ProvinceKind::Sea => ProvinceDetailsKind::Sea,
        ProvinceKind::Lake => ProvinceDetailsKind::Lake,
        ProvinceKind::Land if game_state.is_some_and(|x| x.impassable) => {
            ProvinceDetailsKind::Impassable
        }
        ProvinceKind::Land => ProvinceDetailsKind::Land,
    };

    // A province controller takes precedence over a state controller.
    let state = province.state_id.and_then(|x| save.states.get(&x.value()));
    let owner = state.and_then(|x| x.owner);
    let controller = province
        .id
        .and_then(|x| save.provinces.get(&x.value()))
        .and_then(|x| x.controller)
        .or_else(|| state.and_then(|x| x.controller))
        .or(owner);

    ProvinceControl {
        kind,
        owner,
        controller,
    }
}

fn country_style(game: &GameData, tag: CountryTag, country: &Country) -> CountryStyle {
    let cosmetic = country.cosmetic_tag.as_deref();
    let color = cosmetic
        .and_then(|x| game.color(x))
        .or_else(|| game.color(tag.as_str()))
        .unwrap_or_else(|| fallback_color(tag.as_str()));

    let ideology = country
        .politics
        .as_ref()
        .and_then(|x| x.ruling_party.as_deref());

    let mut name_keys = Vec::with_capacity(4);
    for key in cosmetic.into_iter().chain(std::iter::once(tag.as_str())) {
        if let Some(ideology) = ideology {
            name_keys.push(format!("{key}_{ideology}"));
        }
        name_keys.push(key.to_string());
    }

    let name = name_keys
        .iter()
        .find_map(|key| game.localize(key))
        .map(String::from)
        .unwrap_or_else(|| tag.to_string());

    CountryStyle { name, color }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CountryColor, GameState};

    fn save() -> Hoi4Save {
        let data = br#"HOI4txt
player="FRA"
date="1938.1.1.12"
countries={
	FRA={ capital=1 cosmetic_tag="" politics={ ruling_party=democratic } }
	GER={ capital=2 cosmetic_tag="" politics={ ruling_party=fascism } }
}
states={
	1={ owner="FRA" }
	2={ owner="GER" }
	3={ owner="GER" }
}
provinces={
	11={ controller="GER" }
}
"#;
        let file = hoi4save::Hoi4File::from_slice(data).unwrap();
        let resolver = hoi4save::BasicTokenResolver::from_text_lines(&b""[..]).unwrap();
        file.parse_save(&resolver).unwrap()
    }

    fn game() -> GameData {
        let province = |id, kind, state_id| GameProvince {
            id: Some(ProvinceId::new(id)),
            kind,
            state_id: (state_id != 0).then(|| StateId::new(state_id)),
        };
        let state = |id, impassable| GameState {
            id: StateId::new(id),
            name: format!("State {id}"),
            impassable,
        };
        GameData::new(
            vec![
                province(10, ProvinceKind::Land, 1),
                province(11, ProvinceKind::Land, 1),
                province(20, ProvinceKind::Land, 2),
                province(30, ProvinceKind::Land, 3),
                province(40, ProvinceKind::Sea, 0),
                province(50, ProvinceKind::Land, 0),
            ],
            vec![state(1, false), state(2, false), state(3, true)],
            vec![
                CountryColor {
                    key: String::from("FRA"),
                    color: [0, 0, 255],
                },
                CountryColor {
                    key: String::from("GER"),
                    color: [100, 100, 100],
                },
            ],
            vec![(String::from("GER_fascism"), String::from("German Reich"))],
        )
    }

    #[test]
    fn test_political_colors() {
        let world = Hoi4World::new(&save(), game());
        let arrays = world.political_location_arrays();
        let buffers = arrays.buffers();
        let primary = buffers.primary_colors();
        let secondary = buffers.secondary_colors();
        let borders = buffers.border_colors();
        let flags = buffers.state_flags();
        let france = GpuColor::from([0, 0, 255]);
        let germany = GpuColor::from([100, 100, 100]);

        // No province has stripes
        assert_eq!(primary, secondary);

        // Province 11 is in a French state, but Germany controls it. Thus it
        // has the German fill and the French border.
        assert_eq!((primary[0], borders[0]), (france, france));
        assert_eq!((primary[1], borders[1]), (germany, france));
        assert_eq!((primary[2], borders[2]), (germany, germany));
        assert_eq!(primary[3], GpuColor::IMPASSABLE);
        assert!(flags[3].contains(LocationFlags::IMPASSABLE));
        assert_eq!(primary[4], GpuColor::WATER);
        assert!(flags[4].contains(LocationFlags::WATER));
        assert_eq!(primary[5], GpuColor::UNOWNED);
        assert!(flags[5].contains(LocationFlags::UNOWNED));
        assert_eq!(buffers.location_ids()[1], LocationId::new(11));
    }

    #[test]
    fn test_highlight_and_details() {
        let world = Hoi4World::new(&save(), game());
        let tag: CountryTag = "FRA".parse().unwrap();
        let flags = world.location_flags(Some(tag));
        let highlighted: Vec<_> = flags
            .iter()
            .map(|x| x.contains(LocationFlags::HIGHLIGHTED))
            .collect();
        assert_eq!(highlighted, vec![true, true, false, false, false, false]);

        let details = world.province(ProvinceId::new(11)).unwrap();
        assert_eq!(details.owner.unwrap().tag, "FRA");
        let controller = details.controller.unwrap();
        assert_eq!(controller.name, "German Reich");
        assert_eq!(controller.color, "#646464");
        assert!(
            world
                .province(ProvinceId::new(10))
                .unwrap()
                .controller
                .is_none()
        );
        assert_eq!(world.capital_province(tag), Some(ProvinceId::new(10)));
    }
}
