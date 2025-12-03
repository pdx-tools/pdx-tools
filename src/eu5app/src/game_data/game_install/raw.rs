use super::parsing::{parse_default_map, parse_locations_data, parse_named_locations};
use crate::game_data::game_install::parsing::LocationTerrain;
use crate::game_data::{GameData, GameDataError, TextureProvider};
use crate::map::{EU5_TILE_HEIGHT, EU5_TILE_WIDTH};
use crate::models::GameLocationData;
use crate::tile_dimensions;
use eu5save::hash::{FnvHashMap, FxHashMap};
use rawzip::{CompressionMethod, ReaderAt, ZipArchive, ZipArchiveEntryWayfinder};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};

/// Texture bundle for source game data (parsed from game files).
/// Stores textures as in-memory Vec<u8> (already decoded from PNG).
pub struct GameTextureBundle {
    west_texture: Vec<u8>,
    east_texture: Vec<u8>,
}

impl GameTextureBundle {
    /// Create from owned texture data.
    pub fn new(west_texture: Vec<u8>, east_texture: Vec<u8>) -> Self {
        Self {
            west_texture,
            east_texture,
        }
    }
}

impl GameTextureBundle {
    pub fn west_data(&self) -> &[u8] {
        self.west_texture.as_slice()
    }

    pub fn east_data(&self) -> &[u8] {
        self.east_texture.as_slice()
    }

    fn location_aware(
        &self,
        locations: impl Iterator<Item = LocationTerrain>,
    ) -> FxHashMap<String, GameLocationData> {
        let mut location_coordinates = FnvHashMap::default();
        let (_height, width) = tile_dimensions();

        for (idx, data) in [self.west_data(), self.east_data()].iter().enumerate() {
            let offset_x = width * (idx as u32);
            let chunks = data.chunks_exact(4);
            for (idx, chunk) in chunks.enumerate() {
                let rgba = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                location_coordinates.entry(rgba).or_insert_with(|| {
                    (
                        (offset_x as u16) + ((idx as u32) % width) as u16,
                        ((idx as u32) / width) as u16,
                    )
                });
            }
        }

        locations
            .map(|x| {
                let color_id = u32::from_le_bytes([x.color.0[0], x.color.0[1], x.color.0[2], 255]);
                (
                    x.name,
                    GameLocationData {
                        color_id: x.color.0,
                        terrain: x.terrain,
                        coordinates: location_coordinates
                            .get(&color_id)
                            .copied()
                            .unwrap_or((0, 0)),
                    },
                )
            })
            .collect()
    }
}

impl TextureProvider for GameTextureBundle {
    fn load_west_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        dst.copy_from_slice(&self.west_texture);
        Ok(())
    }

    fn load_east_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        dst.copy_from_slice(&self.east_texture);
        Ok(())
    }

    fn west_texture_size(&self) -> usize {
        self.west_texture.len()
    }

    fn east_texture_size(&self) -> usize {
        self.east_texture.len()
    }
}

pub trait GameFileSource {
    fn open_file<'a>(&'a self, path: &str) -> Result<Box<dyn Read + 'a>, GameDataError>;
}

impl<T> GameFileSource for &T
where
    T: GameFileSource,
{
    fn open_file<'a>(&'a self, path: &str) -> Result<Box<dyn Read + 'a>, GameDataError> {
        (**self).open_file(path)
    }
}

pub struct GameInstallationDirectory {
    base_dir: std::path::PathBuf,
}

impl GameInstallationDirectory {
    pub fn open(base_dir: impl Into<std::path::PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }
}

impl GameFileSource for GameInstallationDirectory {
    fn open_file(&self, path: &str) -> Result<Box<dyn Read>, GameDataError> {
        let full_path = self.base_dir.join(path);
        let file = File::open(&full_path)
            .map_err(|e| GameDataError::Io(e, format!("unable to read {}", full_path.display())))?;
        Ok(Box::new(file))
    }
}

pub struct ZipArchiveData<R> {
    zip: ZipArchive<R>,
    entries: HashMap<Vec<u8>, ZipEntryMetadata>,
}

impl<R> ZipArchiveData<R>
where
    R: ReaderAt,
{
    pub fn open(zip: ZipArchive<R>, mut buffer: Vec<u8>) -> Self {
        let mut entries = HashMap::new();

        let mut zip_entries = zip.entries(&mut buffer);
        while let Some(entry) = zip_entries.next_entry().unwrap() {
            let file_path = entry.file_path();
            let metadata = ZipEntryMetadata::from(entry);
            entries.insert(file_path.as_bytes().to_vec(), metadata);
        }

        Self { zip, entries }
    }
}

impl<R> GameFileSource for ZipArchiveData<R>
where
    R: ReaderAt,
{
    fn open_file(&self, path: &str) -> Result<Box<dyn Read + '_>, GameDataError> {
        let entry = self
            .entries
            .get(path.as_bytes())
            .ok_or_else(|| GameDataError::MissingData(String::from(path)))?;

        let zip_entry = self
            .zip
            .get_entry(entry.wayfinder)
            .map_err(GameDataError::ZipAccess)?;
        let reader = zip_entry.reader();

        match entry.compression_method {
            rawzip::CompressionMethod::Store => {
                let reader = zip_entry.verifying_reader(reader);
                Ok(Box::new(reader))
            }
            rawzip::CompressionMethod::Zstd => {
                let reader = pdx_zstd::Decoder::new(reader)?;
                let reader = zip_entry.verifying_reader(reader);
                Ok(Box::new(reader))
            }
            _ => Err(GameDataError::UnsupportedCompression(
                entry.compression_method,
            )),
        }
    }
}

#[derive(Debug)]
struct ZipEntryMetadata {
    compression_method: CompressionMethod,
    wayfinder: ZipArchiveEntryWayfinder,
}

impl From<rawzip::ZipFileHeaderRecord<'_>> for ZipEntryMetadata {
    fn from(header: rawzip::ZipFileHeaderRecord<'_>) -> Self {
        Self {
            compression_method: header.compression_method(),
            wayfinder: header.wayfinder(),
        }
    }
}

/// Source game data parsed from raw game files (EU5 installation or source bundle).
pub struct RawGameData {
    pub(crate) locations: Vec<LocationTerrain>,
    pub(crate) country_localizations: FxHashMap<String, String>,
}

impl RawGameData {
    pub fn from_source<'a>(
        fs: &'a impl GameFileSource,
    ) -> Result<(Self, RawTextureBuilder<Box<dyn Read + 'a>>), GameDataError> {
        let named_locations_reader =
            fs.open_file("game/in_game/map_data/named_locations/00_default.txt")?;
        let named_locations = parse_named_locations(named_locations_reader)?;

        let default_map_reader = fs.open_file("game/in_game/map_data/default.map")?;
        let default_map = parse_default_map(default_map_reader)?;

        let locations_png_reader = fs.open_file("game/in_game/map_data/locations.png")?;
        let locations = parse_locations_data(named_locations, &default_map);

        // Parse country localizations
        let country_localizations_reader =
            fs.open_file("game/main_menu/localization/english/country_names_l_english.yml")?;
        let country_localizations_data = {
            let mut buf = String::new();
            let mut reader = BufReader::new(country_localizations_reader);
            reader
                .read_to_string(&mut buf)
                .map_err(|e| GameDataError::Io(e, String::from("country_localizations")))?;
            buf
        };
        let all_localizations =
            super::parsing::parse_localization_string(&country_localizations_data);
        let country_localizations_map = super::parsing::country_localization(&all_localizations);
        let country_localizations = country_localizations_map.into_iter().collect();

        let me = Self {
            locations: locations.collect(),
            country_localizations,
        };

        let builder = RawTextureBuilder {
            reader: locations_png_reader,
        };

        Ok((me, builder))
    }

    pub fn into_game_data(self, textures: &GameTextureBundle) -> GameData {
        let locations = textures.location_aware(self.locations.into_iter());
        GameData::new(locations, self.country_localizations)
    }
}

/// This allows one to eagerly open the locations.png file from the source, so
/// that it can be marked as "in use" for the bundler, but defers the actual
/// image processing until build time.
#[derive(Debug)]
pub struct RawTextureBuilder<R> {
    reader: R,
}

impl<R> RawTextureBuilder<R>
where
    R: Read,
{
    pub fn build(mut self) -> Result<GameTextureBundle, GameDataError> {
        let mut png_bytes = Vec::new();
        self.reader
            .read_to_end(&mut png_bytes)
            .map_err(|e| GameDataError::Io(e, String::from("locations_png")))?;

        let (west_texture, east_texture) = split_locations_png(&png_bytes)?;

        Ok(GameTextureBundle::new(west_texture, east_texture))
    }
}

fn split_locations_png(png_bytes: &[u8]) -> Result<(Vec<u8>, Vec<u8>), GameDataError> {
    let image = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
        .map_err(|e| GameDataError::LocationsError(format!("image decoding: {}", e)))?
        .to_rgba8();
    let (width, height) = image.dimensions();

    if !(width == EU5_TILE_WIDTH * 2 && height == EU5_TILE_HEIGHT) {
        return Err(GameDataError::LocationsError(format!(
            "Unexpected locations.png dimensions: {}x{}",
            width, height
        )));
    }

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
