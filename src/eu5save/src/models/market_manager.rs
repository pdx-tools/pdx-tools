use crate::models::bstr::BStr;
use crate::models::de::Maybe;
use crate::models::{
    Color, CountryId, LocationId, de::deserialize_vec_pair_arena_required, deserialize_vec_capacity,
};
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

    pub fn iter_with_id(&self) -> impl Iterator<Item = (MarketId, &Market<'_>)> {
        self.ids
            .iter()
            .zip(self.values.iter())
            .filter_map(|(&id, v)| v.as_ref().map(|m| (id, m)))
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Merchant {
    #[arena(default)]
    pub country: CountryId,
    #[arena(default)]
    pub power: f64,
    #[arena(default)]
    pub capacity: f64,
    #[arena(default)]
    pub original_power: f64,
    #[arena(default)]
    pub original_capacity: f64,
    #[arena(default)]
    pub used: f64,
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Market<'bump> {
    pub center: LocationId,
    #[arena(default)]
    pub color: Color,
    #[arena(default, deserialize_with = "deserialize_market_goods")]
    pub goods: &'bump [MarketGood<'bump>],
    #[arena(duplicated, alias = "merchant")]
    pub merchants: &'bump [Merchant],
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
    pub supplied: &'bump [(BStr<'bump>, f64)],
    pub demanded: &'bump [(BStr<'bump>, f64)],
    pub taken: &'bump [(BStr<'bump>, f64)],
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
        #[arena(default, deserialize_with = "deserialize_market_good_breakdown")]
        supplied: &'bump [(BStr<'bump>, f64)],
        #[arena(default, deserialize_with = "deserialize_market_good_breakdown")]
        demanded: &'bump [(BStr<'bump>, f64)],
        #[arena(default, deserialize_with = "deserialize_market_good_breakdown")]
        taken: &'bump [(BStr<'bump>, f64)],
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
                    supplied: value.supplied,
                    demanded: value.demanded,
                    taken: value.taken,
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

fn deserialize_market_good_breakdown<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<&'bump [(BStr<'bump>, f64)], D::Error>
where
    D: Deserializer<'de>,
{
    Ok(
        deserialize_vec_pair_arena_required::<_, BStr<'bump>, f64>(deserializer, allocator)?
            .into_bump_slice(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::TextDeserializer;

    fn deserialize_manager<'bump>(
        data: &str,
        allocator: &'bump bumpalo::Bump,
    ) -> MarketManager<'bump> {
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        MarketManager::deserialize_in_arena(&deserializer, allocator)
            .expect("market manager deserializes")
    }

    #[test]
    fn market_parses_repeated_merchant_blocks() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
produced_goods={}
database={
    100={
        center=100
        merchant={
            country=1523
            power=44.33076
            original_power=44.33076
            capacity=23.51775
            original_capacity=23.51775
            used=23.51775
        }
        merchant={
            country=2147
            power=5.11316
            original_power=5.11316
            capacity=4.935
            original_capacity=4.935
            used=4.662
        }
        merchant={
            country=214
            power=2.90275
            original_power=2.90275
        }
    }
}
"#,
            &allocator,
        );

        let market = manager.get(MarketId::new(100)).expect("market 100 exists");
        assert_eq!(market.merchants.len(), 3);

        let m0 = &market.merchants[0];
        assert_eq!(m0.country, CountryId::new(1523));
        assert!((m0.power - 44.33076).abs() < 1e-5);
        assert!((m0.capacity - 23.51775).abs() < 1e-5);
        assert!((m0.used - 23.51775).abs() < 1e-5);

        let m2 = &market.merchants[2];
        assert_eq!(m2.country, CountryId::new(214));
        assert!((m2.power - 2.90275).abs() < 1e-5);
        assert_eq!(m2.capacity, 0.0);
        assert_eq!(m2.used, 0.0);
    }

    #[test]
    fn merchant_absent_numeric_fields_default_to_zero() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
produced_goods={}
database={
    1={
        center=1
        merchant={
            country=99
        }
    }
}
"#,
            &allocator,
        );

        let market = manager.get(MarketId::new(1)).expect("market 1 exists");
        assert_eq!(market.merchants.len(), 1);
        let m = &market.merchants[0];
        assert_eq!(m.country, CountryId::new(99));
        assert_eq!(m.power, 0.0);
        assert_eq!(m.capacity, 0.0);
        assert_eq!(m.original_power, 0.0);
        assert_eq!(m.original_capacity, 0.0);
        assert_eq!(m.used, 0.0);
    }

    #[test]
    fn market_with_no_merchants_has_empty_slice() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
produced_goods={}
database={
    5={
        center=5
    }
}
"#,
            &allocator,
        );

        let market = manager.get(MarketId::new(5)).expect("market 5 exists");
        assert!(market.merchants.is_empty());
    }
}
