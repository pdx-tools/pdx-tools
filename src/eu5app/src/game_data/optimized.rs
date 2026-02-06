use crate::{
    GameLocation,
    game_data::{GameData, GameDataError},
};
use eu5save::hash::FxHashMap;
use pdx_map::R16;
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
        let buf_size = self.location_lookup.0.max(self.country_localizations.0);
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
                b"locations-0.r16" => {
                    west_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
                }
                b"locations-1.r16" => {
                    east_texture_entry = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
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
