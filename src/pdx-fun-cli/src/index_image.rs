use anyhow::{Context, Result, anyhow};
use clap::Args;
use image::GenericImageView;
use pdx_map::{World, WorldLength};
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

/// Converts images (PNG, BMP, or raw RGB/RGBA) into split R16 hemisphere textures
#[derive(Args)]
pub struct IndexImageArgs {
    /// Input image file (PNG, BMP, .rgb, or .rgba)
    input: PathBuf,

    /// Image width in pixels (required for .rgb/.rgba, optional for PNG/BMP)
    width: Option<u32>,
}

enum ImageFormat {
    Png,
    Bmp,
    Rgb,
    Rgba,
}

impl IndexImageArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let format = self.detect_format()?;

        let (bytes, width, height, depth) = match format {
            ImageFormat::Png | ImageFormat::Bmp => self.load_image_format()?,
            ImageFormat::Rgb => self.load_raw_format(3)?,
            ImageFormat::Rgba => self.load_raw_format(4)?,
        };

        // Create world from image data
        let (world, palette) = match depth {
            3 => World::from_rgb8(&bytes, WorldLength::new(width)),
            4 => World::from_rgba8(&bytes, WorldLength::new(width)),
            _ => unreachable!("Depth should be 3 or 4"),
        };

        // Split into hemispheres (west and east)
        let (west, east) = world.into_hemispheres();

        // Generate output paths
        let (west_path, east_path) = self.output_paths()?;

        // Write hemisphere files
        fs::write(&west_path, west.as_bytes())
            .with_context(|| format!("Failed to write {}", west_path.display()))?;
        fs::write(&east_path, east.as_bytes())
            .with_context(|| format!("Failed to write {}", east_path.display()))?;

        // Print summary
        println!(
            "Indexed {}x{} ({}-bit) image with {} colors",
            width,
            height,
            depth * 8,
            palette.len()
        );
        println!("Wrote: {}", west_path.display());
        println!("Wrote: {}", east_path.display());

        Ok(ExitCode::SUCCESS)
    }

    fn detect_format(&self) -> Result<ImageFormat> {
        let extension = self
            .input
            .extension()
            .and_then(|ext| ext.to_str())
            .ok_or_else(|| anyhow!("Input file must have an extension"))?
            .to_ascii_lowercase();

        match extension.as_str() {
            "png" => Ok(ImageFormat::Png),
            "bmp" => Ok(ImageFormat::Bmp),
            "rgb" => Ok(ImageFormat::Rgb),
            "rgba" => Ok(ImageFormat::Rgba),
            _ => Err(anyhow!(
                "Unsupported format: .{}. Supported: .png, .bmp, .rgb, .rgba",
                extension
            )),
        }
    }

    fn load_image_format(&self) -> Result<(Vec<u8>, u32, u32, usize)> {
        let img = image::open(&self.input)
            .with_context(|| format!("Failed to open image: {}", self.input.display()))?;

        let (detected_width, height) = img.dimensions();

        let img = img.to_rgb8();
        let bytes = img.into_raw();

        Ok((bytes, detected_width, height, 3))
    }

    fn load_raw_format(&self, depth: usize) -> Result<(Vec<u8>, u32, u32, usize)> {
        let width = self
            .width
            .ok_or_else(|| anyhow!("Width parameter is required for raw .rgb/.rgba files"))?;

        if width == 0 {
            return Err(anyhow!("Width must be greater than 0"));
        }

        let bytes = fs::read(&self.input)
            .with_context(|| format!("Failed to read file: {}", self.input.display()))?;

        let row_bytes = width as usize * depth;
        if row_bytes == 0 || bytes.len() % row_bytes != 0 {
            return Err(anyhow!(
                "Input length ({}) is not a multiple of width * depth ({})",
                bytes.len(),
                row_bytes
            ));
        }

        let height = (bytes.len() / row_bytes) as u32;

        Ok((bytes, width, height, depth))
    }

    fn output_paths(&self) -> Result<(PathBuf, PathBuf)> {
        let base = self.input.with_extension("");
        let base_str = base
            .to_str()
            .ok_or_else(|| anyhow!("Invalid path encoding"))?;
        let west = PathBuf::from(format!("{}-0.r16", base_str));
        let east = PathBuf::from(format!("{}-1.r16", base_str));
        Ok((west, east))
    }
}
