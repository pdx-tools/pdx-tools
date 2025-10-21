use crate::{
    Eu5Date,
    models::{LocationId, de::Maybe},
};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct WarManager<'bump> {
    #[arena(deserialize_with = "deserialize_wars")]
    pub database: WarDatabase<'bump>,
}

impl<'bump> WarManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct WarDatabase<'bump> {
    ids: &'bump [WarId],
    values: &'bump [Option<War<'bump>>],
}

impl<'bump> WarDatabase<'bump> {
    /// Returns an iterator over all wars in the database
    pub fn iter(&self) -> impl Iterator<Item = &War<'bump>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct WarId(u32);

impl WarId {
    #[inline]
    pub fn new(id: u32) -> Self {
        WarId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct War<'bump> {
    pub start_date: Eu5Date,
    #[arena(duplicated, alias = "battle")]
    pub battles: &'bump [Battle],
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Battle {
    pub location: LocationId,
    pub date: Eu5Date,
}

#[inline]
fn deserialize_wars<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<WarDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct WarVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for WarVisitor<'bump> {
        type Value = WarDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing war entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut war_ids = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            let mut war_values = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<War<'bump>>>::new(self.0),
            )? {
                war_ids.push(key);
                war_values.push(value.into_value());
            }

            let ids = war_ids.into_bump_slice();
            let values = war_values.into_bump_slice();
            Ok(WarDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(WarVisitor(allocator))
}
