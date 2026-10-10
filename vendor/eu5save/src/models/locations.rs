use crate::{
    Eu5Date,
    models::{self, MarketId, ReligionId, countries::CountryId, countries::CountryTag},
};
use arena_serde::{ArenaDeserialize, ArenaSeed};
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
    pub fn iter(&self) -> LocationsIter<'bump> {
        LocationsIter::new(self.locations.ids, self.locations.values)
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

    pub fn index(&self, idx: LocationIdx) -> LocationEntry<'bump> {
        LocationEntry {
            idx,
            ids: self.locations.ids,
            values: self.locations.values,
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
    pub raw_material: Option<models::GoodName<'bump>>,
    #[arena(default)]
    pub rank: LocationRank,
    /// Every owner the location has had, in date order. The `owner` field above
    /// is the current owner, and this is the historical source for a map at a
    /// past date.
    #[arena(default)]
    pub ownership_history: &'bump [LocationOwnership<'bump>],
}

/// One entry of a [`Location::ownership_history`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, ArenaDeserialize)]
pub struct LocationOwnership<'bump> {
    /// The date the country took the location.
    pub date: Eu5Date,
    /// The country that took the location. An entry that makes the location
    /// unowned has no owner in the save and gets the dummy country, in the
    /// same way as [`Location::owner`]. Such an entry has the tag `---`.
    #[arena(default)]
    pub owner: CountryId,
    /// The tag of the owner at that date. A country can change its tag later,
    /// so this is not always the current tag of `owner`.
    pub tag: CountryTag<'bump>,
}

#[derive(Debug, ArenaDeserialize, PartialEq, Eq, Default)]
#[arena(rename_all = "snake_case")]
pub enum LocationRank {
    RuralSettlement,
    Town,
    City,
    Megalopolis,
    #[default]
    #[arena(other)]
    Other,
}

#[derive(Debug, Default, ArenaDeserialize)]
pub struct LocationPopulation<'bump> {
    #[arena(default)]
    pub pops: &'bump [models::PopId],
    /// What the last population tick changed. The game shows these as
    /// "Last month change".
    #[arena(default)]
    pub changes: PopulationChanges<'bump>,
}

/// The population changes of the last tick, grouped by cause. The save keeps
/// the changes of only the last tick, so this is a record of what happened,
/// not a prediction of the next tick.
#[derive(Debug, Default, ArenaDeserialize)]
pub struct PopulationChanges<'bump> {
    /// People who were born.
    #[arena(default, alias = "Reproduction")]
    pub reproduction: PopulationChange<'bump>,
}

/// One cause of population change, with one entry for each pop it changed.
#[derive(Debug, Default, ArenaDeserialize)]
pub struct PopulationChange<'bump> {
    #[arena(default)]
    pub data: &'bump [PopulationChangeEntry],
}

impl PopulationChange<'_> {
    /// The sum of the change over all pops, in the same unit as
    /// [`models::Population::size`].
    pub fn total(&self) -> f64 {
        self.data.iter().map(|entry| entry.change).sum()
    }
}

/// The change of one pop.
#[derive(Debug, Clone, Copy, PartialEq, ArenaDeserialize)]
pub struct PopulationChangeEntry {
    /// The pop that changed.
    #[arena(default)]
    pub owner: models::PopId,
    /// The change in size, in the same unit as [`models::Population::size`].
    #[arena(default)]
    pub change: f64,
}

#[inline]
fn deserialize_locations_arena<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump arena_serde::Arena,
) -> Result<LocationsDataArena<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct LocationsVisitor<'bump>(&'bump arena_serde::Arena);

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

#[derive(Debug, Clone)]
pub struct LocationsIter<'bump> {
    index: LocationIdx,
    ids: &'bump [LocationId],
    values: &'bump [Location<'bump>],
}

impl<'bump> LocationsIter<'bump> {
    pub fn new(ids: &'bump [LocationId], values: &'bump [Location<'bump>]) -> Self {
        LocationsIter {
            index: LocationIdx(0),
            ids,
            values,
        }
    }
}

impl<'bump> Iterator for LocationsIter<'bump> {
    type Item = LocationEntry<'bump>;

    fn next(&mut self) -> Option<Self::Item> {
        if (self.index.0 as usize) < self.ids.len() {
            let result = LocationEntry {
                idx: self.index,
                ids: self.ids,
                values: self.values,
            };
            self.index.0 += 1;
            Some(result)
        } else {
            None
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.ids.len() - (self.index.0 as usize);
        (len, Some(len))
    }
}

#[derive(Debug)]
pub struct LocationEntry<'bump> {
    idx: LocationIdx,
    ids: &'bump [LocationId],
    values: &'bump [Location<'bump>],
}

impl<'bump> LocationEntry<'bump> {
    #[inline]
    pub fn idx(&self) -> LocationIdx {
        self.idx
    }

    #[inline]
    pub fn id(&self) -> LocationId {
        self.ids[self.idx.0 as usize]
    }

    #[inline]
    pub fn location(&self) -> &'bump Location<'bump> {
        &self.values[self.idx.0 as usize]
    }
}

#[derive(Debug, Clone)]
pub struct LocationIndexedVec<T> {
    data: Vec<T>,
}

impl<T> LocationIndexedVec<T> {
    /// A vector with `len` copies of `value`. Prefer
    /// [`Locations::create_index`] when the locations are at hand; this
    /// constructor serves tests and callers that only know the count.
    pub fn filled(len: usize, value: T) -> Self
    where
        T: Clone,
    {
        Self {
            data: vec![value; len],
        }
    }

    pub fn iter(&self) -> std::slice::Iter<'_, T> {
        self.data.iter()
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
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

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::{TextDeserializer, common::PdsDate};

    /// Location 134 in a 1346 save: Denmark held it from the start of the
    /// campaign, and Skane took it on 1338.6.3.
    #[test]
    fn ownership_history() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let data = r#"location={
            owner=5
            ownership_history={ {
                    date=1337.4.1
                    owner=4
                    tag="DAN"
                } {
                    date=1338.6.3
                    owner=5
                    tag="SKE"
                } }
        }"#;

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location deserializes")
            .location;

        let [first, second] = location.ownership_history else {
            panic!("expected two ownership entries")
        };
        assert_eq!(first.date.game_fmt().to_string(), "1337.4.1");
        assert_eq!(first.owner, CountryId::new(4));
        assert_eq!(first.tag.as_str(), "DAN");
        assert_eq!(second.date.game_fmt().to_string(), "1338.6.3");
        assert_eq!(second.owner, CountryId::new(5));
        assert_eq!(second.tag.as_str(), "SKE");

        // The last entry at or before the save date is the current owner.
        assert_eq!(second.owner, location.owner);
    }

    /// A location that never changed hands has no history.
    /// A location can become unowned. The entry then has the tag `---` and no
    /// owner at all.
    #[test]
    fn ownership_history_without_an_owner() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let data = r#"location={
            ownership_history={ {
                    date=1337.4.1
                    owner=606
                    tag="KOR"
                } {
                    date=1352.3.1
                    tag="---"
                } }
        }"#;

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location to deserialize")
            .location;

        let history = location.ownership_history;
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].owner, CountryId::new(606));
        assert!(history[1].owner.is_dummy());
        assert_eq!(history[1].date.game_fmt().to_string(), "1352.3.1");
    }

    #[test]
    fn population_changes() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let data = r#"location={
            population={
                changes={
                    MigrationIn={
                        data={ {
                                owner=4
                                change=0.044
                            } }
                    }
                    Reproduction={
                        data={ {
                                owner=3
                                change=0.00507
                            } {
                                owner=5
                                change=0.001
                            } }
                    }
                }
                pops={ 3 4 5 }
            }
        }"#;

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location deserializes")
            .location;

        let reproduction = &location.population.changes.reproduction;
        assert_eq!(reproduction.data.len(), 2);
        assert_eq!(reproduction.data[0].owner, models::PopId::new(3));
        assert_eq!(reproduction.data[0].change, 0.00507);
        assert!((reproduction.total() - 0.00607).abs() < 1e-9);
    }

    /// The keys of `changes` are strings in binary saves, so a melted save
    /// has them quoted.
    #[test]
    fn population_changes_from_melted_save() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let data = r#"location={
            population={
                changes={
                    "Reproduction"={
                        data={ {
                                owner=906033435
                                change=0.01106
                            } }
                    }
                }
            }
        }"#;

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location deserializes")
            .location;

        assert_eq!(location.population.changes.reproduction.total(), 0.01106);
    }

    #[test]
    fn population_changes_are_optional() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(b"location={ population={ pops={ 3 } } }")
                .expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location deserializes")
            .location;

        assert!(location.population.changes.reproduction.data.is_empty());
        assert_eq!(location.population.changes.reproduction.total(), 0.0);
    }

    #[test]
    fn ownership_history_is_optional() {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            location: Location<'bump>,
        }

        let allocator = arena_serde::Arena::new();
        let deserializer =
            TextDeserializer::from_utf8_slice(b"location={ owner=3 }").expect("valid text data");
        let location = Wrapper::deserialize_in_arena(&deserializer, &allocator)
            .expect("location deserializes")
            .location;
        assert!(location.ownership_history.is_empty());
    }
}
