use crate::asset_compilers::{
    Eu4AssetCompliler, Eu5AssetCompiler, GameAssetCompiler, PackageOptions,
};
use crate::bundler::{AssetBundler, AssetManifest};
use crate::images::imagemagick::ImageMagickProcessor;
use crate::{DirectoryProvider, FileAccessTracker, Game, steam};
use anyhow::{Context, Result};
use clap::Args;
use std::io::stdout;
use std::path::PathBuf;
use std::process::ExitCode;

/// Create optimized asset bundle by tracing file access and bundling required files
#[derive(Args, Debug)]
pub struct BundleArgs {
    /// Game directory containing source files
    #[clap(value_parser)]
    game_directory: Option<PathBuf>,

    /// Output directory
    #[clap(value_parser)]
    out_directory: Option<PathBuf>,

    /// Game to bundle (eu4 or eu5). If not specified, attempts to auto-detect from source
    #[clap(long)]
    game: Option<String>,
}

impl BundleArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let imaging = ImageMagickProcessor::create()?;
        let out_dir = match self.out_directory.as_ref() {
            Some(dir) => dir.clone(),
            None => PathBuf::from("."),
        };

        // Determine which games to bundle
        let games_to_process: Vec<(Game, PathBuf)> = match self.game_directory.as_ref() {
            Some(path) => {
                // Path provided: detect game from directory
                let directory_provider = DirectoryProvider::new(path);
                let tracking_provider = FileAccessTracker::new(directory_provider);
                let game = self.detect_game(&tracking_provider)?;
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

        // Process each game
        for (game, game_directory) in games_to_process {
            println!("\n=== Bundling {} ===\n", game);

            let directory_provider = DirectoryProvider::new(&game_directory);
            let tracking_provider = FileAccessTracker::new(directory_provider);

            let options = PackageOptions::dry_run();
            let compilation_output = match game {
                Game::Eu4 => {
                    let game_compiler = Eu4AssetCompliler;
                    game_compiler.compile_assets(
                        &tracking_provider,
                        &imaging,
                        &out_dir,
                        &options,
                    )?
                }
                Game::Eu5 => {
                    let game_compiler = Eu5AssetCompiler;
                    game_compiler.compile_assets(
                        &tracking_provider,
                        &imaging,
                        &out_dir,
                        &options,
                    )?
                }
            };

            let zip_filename = format!("{}-{}.zip", game, compilation_output.game_version);

            // Extract tracked file access
            let accessed_files = tracking_provider.get_accessed_files();

            let manifest = AssetManifest::new(
                compilation_output.game_version,
                game_directory.clone(),
                accessed_files,
            );

            {
                let out = stdout().lock();
                serde_json::to_writer_pretty(out, &manifest)
                    .with_context(|| "Failed to serialize manifest to JSON")?;
                println!();
            };

            let out_file = self
                .out_directory
                .as_ref()
                .map(|dir| dir.join(&zip_filename))
                .unwrap_or_else(|| PathBuf::from(&zip_filename));

            let bundler = AssetBundler::new(manifest, out_file);
            let stats = bundler.bundle()?;

            println!("Files added: {}", stats.files_added);
            println!(
                "Uncompressed size: {} MB",
                stats.total_uncompressed_size / 1_024_000
            );
            println!(
                "Compressed size: {} MB",
                stats.total_compressed_size / 1_024_000
            );
            if let Some(ratio) = stats.compression_ratio() {
                println!("Compression ratio: {:.1}%", ratio);
            }

            println!("Asset bundle created successfully for {}!", game);
        }

        Ok(ExitCode::SUCCESS)
    }

    fn detect_game(&self, provider: &FileAccessTracker<DirectoryProvider>) -> Result<Game> {
        // If explicitly specified, use that
        if let Some(game_str) = &self.game {
            game_str.parse()
        } else {
            // Auto-detect based on file structure
            Game::detect(provider)
        }
    }
}
