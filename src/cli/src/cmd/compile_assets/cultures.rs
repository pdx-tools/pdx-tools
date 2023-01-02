use serde::{
    de::{self, IgnoredAny},
    Deserialize, Deserializer,
};
use std::collections::HashMap;
use std::fmt;

#[derive(Debug, Deserialize, PartialEq)]
pub struct Cultures {
    pub culture_groups: HashMap<String, CultureGroup>,
}

#[derive(Debug, PartialEq)]
pub struct CultureGroup {
    pub graphical_culture: Option<String>,
    pub dynasty_names: Vec<String>,
    pub female_names: Vec<String>,
    pub male_names: Vec<String>,
    pub cultures: Vec<String>,
}

impl<'de> Deserialize<'de> for CultureGroup {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct CultureGroupVisitor;

        impl<'de> de::Visitor<'de> for CultureGroupVisitor {
            type Value = CultureGroup;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct CultureGroup with arbitrary fields")
            }

            fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
            where
                A: de::MapAccess<'de>,
            {
                let mut graphical_culture = None;
                let mut dynasty_names = Vec::new();
                let mut female_names = Vec::new();
                let mut male_names = Vec::new();
                let mut cultures = Vec::new();

                while let Some(key) = map.next_key::<&str>()? {
                    match key {
                        "graphical_culture" => graphical_culture = map.next_value()?,
                        "dynasty_names" => dynasty_names = map.next_value()?,
                        "female_names" => female_names = map.next_value()?,
                        "male_names" => male_names = map.next_value()?,
                        x => {
                            cultures.push(x.to_string());
                            map.next_value::<IgnoredAny>()?;
                        }
                    }
                }

                Ok(CultureGroup {
                    graphical_culture,
                    dynasty_names,
                    female_names,
                    male_names,
                    cultures,
                })
            }
        }

        deserializer.deserialize_map(CultureGroupVisitor)
    }
}

pub fn parse_cultures(data: &[u8]) -> Cultures {
    let groups = jomini::text::de::from_windows1252_slice(data).unwrap();
    Cultures {
        culture_groups: groups,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    pub fn test_culture_parse() {
        let data = r#"
        latin = {
            graphical_culture = westerngfx
            romagnan = {
                primary = FER
        
                dynasty_names = {
                    Bevilacqua Boschetti Carandini Castelvetri Tassoni "Pico di Mirandola" Rangoni Monesi "da Fogliano" Bevilacqua "da Correggio" Platoni Biondelli Arrigoni Castiglione Cavriani d'Arco Ceresara Donesmondi
                }
            }
            male_names = {
                Abbondanzio
            }
            female_names = {
                Abelina
            }
            dynasty_names = {
                "de' Medici"
            }
        }
"#;

        let actual = parse_cultures(data.as_bytes());
        let latin = actual.culture_groups.get("latin").unwrap();
        assert_eq!(latin.cultures, vec![String::from("romagnan")]);
    }
}
