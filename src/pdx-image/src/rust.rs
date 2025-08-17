use crate::{ConvertOptions, ImageBackend, MontageOptions, WebpQuality};
use anyhow::{bail, Context, Result};
use image::{DynamicImage, ImageBuffer, Rgba, RgbaImage};
use std::{ops::Deref, path::Path};

pub struct RustImageBackend;

impl RustImageBackend {
    pub fn new() -> Self {
        Self
    }

    fn load_image<P: AsRef<Path>>(path: P) -> Result<DynamicImage> {
        let path = path.as_ref();
        image::open(path).with_context(|| format!("Failed to load image: {}", path.display()))
    }

    fn apply_background(img: &mut RgbaImage, color: (u8, u8, u8)) {
        for pixel in img.pixels_mut() {
            let alpha = pixel[3] as f32 / 255.0;
            let inv_alpha = 1.0 - alpha;
            
            pixel[0] = ((pixel[0] as f32 * alpha) + (color.0 as f32 * inv_alpha)) as u8;
            pixel[1] = ((pixel[1] as f32 * alpha) + (color.1 as f32 * inv_alpha)) as u8;
            pixel[2] = ((pixel[2] as f32 * alpha) + (color.2 as f32 * inv_alpha)) as u8;
            pixel[3] = 255; // Fully opaque after background application
        }
    }

    fn remove_alpha(img: &mut RgbaImage) {
        for pixel in img.pixels_mut() {
            pixel[3] = 255;
        }
    }

    fn encode_webp(img: &RgbaImage, quality: &WebpQuality) -> Result<webp::WebPMemory> {
        let encoder = webp::Encoder::from_rgba(img.as_raw(), img.width(), img.height());
        
        let encoded = match quality {
            WebpQuality::Lossless => encoder.encode_lossless(),
            WebpQuality::Quality(q) => encoder.encode(*q as f32),
        };

        Ok(encoded)
    }

    fn calculate_grid_layout(num_images: usize, cols: u32) -> (u32, u32) {
        let cols = if cols == 0 {
            (num_images as f64).sqrt().ceil() as u32
        } else {
            cols
        };
        let rows = ((num_images as f64) / (cols as f64)).ceil() as u32;
        (cols, rows)
    }

}

impl ImageBackend for RustImageBackend {
    fn convert_image<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        input: P,
        output: Q,
        options: &ConvertOptions,
    ) -> Result<()> {
        let mut img = Self::load_image(input)?;

        // Apply crop if specified
        if let Some(crop) = &options.crop {
            img = img.crop_imm(crop.x, crop.y, crop.width, crop.height);
        }

        // Convert to RGBA for processing
        let mut rgba_img = img.to_rgba8();

        // Apply background color if specified
        if let Some(bg_color) = options.background_color {
            Self::apply_background(&mut rgba_img, bg_color);
        }

        // Remove alpha channel if requested
        if options.alpha_off {
            Self::remove_alpha(&mut rgba_img);
        }

        // Encode as WebP
        let webp_data = Self::encode_webp(&rgba_img, &options.webp_quality)?;

        // Write to file
        std::fs::write(output, webp_data.deref())
            .with_context(|| "Failed to write WebP file")?;

        Ok(())
    }

    fn create_montage<P: AsRef<Path>, Q: AsRef<Path>>(
        &self,
        images: &[(String, P)],
        output: Q,
        options: &MontageOptions,
    ) -> Result<()> {
        if images.is_empty() {
            bail!("No images provided for montage");
        }

        // Load all images and determine tile size
        let mut loaded_images = Vec::new();
        let (tile_width, tile_height) = if let Some(geometry) = &options.tile_geometry {
            (geometry.width, geometry.height)
        } else {
            // Determine maximum dimensions from all images
            let mut max_w = 0u32;
            let mut max_h = 0u32;
            for (_, path) in images {
                let img = Self::load_image(path)?;
                max_w = max_w.max(img.width());
                max_h = max_h.max(img.height());
            }
            (max_w, max_h)
        };

        for (name, path) in images {
            let img = Self::load_image(path)?;
            let rgba_img = img.to_rgba8();
            loaded_images.push((name.clone(), rgba_img));
        }

        // Calculate grid layout
        let (cols, rows) = Self::calculate_grid_layout(images.len(), options.grid_cols);

        // Create output image
        let output_width = cols * tile_width;
        let output_height = rows * tile_height;

        let background_color = if options.background_transparent {
            Rgba([0, 0, 0, 0]) // Transparent
        } else if let Some(bg) = options.background_color {
            Rgba([bg.0, bg.1, bg.2, 255])
        } else {
            Rgba([255, 255, 255, 255]) // White background
        };

        let mut output_img = ImageBuffer::from_pixel(output_width, output_height, background_color);

        // Place images in grid
        for (i, (_, img)) in loaded_images.iter().enumerate() {
            let col = (i as u32) % cols;
            let row = (i as u32) / cols;
            
            // Calculate tile position
            let tile_x = col * tile_width;
            let tile_y = row * tile_height;

            // Anchor image to bottom-right corner of the tile
            let offset_x = if img.width() <= tile_width {
                tile_width - img.width()
            } else {
                0 // If image is larger than tile, place at tile origin
            };
            let offset_y = if img.height() <= tile_height {
                tile_height - img.height()
            } else {
                0 // If image is larger than tile, place at tile origin
            };

            let final_x = tile_x + offset_x;
            let final_y = tile_y + offset_y;

            image::imageops::overlay(&mut output_img, img, final_x as i64, final_y as i64);
        }

        // Apply alpha off if requested
        if options.alpha_off {
            Self::remove_alpha(&mut output_img);
        }

        // Apply background if not transparent and no explicit background color was set
        if !options.background_transparent && options.background_color.is_none() {
            // Default to white background by removing alpha
            for pixel in output_img.pixels_mut() {
                if pixel[3] < 255 {
                    Self::apply_background(&mut output_img, (255, 255, 255));
                    break;
                }
            }
        }

        // Encode as WebP
        let webp_data = Self::encode_webp(&output_img, &options.webp_quality)?;

        // Write to file
        std::fs::write(output, webp_data.deref())
            .with_context(|| "Failed to write montage WebP file")?;

        Ok(())
    }
}