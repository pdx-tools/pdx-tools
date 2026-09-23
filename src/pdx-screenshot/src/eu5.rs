use eu5app::{
    Eu5AnySaveLoader, Eu5Workspace, MapMode,
    game_data::{OptimizedGameBundle, OptimizedMapBundle},
    should_highlight_individual_locations,
};
use pdx_map::layers::DateLayer;
use pdx_map::{
    GpuContext, HeadlessMapRenderer, LocationArrays, MapTexture, PhysicalSize, ViewportBounds,
    WorldSize,
};
use std::sync::{Mutex, PoisonError};

const OUTPUT_SIZE: PhysicalSize<u32> = PhysicalSize::new(1200, 630);

#[derive(Debug, thiserror::Error)]
pub enum ScreenshotError {
    #[error("EU5 screenshots are not available: no EU5 assets were embedded in this build")]
    NoAssets,
    #[error("failed to parse EU5 save: {0}")]
    Parse(String),
    #[error("failed to load EU5 game data: {0}")]
    GameData(#[from] eu5app::game_data::GameDataError),
    #[error("failed to render EU5 map: {0}")]
    Render(#[from] pdx_map::RenderError),
    #[error(transparent)]
    Encode(#[from] crate::encode::EncodeError),
}

struct PatchAssets {
    major: u32,
    minor: u32,
    game: &'static [u8],
    map: &'static [u8],
}

// `PATCH_ASSETS`, sorted by version. Empty when the build had no EU5 assets.
include!(concat!(env!("OUT_DIR"), "/eu5_assets.rs"));

/// Index into `PATCH_ASSETS`. A version that has no embedded patch falls back
/// to the latest patch.
fn patch_slot(major: u32, minor: u32) -> Result<usize, ScreenshotError> {
    let latest = PATCH_ASSETS
        .len()
        .checked_sub(1)
        .ok_or(ScreenshotError::NoAssets)?;
    Ok(PATCH_ASSETS
        .iter()
        .position(|patch| (patch.major, patch.minor) == (major, minor))
        .unwrap_or(latest))
}

/// The hemisphere textures for one patch.
#[derive(Clone)]
struct Hemispheres {
    west: MapTexture,
    east: MapTexture,
}

/// The hemisphere textures for one patch, uploaded to the GPU. The pair is
/// ~256 MiB, and the software GPU keeps it in host memory, so only the
/// textures of the most recent patch stay in the cache. The decoded arrays
/// are dropped after the upload. The lock is held for the whole load, so
/// only one patch is decoded at a time.
fn hemispheres(gpu: &GpuContext, slot: usize) -> Result<Hemispheres, ScreenshotError> {
    static CACHED: Mutex<Option<(usize, Hemispheres)>> = Mutex::new(None);

    let mut cached = CACHED.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((cached_slot, textures)) = cached.as_ref()
        && *cached_slot == slot
    {
        return Ok(textures.clone());
    }

    // Release the textures of the previous patch before the new patch is
    // decoded. A render that is in progress keeps its own reference.
    *cached = None;
    let mut map_bundle = OptimizedMapBundle::open(PATCH_ASSETS[slot].map)?;
    let (west, east) = map_bundle.load_hemispheres()?;
    let size = eu5app::hemisphere_size().physical();
    let textures = Hemispheres {
        west: gpu.create_texture(&west, size, "EU5 West Texture"),
        east: gpu.create_texture(&east, size, "EU5 East Texture"),
    };
    *cached = Some((slot, textures.clone()));
    Ok(textures)
}

/// A parsed save with the map data that [`render`] needs.
pub struct PreparedSave {
    hemispheres: Hemispheres,
    locations: LocationArrays,
    date: String,
}

impl std::fmt::Debug for PreparedSave {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PreparedSave")
            .field("date", &self.date)
            .finish_non_exhaustive()
    }
}

/// Parse the save and build the map data for [`render`]. This step does the
/// most CPU work, and it can wait for another request to load the map, so
/// the caller must run it where it cannot block an async runtime.
#[tracing::instrument(name = "eu5.screenshot.prepare", skip_all, fields(request_bytes = data.len()))]
pub fn prepare(gpu: &GpuContext, data: &[u8]) -> Result<PreparedSave, ScreenshotError> {
    let tokens = schemas::resolver::Eu5FlatTokens::new();
    let parser = Eu5AnySaveLoader::open(data, tokens)
        .map_err(|error| ScreenshotError::Parse(error.to_string()))?;
    let version = parser.meta().version;
    let slot = patch_slot(version.major, version.minor)?;

    // Load the map before the gamestate is parsed, so that the memory to
    // decode the map is not needed at the same time as the parse memory.
    let hemispheres = hemispheres(gpu, slot)?;
    let mut save = parser
        .parse()
        .map_err(|error| ScreenshotError::Parse(error.to_string()))?;

    let game_data = OptimizedGameBundle::open(PATCH_ASSETS[slot].game)?.into_game_data()?;
    let mut workspace = Eu5Workspace::new(save.take_gamestate(), game_data)?;
    workspace.set_map_mode(MapMode::Political);
    let date = workspace.gamestate().metadata.date.date_fmt().to_string();
    Ok(PreparedSave {
        hemispheres,
        locations: workspace.location_arrays().clone(),
        date,
    })
}

/// Render a prepared save to a WebP image. Returns the WebP-encoded bytes.
#[tracing::instrument(name = "eu5.screenshot.render", skip_all)]
pub async fn render(gpu: &GpuContext, save: PreparedSave) -> Result<Vec<u8>, ScreenshotError> {
    let mut renderer = HeadlessMapRenderer::new(
        gpu.clone(),
        save.hemispheres.west,
        save.hemispheres.east,
        OUTPUT_SIZE.width,
        OUTPUT_SIZE.height,
    )?;
    renderer.update_locations(&save.locations);
    renderer.add_layer(DateLayer::new(save.date, 2));

    let world = eu5app::hemisphere_size().world();
    let viewport_width = world.height * OUTPUT_SIZE.width / OUTPUT_SIZE.height;
    let mut viewport = ViewportBounds::new(WorldSize::new(viewport_width, world.height));
    viewport.rect.origin.x = (world.width - viewport_width) / 2;

    let zoom = OUTPUT_SIZE.width as f32 / viewport_width as f32;
    renderer.set_location_borders(should_highlight_individual_locations(zoom));
    let capture = renderer.capture_viewport(viewport).await?;
    let stride = OUTPUT_SIZE.width as usize * 4;
    let mut rgba = vec![0; OUTPUT_SIZE.area() as usize * 4];
    for (source, destination) in capture.rows().zip(rgba.chunks_exact_mut(stride)) {
        destination.copy_from_slice(source);
    }
    capture.finish();

    Ok(crate::encode::encode_webp(rgba, OUTPUT_SIZE)?)
}
