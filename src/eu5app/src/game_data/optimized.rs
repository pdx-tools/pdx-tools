use crate::{
    GameLocation,
    game_data::{GameData, GameDataError, GoodsData, Localization, LocalizationsData},
};
use pdx_map::{R16, TopologyIndex};
use rawzip::{ZipArchive, ZipSliceArchive};
use serde::{Deserialize, Serialize};

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

    /// Load both hemisphere textures from the bundle.
    pub fn load_hemispheres(&mut self) -> Result<(Vec<R16>, Vec<R16>), GameDataError> {
        let (west_bytes, west_wayfinder) = &self.west_texture;
        let (east_bytes, east_wayfinder) = &self.east_texture;

        let mut west_data = vec![R16::new(0); *west_bytes as usize / std::mem::size_of::<R16>()];
        self.read_entry(*west_wayfinder, bytemuck::cast_slice_mut(&mut west_data))?;

        let mut east_data = vec![R16::new(0); *east_bytes as usize / std::mem::size_of::<R16>()];
        self.read_entry(*east_wayfinder, bytemuck::cast_slice_mut(&mut east_data))?;
        Ok((west_data, east_data))
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
        let zip = test_map_zip();
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

    #[test]
    fn map_bundle_loads_hemispheres_and_metadata() {
        let zip = test_map_zip();
        let mut bundle = OptimizedMapBundle::open(zip).unwrap();
        let (west, east) = bundle.load_hemispheres().unwrap();
        assert_eq!(west.len(), 4);
        assert_eq!(east.len(), 4);
        assert_eq!(bundle.load_max_location_index().unwrap(), Some(R16::new(7)));
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

    fn test_map_zip() -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);

        for filename in ["locations-0.r16", "locations-1.r16"] {
            let data = vec![R16::new(0); 4];
            let (mut entry, config) = archive
                .new_file(filename)
                .compression_method(CompressionMethod::ZSTD)
                .start()
                .unwrap();
            let encoder = pdx_zstd::Encoder::new(&mut entry, 1).unwrap();
            let mut writer = config.wrap(encoder);
            writer.write_all(bytemuck::cast_slice(&data)).unwrap();
            let (encoder, out) = writer.finish().unwrap();
            encoder.finish().unwrap();
            entry.finish(out).unwrap();
        }

        write_test_entry(&mut archive, "world_meta.bin", WorldMetadata::new(7));
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
