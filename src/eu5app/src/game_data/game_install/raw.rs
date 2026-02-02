use super::parsing::{parse_default_map, parse_locations_data, parse_named_locations};
use crate::game_data::game_install::parsing::LocationTerrain;
use crate::game_data::{GameData, GameDataError, TextureProvider};
use crate::map::{EU5_TILE_HEIGHT, EU5_TILE_WIDTH};
use crate::{ColorIdx, GameLocation, GameSpatialLocation, tile_dimensions};
use eu5save::hash::{FnvHashMap, FxHashMap};
use pdx_map::{R16, R16Palette, R16SecondaryMap, Rgb};
use rawzip::{CompressionMethod, ReaderAt, ZipArchive, ZipArchiveEntryWayfinder};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use tracing::instrument;

/// Texture bundle for source game data (parsed from game files).
///
/// Stores textures in memory as R16 format.
pub struct GameTextureBundle {
    west_texture: Vec<R16>,
    east_texture: Vec<R16>,
    palette: R16Palette,
}

impl GameTextureBundle {
    pub fn new(west_texture: Vec<R16>, east_texture: Vec<R16>, palette: R16Palette) -> Self {
        Self {
            west_texture,
            east_texture,
            palette,
        }
    }

    pub fn west_data(&self) -> &[R16] {
        self.west_texture.as_slice()
    }

    pub fn east_data(&self) -> &[R16] {
        self.east_texture.as_slice()
    }

    #[instrument(skip_all, name = "eu5.location_png.transcode")]
    pub fn create_from_location_png(png_bytes: &[u8]) -> Result<Self, GameDataError> {
        let image = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
            .map_err(|e| GameDataError::LocationsError(format!("image decoding: {}", e)))?;
        let image = image.as_rgb8().ok_or_else(|| {
            GameDataError::LocationsError(String::from("locations.png is not in RGB8 format"))
        })?;
        let (width, height) = image.dimensions();

        if !(width == EU5_TILE_WIDTH * 2 && height == EU5_TILE_HEIGHT) {
            return Err(GameDataError::LocationsError(format!(
                "Unexpected locations.png dimensions: {}x{}",
                width, height
            )));
        }

        let (west, east, palette) = pdx_map::split_rgb8_to_indexed_r16(image.as_raw(), width);

        tracing::info!(
            unique_colors = palette.len(),
            "Processed locations.png texture"
        );

        Ok(Self {
            west_texture: west,
            east_texture: east,
            palette,
        })
    }

    #[instrument(
        skip_all,
        name = "eu5.location_png",
        fields(game_locations, texture_locations, joined_locations)
    )]
    pub fn location_aware(
        &self,
        locations: Vec<LocationTerrain>,
    ) -> (Vec<GameLocation>, R16SecondaryMap<GameSpatialLocation>) {
        assert!(
            !self.palette.is_empty(),
            "Texture must be processed to build color index before"
        );

        let mut location_pixels_count = self.palette.map(|_, _| 0u32);
        let mut location_x = self.palette.map(|_, _| 0u32);
        let mut location_y = self.palette.map(|_, _| 0u32);

        let (_height, width) = tile_dimensions();

        for (idx, data) in [self.west_data(), self.east_data()].iter().enumerate() {
            let offset_x = width * (idx as u32);
            for (idx, r16) in data.iter().enumerate() {
                location_pixels_count[*r16] += 1;
                location_x[*r16] += offset_x + ((idx as u32) % width);
                location_y[*r16] += (idx as u32) / width;
            }
        }

        // Compute the average coordinates for each color index
        for (((count, _r16), x), y) in location_pixels_count
            .iter()
            .zip(location_x.iter_mut())
            .zip(location_y.iter_mut())
        {
            *x /= *count;
            *y /= *count;
        }

        let locations_by_color = locations
            .iter()
            .enumerate()
            .map(|(idx, loc)| (Rgb::from(loc.color.0), idx))
            .collect::<FnvHashMap<_, _>>();

        let palette_map = self.palette.map(|_, r16| GameSpatialLocation {
            avg_x: location_x[r16] as u16,
            avg_y: location_y[r16] as u16,
        });

        let mut location_r16 = vec![None; locations.len()];
        for (rgb, r16) in self.palette.iter() {
            let Some(idx) = locations_by_color.get(rgb) else {
                continue;
            };
            location_r16[*idx] = Some(ColorIdx::from(r16));
        }

        let locations = locations
            .into_iter()
            .enumerate()
            .map(|(idx, x)| GameLocation {
                name: x.name,
                terrain: x.terrain,
                color_id: location_r16[idx],
            })
            .collect();

        (locations, palette_map)
    }
}

impl TextureProvider for GameTextureBundle {
    fn load_west_texture(&mut self, mut dst: Vec<R16>) -> Result<Vec<R16>, GameDataError> {
        std::mem::swap(&mut dst, &mut self.west_texture);
        Ok(dst)
    }

    fn load_east_texture(&mut self, mut dst: Vec<R16>) -> Result<Vec<R16>, GameDataError> {
        std::mem::swap(&mut dst, &mut self.east_texture);
        Ok(dst)
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
    pub locations: Vec<LocationTerrain>,
    pub country_localizations: FxHashMap<String, String>,
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
        let (locations, spatial_locations) = textures.location_aware(self.locations);
        GameData::new(locations, spatial_locations, self.country_localizations)
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
    #[instrument(skip_all, name = "eu5.raw_texture.build")]
    pub fn build(mut self) -> Result<GameTextureBundle, GameDataError> {
        let mut png_bytes = Vec::new();
        self.reader
            .read_to_end(&mut png_bytes)
            .map_err(|e| GameDataError::Io(e, String::from("locations_png")))?;

        GameTextureBundle::create_from_location_png(&png_bytes)
    }
}
