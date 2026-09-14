use super::{
    Color, ConvertRequest, Geometry, ImageOperation, ImageProcessor, MontageRequest, MontageSizing,
    OutputFormat, ScaleFilter, WebpQuality,
};
use anyhow::{Context, Result, bail, ensure};
use image::{
    DynamicImage, ImageDecoder, ImageFormat, ImageReader, Rgba, RgbaImage,
    imageops::{self, FilterType},
    metadata::Orientation,
};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Default)]
pub struct RustImageProcessor;

impl RustImageProcessor {
    pub fn create() -> Result<Self> {
        image_extras::register();
        Ok(Self)
    }

    fn load_image(path: &Path, apply_orientation: bool) -> Result<DynamicImage> {
        let reader = ImageReader::open(path)
            .with_context(|| format!("unable to open image: {}", path.display()))?;
        let mut decoder = reader
            .into_decoder()
            .with_context(|| format!("unable to decode image: {}", path.display()))?;
        let orientation = if apply_orientation {
            decoder
                .orientation()
                .with_context(|| format!("unable to read image orientation: {}", path.display()))?
        } else {
            Orientation::NoTransforms
        };
        let mut image = DynamicImage::from_decoder(decoder)
            .with_context(|| format!("unable to read image: {}", path.display()))?;
        image.apply_orientation(orientation);
        Ok(image)
    }

    fn save_image(image: &DynamicImage, path: &Path, format: &OutputFormat) -> Result<()> {
        match format {
            OutputFormat::Webp { quality } => {
                let rgba = image.to_rgba8();
                let encoded = encode_webp(&rgba, quality)?;
                fs::write(path, encoded)
                    .with_context(|| format!("unable to write WebP: {}", path.display()))?;
            }
            OutputFormat::Png => image
                .save_with_format(path, ImageFormat::Png)
                .with_context(|| format!("unable to write PNG: {}", path.display()))?,
            OutputFormat::Raw => fs::write(path, image.to_rgba8().into_raw())
                .with_context(|| format!("unable to write raw image: {}", path.display()))?,
        }
        Ok(())
    }

    fn save_tiled_image(
        image: &DynamicImage,
        output_path: &Path,
        format: &OutputFormat,
        tile: &super::TileGeometry,
    ) -> Result<()> {
        ensure!(tile.columns > 0, "tile columns must be greater than zero");
        ensure!(tile.rows > 0, "tile rows must be greater than zero");

        let width = image.width();
        let height = image.height();
        let mut scene = 1u32;

        for row in 0..tile.rows {
            let y_start = split_boundary(height, tile.rows, row);
            let y_end = split_boundary(height, tile.rows, row + 1);
            for column in 0..tile.columns {
                let x_start = split_boundary(width, tile.columns, column);
                let x_end = split_boundary(width, tile.columns, column + 1);
                ensure!(x_end > x_start, "tile width is too small for tile columns");
                ensure!(y_end > y_start, "tile height is too small for tile rows");

                let tile_image = image.crop_imm(x_start, y_start, x_end - x_start, y_end - y_start);
                let path = numbered_path(output_path, scene)?;
                Self::save_image(&tile_image, &path, format)?;
                scene += 1;
            }
        }

        Ok(())
    }

    fn create_montage_index(request: &MontageRequest<'_>) -> Result<()> {
        let json_path = request.output_path.with_extension("json");
        let mut data = String::from("{\n");
        for (position, (key, _)) in request.images.iter().enumerate() {
            if position > 0 {
                data.push(',');
            }
            data.push_str(&serde_json::to_string(key)?);
            data.push(':');
            data.push_str(&position.to_string());
        }
        data.push_str("\n}");
        fs::write(&json_path, data)
            .with_context(|| format!("unable to write montage index: {}", json_path.display()))?;
        Ok(())
    }

    fn montage_background(background: Option<&Color>) -> Rgba<u8> {
        match background {
            Some(Color::Rgb(red, green, blue)) => Rgba([*red, *green, *blue, 255]),
            None => Rgba([255, 255, 255, 255]),
            Some(Color::Transparent) => Rgba([0, 0, 0, 0]),
            Some(Color::White) => Rgba([255, 255, 255, 255]),
            Some(Color::Black) => Rgba([0, 0, 0, 255]),
        }
    }

    fn alpha_off(additional_args: &[String]) -> Result<bool> {
        let mut alpha_off = false;
        let mut args = additional_args.iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "-alpha" => match args.next().map(String::as_str) {
                    Some(value) if value.eq_ignore_ascii_case("off") => alpha_off = true,
                    Some(value) => bail!("unsupported alpha setting: {value}"),
                    None => bail!("missing value for -alpha"),
                },
                _ => bail!("unsupported montage argument: {arg}"),
            }
        }
        Ok(alpha_off)
    }

    fn load_montage_images(
        request: &MontageRequest<'_>,
        alpha_off: bool,
    ) -> Result<Vec<RgbaImage>> {
        request
            .images
            .iter()
            .map(|(_, path)| {
                let mut image = Self::load_image(path, true)?.to_rgba8();
                if alpha_off {
                    for pixel in image.pixels_mut() {
                        pixel[3] = 255;
                    }
                }
                Ok(image)
            })
            .collect()
    }

    fn native_montage(images: &[RgbaImage], background: Rgba<u8>) -> Result<RgbaImage> {
        let columns = (images.len() as f64).sqrt().ceil() as usize;
        ensure!(columns > 0, "montage requires at least one image");

        let rows = images.len().div_ceil(columns);
        let mut row_widths = vec![0u32; rows];
        let mut row_heights = vec![0u32; rows];
        for (position, image) in images.iter().enumerate() {
            let row = position / columns;
            row_widths[row] = row_widths[row]
                .checked_add(image.width())
                .context("montage width overflow")?;
            row_heights[row] = row_heights[row].max(image.height());
        }

        let width = row_widths.into_iter().max().unwrap_or(0);
        let height = row_heights.iter().try_fold(0u32, |total, row_height| {
            total
                .checked_add(*row_height)
                .context("montage height overflow")
        })?;
        let mut output = RgbaImage::from_pixel(width, height, background);

        let mut y = 0u32;
        for (row, row_height) in row_heights.iter().enumerate() {
            let mut x = 0u32;
            for image in images.iter().skip(row * columns).take(columns) {
                imageops::overlay(&mut output, image, i64::from(x), i64::from(y));
                x = x
                    .checked_add(image.width())
                    .context("montage width overflow")?;
            }
            y = y
                .checked_add(*row_height)
                .context("montage height overflow")?;
        }

        Ok(output)
    }

    fn scaled_montage(
        images: &[RgbaImage],
        size: &Geometry,
        filter: ScaleFilter,
        background: Rgba<u8>,
        allow_upscale: bool,
    ) -> Result<RgbaImage> {
        ensure!(size.width > 0, "montage width must be greater than zero");
        ensure!(size.height > 0, "montage height must be greater than zero");

        let columns = (images.len() as f64).sqrt().ceil() as u32;
        let rows = (images.len() as u32).div_ceil(columns);
        let width = columns
            .checked_mul(size.width)
            .context("montage width overflow")?;
        let height = rows
            .checked_mul(size.height)
            .context("montage height overflow")?;
        let mut output = RgbaImage::from_pixel(width, height, background);

        for (position, image) in images.iter().enumerate() {
            let resized =
                if !allow_upscale && image.width() <= size.width && image.height() <= size.height {
                    image.clone()
                } else {
                    DynamicImage::ImageRgba8(image.clone())
                        .resize(size.width, size.height, filter.filter_type())
                        .to_rgba8()
                };
            let column = position as u32 % columns;
            let row = position as u32 / columns;
            imageops::overlay(
                &mut output,
                &resized,
                i64::from(column * size.width),
                i64::from(row * size.height),
            );
        }

        Ok(output)
    }
}

impl ImageProcessor for RustImageProcessor {
    fn convert(&self, request: ConvertRequest) -> Result<()> {
        let image = Self::load_image(&request.input_path, false)?;
        match request.operation {
            Some(ImageOperation::Tile(tile)) => {
                Self::save_tiled_image(&image, &request.output_path, &request.format, &tile)
            }
            Some(ImageOperation::Resize(geometry)) => {
                ensure!(geometry.width > 0, "resize width must be greater than zero");
                ensure!(
                    geometry.height > 0,
                    "resize height must be greater than zero"
                );
                let image = image.resize(geometry.width, geometry.height, FilterType::Lanczos3);
                Self::save_image(&image, &request.output_path, &request.format)
            }
            Some(ImageOperation::Crop(crop)) => {
                ensure!(crop.width > 0, "crop width must be greater than zero");
                ensure!(crop.height > 0, "crop height must be greater than zero");
                ensure!(
                    crop.x_offset <= image.width()
                        && crop.y_offset <= image.height()
                        && crop.width <= image.width() - crop.x_offset
                        && crop.height <= image.height() - crop.y_offset,
                    "crop is outside image bounds"
                );
                let image = image.crop_imm(crop.x_offset, crop.y_offset, crop.width, crop.height);
                Self::save_image(&image, &request.output_path, &request.format)
            }
            None => Self::save_image(&image, &request.output_path, &request.format),
        }
    }

    fn montage(&self, request: MontageRequest<'_>) -> Result<()> {
        ensure!(
            !request.images.is_empty(),
            "montage requires at least one image"
        );
        Self::create_montage_index(&request)?;
        let alpha_off = Self::alpha_off(&request.additional_args)?;
        let images = Self::load_montage_images(&request, alpha_off)?;
        let background = Self::montage_background(request.background.as_ref());

        match &request.sizing {
            MontageSizing::Native => {
                let image = Self::native_montage(&images, background)?;
                Self::save_image(
                    &DynamicImage::ImageRgba8(image),
                    &request.output_path,
                    &request.format,
                )
            }
            MontageSizing::Scaled { sizes, filter } => {
                Self::write_scaled_montages(&images, sizes, *filter, background, true, &request)
            }
            MontageSizing::ScaledDown { sizes, filter } => {
                Self::write_scaled_montages(&images, sizes, *filter, background, false, &request)
            }
        }
    }
}

impl RustImageProcessor {
    fn write_scaled_montages(
        images: &[RgbaImage],
        sizes: &[Geometry],
        filter: ScaleFilter,
        background: Rgba<u8>,
        allow_upscale: bool,
        request: &MontageRequest<'_>,
    ) -> Result<()> {
        ensure!(
            !sizes.is_empty(),
            "montage scaling requires at least one size"
        );
        let add_suffix = sizes.len() > 1;
        for size in sizes {
            let image = Self::scaled_montage(images, size, filter, background, allow_upscale)?;
            let output_path = if add_suffix {
                sized_output_path(&request.output_path, size.width)?
            } else {
                request.output_path.clone()
            };
            Self::save_image(
                &DynamicImage::ImageRgba8(image),
                &output_path,
                &request.format,
            )?;
        }
        Ok(())
    }
}

impl ScaleFilter {
    fn filter_type(self) -> FilterType {
        match self {
            ScaleFilter::Point => FilterType::Nearest,
            ScaleFilter::Lanczos => FilterType::Lanczos3,
        }
    }
}

fn split_boundary(total: u32, parts: u32, position: u32) -> u32 {
    ((u64::from(position) * u64::from(total) + u64::from(parts / 2)) / u64::from(parts)) as u32
}

fn numbered_path(path: &Path, scene: u32) -> Result<PathBuf> {
    let path = path.to_string_lossy();
    ensure!(path.contains("%d"), "tiled output path must contain %d");
    Ok(PathBuf::from(path.replace("%d", &scene.to_string())))
}

fn sized_output_path(path: &Path, width: u32) -> Result<PathBuf> {
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .context("montage output path has no valid file stem")?;
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .context("montage output path has no valid extension")?;
    Ok(path.with_file_name(format!("{stem}_x{width}.{extension}")))
}

fn encode_webp(image: &RgbaImage, quality: &WebpQuality) -> Result<Vec<u8>> {
    let encoder = webp::Encoder::from_rgba(image.as_raw(), image.width(), image.height());

    let encoded = match quality {
        WebpQuality::Lossless => encoder
            .encode_simple(true, 75.0)
            .map_err(|error| anyhow::anyhow!("unable to encode lossless WebP: {error:?}"))?,
        WebpQuality::Quality(quality) => {
            ensure!(*quality <= 100, "WebP quality must be between 0 and 100");
            let mut config = webp::WebPConfig::new()
                .map_err(|_| anyhow::anyhow!("unable to create WebP config"))?;
            config.quality = f32::from(*quality);
            config.filter_strength = 0;
            config.use_sharp_yuv = 1;
            encoder
                .encode_advanced(&config)
                .map_err(|error| anyhow::anyhow!("unable to encode lossy WebP: {error:?}"))?
        }
    };

    Ok(encoded.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_source(path: &Path, width: u32, height: u32, color: Rgba<u8>) -> Result<()> {
        RgbaImage::from_pixel(width, height, color).save(path)?;
        Ok(())
    }

    #[test]
    fn scaled_montage_resizes_and_pads_images() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let first = temp.path().join("first.png");
        let second = temp.path().join("second.png");
        write_source(&first, 10, 20, Rgba([255, 0, 0, 255]))?;
        write_source(&second, 20, 10, Rgba([0, 0, 255, 255]))?;

        let output = temp.path().join("montage.png");
        RustImageProcessor::create()?.montage(MontageRequest {
            images: &[
                (String::from("first"), first),
                (String::from("second"), second),
            ],
            output_path: output.clone(),
            format: OutputFormat::Png,
            sizing: MontageSizing::Scaled {
                sizes: vec![Geometry::new(8, 8)],
                filter: ScaleFilter::Point,
            },
            background: Some(Color::Rgb(0, 255, 0)),
            additional_args: vec![],
        })?;

        let image = image::open(output)?.to_rgba8();
        assert_eq!((image.width(), image.height()), (16, 8));
        assert_eq!(*image.get_pixel(0, 0), Rgba([255, 0, 0, 255]));
        assert_eq!(*image.get_pixel(4, 0), Rgba([0, 255, 0, 255]));
        assert_eq!(*image.get_pixel(8, 0), Rgba([0, 0, 255, 255]));
        assert_eq!(*image.get_pixel(8, 4), Rgba([0, 255, 0, 255]));
        let index: serde_json::Value =
            serde_json::from_slice(&fs::read(temp.path().join("montage.json"))?)?;
        assert_eq!(index["first"], 0);
        assert_eq!(index["second"], 1);
        Ok(())
    }

    #[test]
    fn tile_uses_one_based_scene_numbers() -> Result<()> {
        let temp = tempfile::tempdir()?;
        let source = temp.path().join("source.png");
        write_source(&source, 10, 5, Rgba([255, 0, 0, 255]))?;
        let output = temp.path().join("tile-%d.png");

        RustImageProcessor::create()?.convert(ConvertRequest {
            input_path: source,
            output_path: output,
            format: OutputFormat::Png,
            operation: Some(ImageOperation::Tile(super::super::TileGeometry::new(3, 2))),
        })?;

        assert_eq!(
            image::image_dimensions(temp.path().join("tile-1.png"))?,
            (3, 3)
        );
        assert_eq!(
            image::image_dimensions(temp.path().join("tile-2.png"))?,
            (4, 3)
        );
        assert_eq!(
            image::image_dimensions(temp.path().join("tile-6.png"))?,
            (3, 2)
        );
        Ok(())
    }
}
