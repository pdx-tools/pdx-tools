use crate::models::{self, MarketId, ReligionId, countries::CountryId};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::{
    fmt,
    ops::{Index, IndexMut},
};

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct LocationId(u32);

impl LocationId {
    #[inline]
    pub fn new(id: u32) -> Self {
        LocationId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct LocationIdx(u32);

impl LocationIdx {
    #[inline]
    pub fn new(idx: u32) -> Self {
        LocationIdx(idx)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize)]
pub struct Locations<'bump> {
    #[arena(deserialize_with = "deserialize_locations_arena")]
    pub locations: LocationsDataArena<'bump>,
}

#[derive(Debug)]
pub struct LocationsDataArena<'bump> {
    ids: &'bump [LocationId],
    values: &'bump [Location<'bump>],
}

impl<'bump> Locations<'bump> {
    pub fn iter(&self) -> LocationsIter<'_> {
        LocationsIter::new(&self.locations)
    }

    pub fn get(&self, id: LocationId) -> Option<LocationIdx> {
        // Fast path: check if the location is at the same index as its ID (1-based)
        let index = (id.value().saturating_sub(1)) as usize;
        if self.locations.ids.get(index).is_some_and(|loc| loc == &id) {
            return Some(LocationIdx(index as u32));
        }

        self.locations
            .ids
            .iter()
            .position(|location| location == &id)
            .map(|idx| LocationIdx(idx as u32))
    }

    pub fn index(&self, idx: LocationIdx) -> LocationEntry<'_> {
        LocationEntry {
            idx,
            locations: &self.locations,
        }
    }

    pub fn len(&self) -> usize {
        self.locations.ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.locations.ids.is_empty()
    }

    pub fn create_index<T: Clone>(&self, initial: T) -> LocationIndexedVec<T> {
        LocationIndexedVec {
            data: vec![initial; self.len()],
        }
    }
}

#[derive(Debug, ArenaDeserialize)]
pub struct Location<'bump> {
    #[arena(default)]
    pub owner: CountryId,
    #[arena(default)]
    pub controller: CountryId,
    pub religion: Option<ReligionId>,
    #[arena(default)]
    pub control: f64, // 0.0 to 1.0
    #[arena(default)]
    pub development: f64, // 0.0 to 100.0...
    #[arena(default)]
    pub population: LocationPopulation<'bump>,
    #[arena(default, alias = "max_raw_material_workers")]
    pub rgo_level: f64,
    pub market: Option<MarketId>,
    #[arena(default)]
    pub market_access: f64, // 0.0 to 1.0
    #[arena(default)]
    pub market_attraction: f64, // 0.0 to 1.0
    #[arena(default)]
    pub prosperity: f64, // 0.0 to 1.0
    #[arena(default)]
    pub proximity: f64, // 0.0 to 100.0
    #[arena(default)]
    pub local_proximity_propagation: f64,
    #[arena(default)]
    pub tax: f64,
    #[arena(default)]
    pub possible_tax: f64,
    pub raw_material: Option<models::RawMaterialsName<'bump>>,
}

#[derive(Debug, Default, ArenaDeserialize)]
pub struct LocationPopulation<'bump> {
    #[arena(default)]
    pub pops: &'bump [models::PopId],
}

#[inline]
fn deserialize_locations_arena<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<LocationsDataArena<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct LocationsVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for LocationsVisitor<'bump> {
        type Value = LocationsDataArena<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing location entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            // There's approximately 30,000 locations in game.
            let mut location_ids = bumpalo::collections::Vec::with_capacity_in(30000, self.0);
            let mut location_values = bumpalo::collections::Vec::with_capacity_in(30000, self.0);
            while let Some((key, value)) =
                map.next_entry_seed(ArenaSeed::new(self.0), ArenaSeed::new(self.0))?
            {
                location_ids.push(key);
                location_values.push(value);
            }

            Ok(LocationsDataArena {
                ids: location_ids.into_bump_slice(),
                values: location_values.into_bump_slice(),
            })
        }
    }

    deserializer.deserialize_map(LocationsVisitor(allocator))
}

#[derive(Debug)]
pub struct LocationsIter<'a> {
    index: LocationIdx,
    locations: &'a LocationsDataArena<'a>,
}

impl<'a> LocationsIter<'a> {
    pub fn new(locations: &'a LocationsDataArena<'a>) -> Self {
        LocationsIter {
            index: LocationIdx(0),
            locations,
        }
    }
}

impl<'a> Iterator for LocationsIter<'a> {
    type Item = LocationEntry<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if (self.index.0 as usize) < self.locations.ids.len() {
            let result = LocationEntry {
                idx: self.index,
                locations: self.locations,
            };
            self.index.0 += 1;
            Some(result)
        } else {
            None
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.locations.ids.len() - (self.index.0 as usize);
        (len, Some(len))
    }
}

#[derive(Debug)]
pub struct LocationEntry<'a> {
    idx: LocationIdx,
    locations: &'a LocationsDataArena<'a>,
}

impl<'a> LocationEntry<'a> {
    #[inline]
    pub fn idx(&self) -> LocationIdx {
        self.idx
    }

    #[inline]
    pub fn id(&self) -> LocationId {
        self.locations.ids[self.idx.0 as usize]
    }

    #[inline]
    pub fn location(&self) -> &'a Location<'a> {
        &self.locations.values[self.idx.0 as usize]
    }
}

#[derive(Debug)]
pub struct LocationIndexedVec<T> {
    data: Vec<T>,
}

impl<T> LocationIndexedVec<T> {
    pub fn iter(&self) -> std::slice::Iter<'_, T> {
        self.data.iter()
    }
}

impl<T> IndexMut<LocationIdx> for LocationIndexedVec<T> {
    #[inline]
    fn index_mut(&mut self, index: LocationIdx) -> &mut Self::Output {
        &mut self.data[index.0 as usize]
    }
}

impl<T> Index<LocationIdx> for LocationIndexedVec<T> {
    type Output = T;

    #[inline]
    fn index(&self, index: LocationIdx) -> &Self::Output {
        &self.data[index.0 as usize]
    }
}
