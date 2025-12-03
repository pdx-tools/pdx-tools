use crate::game_data::GameDataError;
use crate::hexcolor::HexColor;
use crate::models::Terrain;
use eu5save::hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use std::io::Read;

use std::collections::HashMap;

#[derive(Debug)]
pub struct DefaultMap {
    pub water_locations: FxHashSet<String>,
    pub impassable: FxHashSet<String>,
}

pub fn parse_default_map(reader: impl Read) -> Result<DefaultMap, GameDataError> {
    let reader = jomini::text::TokenReader::new(reader);

    #[derive(Deserialize, Debug)]
    struct DefaultMapRaw {
        sea_zones: Vec<String>,
        lakes: Vec<String>,
        impassable_mountains: Vec<String>,
        non_ownable: Vec<String>,
    }

    let default_map: DefaultMapRaw = jomini::text::de::TextDeserializer::from_utf8_reader(reader)
        .deserialize()
        .map_err(|e| GameDataError::Jomini(e, "default.map"))?;

    let water_locations = default_map
        .sea_zones
        .iter()
        .chain(default_map.lakes.iter())
        .cloned()
        .collect::<FxHashSet<_>>();

    let impassable = default_map
        .impassable_mountains
        .iter()
        .chain(default_map.non_ownable.iter())
        .cloned()
        .collect::<FxHashSet<_>>();

    Ok(DefaultMap {
        water_locations,
        impassable,
    })
}

pub fn parse_named_locations(
    reader: impl Read,
) -> Result<FxHashMap<String, HexColor>, GameDataError> {
    let reader = jomini::text::TokenReader::new(reader);
    let location_hex: FxHashMap<String, HexColor> =
        jomini::text::de::TextDeserializer::from_utf8_reader(reader)
            .deserialize()
            .map_err(|e| GameDataError::Jomini(e, "named_locations"))?;
    Ok(location_hex)
}

#[derive(Debug)]
pub struct LocationTerrain {
    pub name: String,
    pub terrain: Terrain,
    pub color: HexColor,
}

pub fn parse_locations_data(
    named_locations: FxHashMap<String, HexColor>,
    default_map: &DefaultMap,
) -> impl Iterator<Item = LocationTerrain> {
    named_locations.into_iter().map(|(name, hex)| {
        let terrain = if default_map.water_locations.contains(&name) {
            Terrain::Water
        } else if default_map.impassable.contains(&name) {
            Terrain::Impassable
        } else {
            Terrain::default()
        };

        LocationTerrain {
            name,
            terrain,
            color: hex,
        }
    })
}

/// Parse a single localization file in the format:
pub fn parse_localization_string(data: &str) -> HashMap<String, String> {
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

            if let Some(field2) = splits.next()
                && let Some(v) = quote_container.captures(field2)
            {
                result.insert(String::from(key), String::from(&v[1]));
            }
        }
    }

    result
}

/// Extract country localizations from the parsed data.
///
/// Filters for uppercase tags and excludes adjectives (_ADJ suffix).
pub fn country_localization(localizations: &HashMap<String, String>) -> HashMap<String, String> {
    localizations
        .iter()
        .filter(|(key, _)| {
            !key.is_empty()
                && key.chars().all(|c| c.is_uppercase() || c == '_')
                && !key.ends_with("_ADJ")
        })
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_localization() {
        let data = r#"l_english:
 TEU: "Teutonic Order"
 TEU_ADJ: "Teutonic"
 MEDICI: "Medici"
 MEDICI_ADJ: "Medici"
 DNS: "Kalmar Union"
 DNS_ADJ: "Kalmar"
 # Comment line
"#;
        let parsed = parse_localization_string(data);
        assert_eq!(parsed.get("TEU").unwrap(), "Teutonic Order");
        assert_eq!(parsed.get("TEU_ADJ").unwrap(), "Teutonic");
        assert_eq!(parsed.get("MEDICI").unwrap(), "Medici");
        assert_eq!(parsed.get("DNS").unwrap(), "Kalmar Union");
    }

    #[test]
    fn test_country_localization() {
        let mut localizations = HashMap::new();
        localizations.insert("TEU".to_string(), "Teutonic Order".to_string());
        localizations.insert("TEU_ADJ".to_string(), "Teutonic".to_string());
        localizations.insert("MEDICI".to_string(), "Medici".to_string());
        localizations.insert("MEDICI_ADJ".to_string(), "Medici".to_string());
        localizations.insert("DNS".to_string(), "Kalmar Union".to_string());
        localizations.insert("DNS_ADJ".to_string(), "Kalmar".to_string());
        localizations.insert("abc".to_string(), "lowercase".to_string());

        let countries = country_localization(&localizations);

        assert_eq!(countries.get("TEU").unwrap(), "Teutonic Order");
        assert_eq!(countries.get("MEDICI").unwrap(), "Medici");
        assert_eq!(countries.get("DNS").unwrap(), "Kalmar Union");
        assert!(!countries.contains_key("TEU_ADJ")); // Adjectives filtered out
        assert!(!countries.contains_key("MEDICI_ADJ")); // Adjectives filtered out
        assert!(!countries.contains_key("abc")); // Lowercase filtered out
        assert_eq!(countries.len(), 3);
    }
}
