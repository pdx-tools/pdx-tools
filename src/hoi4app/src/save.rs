//! The parts of a HOI4 save that the map and the analysis read.
//!
//! The model is read through the generic deserializer of `hoi4save`, so a
//! single pass over the save fills it.

use hoi4save::{CountryTag, Hoi4Date};
use jomini::JominiDeserialize;
use serde::{Deserialize, Deserializer, de};
use std::{collections::HashMap, fmt, marker::PhantomData};

#[derive(JominiDeserialize, Debug, Clone)]
pub struct SaveModel {
    #[jomini(default)]
    pub player: Option<String>,
    pub date: Hoi4Date,

    /// The game version that wrote the save (eg: "Operation Postern
    /// v1.19.3.0.c01a (5632)")
    #[jomini(default)]
    pub version: Option<String>,

    #[jomini(default)]
    pub start_date: Option<Hoi4Date>,

    #[jomini(default, deserialize_with = "deserialize_vec_pair")]
    pub countries: Vec<(CountryTag, Country)>,

    /// The states, keyed by state id. The provinces of a state come from the
    /// game files.
    #[jomini(default, deserialize_with = "deserialize_id_map")]
    pub states: HashMap<u32, State>,

    /// Provinces keyed by province id. Newer saves write only some provinces,
    /// so the presence of a province is not a signal.
    #[jomini(default, deserialize_with = "deserialize_id_map")]
    pub provinces: HashMap<u32, Province>,

    #[jomini(duplicated, alias = "faction")]
    pub factions: Vec<Faction>,

    #[jomini(default)]
    pub history: History,

    /// The end-of-game statistics of each player country
    #[jomini(default, deserialize_with = "deserialize_playthroughs")]
    pub all_playthrough_data: Vec<(String, Playthrough)>,

    #[jomini(default)]
    pub statistics_collection_enabled: Option<bool>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Country {
    #[serde(default)]
    pub stability: f64,
    #[serde(default)]
    pub war_support: f64,
    #[serde(default, deserialize_with = "deserialize_numbers")]
    pub variables: HashMap<String, f64>,

    /// The cosmetic tag that changes the name, flag, and color
    #[serde(default, deserialize_with = "empty_string_is_none")]
    pub cosmetic_tag: Option<String>,

    /// The state id of the capital
    #[serde(default)]
    pub capital: u32,

    #[serde(default)]
    pub politics: Option<Politics>,

    #[serde(default)]
    pub diplomacy: Diplomacy,

    #[serde(default)]
    pub occupation_status: OccupationStatus,

    /// The country that a dynamic tag (eg: D02) split from in a civil war
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub original_tag: Option<CountryTag>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Politics {
    /// The ideology group of the party that rules (eg: fascism)
    #[serde(default)]
    pub ruling_party: Option<String>,

    #[serde(default, deserialize_with = "deserialize_vec_pair")]
    pub parties: Vec<(String, Party)>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Party {
    #[serde(default)]
    pub popularity: f64,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Diplomacy {
    #[serde(default, deserialize_with = "deserialize_vec_pair")]
    pub active_relations: Vec<(CountryTag, Relation)>,
    #[serde(default)]
    pub faction_join_date: Option<Hoi4Date>,
    #[serde(default)]
    pub capitulated: bool,
    #[serde(default)]
    pub capitulated_date: Option<Hoi4Date>,

    /// The country that hosts the government in exile
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub hosting_our_government_in_exile: Option<CountryTag>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Relation {
    #[serde(default)]
    pub war_relation: Option<WarRelation>,
}

/// A war between two countries. The save writes each pair in the relations
/// of both countries.
#[derive(Deserialize, Debug, Clone)]
pub struct WarRelation {
    pub first: CountryTag,
    pub second: CountryTag,
    pub start_date: Hoi4Date,
    #[serde(default)]
    pub first_casualties: f64,
    #[serde(default)]
    pub second_casualties: f64,
    #[serde(default)]
    pub first_was_instigator: bool,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct OccupationStatus {
    #[serde(default, deserialize_with = "deserialize_vec_pair")]
    pub occupation: Vec<(CountryTag, Occupation)>,
}

/// The states that a country occupies from one other country
#[derive(Deserialize, Debug, Clone, Default)]
pub struct Occupation {
    #[serde(default, deserialize_with = "deserialize_ids")]
    pub states: Vec<u32>,
    #[serde(default, deserialize_with = "number_or_zero")]
    pub resistance: f64,
    #[serde(default, deserialize_with = "number_or_zero")]
    pub compliance: f64,
    #[serde(default, deserialize_with = "deserialize_vec_pair")]
    pub occupation_law_list: Vec<(Id, String)>,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct State {
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub owner: Option<CountryTag>,

    /// The controller, when it is not the owner. Older saves (eg: 1.10) do
    /// not write it.
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub controller: Option<CountryTag>,

    #[serde(default, deserialize_with = "deserialize_vec_pair")]
    pub buildings: Vec<(String, Building)>,
}

impl State {
    /// The civilian factories, military factories, and dockyards
    pub fn factories(&self) -> u32 {
        self.buildings
            .iter()
            .filter(|(name, _)| {
                matches!(
                    name.as_str(),
                    "industrial_complex" | "arms_factory" | "dockyard"
                )
            })
            .map(|(_, x)| x.level.max(0.0) as u32)
            .sum()
    }
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Building {
    #[serde(default, deserialize_with = "deserialize_level")]
    pub level: f64,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Province {
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub controller: Option<CountryTag>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Faction {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub color: Vec<f64>,
    #[serde(default)]
    pub ideology: Option<String>,
    #[serde(default)]
    pub members: Vec<CountryTag>,
}

impl Faction {
    pub fn rgb(&self) -> Option<[u8; 3]> {
        match self.color.as_slice() {
            [r, g, b] => Some([*r as u8, *g as u8, *b as u8]),
            _ => None,
        }
    }
}

#[derive(JominiDeserialize, Debug, Clone, Default)]
pub struct History {
    #[jomini(duplicated)]
    pub sunk_ship: Vec<SunkShip>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct SunkShip {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub killer_name: Option<String>,
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub country: Option<CountryTag>,
    #[serde(default, deserialize_with = "empty_tag_is_none")]
    pub killer_country: Option<CountryTag>,
    #[serde(default)]
    pub definition: String,
    pub date: Hoi4Date,
    #[serde(default)]
    pub convoy: bool,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct Playthrough {
    #[serde(default)]
    pub data: PlaythroughData,
}

#[derive(Deserialize, Debug, Clone, Default)]
pub struct PlaythroughData {
    /// The values of this run. The meaning of `second` is not known, so it
    /// is not read.
    #[serde(default, deserialize_with = "deserialize_numbers")]
    pub first: HashMap<String, f64>,
}

pub(crate) fn deserialize_vec_pair<'de, D, K, V>(deserializer: D) -> Result<Vec<(K, V)>, D::Error>
where
    D: Deserializer<'de>,
    K: Deserialize<'de>,
    V: Deserialize<'de>,
{
    struct VecPairVisitor<K, V>(PhantomData<(K, V)>);

    impl<'de, K: Deserialize<'de>, V: Deserialize<'de>> de::Visitor<'de> for VecPairVisitor<K, V> {
        type Value = Vec<(K, V)>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map")
        }

        fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
            let mut values = Vec::with_capacity(map.size_hint().unwrap_or(0));
            while let Some(entry) = map.next_entry()? {
                values.push(entry);
            }
            Ok(values)
        }

        // An empty object (`{ }`) can read as an empty array.
        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            while seq.next_element::<de::IgnoredAny>()?.is_some() {}
            Ok(Vec::new())
        }
    }

    deserializer.deserialize_map(VecPairVisitor(PhantomData))
}

/// An id that the save writes as an integer or, in binary saves, as a
/// quoted string
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Id(pub u32);

impl<'de> Deserialize<'de> for Id {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct IdVisitor;

        impl de::Visitor<'_> for IdVisitor {
            type Value = Id;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("an integer id")
            }

            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                u32::try_from(v)
                    .map(Id)
                    .map_err(|_| E::invalid_value(de::Unexpected::Signed(v), &self))
            }

            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                u32::try_from(v)
                    .map(Id)
                    .map_err(|_| E::invalid_value(de::Unexpected::Unsigned(v), &self))
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                v.parse()
                    .map(Id)
                    .map_err(|_| E::invalid_value(de::Unexpected::Str(v), &self))
            }
        }

        deserializer.deserialize_u32(IdVisitor)
    }
}

fn deserialize_id_map<'de, D, V>(deserializer: D) -> Result<HashMap<u32, V>, D::Error>
where
    D: Deserializer<'de>,
    V: Deserialize<'de>,
{
    let pairs: Vec<(Id, V)> = deserialize_vec_pair(deserializer)?;
    Ok(pairs.into_iter().map(|(Id(k), v)| (k, v)).collect())
}

fn deserialize_ids<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u32>, D::Error> {
    let ids: Vec<Id> = Vec::deserialize(deserializer)?;
    Ok(ids.into_iter().map(|Id(x)| x).collect())
}

fn empty_string_is_none<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    let value = String::deserialize(deserializer)?;
    Ok((!value.is_empty()).then_some(value))
}

fn empty_tag_is_none<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<CountryTag>, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.is_empty() {
        return Ok(None);
    }
    value.parse().map(Some).map_err(de::Error::custom)
}

/// A number, or `None` for a value that is not a number (eg: an array)
struct MaybeNumber(Option<f64>);

impl<'de> Deserialize<'de> for MaybeNumber {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct NumberVisitor;

        impl<'de> de::Visitor<'de> for NumberVisitor {
            type Value = MaybeNumber;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a value")
            }

            fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
                Ok(MaybeNumber(Some(v as f64)))
            }

            fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
                Ok(MaybeNumber(Some(v as f64)))
            }

            fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
                Ok(MaybeNumber(Some(v)))
            }

            fn visit_bool<E>(self, _: bool) -> Result<Self::Value, E> {
                Ok(MaybeNumber(None))
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
                Ok(MaybeNumber(v.parse().ok()))
            }

            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                while seq.next_element::<de::IgnoredAny>()?.is_some() {}
                Ok(MaybeNumber(None))
            }

            fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                while map
                    .next_entry::<de::IgnoredAny, de::IgnoredAny>()?
                    .is_some()
                {}
                Ok(MaybeNumber(None))
            }
        }

        deserializer.deserialize_any(NumberVisitor)
    }
}

/// Older saves (eg: 1.10) write the health of each level as an array, so
/// the level is the length of the array.
fn deserialize_level<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    struct LevelVisitor;

    impl<'de> de::Visitor<'de> for LevelVisitor {
        type Value = f64;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a level")
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E> {
            Ok(v as f64)
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E> {
            Ok(v as f64)
        }

        fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E> {
            Ok(v)
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E> {
            Ok(v.parse().unwrap_or(0.0))
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut count = 0.0;
            while seq.next_element::<de::IgnoredAny>()?.is_some() {
                count += 1.0;
            }
            Ok(count)
        }
    }

    deserializer.deserialize_any(LevelVisitor)
}

fn number_or_zero<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    Ok(MaybeNumber::deserialize(deserializer)?.0.unwrap_or(0.0))
}

/// A map of names to numbers. Values that are not numbers are skipped.
fn deserialize_numbers<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<HashMap<String, f64>, D::Error> {
    let pairs: Vec<(String, MaybeNumber)> = deserialize_vec_pair(deserializer)?;
    Ok(pairs
        .into_iter()
        .filter_map(|(k, v)| v.0.map(|v| (k, v)))
        .collect())
}

/// The playthrough block is an array of objects, and each object holds one
/// or more countries: `{ { "BHU" { data={ … } } } }`.
fn deserialize_playthroughs<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<(String, Playthrough)>, D::Error> {
    struct Entry(Vec<(String, Playthrough)>);

    impl<'de> Deserialize<'de> for Entry {
        fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
            deserialize_vec_pair(deserializer).map(Entry)
        }
    }

    struct PlaythroughsVisitor;

    impl<'de> de::Visitor<'de> for PlaythroughsVisitor {
        type Value = Vec<(String, Playthrough)>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("an array of playthroughs")
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut result = Vec::new();
            while let Some(Entry(entries)) = seq.next_element()? {
                result.extend(entries);
            }
            Ok(result)
        }

        fn visit_map<A: de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
            let mut result = Vec::new();
            while let Some(entry) = map.next_entry()? {
                result.push(entry);
            }
            Ok(result)
        }
    }

    deserializer.deserialize_seq(PlaythroughsVisitor)
}
