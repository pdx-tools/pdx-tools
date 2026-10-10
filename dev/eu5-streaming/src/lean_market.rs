use arena_serde::{ArenaDeserialize, ArenaSeed};
use eu5save::models::{GoodName, LocationId, MarketId};
use serde::de::{self, value::MapAccessDeserializer};
use std::{fmt, marker::PhantomData};
#[derive(ArenaDeserialize)]
pub struct MarketManager<'bump> {
    #[arena(deserialize_with = "parse_market_records")]
    pub database: MarketDatabase<'bump>,
}
pub struct MarketDatabase<'bump> {
    values: &'bump [(MarketId, Maybe<Market<'bump>>)],
}
impl MarketDatabase<'_> {
    pub fn iter_with_id(&self) -> impl Iterator<Item = (MarketId, &Market<'_>)> {
        self.values
            .iter()
            .filter_map(|(id, m)| m.0.as_ref().map(|m| (*id, m)))
    }
}
#[derive(ArenaDeserialize)]
pub struct Market<'bump> {
    pub center: LocationId,
    #[arena(default, deserialize_with = "parse_good_records")]
    pub goods: &'bump [Good<'bump>],
}
pub struct Good<'bump> {
    pub good: GoodName<'bump>,
    pub price: f64,
    pub supply: f64,
    pub demand: f64,
    pub stockpile: f64,
}
#[derive(ArenaDeserialize)]
struct GoodRaw {
    #[arena(default)]
    price: f64,
    #[arena(default)]
    supply: f64,
    #[arena(default)]
    demand: f64,
    #[arena(default)]
    stockpile: f64,
}
struct Maybe<T>(Option<T>);
impl<'bump, T: ArenaDeserialize<'bump>> ArenaDeserialize<'bump> for Maybe<T> {
    fn deserialize_in_arena<'de, D: serde::Deserializer<'de>>(
        d: D,
        a: &'bump arena_serde::Arena,
    ) -> Result<Self, D::Error> {
        struct Visitor<'a, T>(&'a arena_serde::Arena, PhantomData<T>);
        impl<'de, 'a, T: ArenaDeserialize<'a>> de::Visitor<'de> for Visitor<'a, T> {
            type Value = Maybe<T>;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("record or none")
            }
            fn visit_map<M: de::MapAccess<'de>>(self, m: M) -> Result<Self::Value, M::Error> {
                T::deserialize_in_arena(MapAccessDeserializer::new(m), self.0)
                    .map(|v| Maybe(Some(v)))
            }
            fn visit_str<E: de::Error>(self, s: &str) -> Result<Self::Value, E> {
                if s == "none" {
                    Ok(Maybe(None))
                } else {
                    Err(E::custom("expected none"))
                }
            }
            fn visit_bytes<E: de::Error>(self, s: &[u8]) -> Result<Self::Value, E> {
                if s == b"none" {
                    Ok(Maybe(None))
                } else {
                    Err(E::custom("expected none"))
                }
            }
        }
        d.deserialize_map(Visitor(a, PhantomData))
    }
}
fn parse_market_records<'de, 'bump, D: serde::Deserializer<'de>>(
    d: D,
    a: &'bump arena_serde::Arena,
) -> Result<MarketDatabase<'bump>, D::Error> {
    struct Visitor<'a>(&'a arena_serde::Arena);
    impl<'de, 'a> de::Visitor<'de> for Visitor<'a> {
        type Value = MarketDatabase<'a>;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("market map")
        }
        fn visit_map<M: de::MapAccess<'de>>(self, mut m: M) -> Result<Self::Value, M::Error> {
            let mut values = bumpalo::collections::Vec::with_capacity_in(128, self.0);
            while let Some(pair) = m.next_entry_seed(
                ArenaSeed::<MarketId>::new(self.0),
                ArenaSeed::<Maybe<Market<'a>>>::new(self.0),
            )? {
                values.push(pair);
            }
            Ok(MarketDatabase {
                values: values.into_bump_slice(),
            })
        }
    }
    d.deserialize_map(Visitor(a))
}
fn parse_good_records<'de, 'bump, D: serde::Deserializer<'de>>(
    d: D,
    a: &'bump arena_serde::Arena,
) -> Result<&'bump [Good<'bump>], D::Error> {
    struct Visitor<'a>(&'a arena_serde::Arena);
    impl<'de, 'a> de::Visitor<'de> for Visitor<'a> {
        type Value = &'a [Good<'a>];
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("goods map")
        }
        fn visit_map<M: de::MapAccess<'de>>(self, mut m: M) -> Result<Self::Value, M::Error> {
            let mut values = bumpalo::collections::Vec::with_capacity_in(64, self.0);
            while let Some((good, raw)) = m.next_entry_seed(
                ArenaSeed::<GoodName>::new(self.0),
                ArenaSeed::<GoodRaw>::new(self.0),
            )? {
                values.push(Good {
                    good,
                    price: raw.price,
                    supply: raw.supply,
                    demand: raw.demand,
                    stockpile: raw.stockpile,
                });
            }
            Ok(values.into_bump_slice())
        }
    }
    d.deserialize_map(Visitor(a))
}
