use crate::models::{RawMaterialsName, de::Maybe};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct TradeManager<'bump> {
    #[arena(deserialize_with = "deserialize_trades")]
    pub database: TradeDatabase<'bump>,
}

impl<'bump> TradeManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct TradeDatabase<'bump> {
    ids: &'bump [TradeId],
    values: &'bump [Option<TradeEntry<'bump>>],
}

impl<'bump> TradeDatabase<'bump> {
    /// Returns an iterator over all trades in the database
    pub fn iter(&self) -> impl Iterator<Item = &TradeEntry<'bump>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct TradeId(u32);

impl TradeId {
    #[inline]
    pub fn new(id: u32) -> Self {
        TradeId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct TradeEntry<'bump> {
    pub capacity: u32,
    #[arena(default)]
    pub size: f64,
    #[arena(default)]
    pub power: f64,
    #[arena(default)]
    pub effect: f64,
    #[arena(default)]
    pub cached: f64,
    pub which: RawMaterialsName<'bump>,
}

#[inline]
fn deserialize_trades<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<TradeDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct TradeDatabaseVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for TradeDatabaseVisitor<'bump> {
        type Value = TradeDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing trade entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut trade_ids = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            let mut trade_values = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<TradeEntry<'bump>>>::new(self.0),
            )? {
                trade_ids.push(key);
                trade_values.push(value.into_value());
            }

            let ids = trade_ids.into_bump_slice();
            let values = trade_values.into_bump_slice();
            Ok(TradeDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(TradeDatabaseVisitor(allocator))
}
