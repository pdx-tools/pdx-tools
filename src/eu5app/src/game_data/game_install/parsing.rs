use crate::color::{Hsv, Rgb};
use crate::game_data::{GameDataError, GoodData};
use crate::hexcolor::HexColor;
use crate::models::Terrain;
use eu5save::hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use serde::de::{self, SeqAccess, Visitor};
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

#[derive(Debug, Deserialize)]
pub struct RawGoodData {
    pub color: Option<String>,
    pub default_market_price: f64,
    pub transport_cost: Option<f64>,
}

pub fn parse_goods(
    data: &str,
    _source_name: &str,
) -> Result<FxHashMap<String, RawGoodData>, GameDataError> {
    let reader = jomini::text::TokenReader::new(data.as_bytes());
    jomini::text::de::TextDeserializer::from_utf8_reader(reader)
        .deserialize()
        .map_err(|e| GameDataError::Jomini(e, "goods"))
}

#[derive(Debug, Deserialize)]
struct MapModeColors {
    colors: FxHashMap<String, ClauseColor>,
}

#[derive(Debug, Clone, Copy)]
struct ClauseColor([u8; 3]);

#[derive(Deserialize)]
enum ColorKind {
    #[serde(rename = "rgb")]
    Rgb,
    #[serde(rename = "hsv")]
    Hsv,
    #[serde(rename = "hsv360")]
    Hsv360,
}

impl<'de> Deserialize<'de> for ClauseColor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(ClauseColorVisitor)
    }
}

struct ClauseColorVisitor;

impl<'de> Visitor<'de> for ClauseColorVisitor {
    type Value = ClauseColor;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a tagged rgb/hsv/hsv360 color")
    }

    fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let kind: ColorKind = seq
            .next_element()?
            .ok_or_else(|| de::Error::custom("missing color kind"))?;
        let (a, b, c): (f32, f32, f32) = seq
            .next_element()?
            .ok_or_else(|| de::Error::custom("missing color values"))?;

        let rgb = match kind {
            ColorKind::Rgb => {
                if a <= 1.0 && b <= 1.0 && c <= 1.0 {
                    [
                        float_component(a * 255.0),
                        float_component(b * 255.0),
                        float_component(c * 255.0),
                    ]
                } else {
                    [float_component(a), float_component(b), float_component(c)]
                }
            }
            ColorKind::Hsv => {
                let rgb: Rgb = Hsv {
                    h: a * 360.0,
                    s: b,
                    v: c,
                }
                .into();
                let (r, g, b) = rgb.into();
                [r, g, b]
            }
            ColorKind::Hsv360 => {
                let rgb: Rgb = Hsv {
                    h: a,
                    s: b / 100.0,
                    v: c / 100.0,
                }
                .into();
                let (r, g, b) = rgb.into();
                [r, g, b]
            }
        };

        Ok(ClauseColor(rgb))
    }
}

fn float_component(value: f32) -> u8 {
    value.clamp(0.0, 255.0).round() as u8
}

pub fn parse_map_mode_colors(data: &str) -> Result<FxHashMap<String, [u8; 3]>, GameDataError> {
    let reader = jomini::text::TokenReader::new(data.as_bytes());
    let raw: MapModeColors = jomini::text::de::TextDeserializer::from_utf8_reader(reader)
        .deserialize()
        .map_err(|e| GameDataError::Jomini(e, "named_colors"))?;
    Ok(raw
        .colors
        .into_iter()
        .map(|(name, color)| (name, color.0))
        .collect())
}

pub fn resolve_goods(
    raw_goods: FxHashMap<String, RawGoodData>,
    colors: &FxHashMap<String, [u8; 3]>,
) -> Result<FxHashMap<String, GoodData>, GameDataError> {
    raw_goods
        .into_iter()
        .map(|(name, good)| {
            let color_name = good.color.as_deref().unwrap_or(&name);
            let rgb = colors.get(color_name).copied().ok_or_else(|| {
                GameDataError::MissingData(format!(
                    "good '{name}' references unknown color '{color_name}'"
                ))
            })?;
            Ok((
                name,
                GoodData {
                    color_hex: color_hex(rgb),
                    default_market_price: good.default_market_price,
                    transport_cost: good.transport_cost.unwrap_or(1.0),
                },
            ))
        })
        .collect()
}

fn color_hex(rgb: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2])
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

    #[test]
    fn test_parse_goods() {
        let data = r#"
wool = {
    method = farming
    category = raw_material
    color = goods_wool
    default_market_price = 1.25
    food = 5.0
}

porcelain = {
    category = produced
    color = goods_porcelain
    default_market_price = 3
    transport_cost = 5
}
"#;

        let goods = parse_goods(data, "goods.txt").unwrap();

        assert_eq!(
            goods.get("wool").unwrap().color.as_deref(),
            Some("goods_wool")
        );
        assert_eq!(goods.get("wool").unwrap().default_market_price, 1.25);
        assert_eq!(goods.get("wool").unwrap().transport_cost, None);
        assert_eq!(
            goods.get("porcelain").unwrap().color.as_deref(),
            Some("goods_porcelain")
        );
        assert_eq!(goods.get("porcelain").unwrap().default_market_price, 3.0);
        assert_eq!(goods.get("porcelain").unwrap().transport_cost, Some(5.0));
    }

    #[test]
    fn test_parse_map_mode_colors() {
        let data = r#"
colors = {
    goods_debug = rgb { 255 0 255 }
    goods_wine = rgb { 0.36 0.13 0.28 }
    goods_wool = hsv360 { 180 10 60 }
    goods_coal = hsv { 0 0 0.12 }
}
"#;

        let colors = parse_map_mode_colors(data).unwrap();

        assert_eq!(colors.get("goods_debug"), Some(&[255, 0, 255]));
        assert_eq!(colors.get("goods_wine"), Some(&[92, 33, 71]));
        assert_eq!(colors.get("goods_wool"), Some(&[138, 153, 153]));
        assert_eq!(colors.get("goods_coal"), Some(&[31, 31, 31]));
    }

    #[test]
    fn test_resolve_goods() {
        let goods_data = r#"
wool = {
    color = goods_wool
    default_market_price = 1.25
}
livestock = {
    color = goods_livestock
    default_market_price = 2.0
    transport_cost = 3.0
}
"#;
        let colors_data = r#"
colors = {
    goods_wool = hsv360 { 180 10 60 }
    goods_livestock = rgb { 20 150 45 }
}
"#;

        let raw_goods = parse_goods(goods_data, "goods.txt").unwrap();
        let colors = parse_map_mode_colors(colors_data).unwrap();
        let goods = resolve_goods(raw_goods, &colors).unwrap();

        assert_eq!(goods.get("wool").unwrap().color_hex, "#8a9999");
        assert_eq!(goods.get("wool").unwrap().default_market_price, 1.25);
        assert_eq!(goods.get("wool").unwrap().transport_cost, 1.0);
        assert_eq!(goods.get("livestock").unwrap().color_hex, "#14962d");
        assert_eq!(goods.get("livestock").unwrap().transport_cost, 3.0);
    }

    #[test]
    fn test_resolve_goods_transport_cost_defaults_to_one() {
        let goods_data = r#"
grain = {
    color = goods_grain
    default_market_price = 1.0
}
"#;
        let colors_data = r#"
colors = {
    goods_grain = rgb { 255 255 0 }
}
"#;
        let raw_goods = parse_goods(goods_data, "goods.txt").unwrap();
        let colors = parse_map_mode_colors(colors_data).unwrap();
        let goods = resolve_goods(raw_goods, &colors).unwrap();

        assert_eq!(goods.get("grain").unwrap().transport_cost, 1.0);
    }

    #[test]
    fn test_resolve_goods_unknown_color_is_error() {
        let goods_data = r#"
unknown = {
    color = goods_missing
    default_market_price = 0.5
}
"#;
        let raw_goods = parse_goods(goods_data, "goods.txt").unwrap();
        let colors = parse_map_mode_colors("colors = {}").unwrap();
        assert!(resolve_goods(raw_goods, &colors).is_err());
    }
}
