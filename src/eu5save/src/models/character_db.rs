use crate::{
    Eu5Date,
    models::{CountryId, LocationId, bstr::BStr, de::Maybe},
};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::de::value::MapAccessDeserializer;
use serde::{Deserialize, Deserializer, de};
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
    #[arena(deserialize_with = "deserialize_first_name")]
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
fn deserialize_first_name<'de, 'bump, D>(
    deserializer: D,
    alloc: &'bump bumpalo::Bump,
) -> Result<BStr<'bump>, D::Error>
where
    D: Deserializer<'de>,
{
    struct FirstNameVisitor<'bump>(&'bump bumpalo::Bump);

    #[derive(Debug, ArenaDeserialize)]
    struct FirstNameObject<'bump> {
        #[expect(dead_code)] // unused
        name: BStr<'bump>,
        custom_name: BStr<'bump>,
    }

    impl<'de, 'bump> de::Visitor<'de> for FirstNameVisitor<'bump> {
        type Value = BStr<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a first name")
        }

        fn visit_borrowed_str<E>(self, v: &'de str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            self.visit_bytes(v.as_bytes())
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            self.visit_bytes(v.as_bytes())
        }

        fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            self.visit_str(&v)
        }

        fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(BStr::new(self.0.alloc_slice_copy(v)))
        }

        fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let deser = MapAccessDeserializer::new(map);
            let first_name = FirstNameObject::deserialize_in_arena(deser, self.0)?;
            Ok(first_name.custom_name)
        }
    }

    deserializer.deserialize_map(FirstNameVisitor(alloc))
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

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::TextDeserializer;

    #[test]
    fn test_first_name_simple_string() {
        let data = r#"first_name="Margret Thatcher"
birth_date=1925.1.1"#;
        let allocator = bumpalo::Bump::new();
        let d = TextDeserializer::from_utf8_slice(data.as_bytes())
            .expect("Failed to create deserializer");
        let character: Character = Character::deserialize_in_arena(&d, &allocator)
            .expect("Failed to deserialize character with simple first_name");

        assert_eq!(character.first_name.to_str(), "Margret Thatcher");
    }

    #[test]
    fn test_first_name_object_with_custom_name() {
        let data = r#"first_name={
name="name_william"
custom_name="Margret Thatcher"
}
birth_date=1925.1.1"#;
        let allocator = bumpalo::Bump::new();
        let d = TextDeserializer::from_utf8_slice(data.as_bytes())
            .expect("Failed to create deserializer");
        let character: Character = Character::deserialize_in_arena(&d, &allocator)
            .expect("Failed to deserialize character with object first_name with custom_name");

        assert_eq!(character.first_name.to_str(), "Margret Thatcher");
    }
}
