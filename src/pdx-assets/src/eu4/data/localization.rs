use eu4save::CountryTag;
use std::{collections::HashMap, fs, path::Path};

#[derive(Debug, Clone)]
pub struct LocalizedCountry {
    pub name: String,
    pub adjective: String,
}

pub fn country_localization(
    localizations: &HashMap<String, String>,
) -> HashMap<CountryTag, LocalizedCountry> {
    let mut result = HashMap::new();
    let mut adj_key = String::with_capacity(7);
    for (key, name) in localizations.iter() {
        if key.len() != 3 || !key.chars().all(char::is_uppercase) {
            continue;
        }

        adj_key.clear();
        adj_key.push_str(key);
        adj_key.push_str("_ADJ");
        if let Some(adjective) = localizations.get(adj_key.as_str()) {
            result.insert(
                key.parse::<CountryTag>().unwrap(),
                LocalizedCountry {
                    name: name.clone(),
                    adjective: adjective.clone(),
                },
            );
        }
    }

    result
}

fn parse_localization(data: &str) -> HashMap<String, String> {
    let quote_container = regex::Regex::new("\"(.*)\"").unwrap();
    let mut result = HashMap::new();
    for line in data.lines().skip(1) {
        let mut splits = line.split(':');
        if let Some(field) = splits.next() {
            let key = field.trim();

            // skip comments and blanks
            if key.starts_with('#') || key.is_empty() {
                continue;
            }

            if let Some(field2) = splits.next() {
                if let Some(v) = quote_container.captures(field2) {
                    if let Some(prev) = result.insert(String::from(key), String::from(&v[1])) {
                        panic!("previous localization value: {}", prev);
                    }
                }
            } else {
                panic!("no value found for {}", key);
            }
        } else {
            panic!("localization contained line without colon: {}", line);
        }
    }

    result
}

pub fn english_localization<P: AsRef<Path>>(dir: P) -> anyhow::Result<HashMap<String, String>> {
    let mut result = HashMap::new();
    for entry in fs::read_dir(dir.as_ref())? {
        let entry = entry?;
        if !entry
            .path()
            .file_name()
            .is_some_and(|x| x.to_string_lossy().ends_with("english.yml"))
        {
            continue;
        }

        let data = fs::read_to_string(entry.path())?;
        let locals = parse_localization(&data);
        result.extend(locals);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_localized_countries() {
        let data = include_str!("../../../tests/fixtures/localisation/countries_l_english.yml");
        let data = parse_localization(data);
        let res = country_localization(&data);
        let ada = res.get(&"ADA".parse().unwrap()).unwrap();
        assert_eq!(ada.name, String::from("Adal"));
        assert_eq!(ada.adjective, String::from("Adalan"));

        let ade = res.get(&"ADE".parse().unwrap()).unwrap();
        assert_eq!(ade.name, String::from("Aden"));
        assert_eq!(ade.adjective, String::from("Adeni"));

        let gol = res.get(&"GOL".parse().unwrap()).unwrap();
        assert_eq!(gol.name, String::from("Great Horde"));
        assert_eq!(gol.adjective, String::from("Great Horde"));

        let icm = res.get(&"ICM".parse().unwrap()).unwrap();
        assert_eq!(icm.name, String::from("Ichma"));
        assert_eq!(icm.adjective, String::from("Ichman"));
    }

    #[test]
    fn test_parse_localized_countries_text_english() {
        let data = include_str!("../../../tests/fixtures/localisation/text_l_english.yml");
        let data = parse_localization(data);
        let res = country_localization(&data);
        let bha = res.get(&"BHA".parse().unwrap()).unwrap();
        assert_eq!(bha.name, String::from("Bharat"));
        assert_eq!(bha.adjective, String::from("Bharathi"));

        assert!(!res.contains_key(&"INF".parse().unwrap()));
    }

    #[test]
    fn test_parse_localize_condition() {
        let data = include_str!("../../../tests/fixtures/localisation/text_l_english.yml");
        let res: HashMap<_, _> = parse_localization(data)
            .into_iter()
            .filter(|(k, _v)| k.starts_with("building_"))
            .collect();
        let building = res.get("building_farm_estate").unwrap();
        assert_eq!(building, &String::from("Farm Estate"));
    }

    #[test]
    fn test_parse_localize_region() {
        let data = r#"
        l_english:
          andes_superregion:0 "Andes""#;
        let data = parse_localization(data);
        assert_eq!(
            data.get("andes_superregion").unwrap().clone(),
            String::from("Andes")
        );
    }
}
