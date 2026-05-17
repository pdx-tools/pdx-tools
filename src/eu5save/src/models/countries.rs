use crate::models::ReligionId;
use crate::models::bstr::BStr;
use crate::models::{Color, LocationId, de::Maybe};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{
    Deserialize, Deserializer,
    de::{self, DeserializeSeed, IgnoredAny, value::MapAccessDeserializer},
};
use std::ops::IndexMut;
use std::{collections::HashMap, fmt, num::NonZeroU32, ops::Index};

/// A country ID as stored in the save file; may be [CountryId::DUMMY]
///
/// Consider [CountryId::real_id]
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, ArenaDeserialize, Deserialize,
)]
pub struct CountryId(u32);

impl CountryId {
    const DUMMY: CountryId = CountryId(0);

    #[inline]
    pub fn new(id: u32) -> Self {
        CountryId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }

    #[inline]
    pub fn is_dummy(&self) -> bool {
        *self == CountryId::DUMMY
    }

    #[inline]
    pub fn real_id(&self) -> Option<RealCountryId> {
        NonZeroU32::new(self.0).map(RealCountryId)
    }
}

impl Default for CountryId {
    fn default() -> Self {
        CountryId::DUMMY
    }
}

/// A country ID that is not [CountryId::DUMMY]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RealCountryId(NonZeroU32);

impl RealCountryId {
    #[inline]
    pub fn country_id(self) -> CountryId {
        CountryId(self.0.get())
    }
}

impl From<RealCountryId> for CountryId {
    #[inline]
    fn from(real: RealCountryId) -> Self {
        real.country_id()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CountryIdx(NonZeroU32);

impl CountryIdx {
    #[inline]
    fn index(self) -> usize {
        self.0.get() as usize - 1
    }

    #[inline]
    fn from_index(index: usize) -> Self {
        CountryIdx(NonZeroU32::new(index as u32 + 1).unwrap())
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0.get()
    }

    #[inline]
    pub fn from_value(v: u32) -> Option<Self> {
        NonZeroU32::new(v).map(CountryIdx)
    }
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct CountryTag<'bump>(BStr<'bump>);

impl<'bump> CountryTag<'bump> {
    pub fn to_str(&self) -> &str {
        self.0.to_str()
    }
}

#[derive(Debug)]
pub struct Countries<'bump> {
    ids: CountryIndexedVec<'bump, CountryId>,
    tags: CountryIndexedVec<'bump, CountryTag<'bump>>,
    database: CountryIndexedVec<'bump, Option<Country<'bump>>>,
}

impl<'bump> Countries<'bump> {
    pub fn get(&self, id: impl Into<CountryId>) -> Option<CountryIdx> {
        self.get_idx(id.into())
    }

    fn get_idx(&self, id: CountryId) -> Option<CountryIdx> {
        // Fast path: check if the country is at the same index as its tag
        let index = id.value() as usize;
        if self.ids.data.get(index).is_some_and(|cid| *cid == id) {
            return Some(CountryIdx::from_index(index));
        }

        // Otherwise it is probably one of the more dynamic IDs at the end of
        // the list and we may have to search a few dozen for it.
        let index = self.ids.iter().rposition(|cid| *cid == id)?;
        Some(CountryIdx::from_index(index))
    }

    pub fn get_entry(&self, id: CountryId) -> Option<CountryEntry<'_>> {
        Some(self.index(self.get(id)?))
    }

    pub fn index(&self, idx: CountryIdx) -> CountryEntry<'_> {
        CountryEntry {
            idx,
            countries: self,
        }
    }

    pub fn len(&self) -> usize {
        self.ids.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.ids.data.is_empty()
    }

    pub fn iter(&self) -> CountriesIter<'_> {
        CountriesIter::new(self)
    }

    pub fn create_index<T: Clone>(&self, initial: T) -> CountryIndexedVecOwned<T> {
        CountryIndexedVecOwned {
            data: vec![initial; self.len()].into_boxed_slice(),
        }
    }
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct CountryEconomy<'bump> {
    #[arena(default)]
    pub income: f64,
    #[arena(default)]
    pub expense: f64,
    #[arena(default)]
    pub monthly_gold: &'bump [f64],
    #[arena(default)]
    pub recent_balance: &'bump [f64],
}

impl<'bump> Default for CountryEconomy<'bump> {
    fn default() -> Self {
        CountryEconomy {
            income: 0.0,
            expense: 0.0,
            monthly_gold: &[],
            recent_balance: &[],
        }
    }
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct Country<'bump> {
    pub country_name: CountryName<'bump>,
    #[arena(default)]
    pub color: Color,
    pub capital: Option<LocationId>,
    #[arena(default)]
    pub historical_population: &'bump [f64],
    #[arena(default)]
    pub historical_tax_base: &'bump [f64],
    #[arena(default)]
    pub previous_tags: &'bump [CountryTag<'bump>],
    #[arena(default)]
    pub economy: CountryEconomy<'bump>,
    #[arena(default)]
    pub great_power_rank: i32,
    #[arena(default)]
    pub artists: i32,
    #[arena(default)]
    pub estimated_monthly_income_trade_and_tax: f64,
    #[arena(default)]
    pub estimated_monthly_income: f64,
    #[arena(default)]
    pub monthly_trade_balance: f64,
    #[arena(default)]
    pub monthly_trade_value: f64,
    #[arena(default)]
    pub current_tax_base: f64,
    #[arena(default)]
    pub monthly_manpower: f64, // x1000
    #[arena(default)]
    pub monthly_sailors: f64, // x1000
    #[arena(default)]
    pub max_manpower: f64, // x1000
    #[arena(default)]
    pub max_sailors: f64, // x1000
    #[arena(default)]
    pub total_produced: f64,
    pub score: CountryScore,
    pub currency_data: CurrencyData,
    pub primary_religion: Option<ReligionId>,
}

impl Country<'_> {
    /// The economic base is defined as the tax base of the country plus the
    /// volume of all its trades
    ///
    /// TODO: factor in sound tolls
    #[inline]
    pub fn economic_base(&self) -> f64 {
        self.current_tax_base + self.monthly_trade_value
    }
}

/// A country name is deceptively complex:
///
/// ```ignore
/// country_name="TEU"
/// ```
///
/// ```ignore
/// country_name={
///    name="CIVILWAR_FACTION_nobles_estate_NAME"
///    adjective="CIVILWAR_FACTION_nobles_estate_ADJECTIVE"
///    base="DNS"
/// }
/// ```
///
/// ```ignore
/// country_name={
///    name="CIVILWAR_FACTION_nobles_estate_NAME"
///    adjective="CIVILWAR_FACTION_nobles_estate_ADJECTIVE"
///    base={
///        name="UNN"
///        override_name="oyama_dynasty"
///        override_adj="oyama_dynasty"
///    }
/// }
/// ```
#[derive(Debug, Clone)]
pub enum CountryName<'bump> {
    Tag(BStr<'bump>),
    Object(CountryNameObject<'bump>),
}

impl<'bump> CountryName<'bump> {
    /// Returns the raw name key: the tag for `Tag` variants, or `obj.name` for objects.
    /// For presentation code use a proper resolver; this is for debug/raw-key access only.
    pub fn name(&self) -> BStr<'bump> {
        match self {
            CountryName::Tag(tag) => *tag,
            CountryName::Object(obj) => obj.name.unwrap_or(BStr::new(&[])),
        }
    }
}

/// The `key` map inside a `country_name` object, e.g. `key={ "Adjective"="YMT_ADJ" }`.
#[derive(Debug, Clone, Default, ArenaDeserialize)]
pub struct CountryNameKeys<'bump> {
    #[arena(default, alias = "Adjective")]
    pub adjective: Option<BStr<'bump>>,
    #[arena(default, alias = "Custom_Name")]
    pub custom_name: Option<BStr<'bump>>,
}

impl<'bump> CountryNameKeys<'bump> {
    pub fn adjective_key(&self) -> Option<BStr<'bump>> {
        self.adjective
    }
}

/// The `bases` map inside a `country_name` object, e.g. `bases={ Base=JAL }`.
#[derive(Debug, Clone, Default, ArenaDeserialize)]
pub struct CountryNameBases<'bump> {
    #[arena(default, alias = "Base")]
    pub base: Option<BStr<'bump>>,
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct CountryNameObject<'bump> {
    /// Absent for placeholder countries (e.g. "Paradox Country" which only has a `key`).
    #[arena(default)]
    pub name: Option<BStr<'bump>>,
    /// Localization key for the display name. May be a plain key (`"tokunoshima"`) or
    /// extracted from a structured object (`override_name={ key="..." ... }`).
    #[arena(default, deserialize_with = "deserialize_override_key")]
    pub override_name: Option<BStr<'bump>>,
    /// Localization key for the adjective form of the override name.
    #[arena(default, deserialize_with = "deserialize_override_key")]
    pub override_adj: Option<BStr<'bump>>,
    /// String-keyed localization entries such as `"Adjective"="YMT_ADJ"`.
    #[arena(default)]
    pub key: CountryNameKeys<'bump>,
    /// Base tag substitutions such as `Base=JAL` used by `$ADJ$` templates.
    #[arena(default)]
    pub bases: CountryNameBases<'bump>,
}

/// Deserializes an `override_name` or `override_adj` value, which may be either:
/// - A plain string: `override_name="tokunoshima"` → captured as-is
/// - A structured object: `override_name={ key="game_dynasty_name_struct_notooltip" ... }`
///   → only the inner `key` string is preserved
/// - A sequence (binary encoding variant) → `None`
fn deserialize_override_key<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<Option<BStr<'bump>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct Visitor<'bump>(&'bump bumpalo::Bump);
    impl<'de, 'bump> de::Visitor<'de> for Visitor<'bump> {
        type Value = Option<BStr<'bump>>;
        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("string or object with key field")
        }
        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            self.visit_bytes(v.as_bytes())
        }
        fn visit_borrowed_str<E: de::Error>(self, v: &'de str) -> Result<Self::Value, E> {
            self.visit_bytes(v.as_bytes())
        }
        fn visit_bytes<E: de::Error>(self, v: &[u8]) -> Result<Self::Value, E> {
            Ok(Some(BStr::new(self.0.alloc_slice_copy(v))))
        }
        fn visit_map<A: de::MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
            #[derive(ArenaDeserialize)]
            struct OverrideKeyObject<'bump> {
                key: BStr<'bump>,
            }
            let obj =
                OverrideKeyObject::deserialize_in_arena(MapAccessDeserializer::new(map), self.0)?;
            Ok(Some(obj.key))
        }
        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            while seq.next_element::<IgnoredAny>()?.is_some() {}
            Ok(None)
        }
    }
    deserializer.deserialize_any(Visitor(allocator))
}

#[derive(Debug, Clone, Deserialize, ArenaDeserialize)]
pub struct CountryScore {
    pub score_place: Option<i32>,
    #[arena(default)]
    pub score_rating: CountryScoreRating,
    #[arena(default)]
    pub score_rank: CountryScoreRank,
}

#[derive(Debug, Clone, Default, Deserialize, ArenaDeserialize)]
pub struct CountryScoreRating {
    #[serde(default, alias = "ADM")]
    pub adm: f64,
    #[serde(default, alias = "DIP")]
    pub dip: f64,
    #[serde(default, alias = "MIL")]
    pub mil: f64,
}

#[derive(Debug, Clone, Default, Deserialize, ArenaDeserialize)]
pub struct CountryScoreRank {
    #[serde(alias = "ADM")]
    pub adm: f64,
    #[serde(alias = "DIP")]
    pub dip: f64,
    #[serde(alias = "MIL")]
    pub mil: f64,
}

#[derive(Debug, Clone, Default, Deserialize, ArenaDeserialize)]
pub struct CurrencyData {
    #[serde(default)]
    pub manpower: f64,
    #[serde(default)]
    pub gold: f64,
    #[serde(default)]
    pub stability: f64,
    #[serde(default)]
    pub prestige: f64,
    #[serde(default)]
    pub army_tradition: f64,
    #[serde(default)]
    pub navy_tradition: f64,
    #[serde(default)]
    pub government_power: f64,
}

struct CountryDatabaseSeed<'bump> {
    country_ids: &'bump [CountryId],
    allocator: &'bump bumpalo::Bump,
}

impl<'bump> CountryDatabaseSeed<'bump> {
    fn new(country_ids: &'bump [CountryId], allocator: &'bump bumpalo::Bump) -> Self {
        Self {
            country_ids,
            allocator,
        }
    }
}

impl<'bump, 'de> DeserializeSeed<'de> for CountryDatabaseSeed<'bump> {
    type Value = &'bump [Option<Country<'bump>>];

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct CountryDatabaseVisitor<'bump> {
            country_ids: &'bump [CountryId],
            allocator: &'bump bumpalo::Bump,
        }

        impl<'bump, 'de> serde::de::Visitor<'de> for CountryDatabaseVisitor<'bump> {
            type Value = &'bump [Option<Country<'bump>>];

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a map of country database entries")
            }

            fn visit_map<V>(self, mut map: V) -> Result<Self::Value, V::Error>
            where
                V: serde::de::MapAccess<'de>,
            {
                // Unfortunately, the tag list and the country database are
                // often not in the same order. We have to match them up by ID.
                let id_idxs = self
                    .country_ids
                    .iter()
                    .enumerate()
                    .map(|(idx, cid)| (cid, idx))
                    .collect::<HashMap<_, _>>();

                let mut database = bumpalo::collections::Vec::with_capacity_in(
                    self.country_ids.len(),
                    self.allocator,
                );
                database.resize(self.country_ids.len(), None);
                let mut expected_index = 0;

                while let Some((country_id, country)) = map.next_entry_seed(
                    ArenaSeed::<CountryId>::new(self.allocator),
                    ArenaSeed::<Maybe<Country<'bump>>>::new(self.allocator),
                )? {
                    let country = country.into_value();

                    // There will be entries in the countries database like
                    // "33556688=none" that don't show up in the tags list. We
                    // skip over these entries.
                    if country.is_none() && !id_idxs.contains_key(&country_id) {
                        continue;
                    }

                    if expected_index >= self.country_ids.len() {
                        return Err(serde::de::Error::custom(format!(
                            "unexpected country ID {}: more entries than expected",
                            country_id.value()
                        )));
                    }

                    let expected_id = self.country_ids[expected_index];
                    let index = if country_id == expected_id {
                        expected_index
                    } else if let Some(&idx) = id_idxs.get(&country_id) {
                        idx
                    } else {
                        return Err(serde::de::Error::custom(format!(
                            "unexpected country ID {}: not in expected list",
                            country_id.value()
                        )));
                    };

                    database[index] = country;
                    expected_index += 1;
                }

                if expected_index != self.country_ids.len() {
                    return Err(serde::de::Error::custom(format!(
                        "incomplete country data: expected {} entries, found {}",
                        self.country_ids.len(),
                        expected_index
                    )));
                }

                Ok(database.into_bump_slice())
            }
        }

        deserializer.deserialize_map(CountryDatabaseVisitor {
            country_ids: self.country_ids,
            allocator: self.allocator,
        })
    }
}

struct CountriesVisitor<'bump>(&'bump bumpalo::Bump);
impl<'de, 'bump> serde::de::Visitor<'de> for CountriesVisitor<'bump> {
    type Value = Countries<'bump>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a map of country data")
    }

    fn visit_map<V>(self, mut map: V) -> Result<Self::Value, V::Error>
    where
        V: serde::de::MapAccess<'de>,
    {
        let Some(key) = map.next_key::<CountryField>()? else {
            return Err(serde::de::Error::custom("expected countries data"));
        };

        if !matches!(key, CountryField::Tags) {
            return Err(serde::de::Error::custom("expected 'tags' field first"));
        }

        struct TagDataSeed<'bump>(&'bump bumpalo::Bump);

        impl<'bump, 'de> DeserializeSeed<'de> for TagDataSeed<'bump> {
            type Value = (&'bump [CountryId], &'bump [CountryTag<'bump>]);

            fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: Deserializer<'de>,
            {
                struct TagDataVisitor<'bump>(&'bump bumpalo::Bump);

                impl<'bump, 'de> serde::de::Visitor<'de> for TagDataVisitor<'bump> {
                    type Value = (&'bump [CountryId], &'bump [CountryTag<'bump>]);

                    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                        formatter.write_str("a map with country IDs and tags")
                    }

                    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
                    where
                        A: serde::de::MapAccess<'de>,
                    {
                        let mut ids = bumpalo::collections::Vec::new_in(self.0);
                        let mut tags = bumpalo::collections::Vec::new_in(self.0);

                        while let Some(key) = map.next_key::<CountryId>()? {
                            let tag =
                                map.next_value_seed(
                                    bumpalo_serde::ArenaSeed::<CountryTag<'bump>>::new(self.0),
                                )?;
                            ids.push(key);
                            tags.push(tag);
                        }

                        Ok((ids.into_bump_slice(), tags.into_bump_slice()))
                    }
                }

                deserializer.deserialize_map(TagDataVisitor(self.0))
            }
        }

        let tag_data = map.next_value_seed(TagDataSeed(self.0))?;

        let Some(key) = map.next_key::<CountryField>()? else {
            return Err(serde::de::Error::custom("expected countries data"));
        };

        if !matches!(key, CountryField::Database) {
            return Err(serde::de::Error::custom("expected 'database' field second"));
        }

        let database_seed = CountryDatabaseSeed::new(tag_data.0, self.0);
        let database = map.next_value_seed(database_seed)?;

        while map
            .next_entry::<CountryField, serde::de::IgnoredAny>()?
            .is_some()
        {
            // Ignore any other fields
        }

        Ok(Countries {
            ids: CountryIndexedVec { data: tag_data.0 },
            tags: CountryIndexedVec { data: tag_data.1 },
            database: CountryIndexedVec { data: database },
        })
    }
}

impl<'bump> ArenaDeserialize<'bump> for Countries<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(CountriesVisitor(allocator))
    }
}

#[derive(Debug, Clone, Copy, Deserialize)]
enum CountryField {
    #[serde(alias = "tags")]
    Tags,
    #[serde(alias = "database")]
    Database,
    #[serde(other)]
    Other,
}

impl<'bump> ArenaDeserialize<'bump> for CountryName<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct CountryNameVisitor<'bump>(&'bump bumpalo::Bump);
        impl<'de, 'bump> serde::de::Visitor<'de> for CountryNameVisitor<'bump> {
            type Value = CountryName<'bump>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a country name")
            }

            fn visit_borrowed_str<E>(self, v: &'de str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                self.visit_bytes(v.as_bytes())
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                self.visit_bytes(v.as_bytes())
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                self.visit_str(&v)
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                Ok(CountryName::Tag(BStr::new(self.0.alloc_slice_copy(v))))
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::MapAccess<'de>,
            {
                let deser = MapAccessDeserializer::new(map);
                let country = CountryNameObject::deserialize_in_arena(deser, self.0)?;
                Ok(CountryName::Object(country))
            }
        }

        deserializer.deserialize_map(CountryNameVisitor(allocator))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bumpalo_serde::ArenaDeserialize;
    use jomini::TextDeserializer;

    #[derive(ArenaDeserialize)]
    struct Wrapper<'bump> {
        country_name: CountryName<'bump>,
    }

    fn deserialize_country_name<'bump>(
        data: &str,
        allocator: &'bump bumpalo::Bump,
    ) -> CountryName<'bump> {
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        Wrapper::deserialize_in_arena(&deserializer, allocator)
            .expect("country name deserializes")
            .country_name
    }

    #[test]
    fn country_name_tag_string() {
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(r#"country_name="GBR""#, &allocator);
        assert_eq!(name.name().to_str(), "GBR");
    }

    #[test]
    fn country_name_object_with_name_and_adjective_key() {
        // e.g. name="INC" key={ "Adjective"="INC_ADJ" }
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ name="INC" key={ "Adjective"="INC_ADJ" } }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert_eq!(obj.name.unwrap().to_str(), "INC");
        assert_eq!(obj.key.adjective_key().unwrap().to_str(), "INC_ADJ");
        assert!(obj.override_name.is_none());
        assert!(obj.bases.base.is_none());
    }

    #[test]
    fn country_name_object_without_name_is_empty() {
        // "Paradox Country" placeholder: only has a key, no name field
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ key={ "Custom_Name"="Paradox Country" } }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert!(obj.name.is_none());
        assert_eq!(obj.key.custom_name.unwrap().to_str(), "Paradox Country");
    }

    #[test]
    fn country_name_object_with_plain_override() {
        // e.g. name="KOU" override_name="saitama" override_adj="saitama"
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ name="KOU" override_name="saitama" override_adj="saitama" }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert_eq!(obj.override_name.unwrap().to_str(), "saitama");
        assert_eq!(obj.override_adj.unwrap().to_str(), "saitama");
    }

    #[test]
    fn country_name_object_with_override_and_adjective_key() {
        // e.g. name="YMT" override_name="kyoto" override_adj="kyoto" key={ "Adjective"="YMT_ADJ" }
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ name="YMT" override_name="kyoto" override_adj="kyoto" key={ "Adjective"="YMT_ADJ" } }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert_eq!(obj.name.unwrap().to_str(), "YMT");
        assert_eq!(obj.override_name.unwrap().to_str(), "kyoto");
        assert_eq!(obj.override_adj.unwrap().to_str(), "kyoto");
        assert_eq!(obj.key.adjective_key().unwrap().to_str(), "YMT_ADJ");
    }

    #[test]
    fn country_name_object_with_bases() {
        // e.g. name="CIVILWAR_FACTION_nobles_estate_NAME" key={ "Adjective"="..." } bases={ Base=HKK }
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ name="CIVILWAR_FACTION_nobles_estate_NAME" key={ "Adjective"="CIVILWAR_FACTION_nobles_estate_ADJECTIVE" } bases={ Base=HKK } }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert_eq!(
            obj.name.unwrap().to_str(),
            "CIVILWAR_FACTION_nobles_estate_NAME"
        );
        assert_eq!(
            obj.key.adjective_key().unwrap().to_str(),
            "CIVILWAR_FACTION_nobles_estate_ADJECTIVE"
        );
        assert_eq!(obj.bases.base.unwrap().to_str(), "HKK");
    }

    #[test]
    fn country_name_object_with_structured_override_extracts_key() {
        // e.g. override_name={ key="game_dynasty_name_struct_notooltip" variables={...} }
        let allocator = bumpalo::Bump::new();
        let name = deserialize_country_name(
            r#"country_name={ name="CLR" override_name={ key="game_dynasty_name_struct_notooltip" variables={ { key="PREFIX" value="x" } } } }"#,
            &allocator,
        );
        let CountryName::Object(obj) = name else {
            panic!("expected Object")
        };
        assert_eq!(
            obj.override_name.unwrap().to_str(),
            "game_dynasty_name_struct_notooltip"
        );
    }
}

#[derive(Debug)]
pub struct CountriesIter<'a> {
    index: usize,
    countries: &'a Countries<'a>,
}

impl<'a> CountriesIter<'a> {
    pub fn new(countries: &'a Countries<'a>) -> Self {
        CountriesIter {
            index: 0,
            countries,
        }
    }
}

impl<'a> Iterator for CountriesIter<'a> {
    type Item = CountryEntry<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index < self.countries.ids.data.len() {
            let result = CountryEntry {
                idx: CountryIdx::from_index(self.index),
                countries: self.countries,
            };
            self.index += 1;
            Some(result)
        } else {
            None
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.countries.ids.data.len() - self.index;
        (len, Some(len))
    }
}

#[derive(Debug)]
pub struct CountryEntry<'a> {
    idx: CountryIdx,
    countries: &'a Countries<'a>,
}

impl<'a> CountryEntry<'a> {
    #[inline]
    pub fn idx(&self) -> CountryIdx {
        self.idx
    }

    #[inline]
    pub fn id(&self) -> CountryId {
        self.countries.ids[self.idx]
    }

    #[inline]
    pub fn tag(&self) -> &'a CountryTag<'a> {
        &self.countries.tags[self.idx]
    }

    #[inline]
    pub fn data(&self) -> Option<&'a Country<'a>> {
        self.countries.database[self.idx].as_ref()
    }
}

#[derive(Debug, PartialEq)]
pub struct CountryIndexedVec<'bump, T> {
    data: &'bump [T],
}

impl<'bump, T> CountryIndexedVec<'bump, T> {
    pub fn iter(&self) -> std::slice::Iter<'_, T> {
        self.data.iter()
    }
}

impl<'bump, T> Index<CountryIdx> for CountryIndexedVec<'bump, T> {
    type Output = T;

    #[inline]
    fn index(&self, index: CountryIdx) -> &Self::Output {
        &self.data[index.index()]
    }
}

#[derive(Debug, PartialEq)]
pub struct CountryIndexedVecOwned<T> {
    data: Box<[T]>,
}

impl<T> CountryIndexedVecOwned<T> {
    pub fn iter(&self) -> std::slice::Iter<'_, T> {
        self.data.iter()
    }
}

impl<T> Index<CountryIdx> for CountryIndexedVecOwned<T> {
    type Output = T;

    #[inline]
    fn index(&self, index: CountryIdx) -> &Self::Output {
        &self.data[index.index()]
    }
}

impl<T> IndexMut<CountryIdx> for CountryIndexedVecOwned<T> {
    #[inline]
    fn index_mut(&mut self, index: CountryIdx) -> &mut Self::Output {
        &mut self.data[index.index()]
    }
}
