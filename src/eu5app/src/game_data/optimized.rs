use crate::{
    GameLocation,
    game_data::{GameData, GameDataError, GoodsData, Localization, LocalizationsData},
};
use pdx_map::{R16, SpatialIndex, SpatialIndexBuilder, TopologyIndex, WorldRows};
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

/// Optimized map-domain bundle: hemisphere textures and world metadata.
/// Consumed by the map worker.
#[derive(Debug)]
pub struct OptimizedMapBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    west_texture: (u64, rawzip::ZipArchiveEntryWayfinder),
    east_texture: (u64, rawzip::ZipArchiveEntryWayfinder),
    world_meta: Option<(u64, rawzip::ZipArchiveEntryWayfinder)>,
}

impl<R> OptimizedMapBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut west_texture_entry = None;
        let mut east_texture_entry = None;
        let mut world_meta_entry = None;

        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            match entry.file_path().as_bytes() {
                b"locations-0.r16" => {
                    west_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"locations-1.r16" => {
                    east_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"world_meta.bin" => {
                    world_meta_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                _ => {}
            }
        }

        let west_texture = west_texture_entry.ok_or_else(|| {
            GameDataError::MissingData("locations-0.r16 not found in bundle".to_string())
        })?;
        let east_texture = east_texture_entry.ok_or_else(|| {
            GameDataError::MissingData("locations-1.r16 not found in bundle".to_string())
        })?;

        Ok(Self {
            zip,
            west_texture,
            east_texture,
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

    /// Read the map a band of rows at a time. Each band goes to `sink`, and
    /// the spatial index is built from the same rows, so the whole map is
    /// never in memory. On an error, the bands given to `sink` so far are
    /// not the whole map.
    #[tracing::instrument(name = "eu5.map_bundle.read_map", skip_all)]
    pub fn read_map(
        &self,
        mut sink: impl FnMut(WorldRows<'_>),
    ) -> Result<SpatialIndex, GameDataError> {
        let mut index = SpatialIndexBuilder::new(crate::hemisphere_size());
        self.for_each_band(|rows| {
            index.push(rows);
            sink(rows);
        })?;

        let index = index.finish();
        if let Some(expected) = self.load_max_location_index()?
            && index.len() != usize::from(expected.value()) + 1
        {
            return Err(GameDataError::InvalidMap(format!(
                "world_meta.bin gives {} as the highest location, but the map's highest is {}",
                expected.value(),
                index.len() - 1
            )));
        }
        Ok(index)
    }

    /// Load both hemispheres whole.
    pub fn load_hemispheres(&self) -> Result<(Vec<R16>, Vec<R16>), GameDataError> {
        let len = crate::hemisphere_size().area() as usize;
        let mut west = Vec::with_capacity(len);
        let mut east = Vec::with_capacity(len);
        self.for_each_band(|rows| {
            west.extend_from_slice(rows.west());
            east.extend_from_slice(rows.east());
        })?;
        Ok((west, east))
    }

    /// Decode both hemispheres side by side, and give each band of rows to
    /// `sink`, top to bottom. Each entry must hold exactly one hemisphere.
    fn for_each_band(&self, mut sink: impl FnMut(WorldRows<'_>)) -> Result<(), GameDataError> {
        let size = crate::hemisphere_size();
        let width = size.width_length();
        let mut west = self.hemisphere_reader(&self.west_texture, "locations-0.r16")?;
        let mut east = self.hemisphere_reader(&self.east_texture, "locations-1.r16")?;

        let band_len = MAP_BAND_ROWS as usize * width.value as usize;
        let mut west_band = vec![R16::new(0); band_len];
        let mut east_band = vec![R16::new(0); band_len];
        let mut row = 0;
        while row < size.height {
            let rows = MAP_BAND_ROWS.min(size.height - row);
            let len = rows as usize * width.value as usize;
            west.read_rows(&mut west_band[..len])?;
            east.read_rows(&mut east_band[..len])?;
            sink(WorldRows::new(
                row,
                &west_band[..len],
                &east_band[..len],
                width,
            ));
            row += rows;
        }

        west.finish()?;
        east.finish()
    }

    fn hemisphere_reader(
        &self,
        (_, wayfinder): &(u64, rawzip::ZipArchiveEntryWayfinder),
        name: &'static str,
    ) -> Result<HemisphereReader<'_>, GameDataError> {
        let entry = self
            .zip
            .get_entry(*wayfinder)
            .map_err(GameDataError::ZipAccess)?;
        let decoder = pdx_zstd::Decoder::with_window_log_max(entry.data(), MAP_WINDOW_LOG_MAX)?;
        Ok(HemisphereReader { decoder, name })
    }
}

/// Rows of each hemisphere decoded at a time.
const MAP_BAND_ROWS: u32 = 64;

/// The most history, as a power of two, that a map entry may ask its decoder
/// to keep. The bundles are written with much less; a frame that asks for
/// more is refused rather than given that much memory.
const MAP_WINDOW_LOG_MAX: u32 = 23;

/// The decoded rows of one hemisphere entry.
struct HemisphereReader<'a> {
    decoder: pdx_zstd::Decoder<&'a [u8]>,
    name: &'static str,
}

impl HemisphereReader<'_> {
    /// Fill `rows` with the next rows.
    fn read_rows(&mut self, rows: &mut [R16]) -> Result<(), GameDataError> {
        self.decoder
            .read_exact(bytemuck::cast_slice_mut(rows))
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::UnexpectedEof => GameDataError::InvalidMap(format!(
                    "{} is smaller than a {} hemisphere",
                    self.name,
                    crate::hemisphere_size()
                )),
                _ => GameDataError::Io(error, self.name.to_string()),
            })
    }

    /// Check that nothing comes after the rows.
    fn finish(mut self) -> Result<(), GameDataError> {
        let read = self
            .decoder
            .read(&mut [0u8; 1])
            .map_err(|error| GameDataError::Io(error, self.name.to_string()))?;
        if read != 0 || !self.decoder.get_ref().is_empty() {
            return Err(GameDataError::InvalidMap(format!(
                "{} is larger than a {} hemisphere",
                self.name,
                crate::hemisphere_size()
            )));
        }
        Ok(())
    }
}

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
        let zip = test_map_zip(Vec::new(), Vec::new(), Some(7));
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
            GameDataError::MissingData(msg) => assert!(msg.contains("locations-0.r16")),
            other => panic!("expected MissingData, got {other:?}"),
        }
    }

    /// Bytes in a hemisphere entry.
    const HEMISPHERE_BYTES: usize = 8192 * 8192 * 2;

    #[test]
    fn map_bundle_reads_the_map_in_bands() {
        // Every west byte is 0 and every east byte 1, so the east is
        // location 0x0101 throughout.
        let east_location = R16::new(0x0101);
        let zip = test_map_zip(
            rle_frame(0, HEMISPHERE_BYTES, 21),
            rle_frame(1, HEMISPHERE_BYTES, 21),
            Some(east_location.value()),
        );
        let bundle = OptimizedMapBundle::open(zip).unwrap();

        let mut rows = 0;
        let index = bundle
            .read_map(|band| {
                assert!(band.west().iter().all(|&loc| loc == R16::new(0)));
                assert!(band.east().iter().all(|&loc| loc == east_location));
                rows += band.height();
            })
            .unwrap();
        assert_eq!(rows, 8192);
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
    fn map_bundle_rejects_a_map_of_the_wrong_size() {
        let row = 8192 * 2;
        let whole = || rle_frame(0, HEMISPHERE_BYTES, 21);
        let corrupt = {
            let mut frame = whole();
            frame[6] = 0xff;
            frame
        };
        let cases = [
            (
                "west one row short",
                rle_frame(0, HEMISPHERE_BYTES - row, 21),
                whole(),
                None,
            ),
            (
                "east one row long",
                whole(),
                rle_frame(0, HEMISPHERE_BYTES + row, 21),
                None,
            ),
            (
                "east one byte short",
                whole(),
                rle_frame(0, HEMISPHERE_BYTES - 1, 21),
                None,
            ),
            ("east empty", whole(), Vec::new(), None),
            (
                "west has a second frame",
                [whole(), rle_frame(0, 2, 21)].concat(),
                whole(),
                None,
            ),
            (
                "east has trailing bytes",
                whole(),
                [whole(), vec![0]].concat(),
                None,
            ),
            ("west corrupt", corrupt, whole(), None),
            (
                "window too large",
                rle_frame(0, HEMISPHERE_BYTES, 27),
                whole(),
                None,
            ),
            ("metadata disagrees", whole(), whole(), Some(7)),
        ];

        for (case, west, east, max_location) in cases {
            let bundle = OptimizedMapBundle::open(test_map_zip(west, east, max_location)).unwrap();
            assert!(bundle.read_map(|_| {}).is_err(), "{case}");
        }
    }

    /// A zstd frame of `len` bytes of `byte` in run-length blocks, so a
    /// whole hemisphere takes a few KiB.
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

    fn test_map_zip(west: Vec<u8>, east: Vec<u8>, max_location: Option<u16>) -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);

        for (filename, frame) in [("locations-0.r16", west), ("locations-1.r16", east)] {
            let (mut entry, _) = archive
                .new_file(filename)
                .compression_method(CompressionMethod::ZSTD)
                .start()
                .unwrap();
            entry.write_all(&frame).unwrap();
            let size = HEMISPHERE_BYTES as u64;
            entry
                .finish(rawzip::DataDescriptorOutput::new(0, size))
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
