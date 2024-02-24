use crate::{stats::Vic3CountryStats, Vic3Date};
use serde::{
    de::{self, DeserializeOwned, Unexpected},
    Deserialize, Deserializer,
};
use std::{collections::HashMap, fmt, hash::Hash, marker::PhantomData};

#[derive(Debug, Deserialize, PartialEq)]
pub struct MetaData {
    pub version: String,
    pub game_date: Vic3Date,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Counters {
    week: Option<i32>,
    tick: Option<i32>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3CountryBudget {
    pub weekly_income: Vec<f64>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct PopStatistics {
    pub trend_population: Vic3CountryStats,
}
#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3Country {
    pub definition: String,
    pub government: Option<String>,
    pub budget: Vic3CountryBudget,
    pub gdp: Vic3CountryStats,
    pub literacy: Vic3CountryStats,
    pub prestige: Vic3CountryStats,
    pub avgsoltrend: Vic3CountryStats,
    pub pop_statistics: PopStatistics,
}

#[derive(Debug, PartialEq)]
struct Maybe<T>(Option<T>);
impl<'de, T> de::Deserialize<'de> for Maybe<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Maybe<T>, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct MaybeVisitor<T> {
            marker: PhantomData<Maybe<T>>,
        }
        impl<'de, T1> de::Visitor<'de> for MaybeVisitor<T1>
        where
            T1: Deserialize<'de>,
        {
            type Value = Maybe<T1>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_fmt(format_args!(
                    "struct {} or none",
                    std::any::type_name::<T1>()
                ))
            }
            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match v {
                    "none" => Ok(Maybe(None)),
                    _ => Err(E::invalid_value(Unexpected::Other(v), &self)),
                }
            }

            fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                T1::deserialize(de::value::MapAccessDeserializer::new(map)).map(|x| Maybe(Some(x)))
            }
        }
        deserializer.deserialize_map(MaybeVisitor {
            marker: PhantomData,
        })
    }
}

fn maybe_map<'de, D, K, V>(deser: D) -> Result<HashMap<K, Option<V>>, D::Error>
where
    D: Deserializer<'de>,
    K: Deserialize<'de> + Hash + Eq,
    V: Deserialize<'de>,
{
    struct MaybeVisitor<K, V> {
        marker: PhantomData<HashMap<K, Option<V>>>,
    }

    impl<'de, K1, V1> de::Visitor<'de> for MaybeVisitor<K1, V1>
    where
        K1: Deserialize<'de> + Hash + Eq,
        V1: Deserialize<'de>,
    {
        type Value = HashMap<K1, Option<V1>>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("A maybe map")
        }

        fn visit_map<A>(self, mut access: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut map = HashMap::with_capacity(access.size_hint().unwrap_or(0));
            while let Some((key, value)) = access.next_entry::<K1, Maybe<V1>>()? {
                map.insert(key, value.0);
            }

            Ok(map)
        }
    }

    deser.deserialize_map(MaybeVisitor {
        marker: PhantomData,
    })
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Vic3Manager<Of>
where
    Of: DeserializeOwned,
{
    #[serde(deserialize_with = "maybe_map")]
    pub database: HashMap<u32, Option<Of>>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Player {
    pub idtype: u32,
    pub name: String,
}

#[derive(Debug, PartialEq, Deserialize)]
pub struct Vic3Save {
    pub meta_data: MetaData,
    pub counters: Counters,
    pub country_manager: Vic3Manager<Vic3Country>,
    pub previous_played: Vec<Player>,
}

impl Vic3Save {
    pub fn get_country(&self, country_tag: &str) -> Option<&Vic3Country> {
        self.country_manager
            .database
            .iter()
            .filter_map(|(_, country)| country.as_ref())
            .find(|country| country.definition == country_tag)
    }

    pub fn get_last_played_country(&self) -> &Vic3Country {
        let country = self
            .previous_played
            .first()
            .and_then(|x| self.country_manager.database.get(&x.idtype));

        if let Some(Some(country)) = &country {
            return country;
        }

        // If we can't find the previous played country (ie: observer game)
        // default to the country with the highest weekly income
        let mut incomes = self
            .country_manager
            .database
            .values()
            .filter_map(|x| x.as_ref())
            .map(|x| (x.budget.weekly_income.iter().sum::<f64>(), x))
            .collect::<Vec<_>>();

        incomes.sort_unstable_by(|(a, _), (b, _)| a.total_cmp(b).reverse());
        incomes
            .first()
            .map(|(_, country)| country)
            .expect("for there to be at least one country")
    }

    /// Certain binary floating point values contain a different encoding and so
    /// this function will attempt to normalize these oddities so the same
    /// calculations can be ran on both the binary and plaintext formats.
    /// See "ReencodeScalar" in the melter for other affected fields
    pub fn normalize(mut self) -> Self {
        let countries = self
            .country_manager
            .database
            .values_mut()
            .filter_map(|c| c.as_mut());

        for country in countries {
            let channels = country
                .pop_statistics
                .trend_population
                .channels
                .values_mut();

            for channel in channels {
                for value in &mut channel.values {
                    *value *= 10_000.0;
                }
            }
        }

        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::text::de::from_utf8_slice;
    use serde::Deserialize;
    use std::collections::HashMap;

    #[derive(Debug, Deserialize, PartialEq)]
    pub struct Vic3Country {
        pub definition: String,
        pub government: String,
        pub budget: Vic3CountryBudget,
    }
    #[derive(Debug, Deserialize, PartialEq)]
    pub struct Vic3Save {
        pub meta_data: MetaData,
        pub counters: Counters,
        pub country_manager: Vic3Manager<Vic3Country>,
    }

    const SAVE_FILE: &[u8] = br#"
meta_data={
	save_game_version=1700230462
	version="1.5.9"
	game_date=1887.1.1
	real_date=123.11.17
	name="Paraguay"
	rank="minor_power"
}
country_manager={
	database={
		50331652=none
		16777216={
			definition="GER"
			government="gov_absolute_duchy"
			capital=125
			budget={
				hello={ 0 1 2}
				weekly_income={
					0.0 5024.26541 2323.37397 7485.98455 0.0 0.0 16592.54442 5147.93229 0.0 0.0
				}

						
}}}}

counters={
	command=520993
	tick=74461
	week=2660
	province_theater=144569
}"#;
    #[test]
    fn test_full_save() {
        let out: Vic3Save = from_utf8_slice(SAVE_FILE).unwrap();
        let country = out.country_manager.database[&16777216].as_ref().unwrap();
        assert_eq!(country.definition, "GER");
    }

    #[test]
    fn test_country() {
        let country_segment = br#"country={101={
definition="GER"
government="gov_absolute_duchy"
capital=125
budget={
  weekly_income={ 0.0 5024.26541 2323.37397  }
}
}}"#;

        #[derive(Debug, Deserialize, PartialEq)]
        struct TestCountry {
            #[serde(deserialize_with = "maybe_map")]
            country: HashMap<u32, Option<Vic3Country>>,
        }
        let out: TestCountry = from_utf8_slice(country_segment).unwrap();
        let country = out.country[&101].as_ref().unwrap();
        assert_eq!(country.definition, "GER");
        let out1: TestCountry = from_utf8_slice(b"country={101=none}").unwrap();
        assert_eq!(out1.country[&101], None);
        assert_eq!(
            true,
            from_utf8_slice::<TestCountry>(b"country={101=None}").is_err()
        );
    }
}
