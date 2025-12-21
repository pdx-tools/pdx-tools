use crate::asset_compilers::{
    Eu4AssetCompliler, Eu5AssetCompiler, GameAssetCompiler, PackageOptions,
};
use crate::images::imagemagick::ImageMagickProcessor;
use crate::{Game, ImageProcessor, NullImageProcessor, create_provider, steam};
use anyhow::{Context, Result};
use clap::Args;
use std::path::PathBuf;
use std::process::ExitCode;

/// Process assets from directory or zip file
#[derive(Args, Debug)]
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
        let base_output = self
            .output
            .clone()
            .unwrap_or_else(|| PathBuf::from("assets/game"));

        // Create base output directory if it doesn't exist
        std::fs::create_dir_all(&base_output).with_context(|| {
            format!(
                "Failed to create output directory: {}",
                base_output.display()
            )
        })?;

        // Determine which games to compile
        let games_to_process: Vec<(Game, PathBuf)> = match self.source_path.as_ref() {
            Some(path) => {
                // Path provided: detect game from source
                let provider = create_provider(path).with_context(|| {
                    format!("Failed to create provider for: {}", path.display())
                })?;
                let game = self.detect_game(&provider)?;
                vec![(game, path.clone())]
            }
            None => {
                // No path provided
                if let Some(game_str) = &self.game {
                    // --game specified without path: detect specific game from Steam
                    let game: Game = game_str.parse()?;
                    let path = steam::detect_steam_game_path(game)?;
                    vec![(game, path)]
                } else {
                    // No path and no --game: detect all installed games from Steam
                    steam::detect_all_installed_games()?
                }
            }
        };

        let imaging = ImageMagickProcessor::create()
            .inspect_err(|e| tracing::warn!(error = %e, "Failed to initialize ImageMagick processor, falling back to no image processing"))
            .map(|x| Box::new(x) as Box<dyn ImageProcessor>)
            .unwrap_or_else(|_| Box::new(NullImageProcessor));

        let options = PackageOptions {
            dry_run: false,
            minimal: self.minimal,
        };

        // Process each game
        for (game, source_path) in games_to_process {
            println!("\n=== Compiling {} ===\n", game);

            // Auto-detect source type and create appropriate provider
            let provider = create_provider(&source_path).with_context(|| {
                format!("Failed to create provider for: {}", source_path.display())
            })?;

            let result = match game {
                Game::Eu4 => {
                    let asset_compiler = Eu4AssetCompliler;
                    asset_compiler.compile_assets(&provider, &imaging, &base_output, &options)?
                }
                Game::Eu5 => {
                    let asset_compiler = Eu5AssetCompiler;
                    asset_compiler.compile_assets(&provider, &imaging, &base_output, &options)?
                }
            };

            println!(
                "Asset processing completed successfully for {} ({})!",
                game, &result.game_version
            );
        }

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
