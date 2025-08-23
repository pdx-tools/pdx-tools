use anyhow::{Context, Result};
use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct BundleStatistics {
    pub files_added: u32,
    pub total_uncompressed_size: u64,
    pub total_compressed_size: u64,
}

impl BundleStatistics {
    pub fn compression_ratio(&self) -> Option<f64> {
        if self.total_uncompressed_size > 0 {
            Some((self.total_compressed_size as f64 / self.total_uncompressed_size as f64) * 100.0)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetManifest {
    game_version: String,
    base_path: PathBuf,
    files: HashSet<String>,
}

impl AssetManifest {
    pub fn new(game_version: String, base_path: PathBuf, files: HashSet<String>) -> Self {
        Self {
            game_version,
            base_path,
            files,
        }
    }
}

pub struct AssetBundler {
    manifest: AssetManifest,
    out_file: PathBuf,
}

impl AssetBundler {
    pub fn new(manifest: AssetManifest, out_file: PathBuf) -> Self {
        Self { manifest, out_file }
    }

    pub fn bundle(&self) -> Result<BundleStatistics> {
        if let Some(parent) = self.out_file.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create output directory {}", parent.display())
            })?;
        }

        let output_file = fs::File::create(&self.out_file)
            .with_context(|| format!("Failed to create output file {}", self.out_file.display()))?;
        let buffered_writer = BufWriter::new(output_file);
        let mut zip = rawzip::ZipArchiveWriter::new(buffered_writer);

        // Get all required files from manifest
        let mut required_files = self.manifest.files.iter().collect::<Vec<_>>();
        required_files.sort_unstable();

        let mut files_added = 0;
        let mut total_uncompressed_size = 0u64;
        let mut total_compressed_size = 0u64;

        // Add explicit files
        for file_path in &required_files {
            let source_path = self.manifest.base_path.join(file_path);
            if source_path.exists() && source_path.is_file() {
                let (uncompressed, compressed) =
                    self.add_file_to_zip(&mut zip, &source_path, file_path)?;
                files_added += 1;
                total_uncompressed_size += uncompressed;
                total_compressed_size += compressed;
            } else {
                warn!("File not found: {}", file_path);
            }
        }

        zip.finish()?;

        Ok(BundleStatistics {
            files_added,
            total_uncompressed_size,
            total_compressed_size,
        })
    }

    fn add_file_to_zip<W: Write>(
        &self,
        zip: &mut rawzip::ZipArchiveWriter<W>,
        source_path: &Path,
        archive_path: &str,
    ) -> Result<(u64, u64)> {
        let mut file_content = fs::File::open(source_path)
            .with_context(|| format!("Failed to read file: {}", source_path.display()))?;

        // Determine compression method based on file extension
        let compression_method = if self.should_compress_file(source_path) {
            rawzip::CompressionMethod::Zstd
        } else {
            rawzip::CompressionMethod::Store
        };

        let (mut out_file, config) = zip
            .new_file(archive_path)
            .compression_method(compression_method)
            .start()?;

        if compression_method == rawzip::CompressionMethod::Zstd {
            let encoder = zstd::stream::Encoder::new(&mut out_file, 11)?;
            let mut writer = config.wrap(encoder);
            let uncompressed = std::io::copy(&mut file_content, &mut writer)?;
            let (encoder, output) = writer.finish()?;
            encoder.finish()?;
            let compressed = out_file.finish(output)?;
            Ok((uncompressed, compressed))
        } else {
            let mut writer = config.wrap(&mut out_file);
            let uncompressed = std::io::copy(&mut file_content, &mut writer)?;
            let (_, output) = writer.finish()?;
            let compressed = out_file.finish(output)?;
            Ok((uncompressed, compressed))
        }
    }

    fn should_compress_file(&self, path: &Path) -> bool {
        if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
            !matches!(extension.to_lowercase().as_str(), "jpg" | "jpeg" | "png")
        } else {
            true
        }
    }
}
