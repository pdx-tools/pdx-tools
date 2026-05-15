use anyhow::Context;
use clap::Args;
use std::{path::PathBuf, process::ExitCode};
use walkdir::WalkDir;

/// Regenerate EU4 OG preview images from local save files
#[derive(Args)]
pub struct OgArgs {
    /// Directory to write preview images into (defaults to previews/ next to each save)
    #[arg(long)]
    out_dir: Option<PathBuf>,

    /// Overwrite existing preview images
    #[arg(long)]
    force: bool,

    /// Files and directories to process
    #[arg(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl OgArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .build()
            .context("failed to build tokio runtime")?;
        rt.block_on(self.run_async())
    }

    async fn run_async(&self) -> anyhow::Result<ExitCode> {
        let gpu = pdx_screenshot::eu4::GpuContext::new()
            .await
            .context("failed to initialize GPU context")?;

        let save_files: Vec<_> = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file())
            .filter(|e| e.path().extension().is_none())
            .collect();

        let mut ok = 0usize;
        let mut skipped = 0usize;
        let mut failed = 0usize;

        for entry in save_files {
            let path = entry.path();

            let Some(save_id) = path.file_name().and_then(|x| x.to_str()) else {
                tracing::warn!("bad file name: {}", path.display());
                failed += 1;
                continue;
            };

            let out_name = format!("{save_id}.webp");
            let out_path = match &self.out_dir {
                Some(dir) => dir.join(&out_name),
                None => path
                    .parent()
                    .unwrap_or(path)
                    .join("previews")
                    .join(&out_name),
            };

            if out_path.exists() && !self.force {
                tracing::info!(save_id, "skipping existing preview");
                skipped += 1;
                continue;
            }

            let data = std::fs::read(path)
                .with_context(|| format!("failed to read {}", path.display()))?;

            match pdx_screenshot::eu4::render(&gpu, &data).await {
                Ok(webp) => {
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent)
                            .with_context(|| format!("failed to create {}", parent.display()))?;
                    }
                    std::fs::write(&out_path, &webp)
                        .with_context(|| format!("failed to write {}", out_path.display()))?;
                    tracing::info!(save_id, bytes = webp.len(), "wrote preview");
                    ok += 1;
                }
                Err(e) => {
                    tracing::warn!(save_id, error = %e, "failed to render preview");
                    failed += 1;
                }
            }
        }

        println!("done: {ok} rendered, {skipped} skipped, {failed} failed");
        Ok(if failed > 0 {
            ExitCode::FAILURE
        } else {
            ExitCode::SUCCESS
        })
    }
}
