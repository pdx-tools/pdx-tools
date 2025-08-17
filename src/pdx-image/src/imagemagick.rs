use crate::{ConvertOptions, ImageBackend, MontageOptions, WebpQuality};
use anyhow::{bail, Result};
use std::path::Path;
use std::process::Command;

pub struct ImageMagickBackend;

impl ImageMagickBackend {
    pub fn new() -> Self {
        Self
    }

    fn webp_quality_args(quality: &WebpQuality) -> Vec<String> {
        match quality {
            WebpQuality::Lossless => vec!["-define".to_string(), "webp:lossless=true".to_string()],
            WebpQuality::Quality(q) => vec!["-quality".to_string(), q.to_string()],
        }
    }
}

impl ImageBackend for ImageMagickBackend {
    fn convert_image<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        input: P,
        output: Q,
        options: &ConvertOptions,
    ) -> Result<()> {
        let mut cmd = Command::new("convert");
        cmd.arg(input.as_ref());

        // Apply strip profiles
        if options.strip_profiles {
            cmd.arg("-strip");
        }

        // Apply crop
        if let Some(crop) = &options.crop {
            cmd.arg("-crop");
            cmd.arg(format!("{}x{}+{}+{}", crop.width, crop.height, crop.x, crop.y));
        }

        // Apply background color
        if let Some((r, g, b)) = options.background_color {
            cmd.arg("-background");
            cmd.arg(format!("rgb({},{},{})", r, g, b));
        }

        // Apply alpha off
        if options.alpha_off {
            cmd.arg("-alpha");
            cmd.arg("Off");
        }

        // Apply auto-orient
        if options.auto_orient {
            cmd.arg("-auto-orient");
        }

        // Apply WebP quality settings
        let quality_args = Self::webp_quality_args(&options.webp_quality);
        for arg in &quality_args {
            cmd.arg(arg);
        }

        cmd.arg(output.as_ref());

        let child = cmd.output()?;
        if !child.status.success() {
            bail!(
                "ImageMagick convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        Ok(())
    }

    fn create_montage<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        images: &[(String, P)],
        output: Q,
        options: &MontageOptions,
    ) -> Result<()> {
        let cols = if options.grid_cols == 0 {
            (images.len() as f64).sqrt().ceil() as u32
        } else {
            options.grid_cols
        };

        let mut cmd = Command::new("montage");

        // Set background
        if options.background_transparent {
            cmd.arg("-background");
            cmd.arg("transparent");
        } else if let Some((r, g, b)) = options.background_color {
            cmd.arg("-background");
            cmd.arg(format!("rgb({},{},{})", r, g, b));
        }

        // Set auto-orient
        if options.auto_orient {
            cmd.arg("-auto-orient");
        }

        // Apply alpha off
        if options.alpha_off {
            cmd.arg("-alpha");
            cmd.arg("Off");
        }

        cmd.arg("-mode");
        cmd.arg("concatenate");
        cmd.arg("-tile");
        cmd.arg(format!("{}x", cols));

        // Set geometry if specified
        if let Some(geometry) = &options.tile_geometry {
            cmd.arg("-geometry");
            cmd.arg(format!("{}x{}", geometry.width, geometry.height));
        }

        // Apply WebP quality settings
        let quality_args = Self::webp_quality_args(&options.webp_quality);
        for arg in &quality_args {
            cmd.arg(arg);
        }

        // Add all input images
        for (_, path) in images {
            cmd.arg(path.as_ref());
        }

        cmd.arg(output.as_ref());

        let child = cmd.output()?;
        if !child.status.success() {
            bail!(
                "ImageMagick montage failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        Ok(())
    }
}