use crate::asset_compilers::{
    Eu4AssetCompliler, Eu5AssetCompiler, GameAssetCompiler, PackageOptions,
};
use crate::images::imagemagick::ImageMagickProcessor;
use crate::{Game, create_provider, steam};
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

    /// Path to game source (directory or zip file). If not provided, attempts to auto-detect Steam installation
    #[clap(value_parser)]
    source_path: Option<PathBuf>,

    /// Output directory for processed assets
    #[clap(long, short)]
    output: Option<PathBuf>,

    /// Game to compile (eu4 or eu5). If not specified, attempts to auto-detect from source
    #[clap(long)]
    game: Option<String>,
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

        // Get source path: use provided path or auto-detect (defaults to EU4)
        let source_path = match &self.source_path {
            Some(path) => path.clone(),
            None => steam::detect_steam_eu4_path()?,
        };

        // Auto-detect source type and create appropriate provider
        let provider = create_provider(&source_path)
            .with_context(|| format!("Failed to create provider for: {}", source_path.display()))?;

        // Determine which game to compile
        let game = self.detect_game(&provider)?;

        let imaging = ImageMagickProcessor::create()?;

        let options = PackageOptions {
            dry_run: false,
            minimal: self.minimal,
        };

        let result = match game {
            Game::Eu4 => {
                let asset_compiler = Eu4AssetCompliler;
                asset_compiler.compile_assets(&provider, &imaging, &output, &options)?
            }
            Game::Eu5 => {
                let asset_compiler = Eu5AssetCompiler;
                asset_compiler.compile_assets(&provider, &imaging, &output, &options)?
            }
        };

        println!(
            "Asset processing completed successfully for {} ({})!",
            game, &result.game_version
        );
        Ok(ExitCode::SUCCESS)
    }

    fn detect_game(&self, provider: &impl crate::FileProvider) -> Result<Game> {
        // If explicitly specified, use that
        if let Some(game_str) = &self.game {
            game_str.parse()
        } else {
            // Auto-detect based on file structure
            Game::detect(provider)
        }
    }
}
