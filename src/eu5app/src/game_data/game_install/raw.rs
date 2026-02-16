use super::parsing::{parse_default_map, parse_locations_data, parse_named_locations};
use crate::game_data::game_install::parsing::LocationTerrain;
use crate::game_data::{GameData, GameDataError, TextureProvider};
use crate::{ColorIdx, GameLocation, hemisphere_size};
use eu5save::hash::{FnvHashMap, FxHashMap};
use pdx_map::{Hemisphere, HemisphereLength, R16, R16Palette, Rgb, World, WorldLength, WorldSize};
use rawzip::{CompressionMethod, ReaderAt, ZipArchive, ZipArchiveEntryWayfinder};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read};
use std::sync::Arc;
use tracing::instrument;

/// Basic texture storage for game map data.
///
/// Wraps a [`World`] containing west and east hemisphere textures.
pub struct GameTextures {
    world: Arc<World>,
}

impl GameTextures {
    /// Create from pre-split hemisphere data (for optimized bundles)
    pub fn new(west_data: Vec<R16>, east_data: Vec<R16>, max_location_index: Option<R16>) -> Self {
        let hemisphere_width = hemisphere_size().width;
        let west = Hemisphere::new(west_data, HemisphereLength::new(hemisphere_width));
        let east = Hemisphere::new(east_data, HemisphereLength::new(hemisphere_width));

        let mut builder = World::builder(west, east);
        if let Some(max) = max_location_index {
            // SAFETY: Max location index is sourced from trusted internal
            // bundle metadata produced by the asset compiler.
            builder = unsafe { builder.with_max_location_index_unchecked(max) };
        }

        Self {
            world: Arc::new(builder.build()),
        }
    }

    /// Create directly from a World (for raw data processing)
    pub fn from_world(world: World) -> Self {
        Self {
            world: Arc::new(world),
        }
    }

    /// Returns a cheap clone of the world
    pub fn world(&self) -> Arc<World> {
        Arc::clone(&self.world)
    }

    pub fn west_data(&self) -> &[R16] {
        self.world.west().as_slice()
    }

    pub fn east_data(&self) -> &[R16] {
        self.world.east().as_slice()
    }
}

impl TextureProvider for GameTextures {
    fn west_texture(&self) -> &[R16] {
        self.world.west().as_slice()
    }

    fn east_texture(&self) -> &[R16] {
        self.world.east().as_slice()
    }

    fn west_texture_size(&self) -> usize {
        self.world.west().as_slice().len()
    }

    fn east_texture_size(&self) -> usize {
        self.world.east().as_slice().len()
    }
}

/// Palette-aware textures for raw game data processing.
///
/// Contains both textures and the RGB-to-R16 color mapping palette.
/// This type is used during game data compilation to map location
/// colors to texture indices.
pub struct PalettedTextures {
    textures: GameTextures,
    palette: R16Palette,
}

impl PalettedTextures {
    /// Create from locations.png data
    #[instrument(skip_all, name = "eu5.location_png.transcode")]
    pub fn create_from_location_png(png_bytes: &[u8]) -> Result<Self, GameDataError> {
        let image = image::load_from_memory_with_format(png_bytes, image::ImageFormat::Png)
            .map_err(|e| GameDataError::LocationsError(format!("image decoding: {}", e)))?;
        let image = image.as_rgb8().ok_or_else(|| {
            GameDataError::LocationsError(String::from("locations.png is not in RGB8 format"))
        })?;
        let (width, height) = image.dimensions();
        let world_size = WorldSize::new(width, height);

        if world_size != hemisphere_size().world() {
            return Err(GameDataError::LocationsError(format!(
                "Unexpected locations.png dimensions: {}x{}",
                width, height
            )));
        }

        let (world, palette) = World::from_rgb8(image.as_raw(), WorldLength::new(width));

        tracing::info!(
            unique_colors = palette.len(),
            "Processed locations.png texture"
        );

        Ok(Self {
            textures: GameTextures::from_world(world),
            palette,
        })
    }

    /// Process location data with palette awareness
    #[instrument(
        skip_all,
        name = "eu5.location_png",
        fields(game_locations, joined_locations)
    )]
    pub fn location_aware(&self, locations: Vec<LocationTerrain>) -> Vec<GameLocation> {
        let locations_by_color = locations
            .iter()
            .enumerate()
            .map(|(idx, loc)| (Rgb::from(loc.color.0), idx))
            .collect::<FnvHashMap<_, _>>();

        let mut location_r16 = vec![None; locations.len()];
        for (rgb, r16) in self.palette.iter() {
            let Some(idx) = locations_by_color.get(rgb) else {
                continue;
            };
            location_r16[*idx] = Some(ColorIdx::from(r16));
        }

        locations
            .into_iter()
            .enumerate()
            .map(|(idx, x)| GameLocation {
                name: x.name,
                terrain: x.terrain,
                color_id: location_r16[idx],
            })
            .collect()
    }

    /// Access underlying textures (for bundle writing)
    pub fn textures(&self) -> &GameTextures {
        &self.textures
    }

    /// Consume and extract the underlying textures (for runtime use after compilation)
    pub fn into_textures(self) -> GameTextures {
        self.textures
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

    pub fn into_game_data(self, textures: &PalettedTextures) -> GameData {
        let locations = textures.location_aware(self.locations);
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
    #[instrument(skip_all, name = "eu5.raw_texture.build")]
    pub fn build(mut self) -> Result<PalettedTextures, GameDataError> {
        let mut png_bytes = Vec::new();
        self.reader
            .read_to_end(&mut png_bytes)
            .map_err(|e| GameDataError::Io(e, String::from("locations_png")))?;

        PalettedTextures::create_from_location_png(&png_bytes)
    }
}
