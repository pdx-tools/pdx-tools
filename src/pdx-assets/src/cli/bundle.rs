use crate::asset_compilers::{Eu4AssetCompliler, GameAssetCompiler, PackageOptions};
use crate::bundler::{AssetBundler, AssetManifest};
use crate::images::imagemagick::ImageMagickProcessor;
use crate::{DirectoryProvider, FileAccessTracker};
use anyhow::{Context, Result};
use clap::Args;
use std::io::stdout;
use std::path::PathBuf;
use std::process::ExitCode;

/// Create optimized asset bundle by tracing file access and bundling required files
#[derive(Args)]
pub struct BundleArgs {
    /// Game directory containing source files
    #[clap(value_parser)]
    game_directory: PathBuf,

    /// Output directory
    #[clap(value_parser)]
    out_directory: Option<PathBuf>,
}

impl BundleArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let directory_provider = DirectoryProvider::new(&self.game_directory);
        let tracking_provider = FileAccessTracker::new(directory_provider);

        let game_compiler = Eu4AssetCompliler;
        let imaging = ImageMagickProcessor::create()?;

        let options = PackageOptions::dry_run();
        let compilation_output = game_compiler.compile_assets(
            &tracking_provider,
            &imaging,
            &self.game_directory,
            &options,
        )?;

        let zip_filename = format!("eu4-{}.zip", compilation_output.game_version);

        // Extract tracked file access
        let accessed_files = tracking_provider.get_accessed_files();

        let manifest = AssetManifest::new(
            compilation_output.game_version,
            self.game_directory.to_path_buf(),
            accessed_files,
        );

        {
            let out = stdout().lock();
            serde_json::to_writer_pretty(out, &manifest)
                .with_context(|| "Failed to serialize manifest to JSON")?;
            println!();
        }

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

        println!("Asset bundle created successfully!");
        Ok(ExitCode::SUCCESS)
    }
}
