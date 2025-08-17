use std::{
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use anyhow::Result;
use pdx_image::{ImageBackend, MontageOptions, TileGeometry, WebpQuality as BackendWebpQuality};

pub enum WebpQuality {
    #[allow(dead_code)]
    Lossless,
    Quality(i32),
}

pub enum Encoding {
    Webp(WebpQuality),
}

impl From<&WebpQuality> for BackendWebpQuality {
    fn from(quality: &WebpQuality) -> Self {
        match quality {
            WebpQuality::Lossless => BackendWebpQuality::Lossless,
            WebpQuality::Quality(q) => BackendWebpQuality::Quality(*q as u8),
        }
    }
}

pub struct Montager {
    pub name: &'static str,
    pub base_path: PathBuf,
    pub encoding: Encoding,
    pub background_transparent: bool,
    pub auto_orient: bool,
    pub alpha_off: bool,
    pub sizes: &'static [&'static str],
}

impl Montager {
    pub fn montage<KEY, PATH, B>(&self, data: &[(KEY, PATH)], backend: &B) -> Result<()>
    where
        KEY: AsRef<str>,
        PATH: AsRef<Path>,
        B: ImageBackend,
    {
        let json_path = self.base_path.join(format!("{}.json", self.name));
        let data_file = std::fs::File::create(json_path)?;
        let mut json = BufWriter::new(data_file);
        json.write_all(&b"{\n"[..])?;

        for (i, (key, _)) in data.iter().enumerate() {
            if i != 0 {
                json.write_all(&b","[..])?;
            }

            write!(json, "\"{}\":{}", key.as_ref(), i)?;
        }

        json.write_all(&b"\n}"[..])?;
        json.flush()?;

        if self.sizes.is_empty() {
            self.create_montage_with_backend(data, &[""], backend)?;
        } else {
            self.create_montage_with_backend(data, self.sizes, backend)?;
        };

        Ok(())
    }

    fn create_montage_with_backend<KEY, PATH, B>(
        &self,
        data: &[(KEY, PATH)],
        sizes: &[&str],
        backend: &B,
    ) -> Result<()>
    where
        KEY: AsRef<str>,
        PATH: AsRef<Path>,
        B: ImageBackend,
    {
        for size in sizes {
            let webp_quality = match &self.encoding {
                Encoding::Webp(quality) => quality.into(),
            };

            let background_color = if self.background_transparent {
                None
            } else {
                Some((255, 255, 255)) // Default to white background
            };

            let tile_geometry = if size.is_empty() {
                None
            } else {
                // Parse size string like "64x64" or "48x48"
                if let Some(x_pos) = size.find('x') {
                    let width: u32 = size[..x_pos].parse().map_err(|_| {
                        anyhow::anyhow!("Invalid width in size: {}", size)
                    })?;
                    let height: u32 = size[x_pos + 1..].parse().map_err(|_| {
                        anyhow::anyhow!("Invalid height in size: {}", size)
                    })?;
                    Some(TileGeometry { width, height })
                } else {
                    return Err(anyhow::anyhow!("Invalid size format: {}, expected WIDTHxHEIGHT", size));
                }
            };

            let options = MontageOptions {
                grid_cols: 0, // auto-calculate
                tile_geometry,
                webp_quality,
                background_color,
                background_transparent: self.background_transparent,
                auto_orient: self.auto_orient,
                alpha_off: self.alpha_off,
            };

            // Convert data to the format expected by backend
            let image_data: Vec<(String, &Path)> = data
                .iter()
                .map(|(key, path)| (key.as_ref().to_string(), path.as_ref()))
                .collect();

            let img_path = if size.is_empty() {
                self.base_path.join(format!("{}.webp", self.name))
            } else {
                let size_filename = size.find('x').map(|i| &size[i..]).unwrap_or(size);
                self.base_path
                    .join(format!("{}_{}.webp", self.name, size_filename))
            };

            backend.create_montage(&image_data, &img_path, &options)?;
        }
        Ok(())
    }
}
