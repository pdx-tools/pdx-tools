use crate::models::bstr::BStr;
use crate::models::de::Maybe;
use crate::models::{Color, LocationId, deserialize_vec_capacity};
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use core::fmt;
use serde::{Deserialize, Deserializer, de};

#[derive(Debug, ArenaDeserialize)]
pub struct MarketManager<'bump> {
    #[arena(deserialize_with = "deserialize_produced_goods")]
    pub produced_goods: &'bump [(RawMaterialsName<'bump>, f64)],

    #[arena(deserialize_with = "deserialize_markets")]
    pub database: MarketDatabase<'bump>,
}

impl<'bump> MarketManager<'bump> {
    pub fn get(&self, id: MarketId) -> Option<&Market<'bump>> {
        // Fast path: check if the id is the same as the index
        if let Some(location) = self.database.ids.get(id.value() as usize)
            && id == *location
        {
            return self.database.values[id.value() as usize].as_ref();
        }

        let pos = self
            .database
            .ids
            .iter()
            .position(|location| location == &id)?;
        self.database.values[pos].as_ref()
    }

    pub fn len(&self) -> usize {
        self.database.ids.len()
    }

    pub fn is_empty(&self) -> bool {
        self.database.ids.is_empty()
    }
}

#[derive(Debug, Clone, ArenaDeserialize, PartialEq, Copy, Eq, Hash, PartialOrd, Ord)]
pub struct RawMaterialsName<'bump>(BStr<'bump>);

impl<'bump> RawMaterialsName<'bump> {
    pub fn to_str(&self) -> &str {
        self.0.to_str()
    }
}

impl std::fmt::Display for RawMaterialsName<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_str())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct MarketId(u32);

impl MarketId {
    #[inline]
    pub fn new(id: u32) -> Self {
        MarketId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, PartialEq)]
pub struct MarketDatabase<'bump> {
    ids: &'bump [MarketId],
    values: &'bump [Option<Market<'bump>>],
}

impl MarketDatabase<'_> {
    pub fn iter(&self) -> impl Iterator<Item = &Market<'_>> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Market<'bump> {
    pub center: LocationId,
    pub color: Color,
    #[arena(deserialize_with = "deserialize_market_goods")]
    pub goods: &'bump [MarketGood<'bump>],
}

impl Market<'_> {
    pub fn market_value(&self) -> f64 {
        self.goods.iter().map(|g| g.price * g.total_taken).sum()
    }
}

#[derive(Debug, PartialEq)]
pub struct MarketGood<'bump> {
    pub good: RawMaterialsName<'bump>,
    pub price: f64,
    pub impact: f64,
    pub supply: f64,
    pub demand: f64,
    pub total_taken: f64,
    pub surplus: f64,
    pub possible: f64,
    pub allowed_export_amount: f64,
    pub stockpile: f64,
    pub locations_with_this_as_raw_material: u32,
    pub priority: f64,
    pub history: &'bump [f64],
}

#[inline]
fn deserialize_markets<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<MarketDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct MarketsVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for MarketsVisitor<'bump> {
        type Value = MarketDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing market entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut market_ids = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            let mut market_values = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<Market<'bump>>>::new(self.0),
            )? {
                market_ids.push(key);
                market_values.push(value.into_value());
            }

            let ids = market_ids.into_bump_slice();
            let values = market_values.into_bump_slice();

            Ok(MarketDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(MarketsVisitor(allocator))
}

fn deserialize_produced_goods<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<&'bump [(RawMaterialsName<'bump>, f64)], D::Error>
where
    D: Deserializer<'de>,
{
    struct ProducedGoodsVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for ProducedGoodsVisitor<'bump> {
        type Value = &'bump [(RawMaterialsName<'bump>, f64)];

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a map of produced goods")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut result = bumpalo::collections::Vec::new_in(self.0);

            while let Some((key, value)) =
                map.next_entry_seed(ArenaSeed::new(self.0), ArenaSeed::new(self.0))?
            {
                result.push((key, value));
            }

            Ok(result.into_bump_slice())
        }
    }

    deserializer.deserialize_map(ProducedGoodsVisitor(allocator))
}

fn deserialize_market_goods<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<&'bump [MarketGood<'bump>], D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Debug, ArenaDeserialize)]
    struct MarketGoodRaw<'bump> {
        #[arena(default)]
        price: f64,
        #[arena(default)]
        impact: f64,
        #[arena(default)]
        supply: f64,
        #[arena(default)]
        demand: f64,
        #[arena(default)]
        total_taken: f64,
        #[arena(default)]
        surplus: f64,
        #[arena(default)]
        possible: f64,
        #[arena(default)]
        allowed_export_amount: f64,
        #[arena(default)]
        stockpile: f64,
        #[arena(default)]
        locations_with_this_as_raw_material: u32,
        #[arena(default)]
        priority: f64,
        #[arena(deserialize_with = "deserialize_vec_capacity::<_, _, 120>")]
        history: &'bump [f64],
    }

    struct MarketGoodVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for MarketGoodVisitor<'bump> {
        type Value = &'bump [MarketGood<'bump>];

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a map of produced goods")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut result = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<MarketGoodRaw<'bump>>::new(self.0),
            )? {
                let good = MarketGood {
                    good: key,
                    price: value.price,
                    impact: value.impact,
                    supply: value.supply,
                    demand: value.demand,
                    total_taken: value.total_taken,
                    surplus: value.surplus,
                    possible: value.possible,
                    allowed_export_amount: value.allowed_export_amount,
                    stockpile: value.stockpile,
                    locations_with_this_as_raw_material: value.locations_with_this_as_raw_material,
                    priority: value.priority,
                    history: value.history,
                };
                result.push(good);
            }

            Ok(result.into_bump_slice())
        }
    }

    deserializer.deserialize_map(MarketGoodVisitor(allocator))
}
