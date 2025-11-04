use std::fmt;

use crate::models::{CountryId, LocationId, bstr::BStr, de::Maybe};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct BuildingManager<'bump> {
    #[arena(deserialize_with = "deserialize_buildings")]
    pub database: BuildingDatabase<'bump>,
}

impl<'bump> BuildingManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct BuildingDatabase<'bump> {
    ids: &'bump [BuildingId],
    values: &'bump [Option<Building<'bump>>],
}

impl<'bump> BuildingDatabase<'bump> {
    /// Returns an iterator over all buildings in the database
    pub fn iter(&self) -> impl Iterator<Item = &Building<'bump>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct BuildingId(u32);

impl BuildingId {
    #[inline]
    pub fn new(id: u32) -> Self {
        BuildingId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Building<'bump> {
    #[arena(alias = "type")]
    pub _type: BStr<'bump>,
    #[arena(default)]
    pub level: f64,
    pub location: LocationId,
    pub owner: CountryId,
}

#[inline]
fn deserialize_buildings<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<BuildingDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct MarketsVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for MarketsVisitor<'bump> {
        type Value = BuildingDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing building entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut building_ids = bumpalo::collections::Vec::with_capacity_in(65536, self.0);
            let mut building_values = bumpalo::collections::Vec::with_capacity_in(65536, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<Building<'bump>>>::new(self.0),
            )? {
                building_ids.push(key);
                building_values.push(value.into_value());
            }

            let ids = building_ids.into_bump_slice();
            let values = building_values.into_bump_slice();

            Ok(BuildingDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(MarketsVisitor(allocator))
}
