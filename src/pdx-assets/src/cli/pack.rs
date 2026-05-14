use anyhow::{Context, Result};
use clap::Args;
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use walkdir::WalkDir;

/// Pack a directory into a STORE zip archive without compression.
#[derive(Args, Debug)]
pub struct PackArgs {
    /// Source directory to pack
    #[clap(value_parser)]
    source_dir: PathBuf,

    /// Output zip path
    #[clap(value_parser)]
    output_zip: PathBuf,
}

impl PackArgs {
    pub fn run(&self) -> Result<ExitCode> {
        if !self.source_dir.is_dir() {
            anyhow::bail!(
                "Source path is not a directory: {}",
                self.source_dir.display()
            );
        }

        if let Some(parent) = self.output_zip.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create output directory {}", parent.display())
            })?;
        }

        let output = fs::File::create(&self.output_zip).with_context(|| {
            format!("Failed to create output zip {}", self.output_zip.display())
        })?;
        let writer = BufWriter::new(output);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);

        let mut files = Vec::new();
        for entry in WalkDir::new(&self.source_dir) {
            let entry = entry?;
            if entry.file_type().is_file() {
                files.push(entry.into_path());
            }
        }
        files.sort();

        let mut files_added = 0u64;
        let mut total_bytes = 0u64;

        for file_path in files {
            let archive_path = relative_zip_path(&self.source_dir, &file_path)?;
            let mut input = fs::File::open(&file_path)
                .with_context(|| format!("Failed to open {}", file_path.display()))?;

            let (mut out_file, config) = archive
                .new_file(&archive_path)
                .compression_method(rawzip::CompressionMethod::Store)
                .start()?;
            let mut zip_writer = config.wrap(&mut out_file);
            let bytes = std::io::copy(&mut input, &mut zip_writer)?;
            let (_, output) = zip_writer.finish()?;
            out_file.finish(output)?;

            files_added += 1;
            total_bytes += bytes;
        }

        archive.finish()?;

        println!("Files added: {}", files_added);
        println!("Bytes written: {}", total_bytes);

        Ok(ExitCode::SUCCESS)
    }
}

fn relative_zip_path(source_dir: &Path, file_path: &Path) -> Result<String> {
    let relative = file_path.strip_prefix(source_dir)?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}
