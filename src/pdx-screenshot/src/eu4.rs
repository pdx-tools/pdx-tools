mod colors;
mod renderer;
mod save;
mod viewport;

pub use pdx_map::GpuContext;
use pdx_map::{GpuWorldTiles, WorldTiles};
use std::sync::OnceLock;

#[derive(Debug, thiserror::Error)]
pub enum ScreenshotError {
    #[error("failed to parse save file")]
    Parse(#[from] eu4game::Eu4GameError),
    #[error("unsupported EU4 minor version: {0}")]
    UnsupportedVersion(u16),
    #[error("failed to create headless renderer")]
    CreateRenderer(#[source] pdx_map::RenderError),
    #[error("failed to capture viewport")]
    CaptureViewport(#[source] pdx_map::RenderError),
    #[error(transparent)]
    Encode(#[from] crate::encode::EncodeError),
}

struct PatchScreenshotAssets {
    color_index: Vec<u16>,
    color_count: usize,
    /// The map of the patch, kept on the GPU
    tiles: GpuWorldTiles,
}

/// Render an EU4 save file to a WebP image. Returns the WebP-encoded bytes.
pub async fn render(gpu: &GpuContext, data: &[u8]) -> Result<Vec<u8>, ScreenshotError> {
    let parsed = save::ParsedSave::parse(data)?;
    let minor_version = parsed.minor_version();

    let patch_assets = load_patch_assets(gpu, minor_version)?;

    let image_buffer = renderer::render_screenshot(
        parsed,
        gpu,
        patch_assets,
        eu4game_data::game_data(minor_version),
    )
    .await?;

    Ok(crate::encode::encode_webp(
        image_buffer,
        viewport::OUTPUT_IMAGE_SIZE,
    )?)
}

/// The assets of a patch, built on first use. The map stays on the GPU of
/// the first call, so every call must pass the same `gpu`.
fn load_patch_assets(
    gpu: &GpuContext,
    minor_version: u16,
) -> Result<&'static PatchScreenshotAssets, ScreenshotError> {
    static PATCH_SLOTS: [OnceLock<PatchScreenshotAssets>; eu4game_data::LATEST_MINOR as usize + 1] =
        [const { OnceLock::new() }; eu4game_data::LATEST_MINOR as usize + 1];

    let slot = PATCH_SLOTS
        .get(minor_version as usize)
        .ok_or(ScreenshotError::UnsupportedVersion(minor_version))?;

    Ok(slot.get_or_init(|| build_patch_assets(gpu, minor_version)))
}

fn build_patch_assets(gpu: &GpuContext, minor_version: u16) -> PatchScreenshotAssets {
    let raw = eu4game_data::screenshot_assets(minor_version);
    let color_index = bytes_to_u16(raw.color_index);
    let color_count = color_index
        .iter()
        .copied()
        .max()
        .map(|x| x as usize + 1)
        .unwrap_or(0);

    let bytes = pdx_zstd::decode_all(raw.tiles_zst)
        .unwrap_or_else(|e| panic!("failed to decode embedded EU4 map tiles: {e}"));
    let tiles = WorldTiles::from_le_bytes(viewport::EU4_HEMISPHERE_SIZE, &bytes)
        .unwrap_or_else(|e| panic!("embedded EU4 map tiles are invalid: {e}"));
    PatchScreenshotAssets {
        color_index,
        color_count,
        tiles: gpu.upload_world_tiles(&tiles),
    }
}

fn bytes_to_u16(bytes: &[u8]) -> Vec<u16> {
    assert!(
        bytes.len().is_multiple_of(2),
        "embedded u16 asset has odd byte length"
    );
    bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect()
}
