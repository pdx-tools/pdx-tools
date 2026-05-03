use crate::{
    GameLocation,
    game_data::{GameData, GameDataError, GoodsData},
};
use eu5save::hash::FxHashMap;
use pdx_map::R16;
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

/// Optimized game data is the pre-built format for distributing EU5 game data.
pub struct OptimizedGameBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    location_lookup: (u64, rawzip::ZipArchiveEntryWayfinder),
    country_localizations: (u64, rawzip::ZipArchiveEntryWayfinder),
    game_data: (u64, rawzip::ZipArchiveEntryWayfinder),
}

impl<R> OptimizedGameBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut location_lookup_entry = None;
        let mut country_localizations_entry = None;
        let mut game_data_entry = None;

        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            match entry.file_path().as_bytes() {
                b"location_lookup.bin" => {
                    location_lookup_entry =
                        Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"country_localization.bin" => {
                    country_localizations_entry =
                        Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"game_data.bin" => {
                    game_data_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                _ => {}
            }
        }

        let location_lookup = location_lookup_entry.ok_or_else(|| {
            GameDataError::MissingData("location_lookup.bin not found in bundle".to_string())
        })?;
        let country_localizations = country_localizations_entry.ok_or_else(|| {
            GameDataError::MissingData("country_localization.bin not found in bundle".to_string())
        })?;
        let game_data = game_data_entry.ok_or_else(|| {
            GameDataError::MissingData("game_data.bin not found in bundle".to_string())
        })?;

        Ok(Self {
            zip,
            location_lookup,
            country_localizations,
            game_data,
        })
    }

    pub fn into_game_data(self) -> Result<GameData, GameDataError> {
        let buf_size = self
            .location_lookup
            .0
            .max(self.country_localizations.0)
            .max(self.game_data.0);
        let mut buf = vec![0; buf_size as usize];

        // Deserialize location lookup
        let location_entry = self
            .zip
            .get_entry(self.location_lookup.1)
            .map_err(GameDataError::ZipAccess)?;
        let location_buf = &mut buf[..self.location_lookup.0 as usize];
        pdx_zstd::decode_to(location_entry.data(), location_buf)?;
        let locations: Vec<GameLocation> = postcard::from_bytes(location_buf)?;

        // Deserialize country localizations
        let localization_entry = self
            .zip
            .get_entry(self.country_localizations.1)
            .map_err(GameDataError::ZipAccess)?;
        let localization_buf = &mut buf[..self.country_localizations.0 as usize];
        pdx_zstd::decode_to(localization_entry.data(), localization_buf)?;
        let localization: FxHashMap<String, String> = postcard::from_bytes(localization_buf)?;

        let game_data_entry = self
            .zip
            .get_entry(self.game_data.1)
            .map_err(GameDataError::ZipAccess)?;
        let game_data_buf = &mut buf[..self.game_data.0 as usize];
        pdx_zstd::decode_to(game_data_entry.data(), game_data_buf)?;
        let game_data: GoodsData = postcard::from_bytes(game_data_buf)?;

        Ok(GameData::with_goods(
            locations,
            localization,
            game_data.goods,
        ))
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

#[derive(Debug)]
pub struct OptimizedTextureBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    west_texture: (u64, rawzip::ZipArchiveEntryWayfinder),
    east_texture: (u64, rawzip::ZipArchiveEntryWayfinder),
    world_meta: Option<(u64, rawzip::ZipArchiveEntryWayfinder)>,
}

impl<R> OptimizedTextureBundle<R>
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
}

impl<R> OptimizedTextureBundle<R>
where
    R: AsRef<[u8]>,
{
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
    use crate::game_data::GoodData;
    use rawzip::CompressionMethod;
    use std::io::{Cursor, Write};

    #[test]
    fn optimized_bundle_reads_game_data_bin_goods() {
        let mut goods = FxHashMap::default();
        goods.insert(
            "livestock".to_string(),
            GoodData {
                color_hex: "#14962d".to_string(),
                default_market_price: 1.25,
            },
        );
        let zip = test_bundle(GoodsData { goods });

        let data = OptimizedGameBundle::open(zip)
            .unwrap()
            .into_game_data()
            .unwrap();

        let livestock = data.good("livestock").unwrap();
        assert_eq!(livestock.color_hex, "#14962d");
        assert_eq!(livestock.default_market_price, 1.25);
    }

    fn test_bundle(goods: GoodsData) -> Vec<u8> {
        let output = Cursor::new(Vec::new());
        let mut archive = rawzip::ZipArchiveWriter::new(output);
        write_test_entry(
            &mut archive,
            "location_lookup.bin",
            Vec::<GameLocation>::new(),
        );
        write_test_entry(
            &mut archive,
            "country_localization.bin",
            FxHashMap::<String, String>::default(),
        );
        write_test_entry(&mut archive, "game_data.bin", goods);
        archive.finish().unwrap().into_inner()
    }

    fn write_test_entry<W: Write>(
        archive: &mut rawzip::ZipArchiveWriter<W>,
        filename: &str,
        data: impl Serialize,
    ) {
        let (mut entry, config) = archive
            .new_file(filename)
            .compression_method(CompressionMethod::Zstd)
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
