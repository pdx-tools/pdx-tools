use crate::models::de::Maybe;
use crate::models::{CountryId, LocationId, PopId, UnitId};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct SubUnitManager<'bump> {
    #[arena(deserialize_with = "deserialize_units")]
    pub database: SubUnitDatabase<'bump>,
}

impl<'bump> SubUnitManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct SubUnitDatabase<'bump> {
    ids: &'bump [SubUnitId],
    values: &'bump [Option<SubUnit<'bump>>],
}

impl<'bump> SubUnitDatabase<'bump> {
    /// Returns an iterator over all units in the database
    pub fn iter(&self) -> impl Iterator<Item = &SubUnit<'bump>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct SubUnitId(u32);

impl SubUnitId {
    #[inline]
    pub fn new(id: u32) -> Self {
        SubUnitId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct SubUnit<'bump> {
    #[arena(default)]
    pub owner: CountryId,
    #[arena(default)]
    pub controller: CountryId,
    pub home: LocationId,
    pub unit: UnitId,
    pub morale: f64,
    #[arena(default)]
    pub experience: f64,
    #[arena(default)]
    pub strength: f64,
    #[arena(default)]
    pub max_strength: f64,
    #[arena(default)]
    pub levies: &'bump [PopId],
}

#[inline]
fn deserialize_units<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<SubUnitDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct SubUnitVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for SubUnitVisitor<'bump> {
        type Value = SubUnitDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing sub-unit entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut unit_ids = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            let mut unit_values = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<SubUnit<'bump>>>::new(self.0),
            )? {
                unit_ids.push(key);
                unit_values.push(value.into_value());
            }

            let ids = unit_ids.into_bump_slice();
            let values = unit_values.into_bump_slice();
            Ok(SubUnitDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(SubUnitVisitor(allocator))
}
