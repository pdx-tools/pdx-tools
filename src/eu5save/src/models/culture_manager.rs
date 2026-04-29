use crate::models::Color;
use crate::models::bstr::BStr;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, Default, PartialEq, ArenaDeserialize)]
pub struct CultureManager<'bump> {
    #[arena(deserialize_with = "deserialize_cultures")]
    pub database: CultureDatabase<'bump>,
}

impl<'bump> CultureManager<'bump> {
    pub fn lookup(&self, id: CultureId) -> Option<&Culture<'bump>> {
        if let Some(x) = self.database.ids.get(id.value() as usize)
            && *x == id
        {
            return Some(&self.database.values[id.value() as usize]);
        }

        self.database
            .ids
            .iter()
            .position(|&x| x == id)
            .map(|idx| &self.database.values[idx])
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct CultureDatabase<'bump> {
    ids: &'bump [CultureId],
    values: &'bump [Culture<'bump>],
}

impl<'bump> CultureDatabase<'bump> {
    /// Returns an iterator over all cultures in the database
    pub fn iter(&self) -> impl Iterator<Item = &Culture<'bump>> {
        self.values.iter()
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct CultureId(u32);

impl CultureId {
    #[inline]
    pub fn new(id: u32) -> Self {
        CultureId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Culture<'bump> {
    pub name: BStr<'bump>,
    #[arena(default)]
    pub size: f64,
    pub culture_definition: BStr<'bump>,
    #[arena(default)]
    pub color: Color,
    pub language: BStr<'bump>,
}

#[inline]
fn deserialize_cultures<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<CultureDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct CultureVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for CultureVisitor<'bump> {
        type Value = CultureDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing culture entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut culture_ids = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            let mut culture_values = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            while let Some((key, value)) =
                map.next_entry_seed(ArenaSeed::new(self.0), ArenaSeed::<Culture>::new(self.0))?
            {
                culture_ids.push(key);
                culture_values.push(value);
            }

            let ids = culture_ids.into_bump_slice();
            let values = culture_values.into_bump_slice();
            Ok(CultureDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(CultureVisitor(allocator))
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::TextDeserializer;

    #[test]
    fn parses_culture_manager_database() {
        let data = r#"database={
    0={
        name="dakelh_culture"
        size=3.392
        culture_definition=dakelh_culture
        color=rgb {
            68 252 27
        }
        language=nadene_language
    }
    1={
        name="wetsuweten_culture"
        size=1.431
        culture_definition=wetsuweten_culture
        color=rgb {
            105 220 125
        }
        language=nadene_language
    }
}"#;

        let allocator = bumpalo::Bump::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let manager = CultureManager::deserialize_in_arena(&deserializer, &allocator)
            .expect("culture manager deserializes");

        let cultures: Vec<_> = manager.database.iter().collect();
        assert_eq!(cultures.len(), 2);

        let dakelh = manager
            .lookup(CultureId::new(0))
            .expect("culture id 0 exists");
        assert_eq!(dakelh.name.to_str(), "dakelh_culture");
        assert_eq!(dakelh.size, 3.392);
        assert_eq!(dakelh.culture_definition.to_str(), "dakelh_culture");
        assert_eq!(dakelh.color.0, [68, 252, 27]);
        assert_eq!(dakelh.language.to_str(), "nadene_language");

        let wetsuweten = manager
            .lookup(CultureId::new(1))
            .expect("culture id 1 exists");
        assert_eq!(wetsuweten.name.to_str(), "wetsuweten_culture");
        assert_eq!(wetsuweten.size, 1.431);
        assert_eq!(wetsuweten.culture_definition.to_str(), "wetsuweten_culture");
        assert_eq!(wetsuweten.color.0, [105, 220, 125]);
        assert_eq!(wetsuweten.language.to_str(), "nadene_language");
    }
}
