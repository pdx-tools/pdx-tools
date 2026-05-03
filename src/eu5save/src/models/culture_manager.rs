use crate::models::Color;
use crate::models::bstr::BStr;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::de::value::MapAccessDeserializer;
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, Default, ArenaDeserialize)]
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

#[derive(Debug, Default)]
pub struct CultureDatabase<'bump> {
    ids: &'bump [CultureId],
    values: &'bump [Culture<'bump>],
}

impl<'bump> CultureDatabase<'bump> {
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

#[derive(Debug, ArenaDeserialize)]
pub struct Culture<'bump> {
    pub name: CultureName<'bump>,
    #[arena(default)]
    pub key: Option<BStr<'bump>>,
    #[arena(default)]
    pub size: f64,
    #[arena(default)]
    pub cultural_influence: f64,
    #[arena(default)]
    pub color: Color,
}

/// Culture name, either a plain string identifier or a localization object with
/// a key and interpolation variables.
///
/// Plain string:
/// ```text
/// name="dakelh_culture"
/// ```
///
/// Object:
/// ```text
/// name={
///     key="NEW_CULTURE_NAME_ADJ_OLD_CULTURE"
///     variables={ { key="OLD_CULTURE_NAME" value="irish" } }
/// }
/// ```
#[derive(Debug, Clone)]
pub enum CultureName<'bump> {
    Tag(BStr<'bump>),
    Object(CultureNameObject<'bump>),
}

impl<'bump> CultureName<'bump> {
    pub fn key(&self) -> BStr<'bump> {
        match self {
            CultureName::Tag(tag) => *tag,
            CultureName::Object(obj) => obj.key,
        }
    }
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct CultureNameObject<'bump> {
    pub key: BStr<'bump>,
    #[arena(default)]
    pub variables: &'bump [CultureNameVariable<'bump>],
}

#[derive(Debug, Clone, ArenaDeserialize)]
pub struct CultureNameVariable<'bump> {
    pub key: BStr<'bump>,
    pub value: BStr<'bump>,
}

impl<'bump> ArenaDeserialize<'bump> for CultureName<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct CultureNameVisitor<'bump>(&'bump bumpalo::Bump);

        impl<'de, 'bump> de::Visitor<'de> for CultureNameVisitor<'bump> {
            type Value = CultureName<'bump>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a culture name string or object")
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
                Ok(CultureName::Tag(BStr::new(self.0.alloc_slice_copy(v))))
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                let deser = MapAccessDeserializer::new(map);
                let obj = CultureNameObject::deserialize_in_arena(deser, self.0)?;
                Ok(CultureName::Object(obj))
            }
        }

        deserializer.deserialize_map(CultureNameVisitor(allocator))
    }
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
    fn parses_culture_with_name_tag() {
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
        assert_eq!(dakelh.name.key().to_str(), "dakelh_culture");
        assert_eq!(dakelh.size, 3.392);
        assert_eq!(dakelh.color.0, [68, 252, 27]);

        let wetsuweten = manager
            .lookup(CultureId::new(1))
            .expect("culture id 1 exists");
        assert_eq!(wetsuweten.name.key().to_str(), "wetsuweten_culture");
        assert_eq!(wetsuweten.size, 1.431);
        assert_eq!(wetsuweten.color.0, [105, 220, 125]);
    }

    #[test]
    fn parses_culture_with_name_object() {
        let data = r#"database={
    2085={
        name={
            key="NEW_CULTURE_NAME_ADJ_OLD_CULTURE"
            variables={
                {
                    key="COUNTRY_NAME"
                    value="nova_scotia_scripted_country_name"
                }
                {
                    key="COUNTRY_ADJ"
                    value="nova_scotia_scripted_country_name"
                }
                {
                    key="OLD_CULTURE_NAME"
                    value="irish"
                }
            }
        }
        key="irish_aba45"
        size=2252.95637
        cultural_influence=1074.29957
    }
}"#;

        let allocator = bumpalo::Bump::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let manager = CultureManager::deserialize_in_arena(&deserializer, &allocator)
            .expect("culture manager deserializes");

        let culture = manager
            .lookup(CultureId::new(2085))
            .expect("culture id 2085 exists");

        let CultureName::Object(ref name_obj) = culture.name else {
            panic!("expected CultureName::Object");
        };
        assert_eq!(name_obj.key.to_str(), "NEW_CULTURE_NAME_ADJ_OLD_CULTURE");
        assert_eq!(name_obj.variables.len(), 3);
        assert_eq!(name_obj.variables[0].key.to_str(), "COUNTRY_NAME");
        assert_eq!(
            name_obj.variables[0].value.to_str(),
            "nova_scotia_scripted_country_name"
        );
        assert_eq!(name_obj.variables[2].key.to_str(), "OLD_CULTURE_NAME");
        assert_eq!(name_obj.variables[2].value.to_str(), "irish");

        assert_eq!(culture.key.map(|x| x.to_str()), Some("irish_aba45"));
        assert_eq!(culture.size, 2252.95637);
        assert_eq!(culture.cultural_influence, 1074.29957);
    }
}
