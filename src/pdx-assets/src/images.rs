use anyhow::Result;
use std::path::PathBuf;

pub mod error;
pub mod imagemagick;

pub use error::ImageError;

pub trait ImageProcessor {
    fn convert(&self, request: ConvertRequest) -> Result<()>;
    fn montage(&self, request: MontageRequest<'_>) -> Result<()>;
}

#[derive(Debug, Clone)]
pub struct ConvertRequest {
    pub input_path: PathBuf,
    pub output_path: PathBuf,
    pub format: OutputFormat,
    pub operation: Option<ImageOperation>,
}

#[derive(Debug)]
pub struct MontageRequest<'a> {
    pub images: &'a [(String, PathBuf)],
    pub output_path: PathBuf,
    pub format: OutputFormat,
    pub geometries: Vec<Geometry>,
    pub background: Option<Color>,
    pub additional_args: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct Geometry {
    pub width: u32,
    pub height: u32,
}

impl Geometry {
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }
}

#[derive(Debug, Clone)]
pub struct CropGeometry {
    pub width: u32,
    pub height: u32,
    pub x_offset: u32,
    pub y_offset: u32,
}

impl CropGeometry {
    pub fn new(width: u32, height: u32, x_offset: u32, y_offset: u32) -> Self {
        Self {
            width,
            height,
            x_offset,
            y_offset,
        }
    }
}

#[derive(Debug, Clone)]
pub enum Color {
    Rgb(u8, u8, u8),
    Transparent,
    White,
    Black,
}

#[derive(Debug, Clone)]
pub enum OutputFormat {
    Webp { quality: WebpQuality },
    Png,
}

#[derive(Debug, Clone)]
pub enum WebpQuality {
    Lossless,
    Quality(u8),
}

#[derive(Debug, Clone)]
pub struct TileGeometry {
    pub columns: u32,
    pub rows: u32,
}

impl TileGeometry {
    pub fn new(columns: u32, rows: u32) -> Self {
        Self { columns, rows }
    }
}

#[derive(Debug, Clone)]
pub enum ImageOperation {
    Resize(Geometry),
    Crop(CropGeometry),
    Tile(TileGeometry),
}
