use crate::hash::FnvHashMap;
use crate::models::de::Maybe;
use bumpalo_serde::ArenaDeserialize;
use jomini::JominiDeserialize;
use serde::Deserialize;
use serde::de::MapAccess;
use serde::de::Visitor;

#[derive(Debug, ArenaDeserialize)]
pub struct PopulationDirectory<'bump> {
    pub database: PopDatabase<'bump>,
}

#[derive(Debug, PartialEq, Clone, Copy, Deserialize, ArenaDeserialize)]
#[serde(rename_all = "snake_case")]
pub enum PopulationType {
    Burghers,
    Clergy,
    Laborers,
    Nobles,
    Peasants,
    Slaves,
    Soldiers,
    Tribesmen,
    #[serde(other)]
    Other,
}

#[derive(Debug, JominiDeserialize)]
pub struct Population {
    #[jomini(alias = "type")]
    pub kind: PopulationType,
    #[jomini(default)]
    pub size: f64,
    #[jomini(default)]
    pub satisfaction: f64,
    #[jomini(default)]
    pub literacy: f64,
    #[jomini(default)]
    pub price: f64,
}

pub(crate) struct PopDatabaseVisitor<'bump>(&'bump bumpalo::Bump);

impl<'de, 'bump> Visitor<'de> for PopDatabaseVisitor<'bump> {
    type Value = PopDatabase<'bump>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a map of population data")
    }

    fn visit_map<V>(self, mut map: V) -> Result<Self::Value, V::Error>
    where
        V: MapAccess<'de>,
    {
        let mut ids = bumpalo::collections::Vec::with_capacity_in(131072, self.0);
        let mut values = bumpalo::collections::Vec::with_capacity_in(131072, self.0);
        while let Some((key, value)) = map.next_entry::<u32, Maybe<Population>>()? {
            let id = PopId::new(key);
            ids.push(id);
            values.push(value.into_value());
        }

        let ids = ids.into_bump_slice();
        let values = values.into_bump_slice();
        let lookup = ids
            .iter()
            .enumerate()
            .map(|(idx, &id)| (id, idx))
            .collect::<FnvHashMap<_, _>>();
        let db = PopDatabase {
            ids,
            values,
            lookup,
        };
        Ok(db)
    }
}

impl<'bump> ArenaDeserialize<'bump> for PopDatabase<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_map(PopDatabaseVisitor(allocator))
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct PopId(u32);

impl PopId {
    #[inline]
    pub fn new(id: u32) -> Self {
        PopId(id)
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
pub struct PopIdx(u32);

impl From<usize> for PopIdx {
    fn from(value: usize) -> Self {
        PopIdx(value as u32)
    }
}

impl From<PopIdx> for usize {
    fn from(value: PopIdx) -> Self {
        value.0 as usize
    }
}

#[derive(Debug)]
pub struct PopDatabase<'bump> {
    ids: &'bump [PopId],
    values: &'bump [Option<Population>],
    lookup: FnvHashMap<PopId, usize>,
}

impl<'bump> PopDatabase<'bump> {
    pub fn len(&self) -> usize {
        self.ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.ids.is_empty()
    }

    pub fn lookup(&self, id: PopId) -> Option<&Population> {
        let idx = self.lookup.get(&id)?;
        self.values.get(*idx)?.as_ref()
    }
}
