use crate::{
    GameLocation,
    game_data::{GameData, GameDataError, GoodsData, Localization, LocalizationsData},
};
use pdx_map::{R16, SpatialIndex, TopologyIndex, WorldTiles};
use rawzip::{ZipArchive, ZipSliceArchive};
use serde::{Deserialize, Serialize};
use std::io::Read;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMetadata {
    max_location_index: u16,
}

impl WorldMetadata {
    pub fn new(max_location_index: u16) -> Self {
        Self { max_location_index }
    }

    pub fn max_location(self) -> R16 {
        R16::new(self.max_location_index)
    }
}

/// Optimized game-domain bundle: language-agnostic gameplay lookup data.
/// Consumed by the game worker.
pub struct OptimizedGameBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    location_lookup: (u64, rawzip::ZipArchiveEntryWayfinder),
    game_data: (u64, rawzip::ZipArchiveEntryWayfinder),
    topology: (u64, rawzip::ZipArchiveEntryWayfinder),
}

impl<R> OptimizedGameBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut location_lookup_entry = None;
        let mut game_data_entry = None;
        let mut topology_entry = None;

        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            match entry.file_path().as_bytes() {
                b"location_lookup.bin" => {
                    location_lookup_entry =
                        Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"game_data.bin" => {
                    game_data_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"topology.bin" => {
                    topology_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                _ => {}
            }
        }

        let location_lookup = location_lookup_entry.ok_or_else(|| {
            GameDataError::MissingData("location_lookup.bin not found in bundle".to_string())
        })?;
        let game_data = game_data_entry.ok_or_else(|| {
            GameDataError::MissingData("game_data.bin not found in bundle".to_string())
        })?;
        let topology = topology_entry.ok_or_else(|| {
            GameDataError::MissingData("topology.bin not found in bundle".to_string())
        })?;

        Ok(Self {
            zip,
            location_lookup,
            game_data,
            topology,
        })
    }

    pub fn into_game_data(self) -> Result<GameData, GameDataError> {
        let buf_size = self
            .location_lookup
            .0
            .max(self.game_data.0)
            .max(self.topology.0);
        let mut buf = vec![0; buf_size as usize];

        let location_entry = self
            .zip
            .get_entry(self.location_lookup.1)
            .map_err(GameDataError::ZipAccess)?;
        let location_buf = &mut buf[..self.location_lookup.0 as usize];
        pdx_zstd::decode_to(location_entry.data(), location_buf)?;
        let locations: Vec<GameLocation> = postcard::from_bytes(location_buf)?;

        let game_data_entry = self
            .zip
            .get_entry(self.game_data.1)
            .map_err(GameDataError::ZipAccess)?;
        let game_data_buf = &mut buf[..self.game_data.0 as usize];
        pdx_zstd::decode_to(game_data_entry.data(), game_data_buf)?;
        let game_data: GoodsData = postcard::from_bytes(game_data_buf)?;

        let topology_entry = self
            .zip
            .get_entry(self.topology.1)
            .map_err(GameDataError::ZipAccess)?;
        let topology_buf = &mut buf[..self.topology.0 as usize];
        pdx_zstd::decode_to(topology_entry.data(), topology_buf)?;
        let topology: TopologyIndex = postcard::from_bytes(topology_buf)?;

        Ok(GameData {
            locations,
            goods: game_data.goods,
            topology,
        })
    }
}

/// Optimized localization-domain bundle (`loc-en.zip`): English localization
/// payload split out from the game bundle. Consumed by the game worker once
/// the unlocalized workspace is ready.
pub struct OptimizedLocalizationBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    localizations: (u64, rawzip::ZipArchiveEntryWayfinder),
}

impl<R> OptimizedLocalizationBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut localizations_entry = None;
        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            if entry.file_path().as_bytes() == b"localizations.bin" {
                localizations_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
            }
        }

        let localizations = localizations_entry.ok_or_else(|| {
            GameDataError::MissingData(
                "localizations.bin not found in localization bundle".to_string(),
            )
        })?;

        Ok(Self { zip, localizations })
    }

    pub fn into_localization(self) -> Result<Localization, GameDataError> {
        let entry = self
            .zip
            .get_entry(self.localizations.1)
            .map_err(GameDataError::ZipAccess)?;
        let mut buf = vec![0; self.localizations.0 as usize];
        pdx_zstd::decode_to(entry.data(), &mut buf)?;
        let data: LocalizationsData = postcard::from_bytes(&buf)?;
        Ok(Localization::new(data.entries))
    }
}

impl<R> std::fmt::Debug for OptimizedLocalizationBundle<R>
where
    R: AsRef<[u8]>,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OptimizedLocalizationBundle")
            .finish_non_exhaustive()
    }
}

impl<R> std::fmt::Debug for OptimizedGameBundle<R>
where
    R: AsRef<[u8]>,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OptimizedGameBundle")
            .finish_non_exhaustive()
    }
}

/// Optimized map-domain bundle: the world's location tiles and world
/// metadata. Consumed by the map worker.
#[derive(Debug)]
pub struct OptimizedMapBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    tiles: (u64, rawzip::ZipArchiveEntryWayfinder),
    world_meta: Option<(u64, rawzip::ZipArchiveEntryWayfinder)>,
}

/// The map of a bundle: what the GPU draws, and what finds locations
#[derive(Debug)]
pub struct BundleMap {
    pub tiles: WorldTiles,
    pub index: SpatialIndex,
}

/// Name of the bundle entry that holds the [`WorldTiles`], as
/// [`tiles_entry_bytes`] writes them
pub const TILES_ENTRY: &str = "locations.tiles";

/// The bytes of the tiles entry: the words of the tiles, little endian
pub fn tiles_entry_bytes(tiles: &WorldTiles) -> Vec<u8> {
    tiles
        .words()
        .iter()
        .flat_map(|word| word.to_le_bytes())
        .collect()
}

impl<R> OptimizedMapBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut tiles_entry = None;
        let mut world_meta_entry = None;

        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            let found = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
            match entry.file_path().as_bytes() {
                b"locations.tiles" => tiles_entry = found,
                b"world_meta.bin" => world_meta_entry = found,
                _ => {}
            }
        }

        let tiles = tiles_entry.ok_or_else(|| {
            GameDataError::MissingData(format!("{TILES_ENTRY} not found in bundle"))
        })?;

        Ok(Self {
            zip,
            tiles,
            world_meta: world_meta_entry,
        })
    }

    fn read_entry(
        &self,
        wayfinder: rawzip::ZipArchiveEntryWayfinder,
        dst: &mut [u8],
    ) -> Result<(), GameDataError> {
        let entry = self
            .zip
            .get_entry(wayfinder)
            .map_err(GameDataError::ZipAccess)?;
        pdx_zstd::decode_to(entry.data(), dst)?;
        Ok(())
    }

    /// Load the precomputed max location index, when present.
    pub fn load_max_location_index(&self) -> Result<Option<R16>, GameDataError> {
        let Some((meta_bytes, wayfinder)) = self.world_meta else {
            return Ok(None);
        };

        let mut buf = vec![0; meta_bytes as usize];
        self.read_entry(wayfinder, &mut buf)?;
        let metadata: WorldMetadata = postcard::from_bytes(&buf)?;
        Ok(Some(metadata.max_location()))
    }

    /// The map: its tiles, and the spatial index built from them. Building
    /// the index decodes every pixel, which checks the tiles, and the index
    /// is checked against `world_meta.bin` when the bundle has one.
    #[tracing::instrument(name = "eu5.map_bundle.load", skip_all)]
    pub fn load(&self) -> Result<BundleMap, GameDataError> {
        let tiles = self.load_tiles()?;
        let index = tiles
            .build_spatial_index()
            .map_err(|error| GameDataError::InvalidMap(error.to_string()))?;
        if let Some(expected) = self.load_max_location_index()?
            && index.len() != usize::from(expected.value()) + 1
        {
            return Err(GameDataError::InvalidMap(format!(
                "world_meta.bin gives {} as the highest location, but the map's highest is {}",
                expected.value(),
                index.len() - 1
            )));
        }
        Ok(BundleMap { tiles, index })
    }

    /// Load both hemispheres whole.
    pub fn load_hemispheres(&self) -> Result<(Vec<R16>, Vec<R16>), GameDataError> {
        let len = crate::hemisphere_size().area() as usize;
        let mut west = Vec::with_capacity(len);
        let mut east = Vec::with_capacity(len);
        self.load_tiles()?
            .for_each_band(|rows| {
                west.extend_from_slice(rows.west());
                east.extend_from_slice(rows.east());
            })
            .map_err(|error| GameDataError::InvalidMap(error.to_string()))?;
        Ok((west, east))
    }

    /// The tiles, with their table checked. The entry must hold exactly
    /// the words its size gives, no larger than tiles of 16-bit pixels.
    fn load_tiles(&self) -> Result<WorldTiles, GameDataError> {
        let hemisphere = crate::hemisphere_size();
        let (size, wayfinder) = self.tiles;
        let tile_count = hemisphere.world().area().div_ceil(16 * 16) as u64;
        // A table entry and 128 words of 16-bit pixels per tile
        let largest = tile_count * (1 + 128) * 4;
        if !size.is_multiple_of(4) || size > largest {
            return Err(GameDataError::InvalidMap(format!(
                "{TILES_ENTRY} is {size} bytes, which is not whole words or exceeds {largest}"
            )));
        }

        let entry = self
            .zip
            .get_entry(wayfinder)
            .map_err(GameDataError::ZipAccess)?;
        let mut decoder = pdx_zstd::Decoder::with_window_log_max(entry.data(), MAP_WINDOW_LOG_MAX)?;
        let mut words = vec![0u32; (size / 4) as usize];
        let io_error = |error: std::io::Error| match error.kind() {
            std::io::ErrorKind::UnexpectedEof => GameDataError::InvalidMap(format!(
                "{TILES_ENTRY} is smaller than its size of {size} bytes"
            )),
            _ => GameDataError::Io(error, TILES_ENTRY.to_string()),
        };
        decoder
            .read_exact(bytemuck::cast_slice_mut(&mut words))
            .map_err(io_error)?;
        let more = decoder.read(&mut [0u8; 1]).map_err(io_error)?;
        if more != 0 || !decoder.get_ref().is_empty() {
            return Err(GameDataError::InvalidMap(format!(
                "{TILES_ENTRY} is larger than its size of {size} bytes"
            )));
        }
        for word in &mut words {
            *word = u32::from_le(*word);
        }

        WorldTiles::from_words(hemisphere, words)
            .map_err(|error| GameDataError::InvalidMap(error.to_string()))
    }
}

/// The most history, as a power of two, that a map entry may ask its decoder
/// to keep. The bundles are written with much less; a frame that asks for
/// more is refused rather than given that much memory.
const MAP_WINDOW_LOG_MAX: u32 = 23;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::color::Srgb;
    use crate::game_data::GoodData;
    use eu5save::hash::FxHashMap;
    use rawzip::CompressionMethod;
    use std::io::{Cursor, Write};

    #[test]
    fn optimized_bundle_reads_game_data_bin_goods() {
        let mut goods = FxHashMap::default();
        goods.insert(
            "livestock".to_string(),
            GoodData {
                color_hex: Srgb([0x14, 0x96, 0x2d]),
                default_market_price: 1.25,
                transport_cost: 1.0,
            },
        );
        let zip = test_game_zip(GoodsData { goods });

        let data = OptimizedGameBundle::open(zip)
            .unwrap()
            .into_game_data()
            .unwrap();

        let livestock = data.good("livestock").unwrap();
        assert_eq!(livestock.color_hex, Srgb([0x14, 0x96, 0x2d]));
        assert_eq!(livestock.default_market_price, 1.25);
    }

    #[test]
    fn localization_bundle_reads_localizations_bin() {
        let mut entries = FxHashMap::default();
        entries.insert("livestock".to_string(), "Livestock".to_string());
        entries.insert("workshop".to_string(), "Workshop".to_string());
        let zip = test_loc_zip(LocalizationsData { entries });

        let loc = OptimizedLocalizationBundle::open(zip)
            .unwrap()
            .into_localization()
            .unwrap();

        assert_eq!(loc.get("livestock"), Some("Livestock"));
        assert_eq!(loc.get("workshop"), Some("Workshop"));
    }

    #[test]
    fn localization_bundle_returns_none_for_missing_keys() {
        let zip = test_loc_zip(LocalizationsData::default());
        let loc = OptimizedLocalizationBundle::open(zip)
            .unwrap()
            .into_localization()
            .unwrap();

        assert_eq!(loc.get("unknown_good"), None);
        assert_eq!(loc.get("unknown_building"), None);
    }

    #[test]
    fn game_bundle_rejects_map_zip() {
        let zip = test_map_zip(&[], Some(7));
        let err = OptimizedGameBundle::open(zip).unwrap_err();
        match err {
            GameDataError::MissingData(msg) => assert!(msg.contains("location_lookup.bin")),
            other => panic!("expected MissingData, got {other:?}"),
        }
    }

    #[test]
    fn game_bundle_rejects_localization_zip() {
        let zip = test_loc_zip(LocalizationsData::default());
        let err = OptimizedGameBundle::open(zip).unwrap_err();
        match err {
            GameDataError::MissingData(msg) => assert!(msg.contains("location_lookup.bin")),
            other => panic!("expected MissingData, got {other:?}"),
        }
    }

    #[test]
    fn localization_bundle_rejects_game_zip() {
        let zip = test_game_zip(GoodsData::default());
        let err = OptimizedLocalizationBundle::open(zip).unwrap_err();
        match err {
            GameDataError::MissingData(msg) => assert!(msg.contains("localizations.bin")),
            other => panic!("expected MissingData, got {other:?}"),
        }
    }

    #[test]
    fn map_bundle_rejects_game_zip() {
        let zip = test_game_zip(GoodsData::default());
        let err = OptimizedMapBundle::open(zip).unwrap_err();
        match err {
            GameDataError::MissingData(msg) => assert!(msg.contains(TILES_ENTRY)),
            other => panic!("expected MissingData, got {other:?}"),
        }
    }

    #[test]
    fn map_bundle_reads_the_map() {
        let east_location = R16::new(0x0101);
        let words = uniform_tiles(0, east_location.value());
        let zip = test_map_zip(&[tiles_entry(&words)], Some(east_location.value()));
        let BundleMap { tiles, index } = OptimizedMapBundle::open(zip).unwrap().load().unwrap();

        assert_eq!(tiles.words(), words);
        assert_eq!(index.len(), usize::from(east_location.value()) + 1);
        assert_eq!(
            index.point_of(R16::new(0)),
            Some(pdx_map::WorldPoint::new(4095, 4096))
        );
        assert_eq!(
            index.point_of(east_location),
            Some(pdx_map::WorldPoint::new(12287, 4096))
        );
    }

    #[test]
    fn map_bundle_rejects_a_broken_map() {
        let words = uniform_tiles(0, 0);
        let size = (words.len() * 4) as u64;
        let frame = zstd_frame(&words);
        let mut bad_code = words.clone();
        bad_code[0] |= 7;

        let cases = [
            (
                "one word short",
                vec![tiles_entry(&words[..words.len() - 1])],
                None,
            ),
            (
                "shorter than its size",
                vec![(TILES_ENTRY, frame.clone(), size + 4)],
                None,
            ),
            (
                "longer than its size",
                vec![(TILES_ENTRY, frame.clone(), size - 4)],
                None,
            ),
            (
                "not whole words",
                vec![(TILES_ENTRY, frame.clone(), size - 1)],
                None,
            ),
            (
                "a second frame",
                vec![(
                    TILES_ENTRY,
                    [frame.clone(), rle_frame(0, 4, 21)].concat(),
                    size,
                )],
                None,
            ),
            ("a bad bit width", vec![tiles_entry(&bad_code)], None),
            (
                "window too large",
                vec![(TILES_ENTRY, rle_frame(0, size as usize, 27), size)],
                None,
            ),
            ("metadata disagrees", vec![tiles_entry(&words)], Some(7)),
        ];

        for (case, entries, max_location) in cases {
            let bundle = OptimizedMapBundle::open(test_map_zip(&entries, max_location)).unwrap();
            assert!(bundle.load().is_err(), "{case}");
        }
    }

    /// The tiles of a world whose west is location `west` and whose east is
    /// location `east`, every tile one location
    fn uniform_tiles(west: u16, east: u16) -> Vec<u32> {
        let world = crate::hemisphere_size().world();
        let tiles_wide = world.width / 16;
        let count = tiles_wide * world.height / 16;
        let table = (0..count).map(|tile| (count + tile) << 3);
        let blocks = (0..count).map(|tile| {
            u32::from(if tile % tiles_wide < tiles_wide / 2 {
                west
            } else {
                east
            })
        });
        table.chain(blocks).collect()
    }

    fn zstd_frame(words: &[u32]) -> Vec<u8> {
        let bytes: Vec<u8> = words.iter().flat_map(|word| word.to_le_bytes()).collect();
        let mut frame = Vec::new();
        let mut encoder = pdx_zstd::Encoder::new(&mut frame, 1).unwrap();
        encoder.write_all(&bytes).unwrap();
        encoder.finish().unwrap();
        frame
    }

    fn tiles_entry(words: &[u32]) -> (&'static str, Vec<u8>, u64) {
        (TILES_ENTRY, zstd_frame(words), (words.len() * 4) as u64)
    }

    /// A zstd frame of `len` bytes of `byte` in run-length blocks
    fn rle_frame(byte: u8, len: usize, window_log: u8) -> Vec<u8> {
        const BLOCK: usize = 128 << 10;
        let mut frame = vec![0x28, 0xb5, 0x2f, 0xfd, 0, (window_log - 10) << 3];
        let mut left = len;
        loop {
            let size = left.min(BLOCK);
            left -= size;
            let last = u32::from(left == 0);
            let header = (size as u32) << 3 | 1 << 1 | last;
            frame.extend_from_slice(&header.to_le_bytes()[..3]);
            frame.push(byte);
            if last == 1 {
                return frame;
            }
        }
    }

    fn test_game_zip(goods: GoodsData) -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);
        write_test_entry(
            &mut archive,
            "location_lookup.bin",
            Vec::<GameLocation>::new(),
        );
        write_test_entry(&mut archive, "game_data.bin", goods);
        write_test_entry(&mut archive, "topology.bin", empty_topology());
        archive.finish().unwrap().into_inner()
    }

    fn empty_topology() -> TopologyIndex {
        use pdx_map::{Hemisphere, HemisphereLength, World};
        let world = World::builder(
            Hemisphere::new(vec![R16::new(0)], HemisphereLength::new(1)),
            Hemisphere::new(vec![R16::new(0)], HemisphereLength::new(1)),
        )
        .build();
        world.build_topology_index()
    }

    fn test_loc_zip(localizations: LocalizationsData) -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);
        write_test_entry(&mut archive, "localizations.bin", localizations);
        archive.finish().unwrap().into_inner()
    }

    /// A map bundle of zstd entries, each a name, a frame, and its
    /// uncompressed size
    fn test_map_zip(entries: &[(&str, Vec<u8>, u64)], max_location: Option<u16>) -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);

        for (filename, frame, size) in entries {
            let (mut entry, _) = archive
                .new_file(filename)
                .compression_method(CompressionMethod::ZSTD)
                .start()
                .unwrap();
            entry.write_all(frame).unwrap();
            entry
                .finish(rawzip::DataDescriptorOutput::new(0, *size))
                .unwrap();
        }

        if let Some(max_location) = max_location {
            write_test_entry(
                &mut archive,
                "world_meta.bin",
                WorldMetadata::new(max_location),
            );
        }
        archive.finish().unwrap().into_inner()
    }

    fn write_test_entry<W: Write>(
        archive: &mut rawzip::ZipArchiveWriter<W>,
        filename: &str,
        data: impl Serialize,
    ) {
        let (mut entry, config) = archive
            .new_file(filename)
            .compression_method(CompressionMethod::ZSTD)
            .start()
            .unwrap();
        let encoder = pdx_zstd::Encoder::new(&mut entry, 1).unwrap();
        let mut writer = config.wrap(encoder);
        let bytes = postcard::to_allocvec(&data).unwrap();
        writer.write_all(&bytes).unwrap();
        let (encoder, out) = writer.finish().unwrap();
        encoder.finish().unwrap();
        entry.finish(out).unwrap();
    }
}
