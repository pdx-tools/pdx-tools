use crate::{GameData, WorldMetadata};
use pdx_map::R16;
use rawzip::{ZipArchive, ZipArchiveEntryWayfinder, ZipSliceArchive};

/// Names of the entries in the compiled bundles
pub mod entries {
    pub const GAME_DATA: &str = "game_data.bin";
    pub const WORLD_META: &str = "world_meta.bin";
    pub const WEST_TEXTURE: &str = "locations-0.r16";
    pub const EAST_TEXTURE: &str = "locations-1.r16";
}

#[derive(Debug, thiserror::Error)]
pub enum BundleError {
    #[error("unable to read bundle: {0}")]
    Zip(#[from] rawzip::Error),

    #[error("bundle entry is missing: {0}")]
    MissingEntry(&'static str),

    #[error("unable to decompress bundle entry: {0}")]
    Decompress(#[from] pdx_zstd::Error),

    #[error("unable to decode bundle entry: {0}")]
    Decode(#[from] postcard::Error),

    #[error("map textures do not match the world metadata")]
    TextureSize,
}

type Entry = (u64, ZipArchiveEntryWayfinder);

fn find_entries<R: AsRef<[u8]>, const N: usize>(
    zip: &ZipSliceArchive<R>,
    names: [&'static str; N],
) -> Result<[Entry; N], BundleError> {
    let mut found: [Option<Entry>; N] = [None; N];
    for entry in zip.entries() {
        let entry = entry?;
        let path = entry.file_path();
        if let Some(idx) = names.iter().position(|x| x.as_bytes() == path.as_bytes()) {
            found[idx] = Some((entry.uncompressed_size_hint(), entry.wayfinder()));
        }
    }

    if let Some(idx) = found.iter().position(|x| x.is_none()) {
        return Err(BundleError::MissingEntry(names[idx]));
    }
    Ok(found.map(|x| x.expect("all entries are found")))
}

fn read_entry<R: AsRef<[u8]>>(
    zip: &ZipSliceArchive<R>,
    (size, wayfinder): Entry,
) -> Result<Vec<u8>, BundleError> {
    let entry = zip.get_entry(wayfinder)?;
    let mut out = vec![0u8; size as usize];
    pdx_zstd::decode_to(entry.data(), &mut out)?;
    Ok(out)
}

/// Read the game data from the game bundle (game.zip)
pub fn read_game_bundle(data: &[u8]) -> Result<GameData, BundleError> {
    let zip = ZipArchive::from_slice(data)?;
    let [game] = find_entries(&zip, [entries::GAME_DATA])?;
    let bytes = read_entry(&zip, game)?;
    Ok(postcard::from_bytes(&bytes)?)
}

/// The location textures of the map, split into west and east halves
#[derive(Debug)]
pub struct MapTextures {
    pub meta: WorldMetadata,
    pub west: Vec<R16>,
    pub east: Vec<R16>,
}

/// Read the location textures from the map bundle (map.zip)
pub fn read_map_bundle(data: &[u8]) -> Result<MapTextures, BundleError> {
    let zip = ZipArchive::from_slice(data)?;
    let [meta, west, east] = find_entries(
        &zip,
        [
            entries::WORLD_META,
            entries::WEST_TEXTURE,
            entries::EAST_TEXTURE,
        ],
    )?;

    let meta: WorldMetadata = postcard::from_bytes(&read_entry(&zip, meta)?)?;
    let hemisphere_pixels = (meta.width / 2) as usize * meta.height as usize;

    let read_texture = |entry: Entry| -> Result<Vec<R16>, BundleError> {
        if entry.0 as usize != hemisphere_pixels * std::mem::size_of::<R16>() {
            return Err(BundleError::TextureSize);
        }
        let entry_data = zip.get_entry(entry.1)?;
        let mut out = vec![R16::new(0); hemisphere_pixels];
        pdx_zstd::decode_to(entry_data.data(), bytemuck::cast_slice_mut(&mut out))?;
        Ok(out)
    };

    let west = read_texture(west)?;
    let east = read_texture(east)?;
    Ok(MapTextures { meta, west, east })
}
