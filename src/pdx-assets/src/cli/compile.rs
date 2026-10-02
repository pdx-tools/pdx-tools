use crate::asset_compilers::{
    Eu4AssetCompliler, Eu5AssetCompiler, GameAssetCompiler, Hoi4AssetCompiler, PackageOptions,
};
use crate::images::RustImageProcessor;
use crate::{Game, create_provider, steam};
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

    /// Game to compile (eu4, eu5, or hoi4). If not specified, attempts to auto-detect from source
    #[clap(long)]
    game: Option<String>,

    /// Version of the source game files. Use only if detection is not possible.
    #[clap(long = "game-version", alias = "version")]
    version: Option<String>,
}

impl CompileArgs {
    pub fn run(&self) -> Result<ExitCode> {
        anyhow::ensure!(
            self.version.is_none() || self.source_path.is_some() || self.game.is_some(),
            "Use --game or a source path with --game-version"
        );
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

        let imaging = RustImageProcessor::create()?;

        // Process each game
        for (game, source_path) in games_to_process {
            println!("\n=== Compiling {} ===\n", game);

            // Auto-detect source type and create appropriate provider
            let provider = create_provider(&source_path).with_context(|| {
                format!("Failed to create provider for: {}", source_path.display())
            })?;

            let version = match crate::asset_source::detect_version(
                &provider,
                &source_path,
                game,
                self.version.as_deref(),
            )? {
                Some(version) => version,
                None => {
                    let version = crate::asset_source::latest_catalog_version(game)?;
                    tracing::warn!(%game, %version,
                        "The source game version is unknown. Using the latest catalog version. Use --game-version to change it");
                    version
                }
            };
            let options = PackageOptions {
                dry_run: false,
                minimal: self.minimal,
                game_version: Some(version),
            };

            let result = match game {
                Game::Eu4 => {
                    let asset_compiler = Eu4AssetCompliler;
                    asset_compiler.compile_assets(&provider, &imaging, &base_output, &options)?
                }
                Game::Eu5 => {
                    let asset_compiler = Eu5AssetCompiler;
                    asset_compiler.compile_assets(&provider, &imaging, &base_output, &options)?
                }
                Game::Hoi4 => {
                    let asset_compiler = Hoi4AssetCompiler;
                    asset_compiler.compile_assets(&provider, &imaging, &base_output, &options)?
                }
                game => anyhow::bail!(
                    "Asset compilation is not supported for {}. Use fetch-game to download it",
                    game
                ),
            };

            println!(
                "Asset processing completed successfully for {} ({})!",
                game, result.game_version
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
