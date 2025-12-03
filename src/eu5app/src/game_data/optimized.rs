use crate::game_data::{GameData, GameDataError, TextureProvider};
use crate::models::GameLocationData;
use eu5save::hash::FxHashMap;
use rawzip::{ZipArchive, ZipSliceArchive};

/// Optimized game data is the pre-built format for distributing EU5 game data.
pub struct OptimizedGameBundle<R: AsRef<[u8]>> {
    zip: ZipSliceArchive<R>,
    location_lookup: (u64, rawzip::ZipArchiveEntryWayfinder),
    country_localizations: (u64, rawzip::ZipArchiveEntryWayfinder),
}

impl<R> OptimizedGameBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut location_lookup_entry = None;
        let mut country_localizations_entry = None;

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
                _ => {}
            }
        }

        let location_lookup = location_lookup_entry.ok_or_else(|| {
            GameDataError::MissingData("location_lookup.bin not found in bundle".to_string())
        })?;
        let country_localizations = country_localizations_entry.ok_or_else(|| {
            GameDataError::MissingData("country_localization.bin not found in bundle".to_string())
        })?;

        Ok(Self {
            zip,
            location_lookup,
            country_localizations,
        })
    }

    pub fn into_game_data(self) -> Result<GameData, GameDataError> {
        // Deserialize location lookup
        let location_entry = self
            .zip
            .get_entry(self.location_lookup.1)
            .map_err(GameDataError::ZipAccess)?;
        let mut location_buf = vec![0; self.location_lookup.0 as usize];
        pdx_zstd::decode_to(location_entry.data(), &mut location_buf)?;
        let locations: FxHashMap<String, GameLocationData> = postcard::from_bytes(&location_buf)?;

        // Deserialize country localizations
        let localization_entry = self
            .zip
            .get_entry(self.country_localizations.1)
            .map_err(GameDataError::ZipAccess)?;
        let mut localization_buf = vec![0; self.country_localizations.0 as usize];
        pdx_zstd::decode_to(localization_entry.data(), &mut localization_buf)?;
        let localization: FxHashMap<String, String> = postcard::from_bytes(&localization_buf)?;

        Ok(GameData::new(locations, localization))
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
}

impl<R> OptimizedTextureBundle<R>
where
    R: AsRef<[u8]>,
{
    pub fn open(data: R) -> Result<Self, GameDataError> {
        let zip = ZipArchive::from_slice(data).map_err(GameDataError::ZipAccess)?;
        let mut west_texture_entry = None;
        let mut east_texture_entry = None;

        for entry in zip.entries() {
            let entry = entry.map_err(GameDataError::ZipAccess)?;
            match entry.file_path().as_bytes() {
                b"locations-0.rgba" => {
                    west_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"locations-1.rgba" => {
                    east_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                _ => {}
            }
        }

        let west_texture = west_texture_entry.ok_or_else(|| {
            GameDataError::MissingData("locations-0.rgba not found in bundle".to_string())
        })?;
        let east_texture = east_texture_entry.ok_or_else(|| {
            GameDataError::MissingData("locations-1.rgba not found in bundle".to_string())
        })?;

        Ok(Self {
            zip,
            west_texture,
            east_texture,
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

impl<R> TextureProvider for OptimizedTextureBundle<R>
where
    R: AsRef<[u8]>,
{
    fn load_west_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        self.read_entry(self.west_texture.1, dst)
    }

    fn load_east_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        self.read_entry(self.east_texture.1, dst)
    }

    fn west_texture_size(&self) -> usize {
        self.west_texture.0 as usize
    }

    fn east_texture_size(&self) -> usize {
        self.east_texture.0 as usize
    }
}
