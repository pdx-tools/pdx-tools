use std::path::Path;
use anyhow::Result;

mod imagemagick;
#[cfg(feature = "rust")]
mod rust;

pub use imagemagick::ImageMagickBackend;
#[cfg(feature = "rust")]
pub use rust::RustImageBackend;

#[derive(Debug, Clone)]
pub struct CropParams {
    pub width: u32,
    pub height: u32,
    pub x: u32,
    pub y: u32,
}

#[derive(Debug, Clone)]
pub struct TileGeometry {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone)]
pub enum WebpQuality {
    Lossless,
    Quality(u8),
}

#[derive(Debug, Clone)]
pub struct ConvertOptions {
    pub webp_quality: WebpQuality,
    pub background_color: Option<(u8, u8, u8)>,
    pub alpha_off: bool,
    pub auto_orient: bool,
    pub strip_profiles: bool,
    pub crop: Option<CropParams>,
}

impl Default for ConvertOptions {
    fn default() -> Self {
        Self {
            webp_quality: WebpQuality::Quality(90),
            background_color: None,
            alpha_off: false,
            auto_orient: false,
            strip_profiles: false,
            crop: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct MontageOptions {
    pub grid_cols: u32,
    pub tile_geometry: Option<TileGeometry>,
    pub webp_quality: WebpQuality,
    pub background_color: Option<(u8, u8, u8)>,
    pub background_transparent: bool,
    pub auto_orient: bool,
    pub alpha_off: bool,
}

impl Default for MontageOptions {
    fn default() -> Self {
        Self {
            grid_cols: 0, // auto-calculate
            tile_geometry: None,
            webp_quality: WebpQuality::Quality(90),
            background_color: None,
            background_transparent: false,
            auto_orient: false,
            alpha_off: false,
        }
    }
}

/// Trait for image processing backends
pub trait ImageBackend {
    /// Convert a single image to WebP format
    fn convert_image<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        input: P,
        output: Q,
        options: &ConvertOptions,
    ) -> Result<()>;

    /// Create a montage/sprite sheet from multiple images
    fn create_montage<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        images: &[(String, P)],
        output: Q,
        options: &MontageOptions,
    ) -> Result<()>;
}

/// Enum wrapper for different image backends
pub enum ImageBackendType {
    ImageMagick(ImageMagickBackend),
    #[cfg(feature = "rust")]
    Rust(RustImageBackend),
}

impl ImageBackend for ImageBackendType {
    fn convert_image<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        input: P,
        output: Q,
        options: &ConvertOptions,
    ) -> Result<()> {
        match self {
            ImageBackendType::ImageMagick(backend) => backend.convert_image(input, output, options),
            #[cfg(feature = "rust")]
            ImageBackendType::Rust(backend) => backend.convert_image(input, output, options),
        }
    }

    fn create_montage<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        images: &[(String, P)],
        output: Q,
        options: &MontageOptions,
    ) -> Result<()> {
        match self {
            ImageBackendType::ImageMagick(backend) => backend.create_montage(images, output, options),
            #[cfg(feature = "rust")]
            ImageBackendType::Rust(backend) => backend.create_montage(images, output, options),
        }
    }
}

impl ImageBackendType {
    pub fn new_imagemagick() -> Self {
        Self::ImageMagick(ImageMagickBackend::new())
    }

    #[cfg(feature = "rust")]
    pub fn new_rust() -> Self {
        Self::Rust(RustImageBackend::new())
    }
}