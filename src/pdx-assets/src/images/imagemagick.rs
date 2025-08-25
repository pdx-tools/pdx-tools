use super::{
    Color, ConvertRequest, ImageOperation, ImageProcessor, MontageRequest, OutputFormat,
    WebpQuality,
};
use crate::images::ImageError;
use anyhow::{Context, Result, bail, ensure};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::process::Command;

/// Creates an ImageMagick command with the given subcommand.
/// Automatically handles both ImageMagick 7+ ("magick <subcommand>") and ImageMagick 6 ("<subcommand>") installations.
pub fn imagemagick_command(subcommand: &str) -> anyhow::Result<Command> {
    // First try 'magick' command (ImageMagick 7+)
    if Command::new("magick")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        let mut cmd = Command::new("magick");
        cmd.arg(subcommand);
        return Ok(cmd);
    }

    // Fall back to direct subcommand (ImageMagick 6)
    if Command::new(subcommand)
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
    {
        return Ok(Command::new(subcommand));
    }

    bail!(
        "ImageMagick not found. Please install ImageMagick ('magick {}' or '{}' command)",
        subcommand,
        subcommand
    )
}

#[derive(Debug, Clone)]
enum MagickCommand {
    Magick,
    Direct,
    Downloaded(PathBuf),
}

#[derive(Debug)]
pub struct ImageMagickProcessor {
    command_type: MagickCommand,
}

impl ImageMagickProcessor {
    pub fn create() -> Result<Self> {
        // First try 'magick' command (ImageMagick 7+)
        if Self::check_magick_command() {
            return Ok(Self {
                command_type: MagickCommand::Magick,
            });
        }

        // Then try direct 'convert' command (ImageMagick 6)
        if Self::check_direct_command("convert") {
            return Ok(Self {
                command_type: MagickCommand::Direct,
            });
        }

        // Check if ImageMagick is already downloaded in vendored directory
        if std::env::consts::OS == "windows" {
            let vendored_magick = PathBuf::from("assets/vendored/imagemagick/magick.exe");
            if vendored_magick.exists() {
                return Ok(Self {
                    command_type: MagickCommand::Downloaded(vendored_magick),
                });
            }
        }

        // On Windows, attempt to download ImageMagick
        if std::env::consts::OS == "windows" {
            let path = Self::download_imagemagick().context("Failed to download ImageMagick")?;
            return Ok(Self {
                command_type: MagickCommand::Downloaded(path),
            });
        }

        bail!("ImageMagick not found. Please install ImageMagick ('magick' or 'convert' command)")
    }

    fn get_command(&self, subcommand: &str) -> Result<Command> {
        match &self.command_type {
            MagickCommand::Magick => {
                let mut cmd = Command::new("magick");
                if subcommand != "convert" {
                    cmd.arg(subcommand);
                }
                Ok(cmd)
            }
            MagickCommand::Direct => Ok(Command::new(subcommand)),
            MagickCommand::Downloaded(path) => {
                let mut cmd = Command::new(path);
                if subcommand != "convert" {
                    cmd.arg(subcommand);
                }
                Ok(cmd)
            }
        }
    }

    fn check_magick_command() -> bool {
        Command::new("magick")
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    }

    fn check_direct_command(subcommand: &str) -> bool {
        Command::new(subcommand)
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    }

    fn download_imagemagick() -> Result<PathBuf> {
        // Use persistent vendored directory
        let vendored_dir = PathBuf::from("assets/vendored/imagemagick");
        let magick_exe = vendored_dir.join("magick.exe");
        let url =
            "https://imagemagick.org/archive/binaries/ImageMagick-7.1.2-2-portable-Q8-x64.zip";

        // Create vendored directory
        fs::create_dir_all(&vendored_dir).context("Failed to create vendored directory")?;

        let response = attohttpc::get(url)
            .send()
            .context("Failed to download ImageMagick")?;

        if !response.status().is_success() {
            bail!("Failed to download ImageMagick: HTTP {}", response.status());
        }

        let data = response.bytes().context("Failed to read response body")?;

        // Extract directly to vendored directory
        let archive =
            rawzip::ZipArchive::from_slice(&data).context("Failed to parse zip archive")?;

        let mut entries = archive.entries();
        while let Some(entry) = entries.next_entry()? {
            if entry.is_dir() {
                continue;
            }

            let wayfinder = entry.wayfinder();
            let zip_entry = archive
                .get_entry(wayfinder)
                .context("Failed to get zip entry")?;
            let Ok(entry_file_path) = entry.file_path().try_normalize() else {
                continue;
            };
            let entry_file_name = entry_file_path.as_str().split("/").last().unwrap();
            let extract_path = vendored_dir.join(entry_file_name);
            let mut output_file =
                fs::File::create(&extract_path).context("Failed to create extracted file")?;

            match entry.compression_method() {
                rawzip::CompressionMethod::Store => {
                    output_file
                        .write_all(&zip_entry.data())
                        .context("Failed to write extracted file")?;
                }
                rawzip::CompressionMethod::Deflate => {
                    let decoder = flate2::read::DeflateDecoder::new(zip_entry.data());
                    let mut reader = zip_entry.verifying_reader(decoder);
                    std::io::copy(&mut reader, &mut output_file)
                        .context("Failed to extract file")?;
                }
                _ => {
                    bail!("Unsupported compression method in zip entry");
                }
            }
        }

        ensure!(
            magick_exe.exists(),
            "Extracted ImageMagick executable not found"
        );

        println!("ImageMagick downloaded to: {}", magick_exe.display());
        Ok(magick_exe)
    }
}

impl ImageProcessor for ImageMagickProcessor {
    fn convert(&self, request: ConvertRequest) -> Result<()> {
        let mut cmd = self.get_command("convert")?;
        cmd.arg(&request.input_path);

        // Always strip metadata/profiles for web assets
        cmd.arg("-strip");

        // Apply operation if present
        if let Some(operation) = &request.operation {
            match operation {
                ImageOperation::Resize(geometry) => {
                    cmd.arg("-resize");
                    cmd.arg(format!("{}x{}", geometry.width, geometry.height));
                }
                ImageOperation::Crop(crop) => {
                    cmd.arg("-crop");
                    cmd.arg(format!(
                        "{}x{}+{}+{}",
                        crop.width, crop.height, crop.x_offset, crop.y_offset
                    ));
                }
                ImageOperation::Tile(tile) => {
                    cmd.arg("-crop");
                    cmd.arg(format!("{}x{}@", tile.columns, tile.rows));
                    cmd.arg("-scene");
                    cmd.arg("1");
                }
            }
        }

        // Apply output format settings
        match &request.format {
            OutputFormat::Webp { quality } => match quality {
                WebpQuality::Lossless => {
                    cmd.arg("-define");
                    cmd.arg("webp:lossless=true");
                }
                WebpQuality::Quality(q) => {
                    cmd.arg("-quality");
                    cmd.arg(q.to_string());
                }
            },
            OutputFormat::Png => {
                // PNG doesn't need special args for basic conversion
            }
        }

        cmd.arg(&request.output_path);

        let output = cmd.output()?;
        if !output.status.success() {
            return Err(ImageError::ImageMagickFailed {
                command: "convert".to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            }
            .into());
        }

        Ok(())
    }

    fn montage(&self, request: MontageRequest<'_>) -> Result<()> {
        // Create JSON index file
        self.create_montage_index(&request)?;

        // Calculate auto-square tile layout
        let tile_spec = self.calculate_auto_square_layout(request.images.len());

        // Use response file to avoid command line length limits on Windows
        let response_path = request.output_path.with_extension("txt");
        self.create_response_file(request.images, &response_path)?;

        let mut cmd = self.get_command("montage")?;

        // Always auto-orient images for web assets
        cmd.arg("-auto-orient");

        // Add additional arguments
        cmd.args(&request.additional_args);

        // Montage mode and layout
        cmd.arg("-mode");
        cmd.arg("concatenate");
        cmd.arg("-tile");
        cmd.arg(&tile_spec);

        // Geometry if specified
        if let Some(geometry) = &request.geometry {
            cmd.arg("-geometry");
            cmd.arg(format!("{}x{}", geometry.width, geometry.height));
        }

        // Background color
        if let Some(color) = &request.background {
            cmd.arg("-background");
            cmd.arg(color_to_string(color));
        }

        // Output format settings
        match &request.format {
            OutputFormat::Webp { quality } => match quality {
                WebpQuality::Lossless => {
                    cmd.arg("-define");
                    cmd.arg("webp:lossless=true");
                }
                WebpQuality::Quality(q) => {
                    cmd.arg("-quality");
                    cmd.arg(q.to_string());
                }
            },
            OutputFormat::Png => {
                // PNG doesn't need special args
            }
        }

        // Input files from response file
        cmd.arg(format!("@{}", response_path.display()));
        cmd.arg(&request.output_path);

        let output = cmd.output()?;

        // Clean up response file
        let _ = fs::remove_file(&response_path);

        if !output.status.success() {
            return Err(ImageError::ImageMagickFailed {
                command: "montage".to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            }
            .into());
        }

        Ok(())
    }
}

impl ImageMagickProcessor {
    fn create_montage_index(&self, request: &MontageRequest<'_>) -> Result<()> {
        let json_path = request.output_path.with_extension("json");
        let data_file = fs::File::create(json_path)?;
        let mut json = BufWriter::new(data_file);
        json.write_all(b"{\n")?;

        for (i, (key, _)) in request.images.iter().enumerate() {
            if i != 0 {
                json.write_all(b",")?;
            }
            write!(json, "\"{}\":{}", key, i)?;
        }

        json.write_all(b"\n}")?;
        json.flush()?;
        Ok(())
    }

    fn calculate_auto_square_layout(&self, image_count: usize) -> String {
        let cols = (image_count as f64).sqrt().ceil() as u32;
        format!("{}x", cols)
    }

    fn create_response_file(
        &self,
        images: &[(String, PathBuf)],
        response_path: &PathBuf,
    ) -> Result<()> {
        let response_file = fs::File::create(response_path)?;
        let mut response_writer = BufWriter::new(response_file);

        for (_, path) in images {
            write!(response_writer, "'{}' ", path.display())?;
        }
        response_writer.flush()?;
        Ok(())
    }
}

fn color_to_string(color: &Color) -> String {
    match color {
        Color::Rgb(r, g, b) => format!("rgb({},{},{})", r, g, b),
        Color::Transparent => "transparent".to_string(),
        Color::White => "white".to_string(),
        Color::Black => "black".to_string(),
    }
}
