use anyhow::Context;
use clap::Args;
use std::{io::Cursor, path::PathBuf, process::ExitCode};
use walkdir::WalkDir;
use zip::CompressionMethod;
use zip_next as zip;

use crate::remote_parse::inflate_file;

/// Re-encode save container format
#[derive(Args)]
pub struct TranscodeArgs {
    #[arg(long)]
    dest: PathBuf,

    /// Files and directories to parse
    #[arg(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl TranscodeArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let files = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file());

        for file in files {
            let path = file.path();
            let file = std::fs::File::open(path)
                .with_context(|| format!("unable to open: {}", path.display()))?;
            let inflated = inflate_file(&file)?;

            let data = if let Ok(mut z) = zip::ZipArchive::new(Cursor::new(&inflated)) {
                let mut inflated_size: u64 = 0;
                let mut is_encoded = true;
                for name in &["meta", "gamestate", "ai"] {
                    let file = z.by_name(name).context("unable to find file in zip")?;
                    inflated_size += file.size();
                    is_encoded &= file.compression() == CompressionMethod::ZSTD;
                }

                if is_encoded {
                    continue;
                }

                let out = Vec::with_capacity(inflated_size as usize);
                let writer = Cursor::new(out);
                let mut out_zip = zip::ZipWriter::new(writer);

                for name in &["meta", "gamestate", "ai"] {
                    let options = zip::write::FileOptions::default()
                        .compression_level(Some(7))
                        .compression_method(zip::CompressionMethod::Zstd);
                    let mut file = z.by_name(name).context("unable to find file in zip")?;
                    out_zip.start_file(String::from(*name), options).unwrap();
                    std::io::copy(&mut file, &mut out_zip)
                        .context("unable to copy between zips")?;
                }

                out_zip.finish().unwrap().into_inner()
            } else if inflated.starts_with(&zstd::zstd_safe::MAGICNUMBER.to_le_bytes()) {
                continue;
            } else {
                zstd::bulk::compress(&inflated, 7).context("zstd failure")?
            };

            let out_path = self.dest.join(path.file_name().unwrap());
            std::fs::write(&out_path, &data)
                .with_context(|| format!("unable to write to {}", out_path.display()))?;
            println!("{} {}/{}", out_path.display(), inflated.len(), data.len());
        }

        Ok(ExitCode::SUCCESS)
    }
}
