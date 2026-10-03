//! The parts of a save that the map uses.

use crate::{CountryId, ProvinceId, StateId, deserialize_reference};
use serde::{
    Deserialize, Deserializer,
    de::{self, DeserializeOwned, SeqAccess, Visitor},
};
use std::{collections::HashMap, fmt, hash::Hash};
use vic3save::savefile::Vic3Manager;

/// A save database with IDs of one type.
#[derive(Debug)]
pub struct SaveManager<Id, Of> {
    pub database: HashMap<Id, Option<Of>>,
}

impl<'de, Id, Of> Deserialize<'de> for SaveManager<Id, Of>
where
    Id: From<u32> + Eq + Hash,
    Of: DeserializeOwned,
{
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let manager = Vic3Manager::<Of>::deserialize(deserializer)?;
        Ok(Self {
            database: manager
                .database
                .into_iter()
                .map(|(id, value)| (Id::from(id), value))
                .collect(),
        })
    }
}

/// The name of a country that changed its name (eg: after a formation)
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DynamicName {
    pub dynamic_country_name: Option<String>,
}

/// The map data of a country in `country_manager`
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SaveCountry {
    pub definition: String,
    pub country_type: Option<String>,

    /// The save id of the capital state
    #[serde(default, deserialize_with = "deserialize_reference")]
    pub capital: Option<StateId>,

    /// A map color that replaces the color of the country definition
    pub map_color: Option<SaveColor>,
    pub dynamic_name: Option<DynamicName>,
}

/// The countries in a diplomatic pact. The first country is the overlord
/// when the pact is a subject relationship.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PactTargets {
    #[serde(default, deserialize_with = "deserialize_reference")]
    pub first: Option<CountryId>,
    #[serde(default, deserialize_with = "deserialize_reference")]
    pub second: Option<CountryId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SavePact {
    pub targets: PactTargets,
    pub action: String,
}

impl SavePact {
    pub fn is_subject(&self) -> bool {
        matches!(
            self.action.as_str(),
            "colony"
                | "dominion"
                | "puppet"
                | "protectorate"
                | "tributary"
                | "vassal"
                | "personal_union"
                | "crown_land"
                | "chartered_company"
        )
    }
}

/// The state and country that control an occupied area.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SaveOccupation {
    pub state: Option<StateId>,
    pub controller: Option<CountryId>,
}

impl<'de> Deserialize<'de> for SaveOccupation {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct OccupationVisitor;

        impl<'de> Visitor<'de> for OccupationVisitor {
            type Value = SaveOccupation;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("an occupation or none")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                if v == "none" {
                    Ok(SaveOccupation::default())
                } else {
                    Err(E::custom("expected an occupation or none"))
                }
            }

            fn visit_map<A: de::MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
                #[derive(Deserialize)]
                struct Occupation {
                    #[serde(default, deserialize_with = "deserialize_reference")]
                    state: Option<StateId>,
                    #[serde(default, deserialize_with = "deserialize_reference")]
                    controller: Option<CountryId>,
                }

                let value = Occupation::deserialize(de::value::MapAccessDeserializer::new(map))?;
                Ok(SaveOccupation {
                    state: value.state,
                    controller: value.controller,
                })
            }
        }

        deserializer.deserialize_map(OccupationVisitor)
    }
}

#[derive(Debug, Default, Deserialize)]
pub struct SaveWarManager {
    #[serde(default)]
    pub occupations: HashMap<u32, SaveOccupation>,
}

impl SaveCountry {
    pub fn capital(&self) -> Option<StateId> {
        self.capital
    }
}

/// The provinces of a state as a list of ranges. Each range is a pair of
/// the first province id and the number of provinces that follow it.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
pub struct ProvinceRanges {
    #[serde(default)]
    pub provinces: Vec<u32>,
}

impl ProvinceRanges {
    /// The ids of the provinces in the ranges
    pub fn ids(&self) -> impl Iterator<Item = ProvinceId> + '_ {
        self.provinces
            .as_chunks::<2>()
            .0
            .iter()
            .flat_map(|[start, rest]| *start..=start.saturating_add(*rest))
            .map(ProvinceId::new)
    }
}

/// The map data of a state in `states`
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveState {
    /// The save id of the owner country
    #[serde(default, deserialize_with = "deserialize_reference")]
    pub country: Option<CountryId>,

    /// The province id of the state capital
    #[serde(default, deserialize_with = "deserialize_reference")]
    pub capital: Option<ProvinceId>,

    #[serde(default)]
    pub provinces: ProvinceRanges,
}

impl SaveState {
    pub fn country(&self) -> Option<CountryId> {
        self.country
    }

    pub fn capital(&self) -> Option<ProvinceId> {
        self.capital
    }
}

/// The map data of a save
#[derive(Debug, Default)]
pub struct Vic3MapSave {
    pub countries: HashMap<CountryId, SaveCountry>,
    pub states: HashMap<StateId, SaveState>,
    pub overlords: HashMap<CountryId, CountryId>,
    pub controllers: HashMap<StateId, CountryId>,
}

impl Vic3MapSave {
    pub fn new(
        countries: HashMap<CountryId, SaveCountry>,
        states: SaveManager<StateId, SaveState>,
    ) -> Self {
        let states = states
            .database
            .into_iter()
            .filter_map(|(id, state)| state.map(|x| (id, x)))
            .collect();
        Self {
            countries,
            states,
            ..Self::default()
        }
    }

    pub fn with_diplomacy(
        mut self,
        pacts: Option<Vic3Manager<SavePact>>,
        war_manager: SaveWarManager,
    ) -> Self {
        if let Some(pacts) = pacts {
            self.overlords = pacts
                .database
                .into_values()
                .flatten()
                .filter(SavePact::is_subject)
                .filter_map(|pact| Some((pact.targets.second?, pact.targets.first?)))
                .collect();
        }
        self.controllers = war_manager
            .occupations
            .into_values()
            .filter_map(|occupation| Some((occupation.state?, occupation.controller?)))
            .collect();
        self
    }
}

/// An RGB color. A binary save stores it as a sequence of three numbers and
/// a text save stores it as `rgb { 1 2 3 }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaveColor(pub [u8; 3]);

/// The first element of a color sequence: a channel (binary) or a header
/// (text)
enum ColorStart {
    Channel(u8),
    Header(String),
}

impl<'de> Deserialize<'de> for ColorStart {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct StartVisitor;

        impl Visitor<'_> for StartVisitor {
            type Value = ColorStart;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a color channel or a color header")
            }

            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(ColorStart::Channel(v.min(255) as u8))
            }

            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(ColorStart::Channel(v.clamp(0, 255) as u8))
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(ColorStart::Header(v.to_ascii_lowercase()))
            }
        }

        // A text header is only a string when a string is requested. The
        // binary channels give a number for each request.
        deserializer.deserialize_str(StartVisitor)
    }
}

impl<'de> Deserialize<'de> for SaveColor {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ColorVisitor;

        impl<'de> Visitor<'de> for ColorVisitor {
            type Value = SaveColor;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a color")
            }

            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let missing = || de::Error::custom("color has too few channels");
                let start = seq.next_element::<ColorStart>()?.ok_or_else(missing)?;
                let color = match start {
                    ColorStart::Channel(r) => {
                        let g = seq.next_element::<u8>()?.ok_or_else(missing)?;
                        let b = seq.next_element::<u8>()?.ok_or_else(missing)?;
                        [r, g, b]
                    }
                    ColorStart::Header(header) if header == "rgb" => {
                        let (r, g, b) = seq.next_element::<(u8, u8, u8)>()?.ok_or_else(missing)?;
                        [r, g, b]
                    }
                    ColorStart::Header(header) if header == "hsv" => {
                        let (h, s, v) =
                            seq.next_element::<(f64, f64, f64)>()?.ok_or_else(missing)?;
                        crate::hsv_to_rgb(h, s, v)
                    }
                    ColorStart::Header(header) => {
                        return Err(de::Error::custom(format!("unknown color type: {header}")));
                    }
                };

                // Ignore an alpha channel
                while seq.next_element::<de::IgnoredAny>()?.is_some() {}
                Ok(SaveColor(color))
            }
        }

        deserializer.deserialize_seq(ColorVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, Deserialize)]
    struct Countries {
        country: SaveCountry,
    }

    #[test]
    fn test_text_country() {
        let data = br#"country={
            definition="USA"
            capital=12
            map_color=rgb { 8 89 54 }
            dynamic_name={
                dynamic_country_name="dyn_c_united_states"
                dynamic_country_adjective="USA_ADJ"
            }
        }"#;
        let out: Countries = jomini::text::de::from_utf8_slice(data).unwrap();
        assert_eq!(out.country.definition, "USA");
        assert_eq!(out.country.capital(), Some(StateId::new(12)));
        assert_eq!(out.country.map_color, Some(SaveColor([8, 89, 54])));
        assert_eq!(
            out.country
                .dynamic_name
                .and_then(|x| x.dynamic_country_name)
                .as_deref(),
            Some("dyn_c_united_states")
        );
    }

    #[test]
    fn test_state_ranges() {
        #[derive(Debug, Deserialize)]
        struct States {
            state: SaveState,
        }

        let data = br#"state={
            capital=23570
            country=3
            provinces={ provinces={ 23547 2 19075 0 } }
        }"#;
        let out: States = jomini::text::de::from_utf8_slice(data).unwrap();
        let ids: Vec<_> = out.state.provinces.ids().collect();
        assert_eq!(ids, [23547, 23548, 23549, 19075].map(ProvinceId::new));
        assert_eq!(out.state.country(), Some(CountryId::new(3)));
        assert_eq!(out.state.capital(), Some(ProvinceId::new(23570)));
    }

    #[test]
    fn test_unset_references() {
        #[derive(Deserialize)]
        struct References {
            country: SaveCountry,
            state: SaveState,
            targets: PactTargets,
        }

        let data = br#"
            country={ definition="USA" capital=4294967295 }
            state={ country=4294967295 capital=4294967295 }
            targets={ first=4294967295 second=0 }
        "#;
        let references: References = jomini::text::de::from_utf8_slice(data).unwrap();
        assert_eq!(references.country.capital, None);
        assert_eq!(references.state.country, None);
        assert_eq!(references.state.capital, None);
        assert_eq!(references.targets.first, None);
        assert_eq!(references.targets.second, Some(CountryId::new(0)));

        let data = br#"country={ definition="USA" } state={} targets={}"#;
        let references: References = jomini::text::de::from_utf8_slice(data).unwrap();
        assert_eq!(references.country.capital, None);
        assert_eq!(references.state.country, None);
        assert_eq!(references.state.capital, None);
        assert_eq!(references.targets.first, None);
        assert_eq!(references.targets.second, None);
    }

    #[test]
    fn test_diplomacy() {
        #[derive(Deserialize)]
        struct Diplomacy {
            pacts: Vic3Manager<SavePact>,
            war_manager: SaveWarManager,
        }

        let data = br#"
            pacts={ database={
                1={ targets={ first=1 second=2 } action="puppet" }
                2={ targets={ first=2 second=3 } action="colony" }
                3={ targets={ first=1 second=4 } action="increase_relations" }
                4=none
            } }
            war_manager={ occupations={
                1=none
                2={ state=274 controller=9 occupations={ { country=9 fraction=1 } } }
                3={ state=275 controller=4294967295 }
            } }
        "#;
        let diplomacy: Diplomacy = jomini::text::de::from_utf8_slice(data).unwrap();
        let save =
            Vic3MapSave::default().with_diplomacy(Some(diplomacy.pacts), diplomacy.war_manager);
        assert_eq!(
            save.overlords,
            HashMap::from([
                (CountryId::new(2), CountryId::new(1)),
                (CountryId::new(3), CountryId::new(2))
            ])
        );
        assert_eq!(
            save.controllers,
            HashMap::from([(StateId::new(274), CountryId::new(9))])
        );
    }
}
