use super::parsing::{parse_default_map, parse_locations_data, parse_named_locations};
use crate::game_data::GameDataProvider;
use crate::map::{EU5_TILE_HEIGHT, EU5_TILE_WIDTH};
use crate::models::GameLocationData;
use anyhow::{Context, Result, ensure};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Source game data parsed from raw game files (EU5 installation or source bundle).
/// Eagerly loads and processes all data into memory.
pub struct SourceGameData {
    locations: Vec<GameLocationData>,
    west_texture: Vec<u8>,
    east_texture: Vec<u8>,
    country_localizations: HashMap<String, String>,
}

impl SourceGameData {
    /// Create from a game directory
    pub fn from_directory(base_dir: impl AsRef<Path>) -> Result<Self> {
        let base_dir = base_dir.as_ref();

        // Parse game files
        let named_locations_path =
            base_dir.join("game/in_game/map_data/named_locations/00_default.txt");
        let named_locations_file = fs::File::open(&named_locations_path)
            .with_context(|| format!("Failed to open: {}", named_locations_path.display()))?;
        let named_locations = parse_named_locations(named_locations_file)?;

        let default_map_path = base_dir.join("game/in_game/map_data/default.map");
        let default_map_file = fs::File::open(&default_map_path)
            .with_context(|| format!("Failed to open: {}", default_map_path.display()))?;
        let default_map = parse_default_map(default_map_file)?;

        let locations = parse_locations_data(named_locations, &default_map);

        // Parse country localizations
        let country_localizations_path =
            base_dir.join("game/main_menu/localization/english/country_names_l_english.yml");
        let country_localizations_data = fs::read_to_string(&country_localizations_path)
            .with_context(|| {
                format!(
                    "Failed to read country localizations: {}",
                    country_localizations_path.display()
                )
            })?;
        let all_localizations =
            super::parsing::parse_localization_string(&country_localizations_data);
        let country_localizations = super::parsing::country_localization(&all_localizations);

        // Split locations.png into west/east RGBA buffers eagerly
        let locations_png_path = base_dir.join("game/in_game/map_data/locations.png");
        let locations_png = fs::read(&locations_png_path).with_context(|| {
            format!(
                "Failed to read locations texture: {}",
                locations_png_path.display()
            )
        })?;
        let (west_texture, east_texture) = split_locations_png(&locations_png)?;

        Ok(Self {
            locations,
            west_texture,
            east_texture,
            country_localizations,
        })
    }

    /// Create from a source bundle (zip with raw game files)
    pub fn from_source_bundle(path: impl AsRef<Path>) -> Result<Self> {
        use rawzip::ZipArchive;

        let path = path.as_ref();
        let data = fs::read(path)?;
        let archive = ZipArchive::from_slice(data)?;

        let mut named_locations_data = None;
        let mut default_map_data = None;
        let mut locations_png = None;
        let mut country_localizations_data = None;

        // Read all required files from the source bundle
        for entry in archive.entries() {
            let entry = entry?;
            let file_path = entry.file_path();

            match file_path.as_bytes() {
                b"game/in_game/map_data/named_locations/00_default.txt" => {
                    let wayfinder = entry.wayfinder();
                    let entry_data = archive.get_entry(wayfinder)?;
                    named_locations_data = Some(entry_data.data().to_vec());
                }
                b"game/in_game/map_data/default.map" => {
                    let wayfinder = entry.wayfinder();
                    let entry_data = archive.get_entry(wayfinder)?;
                    default_map_data = Some(entry_data.data().to_vec());
                }
                b"game/in_game/map_data/locations.png" => {
                    let wayfinder = entry.wayfinder();
                    let entry_data = archive.get_entry(wayfinder)?;
                    locations_png = Some(entry_data.data().to_vec());
                }
                b"game/main_menu/localization/english/country_names_l_english.yml" => {
                    let wayfinder = entry.wayfinder();
                    let entry_data = archive.get_entry(wayfinder)?;
                    country_localizations_data = Some(entry_data.data().to_vec());
                }
                _ => {} // Skip other files
            }
        }

        // Parse the data
        let named_locations_data = named_locations_data
            .ok_or_else(|| anyhow::anyhow!("Missing named_locations in source bundle"))?;
        let default_map_data = default_map_data
            .ok_or_else(|| anyhow::anyhow!("Missing default.map in source bundle"))?;
        let locations_png = locations_png
            .ok_or_else(|| anyhow::anyhow!("Missing locations.png in source bundle"))?;
        let country_localizations_data = country_localizations_data.ok_or_else(|| {
            anyhow::anyhow!("Missing country_names_l_english.yml in source bundle")
        })?;

        let named_locations = parse_named_locations(&named_locations_data[..])?;
        let default_map = parse_default_map(&default_map_data[..])?;
        let locations = parse_locations_data(named_locations, &default_map);

        // Parse country localizations
        let country_localizations_str = String::from_utf8_lossy(&country_localizations_data);
        let all_localizations =
            super::parsing::parse_localization_string(&country_localizations_str);
        let country_localizations = super::parsing::country_localization(&all_localizations);

        // Split locations.png into west/east textures
        let (west_texture, east_texture) = split_locations_png(&locations_png)?;

        Ok(Self {
            locations,
            west_texture,
            east_texture,
            country_localizations,
        })
    }
}

impl GameDataProvider for SourceGameData {
    fn locations(&self) -> Result<Vec<GameLocationData>, Box<dyn std::error::Error>> {
        Ok(self.locations.clone())
    }

    fn west_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        dst.copy_from_slice(&self.west_texture);
        Ok(())
    }

    fn east_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        dst.copy_from_slice(&self.east_texture);
        Ok(())
    }

    fn country_localizations(&self) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
        Ok(self.country_localizations.clone())
    }
}

fn split_locations_png(png_bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    let image = image::load_from_memory(png_bytes)
        .context("Failed to decode locations.png from PNG data")?
        .to_rgba8();
    let (width, height) = image.dimensions();
    ensure!(
        width == EU5_TILE_WIDTH * 2 && height == EU5_TILE_HEIGHT,
        "Unexpected locations.png dimensions: {}x{}",
        width,
        height
    );

    let half_width = EU5_TILE_WIDTH;
    let mut west_texture = Vec::with_capacity((half_width * height * 4) as usize);
    let mut east_texture = Vec::with_capacity((half_width * height * 4) as usize);

    for y in 0..height {
        let row_start = (y * width * 4) as usize;
        let row_end = row_start + (width * 4) as usize;
        let row = &image.as_raw()[row_start..row_end];

        west_texture.extend_from_slice(&row[..(half_width * 4) as usize]);
        east_texture.extend_from_slice(&row[(half_width * 4) as usize..]);
    }

    Ok((west_texture, east_texture))
}
