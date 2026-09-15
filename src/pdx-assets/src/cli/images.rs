use crate::images::{
    Color, Geometry, ImageProcessor, MontageRequest, MontageSizing, OutputFormat,
    RustImageProcessor, ScaleFilter, WebpQuality,
};
use anyhow::{Context, Result, bail};
use clap::{Args, Subcommand};
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

#[derive(Args, Debug)]
pub struct ImagesArgs {
    #[command(subcommand)]
    command: ImagesCommand,
}

#[derive(Subcommand, Debug)]
enum ImagesCommand {
    /// Create a WebP montage from all supported images in a directory.
    Montage(MontageArgs),
}

#[derive(Args, Debug)]
struct MontageArgs {
    /// Directory that contains the source images.
    source_dir: PathBuf,

    /// Output WebP path.
    output_path: PathBuf,

    /// Fit each image into cells of this size, for example 32x32.
    #[arg(long, value_parser = parse_geometry)]
    size: Option<Geometry>,

    /// WebP quality for lossy output.
    #[arg(long, default_value_t = 75)]
    quality: u8,

    /// Write lossless WebP output.
    #[arg(long)]
    lossless: bool,
}

impl ImagesArgs {
    pub fn run(&self) -> Result<ExitCode> {
        match &self.command {
            ImagesCommand::Montage(args) => args.run(),
        }
    }
}

impl MontageArgs {
    fn run(&self) -> Result<ExitCode> {
        let mut images = Vec::new();
        for entry in fs::read_dir(&self.source_dir)
            .with_context(|| format!("unable to read {}", self.source_dir.display()))?
        {
            let entry = entry?;
            if !entry.file_type()?.is_file() || !is_supported_image(&entry.path()) {
                continue;
            }
            let path = entry.path();
            let name = path
                .file_stem()
                .and_then(|name| name.to_str())
                .with_context(|| format!("invalid image name: {}", path.display()))?;
            images.push((name.to_owned(), path));
        }
        images.sort_by(|left, right| left.0.cmp(&right.0));

        if images.is_empty() {
            bail!("no supported images found in {}", self.source_dir.display());
        }

        let sizing = match self.size.clone() {
            Some(size) => MontageSizing::ScaledDown {
                sizes: vec![size],
                filter: ScaleFilter::Lanczos,
            },
            None => MontageSizing::Native,
        };
        let quality = if self.lossless {
            WebpQuality::Lossless
        } else {
            WebpQuality::Quality(self.quality)
        };
        RustImageProcessor::create()?.montage(MontageRequest {
            images: &images,
            output_path: self.output_path.clone(),
            format: OutputFormat::Webp { quality },
            sizing,
            background: Some(Color::Transparent),
            additional_args: vec![],
        })?;

        Ok(ExitCode::SUCCESS)
    }
}

fn is_supported_image(path: &std::path::Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("bmp" | "dds" | "png" | "tga")
    )
}

fn parse_geometry(value: &str) -> Result<Geometry, String> {
    let (width, height) = value
        .split_once('x')
        .ok_or_else(|| "size must use WIDTHxHEIGHT format".to_owned())?;
    let width = width
        .parse()
        .map_err(|_| "size width must be a positive integer".to_owned())?;
    let height = height
        .parse()
        .map_err(|_| "size height must be a positive integer".to_owned())?;
    if width == 0 || height == 0 {
        return Err("size dimensions must be greater than zero".to_owned());
    }
    Ok(Geometry::new(width, height))
}
