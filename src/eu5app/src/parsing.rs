use crate::hexcolor::HexColor;
use crate::models::{GameLocationData, Terrain};
use anyhow::{Context, Result};
use eu5save::hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use std::io::Read;

#[derive(Debug)]
pub struct DefaultMap {
    pub water_locations: FxHashSet<String>,
    pub impassable: FxHashSet<String>,
}

pub fn parse_default_map(reader: impl Read) -> Result<DefaultMap> {
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
        .context("Failed to parse default.map")?;

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

pub fn parse_named_locations(reader: impl Read) -> Result<FxHashMap<String, HexColor>> {
    let reader = jomini::text::TokenReader::new(reader);
    let location_hex: FxHashMap<String, HexColor> =
        jomini::text::de::TextDeserializer::from_utf8_reader(reader)
            .deserialize()
            .context("Failed to parse named_locations")?;
    Ok(location_hex)
}

pub fn parse_locations_data(
    named_locations: FxHashMap<String, HexColor>,
    default_map: &DefaultMap,
) -> Vec<GameLocationData> {
    named_locations
        .into_iter()
        .map(|(name, hex)| {
            let terrain = if default_map.water_locations.contains(&name) {
                Terrain::Water
            } else if default_map.impassable.contains(&name) {
                Terrain::Impassable
            } else {
                Terrain::default()
            };

            GameLocationData {
                name,
                color_id: hex.0,
                terrain,
                coordinates: (0, 0), // Will be filled by texture processing
            }
        })
        .collect()
}
