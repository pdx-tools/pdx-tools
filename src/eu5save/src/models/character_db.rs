use crate::{
    Eu5Date,
    models::{CountryId, LocationId, bstr::BStr, de::Maybe},
};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct CharacterDb<'bump> {
    #[arena(deserialize_with = "deserialize_characters")]
    pub database: CharacterDatabase<'bump>,
}

impl<'bump> CharacterDb<'bump> {}

#[derive(Debug, PartialEq)]
pub struct CharacterDatabase<'bump> {
    ids: &'bump [CharacterId],
    values: &'bump [Option<Character<'bump>>],
}

impl<'bump> CharacterDatabase<'bump> {
    /// Returns an iterator over all characters in the database
    pub fn iter(&self) -> impl Iterator<Item = &Character<'bump>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct CharacterId(u32);

impl CharacterId {
    #[inline]
    pub fn new(id: u32) -> Self {
        CharacterId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Character<'bump> {
    #[arena(default)]
    pub country: CountryId,
    pub first_name: BStr<'bump>,
    #[arena(default)]
    pub adm: f64,
    #[arena(default)]
    pub dip: f64,
    #[arena(default)]
    pub mil: f64,
    pub birth: Option<LocationId>,
    pub birth_date: Eu5Date,
    pub father: Option<CharacterId>,
    pub mother: Option<CharacterId>,
}

#[inline]
fn deserialize_characters<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<CharacterDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct CharacterVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for CharacterVisitor<'bump> {
        type Value = CharacterDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing character entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut character_ids = bumpalo::collections::Vec::with_capacity_in(65536, self.0);
            let mut character_values = bumpalo::collections::Vec::with_capacity_in(65536, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<Character<'bump>>>::new(self.0),
            )? {
                character_ids.push(key);
                character_values.push(value.into_value());
            }

            let ids = character_ids.into_bump_slice();
            let values = character_values.into_bump_slice();
            Ok(CharacterDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(CharacterVisitor(allocator))
}
