use crate::models::Color;
use crate::models::bstr::BStr;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct ReligionManager<'bump> {
    #[arena(deserialize_with = "deserialize_religions")]
    pub database: ReligionDatabase<'bump>,
}

impl<'bump> ReligionManager<'bump> {
    pub fn lookup(&self, id: ReligionId) -> Option<&Religion<'bump>> {
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

#[derive(Debug, PartialEq)]
pub struct ReligionDatabase<'bump> {
    ids: &'bump [ReligionId],
    values: &'bump [Religion<'bump>],
}

impl<'bump> ReligionDatabase<'bump> {
    /// Returns an iterator over all religions in the database
    pub fn iter(&self) -> impl Iterator<Item = &Religion<'bump>> {
        self.values.iter()
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct ReligionId(u32);

impl ReligionId {
    #[inline]
    pub fn new(id: u32) -> Self {
        ReligionId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Religion<'bump> {
    pub name: BStr<'bump>,
    pub key: BStr<'bump>,
    pub color: Color,
}

#[inline]
fn deserialize_religions<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<ReligionDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct ReligionVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for ReligionVisitor<'bump> {
        type Value = ReligionDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing religion entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut religion_ids = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            let mut religion_values = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            while let Some((key, value)) =
                map.next_entry_seed(ArenaSeed::new(self.0), ArenaSeed::<Religion>::new(self.0))?
            {
                religion_ids.push(key);
                religion_values.push(value);
            }

            let ids = religion_ids.into_bump_slice();
            let values = religion_values.into_bump_slice();
            Ok(ReligionDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(ReligionVisitor(allocator))
}
