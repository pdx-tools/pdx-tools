use crate::asset_compilers::{Eu4AssetCompliler, GameAssetCompiler, PackageOptions};
use crate::create_provider;
use crate::images::imagemagick::ImageMagickProcessor;
use anyhow::{Context, Result};
use clap::Args;
use std::path::PathBuf;
use std::process::ExitCode;

/// Process assets from directory or zip file
#[derive(Args)]
pub struct CompileArgs {
    /// Useful when compiling across multiple game patches and there are a set
    /// of shared assets across all assets. Minimal can signal for the older
    /// patches not to generate the shared assets.
    #[clap(long)]
    minimal: bool,

    /// Path to source (directory or zip file)
    #[clap(value_parser)]
    source_path: PathBuf,

    /// Output directory for processed assets
    #[clap(long, short)]
    output: Option<PathBuf>,
}

impl CompileArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let output = self
            .output
            .clone()
            .unwrap_or_else(|| PathBuf::from("assets/game"));

        // Create output directory if it doesn't exist
        std::fs::create_dir_all(&output)
            .with_context(|| format!("Failed to create output directory: {}", output.display()))?;

        // Auto-detect source type and create appropriate provider
        let provider = create_provider(&self.source_path).with_context(|| {
            format!(
                "Failed to create provider for: {}",
                self.source_path.display()
            )
        })?;

        let asset_compiler = Eu4AssetCompliler;
        let imaging = ImageMagickProcessor::new();

        let options = PackageOptions {
            dry_run: false,
            minimal: self.minimal,
        };

        let result = asset_compiler.compile_assets(&provider, &imaging, &output, &options)?;

        println!(
            "Asset processing completed successfully ({})!",
            &result.game_version
        );
        Ok(ExitCode::SUCCESS)
    }
}
