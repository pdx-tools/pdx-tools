use anyhow::{ensure, Context, Result};
use eu4save::SegmentedResolver;
use schemas::FlatResolver;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

/// Manages EU4 game assets (tokens, game data, textures, color indices)
pub struct Eu4Assets {
    /// Token resolver for parsing saves
    resolver: &'static SegmentedResolver<'static>,
    /// Cached game data per version
    game_data_cache: tokio::sync::RwLock<HashMap<u16, Arc<Vec<u8>>>>,
    /// Base path to assets directory
    assets_path: PathBuf,
}

static TOKEN_DATA: OnceLock<Vec<u8>> = OnceLock::new();
static TOKEN_RESOLVER: OnceLock<SegmentedResolver<'static>> = OnceLock::new();

impl Eu4Assets {
    /// Create a new asset manager and load tokens
    pub fn new(assets_path: impl Into<PathBuf>) -> Result<Self> {
        let assets_path = assets_path.into();

        // Load tokens once
        let resolver = Self::load_tokens(&assets_path)?;

        Ok(Self {
            resolver,
            game_data_cache: tokio::sync::RwLock::new(HashMap::new()),
            assets_path,
        })
    }

    /// Load and initialize token resolver (called once at startup)
    fn load_tokens(assets_path: &Path) -> Result<&'static SegmentedResolver<'static>> {
        if let Some(resolver) = TOKEN_RESOLVER.get() {
            return Ok(resolver);
        }

        let token_path = assets_path.join("tokens/eu4.bin");
        tracing::info!("Loading tokens from: {}", token_path.display());

        let compressed = std::fs::read(&token_path)
            .with_context(|| format!("Failed to read tokens from {}", token_path.display()))?;

        let tokens =
            pdx_zstd::decode_all(&compressed).context("Failed to decompress token data")?;

        // Store token data in static
        let token_data = TOKEN_DATA.get_or_init(|| tokens);

        // Safety: We're using 'static lifetime because the data is stored in a static
        // and will live for the entire program duration
        let sl: &'static [u8] = unsafe { std::mem::transmute(token_data.as_slice()) };
        let flat_resolver = FlatResolver::from_slice(sl);

        let resolver =
            SegmentedResolver::from_parts(flat_resolver.values, flat_resolver.breakpoint, 10000);

        TOKEN_RESOLVER.get_or_init(|| resolver);
        Ok(TOKEN_RESOLVER.get().unwrap())
    }

    /// Get the token resolver
    pub fn resolver(&self) -> &'static SegmentedResolver<'static> {
        self.resolver
    }

    /// Load game data for a specific version (cached)
    pub async fn load_game_data(&self, minor_version: u16) -> Result<Arc<Vec<u8>>> {
        // Check cache first
        {
            let cache = self.game_data_cache.read().await;
            if let Some(data) = cache.get(&minor_version) {
                return Ok(Arc::clone(data));
            }
        }

        // Load from disk
        let version_str = format!("1.{}", minor_version);
        let data_path = self
            .assets_path
            .join(format!("game/eu4/{}/data.bin", version_str));

        tracing::info!("Loading game data from: {}", data_path.display());

        let compressed = std::fs::read(&data_path)
            .with_context(|| format!("Failed to read game data from {}", data_path.display()))?;

        let decompressed =
            pdx_zstd::decode_all(&compressed).context("Failed to decompress game data")?;

        let data = Arc::new(decompressed);

        // Cache it
        {
            let mut cache = self.game_data_cache.write().await;
            cache.insert(minor_version, Arc::clone(&data));
        }

        Ok(data)
    }

    /// Load color index mapping (province ID -> color buffer index)
    pub async fn load_color_index(&self, minor_version: u16) -> Result<Vec<u16>> {
        let version_str = format!("1.{}", minor_version);
        let path = self
            .assets_path
            .join(format!("game/eu4/{}/map/color-index.bin", version_str));

        tracing::debug!("Loading color index from: {}", path.display());

        let bytes = std::fs::read(&path)
            .with_context(|| format!("Failed to read color index from {}", path.display()))?;

        // Convert bytes to u16 array
        let mut result = Vec::with_capacity(bytes.len() / 2);
        for chunk in bytes.chunks_exact(2) {
            result.push(u16::from_le_bytes([chunk[0], chunk[1]]));
        }

        Ok(result)
    }

    /// Load ordered province colors (RGB triplets)
    pub async fn load_color_order(&self, minor_version: u16) -> Result<Vec<u8>> {
        let version_str = format!("1.{}", minor_version);
        let path = self
            .assets_path
            .join(format!("game/eu4/{}/map/color-order.bin", version_str));

        tracing::debug!("Loading color order from: {}", path.display());

        let bytes = std::fs::read(&path)
            .with_context(|| format!("Failed to read color order from {}", path.display()))?;

        ensure!(
            bytes.len() % 3 == 0,
            "Color order length is not a multiple of 3"
        );
        Ok(bytes)
    }

    /// Load west texture (provinces-1.webp)
    pub async fn load_west_texture(
        &self,
        minor_version: u16,
        color_lut: &[u16],
    ) -> Result<(Vec<u8>, u32, u32)> {
        let version_str = format!("1.{}", minor_version);
        let path = self
            .assets_path
            .join(format!("game/eu4/{}/map/provinces-1.webp", version_str));

        tracing::debug!("Loading west texture from: {}", path.display());

        let webp_data = std::fs::read(&path)
            .with_context(|| format!("Failed to read west texture from {}", path.display()))?;

        let decoder = webp::Decoder::new(&webp_data);
        let image = decoder
            .decode()
            .context("Failed to decode west texture WebP")?;

        let width = image.width();
        let height = image.height();
        tracing::debug!("West texture dimensions: {}×{}", width, height);

        let indexed = convert_province_texture(&image, color_lut)?;
        Ok((indexed, width, height))
    }

    /// Load east texture (provinces-2.webp)
    pub async fn load_east_texture(
        &self,
        minor_version: u16,
        color_lut: &[u16],
    ) -> Result<(Vec<u8>, u32, u32)> {
        let version_str = format!("1.{}", minor_version);
        let path = self
            .assets_path
            .join(format!("game/eu4/{}/map/provinces-2.webp", version_str));

        tracing::debug!("Loading east texture from: {}", path.display());

        let webp_data = std::fs::read(&path)
            .with_context(|| format!("Failed to read east texture from {}", path.display()))?;

        let decoder = webp::Decoder::new(&webp_data);
        let image = decoder
            .decode()
            .context("Failed to decode east texture WebP")?;

        let width = image.width();
        let height = image.height();
        tracing::debug!("East texture dimensions: {}×{}", width, height);

        let indexed = convert_province_texture(&image, color_lut)?;
        Ok((indexed, width, height))
    }
}

const COLOR_LUT_SIZE: usize = 1 << 24;

pub fn build_color_lut(color_order: &[u8]) -> Result<Vec<u16>> {
    ensure!(
        color_order.len() % 3 == 0,
        "Color order length is not a multiple of 3"
    );
    let color_count = color_order.len() / 3;
    ensure!(
        color_count <= u16::MAX as usize,
        "Color order exceeds u16 capacity"
    );

    let mut color_lut = vec![u16::MAX; COLOR_LUT_SIZE];
    for (idx, chunk) in color_order.chunks_exact(3).enumerate() {
        let key = ((chunk[0] as usize) << 16) | ((chunk[1] as usize) << 8) | chunk[2] as usize;
        color_lut[key] = idx as u16;
    }

    Ok(color_lut)
}

fn convert_province_texture(image: &webp::WebPImage, color_lut: &[u16]) -> Result<Vec<u8>> {
    let data = image.to_owned().to_vec();
    let bytes_per_pixel = image.layout().bytes_per_pixel() as usize;
    ensure!(
        bytes_per_pixel == 3 || bytes_per_pixel == 4,
        "Unsupported WebP pixel layout"
    );
    ensure!(
        data.len() % bytes_per_pixel == 0,
        "Province texture data is not RGB/RGBA"
    );

    let mut missing = 0usize;
    let mut indexed = vec![0u8; data.len() / bytes_per_pixel * 2];
    for (pixel, dst) in data
        .chunks_exact(bytes_per_pixel)
        .zip(indexed.chunks_exact_mut(2))
    {
        let key = ((pixel[0] as usize) << 16) | ((pixel[1] as usize) << 8) | pixel[2] as usize;
        let mut idx = color_lut[key];
        if idx == u16::MAX {
            missing += 1;
            idx = 0;
        }
        dst.copy_from_slice(&idx.to_le_bytes());
    }

    if missing > 0 {
        tracing::warn!("Found {} province pixels with unknown colors", missing);
    }

    Ok(indexed)
}
