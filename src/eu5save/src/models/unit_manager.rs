use crate::models::de::Maybe;
use crate::models::{CharacterId, CountryId};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct UnitManager<'bump> {
    #[arena(deserialize_with = "deserialize_units")]
    pub database: UnitDatabase<'bump>,
}

impl<'bump> UnitManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct UnitDatabase<'bump> {
    ids: &'bump [UnitId],
    values: &'bump [Option<Unit>],
}

impl<'bump> UnitDatabase<'bump> {
    /// Returns an iterator over all units in the database
    pub fn iter(&self) -> impl Iterator<Item = &Unit> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct UnitId(u32);

impl UnitId {
    #[inline]
    pub fn new(id: u32) -> Self {
        UnitId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Unit {
    pub country: CountryId,
    pub leader: Option<CharacterId>,
}

#[inline]
fn deserialize_units<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<UnitDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct UnitVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for UnitVisitor<'bump> {
        type Value = UnitDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing unit entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut unit_ids = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            let mut unit_values = bumpalo::collections::Vec::with_capacity_in(1024, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<Unit>>::new(self.0),
            )? {
                unit_ids.push(key);
                unit_values.push(value.into_value());
            }

            let ids = unit_ids.into_bump_slice();
            let values = unit_values.into_bump_slice();
            Ok(UnitDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(UnitVisitor(allocator))
}
