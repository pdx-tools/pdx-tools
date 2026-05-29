use super::parsing::{
    parse_building_keys, parse_culture_keys, parse_default_map, parse_goods, parse_locations_data,
    parse_map_mode_colors, parse_named_locations, parse_religion_keys, resolve_goods,
};
use crate::game_data::game_install::parsing::LocationTerrain;
use crate::game_data::{GameData, GameDataError, GoodData, Localization, TextureProvider};
use crate::{ColorIdx, GameLocation, hemisphere_size};
use eu5save::hash::{FnvHashMap, FxHashMap, FxHashSet};
use pdx_map::{Hemisphere, HemisphereLength, R16, R16Palette, Rgb, World, WorldLength, WorldSize};
use rawzip::{CompressionMethod, ReaderAt, ZipArchive, ZipArchiveEntryWayfinder};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
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
    fn read_to_string(&self, path: &str) -> Result<String, GameDataError>;
    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>, GameDataError>;
}

impl<T> GameFileSource for &T
where
    T: GameFileSource,
{
    fn open_file<'a>(&'a self, path: &str) -> Result<Box<dyn Read + 'a>, GameDataError> {
        (**self).open_file(path)
    }

    fn read_to_string(&self, path: &str) -> Result<String, GameDataError> {
        (**self).read_to_string(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>, GameDataError> {
        (**self).walk_directory(path, ends_with)
    }
}

pub trait Eu5GameFileSourceExt: GameFileSource {
    fn parse_goods(&self) -> Result<FxHashMap<String, GoodData>, GameDataError>;
    fn parse_building_keys(&self) -> Result<FxHashSet<String>, GameDataError>;
    fn parse_religion_keys(&self) -> Result<FxHashSet<String>, GameDataError>;
    fn parse_culture_keys(&self) -> Result<FxHashSet<String>, GameDataError>;
    fn load_blessed_localizations(
        &self,
        goods: &FxHashSet<String>,
        buildings: &FxHashSet<String>,
        religions: &FxHashSet<String>,
        cultures: &FxHashSet<String>,
    ) -> Result<FxHashMap<String, String>, GameDataError>;
}

impl<T: GameFileSource + ?Sized> Eu5GameFileSourceExt for T {
    fn parse_goods(&self) -> Result<FxHashMap<String, GoodData>, GameDataError> {
        let goods_files = self.walk_directory("game/in_game/common/goods", &[".txt"])?;

        let mut raw_goods = FxHashMap::default();
        for path in goods_files {
            let Some(file_name) = path.rsplit('/').next() else {
                continue;
            };
            if file_name.to_ascii_lowercase().contains("readme") {
                continue;
            }
            let data = self.read_to_string(&path)?;
            raw_goods.extend(parse_goods(&data, &path)?);
        }

        let color_data = self.read_to_string("game/main_menu/common/named_colors/02_map.txt")?;
        let colors = parse_map_mode_colors(&color_data)?;
        resolve_goods(raw_goods, &colors)
    }

    fn parse_building_keys(&self) -> Result<FxHashSet<String>, GameDataError> {
        let building_files =
            self.walk_directory("game/in_game/common/building_types", &[".txt"])?;
        let mut building_keys = FxHashSet::default();
        for path in building_files {
            let Some(file_name) = path.rsplit('/').next() else {
                continue;
            };
            if file_name.to_ascii_lowercase().contains("readme") {
                continue;
            }
            let data = self.read_to_string(&path)?;
            building_keys.extend(parse_building_keys(&data)?);
        }

        Ok(building_keys)
    }

    fn parse_religion_keys(&self) -> Result<FxHashSet<String>, GameDataError> {
        let religion_files = self.walk_directory("game/in_game/common/religions", &[".txt"])?;
        let mut religion_keys = FxHashSet::default();
        for path in religion_files {
            let Some(file_name) = path.rsplit('/').next() else {
                continue;
            };
            if file_name.to_ascii_lowercase().contains("readme") {
                continue;
            }
            let data = self.read_to_string(&path)?;
            religion_keys.extend(parse_religion_keys(&data)?);
        }

        Ok(religion_keys)
    }

    fn parse_culture_keys(&self) -> Result<FxHashSet<String>, GameDataError> {
        let culture_files = self.walk_directory("game/in_game/common/cultures", &[".txt"])?;
        let mut culture_keys = FxHashSet::default();
        for path in culture_files {
            let Some(file_name) = path.rsplit('/').next() else {
                continue;
            };
            if file_name.to_ascii_lowercase().contains("readme") {
                continue;
            }
            let data = self.read_to_string(&path)?;
            culture_keys.extend(parse_culture_keys(&data)?);
        }

        Ok(culture_keys)
    }

    /// EU5 localization (across all english localization):
    /// - 222,265 unique keys found
    /// - 61 keys are duplicated across files
    /// - 31 duplicated keys have different values
    fn load_blessed_localizations(
        &self,
        goods: &FxHashSet<String>,
        buildings: &FxHashSet<String>,
        religions: &FxHashSet<String>,
        cultures: &FxHashSet<String>,
    ) -> Result<FxHashMap<String, String>, GameDataError> {
        let mut entries: FxHashMap<String, String> = FxHashMap::default();
        let mut same_value_duplicates: usize = 0;
        let mut conflicting_duplicates: usize = 0;
        for file in blessed_files(goods, buildings, religions, cultures) {
            let data = self.read_to_string(file.path)?;
            for (key, value) in super::parsing::parse_localization(&data) {
                if !(file.filter)(key) {
                    continue;
                }
                match entries.get(key) {
                    Some(prev) if prev == value => {
                        same_value_duplicates += 1;
                    }
                    Some(prev) => {
                        tracing::debug!(
                            name: "eu5.localization.duplicate.conflict",
                            key = key,
                            previous = %prev,
                            replacement = value,
                            file = file.path,
                            "later blessed file overrides earlier value for key",
                        );
                        conflicting_duplicates += 1;
                        entries.insert(key.to_owned(), value.to_owned());
                    }
                    None => {
                        entries.insert(key.to_owned(), value.to_owned());
                    }
                }
            }
        }

        tracing::info!(
            name: "eu5.localization.loaded",
            unique_keys = entries.len(),
            same_value_duplicates,
            conflicting_duplicates,
            "blessed localization files merged into flat map",
        );

        Ok(entries)
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

    fn read_to_string(&self, path: &str) -> Result<String, GameDataError> {
        let full_path = self.base_dir.join(path);
        std::fs::read_to_string(&full_path)
            .map_err(|e| GameDataError::Io(e, format!("unable to read {}", full_path.display())))
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>, GameDataError> {
        let full_path = self.base_dir.join(path);
        let mut files = Vec::new();
        for entry in walkdir::WalkDir::new(&full_path) {
            let entry = entry.map_err(|e| {
                GameDataError::Io(std::io::Error::other(e), full_path.display().to_string())
            })?;
            if !entry.file_type().is_file() {
                continue;
            }
            let relative_path = entry
                .path()
                .strip_prefix(&self.base_dir)
                .map_err(|e| {
                    GameDataError::Io(std::io::Error::other(e), full_path.display().to_string())
                })?
                .to_string_lossy()
                .replace('\\', "/");
            if ends_with
                .iter()
                .any(|suffix| relative_path.ends_with(suffix))
            {
                files.push(relative_path);
            }
        }
        files.sort();
        Ok(files)
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

    fn read_to_string(&self, path: &str) -> Result<String, GameDataError> {
        let mut reader = self.open_file(path)?;
        let mut buf = String::new();
        reader
            .read_to_string(&mut buf)
            .map_err(|e| GameDataError::Io(e, String::from(path)))?;
        Ok(buf)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>, GameDataError> {
        let dir_prefix = format!("{}/", path.trim_end_matches('/'));
        let mut files = self
            .entries
            .keys()
            .filter_map(|x| std::str::from_utf8(x).ok())
            .filter(|file_path| file_path.starts_with(&dir_prefix))
            .filter(|file_path| ends_with.iter().any(|suffix| file_path.ends_with(suffix)))
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        files.sort();
        Ok(files)
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

/// One localization file folded into the flat [`Localization`] map. `filter`
/// runs against each parsed key; only keys where it returns `true` are kept.
/// The runtime map stays an opaque key/value bag; filtering only trims keys
/// that can never be looked up so the bundle stays small.
pub struct BlessedFile<'a> {
    pub path: &'static str,
    pub filter: Box<dyn Fn(&str) -> bool + 'a>,
}

/// Tag-shaped keys (uppercase + underscores). Keeps `TAG` and `TAG_ADJ`; the
/// adjective form is needed to resolve `$ADJ$` in templated country names.
fn is_country_name_key(key: &str) -> bool {
    key.chars().all(|c| c.is_ascii_uppercase() || c == '_')
}

/// Build the ordered blessed-file list. Each file's filter is declared inline
/// next to its path, so adding a new file is a one-line extension and new
/// filter strategies do not require touching a central dispatch.
fn blessed_files<'a>(
    goods: &'a FxHashSet<String>,
    buildings: &'a FxHashSet<String>,
    religions: &'a FxHashSet<String>,
    cultures: &'a FxHashSet<String>,
) -> Vec<BlessedFile<'a>> {
    vec![
        BlessedFile {
            path: "game/main_menu/localization/english/country_names_l_english.yml",
            filter: Box::new(is_country_name_key),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/goods_l_english.yml",
            filter: Box::new(move |k| goods.contains(k)),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/buildings_l_english.yml",
            filter: Box::new(move |k| buildings.contains(k)),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/religion_l_english.yml",
            filter: Box::new(move |k| religions.contains(k)),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/cultural_and_languages_l_english.yml",
            filter: Box::new(move |k| cultures.contains(k)),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/location_names/location_names_l_english.yml",
            filter: Box::new(|_| true),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/province_names_l_english.yml",
            filter: Box::new(|_| true),
        },
        BlessedFile {
            path: "game/main_menu/localization/english/rebel_l_english.yml",
            filter: Box::new(|_| true),
        },
    ]
}

/// Source game data parsed from raw game files (EU5 installation or source bundle).
pub struct RawGameData {
    pub locations: Vec<LocationTerrain>,
    pub localizations: FxHashMap<String, String>,
    pub goods: FxHashMap<String, GoodData>,
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

        let goods = fs.parse_goods()?;
        let building_keys = fs.parse_building_keys()?;
        let religion_keys = fs.parse_religion_keys()?;
        let culture_keys = fs.parse_culture_keys()?;
        let goods_keys: FxHashSet<String> = goods.keys().cloned().collect();
        let localizations = fs.load_blessed_localizations(
            &goods_keys,
            &building_keys,
            &religion_keys,
            &culture_keys,
        )?;

        let me = Self {
            locations: locations.collect(),
            localizations,
            goods,
        };

        let builder = RawTextureBuilder {
            reader: locations_png_reader,
        };

        Ok((me, builder))
    }

    /// Apply paletted textures and split into runtime [`GameData`] + [`Localization`].
    pub fn materialize(self, textures: &PalettedTextures) -> (GameData, Localization) {
        let locations = textures.location_aware(self.locations);
        let localization = Localization::new(self.localizations);
        let topology = textures.textures().world().build_topology_index();
        (
            GameData {
                locations,
                goods: self.goods,
                topology,
            },
            localization,
        )
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[derive(Default)]
    struct FakeSource {
        files: FxHashMap<String, String>,
    }

    impl FakeSource {
        fn with_file(mut self, path: &str, data: &str) -> Self {
            self.files.insert(path.to_string(), data.to_string());
            self
        }
    }

    impl GameFileSource for FakeSource {
        fn open_file<'a>(&'a self, path: &str) -> Result<Box<dyn Read + 'a>, GameDataError> {
            let data = self
                .files
                .get(path)
                .ok_or_else(|| GameDataError::MissingData(path.to_string()))?;
            Ok(Box::new(Cursor::new(data.as_bytes())))
        }

        fn read_to_string(&self, path: &str) -> Result<String, GameDataError> {
            self.files
                .get(path)
                .cloned()
                .ok_or_else(|| GameDataError::MissingData(path.to_string()))
        }

        fn walk_directory(
            &self,
            path: &str,
            ends_with: &[&str],
        ) -> Result<Vec<String>, GameDataError> {
            let dir_prefix = format!("{}/", path.trim_end_matches('/'));
            let mut files = self
                .files
                .keys()
                .filter(|file_path| file_path.starts_with(&dir_prefix))
                .filter(|file_path| ends_with.iter().any(|suffix| file_path.ends_with(suffix)))
                .cloned()
                .collect::<Vec<_>>();
            files.sort();
            Ok(files)
        }
    }

    #[test]
    fn parse_goods_from_source_excludes_readme() {
        let source = FakeSource::default()
            .with_file(
                "game/in_game/common/goods/00_goods.txt",
                r#"
livestock = {
    color = goods_livestock
    default_market_price = 1.25
}
"#,
            )
            .with_file(
                "game/in_game/common/goods/readme.txt",
                r#"
readme_entry = {
    color = goods_readme
}
"#,
            )
            .with_file(
                "game/main_menu/common/named_colors/02_map.txt",
                r#"
colors = {
    goods_livestock = rgb { 20 150 45 }
    goods_readme = rgb { 255 0 0 }
}
"#,
            );

        let goods = source.parse_goods().unwrap();

        assert_eq!(goods.len(), 1);
        assert_eq!(
            goods.get("livestock").unwrap().color_hex,
            crate::color::Srgb([0x14, 0x96, 0x2d]),
        );
        assert!(!goods.contains_key("readme_entry"));
    }

    fn blessed_source() -> FakeSource {
        FakeSource::default()
            .with_file(
                "game/main_menu/localization/english/country_names_l_english.yml",
                r#"l_english:
 SWE: "Sweden"
 SWE_ADJ: "Swedish"
 lowercase_tag: "junk"
 SHARED: "from_countries"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/goods_l_english.yml",
                r#"l_english:
 wool: "Wool"
 unknown_good: "Unknown Good"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/buildings_l_english.yml",
                r#"l_english:
 workshop: "Workshop"
 workshop_desc: "A place for craft production."
 artisan_tools: "Artisan Tools"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/religion_l_english.yml",
                r#"l_english:
 catholic: "Catholicism"
 catholic_ADJ: "Catholic"
 unknown_religion: "Unknown Religion"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/cultural_and_languages_l_english.yml",
                r#"l_english:
 dakelh_culture: "Dakelh"
 luo_language: "Luo"
 unknown_culture: "Unknown Culture"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/location_names/location_names_l_english.yml",
                r#"l_english:
 stockholm: "Stockholm"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/province_names_l_english.yml",
                r#"l_english:
 svealand: "Svealand"
"#,
            )
            .with_file(
                "game/main_menu/localization/english/rebel_l_english.yml",
                r#"l_english:
 peasant_rebels: "Peasant Rebels"
"#,
            )
    }

    fn allow(items: &[&str]) -> FxHashSet<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn load_blessed_localizations_merges_files_into_flat_map() {
        let source = blessed_source();
        let goods = allow(&["wool"]);
        let buildings = allow(&["workshop"]);
        let religions = allow(&["catholic"]);
        let cultures = allow(&["dakelh_culture"]);
        let entries = source
            .load_blessed_localizations(&goods, &buildings, &religions, &cultures)
            .unwrap();

        assert_eq!(entries.get("SWE").unwrap(), "Sweden");
        assert_eq!(entries.get("wool").unwrap(), "Wool");
        assert_eq!(entries.get("workshop").unwrap(), "Workshop");
        assert_eq!(entries.get("catholic").unwrap(), "Catholicism");
        assert_eq!(entries.get("dakelh_culture").unwrap(), "Dakelh");
        assert_eq!(entries.get("stockholm").unwrap(), "Stockholm");
        assert_eq!(entries.get("svealand").unwrap(), "Svealand");
        assert_eq!(entries.get("peasant_rebels").unwrap(), "Peasant Rebels");
    }

    #[test]
    fn load_blessed_localizations_keeps_adjectives_but_filters_non_tags() {
        let source = blessed_source();
        let entries = source
            .load_blessed_localizations(
                &allow(&["wool"]),
                &allow(&["workshop"]),
                &allow(&["catholic"]),
                &allow(&["dakelh_culture"]),
            )
            .unwrap();

        // *_ADJ entries are retained to resolve $ADJ$ tokens in templated names.
        assert!(entries.contains_key("SWE_ADJ"));
        assert!(!entries.contains_key("lowercase_tag"));
    }

    #[test]
    fn load_blessed_localizations_filters_goods_and_buildings_by_allowlist() {
        let source = blessed_source();
        let entries = source
            .load_blessed_localizations(
                &allow(&["wool"]),
                &allow(&["workshop"]),
                &allow(&["catholic"]),
                &allow(&["dakelh_culture"]),
            )
            .unwrap();

        assert!(!entries.contains_key("unknown_good"));
        assert!(!entries.contains_key("workshop_desc"));
        assert!(!entries.contains_key("artisan_tools"));
        assert!(!entries.contains_key("catholic_ADJ"));
        assert!(!entries.contains_key("unknown_religion"));
        assert!(!entries.contains_key("luo_language"));
        assert!(!entries.contains_key("unknown_culture"));
    }

    #[test]
    fn load_blessed_localizations_later_files_override_earlier_files() {
        // Override across files: stockholm appears in both location_names and
        // province_names (later wins).
        let source = blessed_source().with_file(
            "game/main_menu/localization/english/province_names_l_english.yml",
            r#"l_english:
 svealand: "Svealand"
 stockholm: "Stockholm Province"
"#,
        );
        let entries = source
            .load_blessed_localizations(
                &allow(&["wool"]),
                &allow(&["workshop"]),
                &allow(&["catholic"]),
                &allow(&["dakelh_culture"]),
            )
            .unwrap();
        assert_eq!(entries.get("stockholm").unwrap(), "Stockholm Province");
    }
}
