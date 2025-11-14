use crate::game_data::{GameDataProvider, models::GameLocationData};
use rawzip::{CompressionMethod, ZipArchive, ZipArchiveEntryWayfinder, ZipSliceArchive};
use std::collections::HashMap;

/// Optimized game data is the pre-built format for distributing EU5 game
/// data. Contains compressed binary data loaded lazily from a ZIP archive.
#[derive(Debug)]
pub struct OptimizedGameData {
    archive: ZipSliceArchive<Vec<u8>>,
    location_lookup: (CompressionMethod, ZipArchiveEntryWayfinder),
    west_texture: (CompressionMethod, ZipArchiveEntryWayfinder),
    east_texture: (CompressionMethod, ZipArchiveEntryWayfinder),
    country_localizations: (CompressionMethod, ZipArchiveEntryWayfinder),
}

impl OptimizedGameData {
    pub fn open(data: Vec<u8>) -> Result<Self, Box<dyn std::error::Error>> {
        let archive = ZipArchive::from_slice(data)?;
        let mut location_lookup = None;
        let mut west_texture = None;
        let mut east_texture = None;
        let mut country_localizations = None;
        for entry in archive.entries() {
            let entry = entry?;
            match entry.file_path().as_bytes() {
                b"location_lookup.bin" => {
                    location_lookup = Some((entry.compression_method(), entry.wayfinder()));
                }
                b"locations-0.rgba" => {
                    west_texture = Some((entry.compression_method(), entry.wayfinder()));
                }
                b"locations-1.rgba" => {
                    east_texture = Some((entry.compression_method(), entry.wayfinder()));
                }
                b"country_localization.bin" => {
                    country_localizations = Some((entry.compression_method(), entry.wayfinder()));
                }
                _ => {}
            }
        }

        let location_lookup = location_lookup.ok_or("location_lookup.bin not found in bundle")?;
        let west_texture = west_texture.ok_or("locations-0.rgba not found in bundle")?;
        let east_texture = east_texture.ok_or("locations-1.rgba not found in bundle")?;
        let country_localizations =
            country_localizations.ok_or("country_localization.bin not found in bundle")?;
        Ok(Self {
            archive,
            location_lookup,
            west_texture,
            east_texture,
            country_localizations,
        })
    }
}

impl GameDataProvider for OptimizedGameData {
    fn locations(&self) -> Result<Vec<GameLocationData>, Box<dyn std::error::Error>> {
        let (_compression_method, wayfinder) = self.location_lookup;
        let entry = self.archive.get_entry(wayfinder)?;
        let decoder = pdx_zstd::Decoder::from_slice(entry.data())?;
        let mut buf = vec![0u8; wayfinder.uncompressed_size_hint() as usize];
        let (result, _) = postcard::from_io((decoder, &mut buf))?;
        Ok(result)
    }

    fn west_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        let (_compression_method, west_wayfinder) = self.west_texture;
        let entry = self.archive.get_entry(west_wayfinder)?;
        pdx_zstd::decode_to(entry.data(), dst)?;
        Ok(())
    }

    fn east_texture(&self, dst: &mut [u8]) -> Result<(), Box<dyn std::error::Error>> {
        let (_compression_method, east_wayfinder) = self.east_texture;
        let entry = self.archive.get_entry(east_wayfinder)?;
        pdx_zstd::decode_to(entry.data(), dst)?;
        Ok(())
    }

    fn country_localizations(&self) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
        let (_compression_method, wayfinder) = self.country_localizations;
        let entry = self.archive.get_entry(wayfinder)?;
        let decoder = pdx_zstd::Decoder::from_slice(entry.data())?;
        let mut buf = vec![0u8; wayfinder.uncompressed_size_hint() as usize];
        let (result, _) = postcard::from_io((decoder, &mut buf))?;
        Ok(result)
    }
}
