mod colors;
mod renderer;
mod save;
mod viewport;

pub use pdx_map::GpuContext;
use pdx_map::R16;
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
    #[error("invalid RGBA image buffer")]
    InvalidImageBuffer,
    #[error("failed to create WebP encoder: {0}")]
    WebpEncode(String),
}

struct PatchScreenshotAssets {
    color_index: Vec<u16>,
    color_count: usize,
    west_r16: Vec<R16>,
    east_r16: Vec<R16>,
}

/// Render an EU4 save file to a WebP image. Returns the WebP-encoded bytes.
pub async fn render(gpu: &GpuContext, data: &[u8]) -> Result<Vec<u8>, ScreenshotError> {
    let parsed = save::ParsedSave::parse(data)?;
    let minor_version = parsed.minor_version();

    let patch_assets = load_patch_assets(minor_version)?;

    let image_buffer = renderer::render_screenshot(
        parsed,
        gpu,
        patch_assets,
        eu4game_data::game_data(minor_version),
    )
    .await?;

    encode_webp(image_buffer)
}

fn encode_webp(image_buffer: Vec<u8>) -> Result<Vec<u8>, ScreenshotError> {
    let output_size = viewport::OUTPUT_IMAGE_SIZE;
    let img = image::RgbaImage::from_raw(output_size.width, output_size.height, image_buffer)
        .ok_or(ScreenshotError::InvalidImageBuffer)?;
    let dynamic_img = image::DynamicImage::from(img);

    let encoder = webp::Encoder::from_image(&dynamic_img)
        .map_err(|e| ScreenshotError::WebpEncode(e.to_string()))?;
    Ok(encoder.encode_lossless().to_vec())
}

fn load_patch_assets(
    minor_version: u16,
) -> Result<&'static PatchScreenshotAssets, ScreenshotError> {
    static PATCH_SLOTS: [OnceLock<PatchScreenshotAssets>; eu4game_data::LATEST_MINOR as usize + 1] =
        [const { OnceLock::new() }; eu4game_data::LATEST_MINOR as usize + 1];

    let slot = PATCH_SLOTS
        .get(minor_version as usize)
        .ok_or(ScreenshotError::UnsupportedVersion(minor_version))?;

    Ok(slot.get_or_init(|| build_patch_assets(minor_version)))
}

fn build_patch_assets(minor_version: u16) -> PatchScreenshotAssets {
    let raw = eu4game_data::screenshot_assets(minor_version);
    let color_index = bytes_to_u16(raw.color_index);
    let color_count = color_index
        .iter()
        .copied()
        .max()
        .map(|x| x as usize + 1)
        .unwrap_or(0);

    let west_r16 = decode_r16(raw.west_r16_zst, "west");
    let east_r16 = decode_r16(raw.east_r16_zst, "east");
    let expected_len = viewport::EU4_HEMISPHERE_SIZE.area() as usize;
    assert!(
        west_r16.len() == expected_len,
        "embedded west R16 texture has {} pixels, expected {}",
        west_r16.len(),
        expected_len
    );
    assert!(
        east_r16.len() == expected_len,
        "embedded east R16 texture has {} pixels, expected {}",
        east_r16.len(),
        expected_len
    );

    PatchScreenshotAssets {
        color_index,
        color_count,
        west_r16,
        east_r16,
    }
}

fn bytes_to_u16(bytes: &[u8]) -> Vec<u16> {
    assert!(
        bytes.len().is_multiple_of(2),
        "embedded u16 asset has odd byte length"
    );
    bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect()
}

fn decode_r16(data: &[u8], label: &str) -> Vec<R16> {
    let bytes = pdx_zstd::decode_all(data)
        .unwrap_or_else(|e| panic!("failed to decode embedded {label} R16 asset: {e}"));
    bytemuck::cast_vec(bytes_to_u16(&bytes))
}
