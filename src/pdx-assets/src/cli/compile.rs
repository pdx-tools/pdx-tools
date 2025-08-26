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

    /// Path to game source (directory or zip file). If not provided, attempts to auto-detect Steam installation
    #[clap(value_parser)]
    source_path: Option<PathBuf>,

    /// Output directory for processed assets
    #[clap(long, short)]
    output: Option<PathBuf>,
}

impl CompileArgs {
    /// Auto-detect Steam installation path and EU4 directory
    fn detect_steam_eu4_path() -> Result<PathBuf> {
        let steam_path =
            Self::detect_steam_path().context("Failed to auto-detect Steam installation path")?;

        let eu4_path = steam_path.join("steamapps/common/Europa Universalis IV");
        anyhow::ensure!(
            eu4_path.exists(),
            "Europa Universalis IV not found in Steam library at expected path: {}",
            eu4_path.display()
        );

        println!("Detected EU4 installation at: {}", eu4_path.display());
        Ok(eu4_path)
    }

    /// Detect Steam installation path based on the current platform
    fn detect_steam_path() -> Result<PathBuf> {
        match std::env::consts::OS {
            "windows" => Self::detect_steam_path_windows(),
            "macos" => Self::detect_steam_path_macos(),
            "linux" => Self::detect_steam_path_linux(),
            os => anyhow::bail!(
                "Steam auto-detection is not supported on platform '{}'. Please specify the source path manually.",
                os
            ),
        }
    }

    /// Detect Steam installation path on Windows
    fn detect_steam_path_windows() -> Result<PathBuf> {
        let output = std::process::Command::new("powershell")
            .arg("-Command")
            .arg("(Get-ItemProperty -Path \"HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam\").InstallPath")
            .output()
            .context("Failed to execute PowerShell command. Is PowerShell available?")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("PowerShell command failed: {}", stderr);
        }

        let install_path = String::from_utf8(output.stdout)
            .context("PowerShell output is not valid UTF-8")?
            .trim()
            .to_string();

        Ok(PathBuf::from(install_path))
    }

    /// Detect Steam installation path on macOS
    fn detect_steam_path_macos() -> Result<PathBuf> {
        let steam_path = PathBuf::from("/Applications/Steam.app/Contents/MacOS");
        Ok(steam_path)
    }

    /// Detect Steam installation path on Linux
    fn detect_steam_path_linux() -> Result<PathBuf> {
        let home = std::env::var("HOME").context("HOME environment variable not set")?;
        let local = PathBuf::from(&home).join(".local/share/Steam");
        if local.exists() {
            return Ok(local);
        }

        let steam_path = PathBuf::from(&home).join(".steam/steam");
        if steam_path.exists() {
            return Ok(steam_path);
        }

        anyhow::bail!("Could not find Steam installation");
    }

    pub fn run(&self) -> Result<ExitCode> {
        let output = self
            .output
            .clone()
            .unwrap_or_else(|| PathBuf::from("assets/game"));

        // Create output directory if it doesn't exist
        std::fs::create_dir_all(&output)
            .with_context(|| format!("Failed to create output directory: {}", output.display()))?;

        // Get source path: use provided path or auto-detect
        let source_path = match &self.source_path {
            Some(path) => path.clone(),
            None => Self::detect_steam_eu4_path()?,
        };

        // Auto-detect source type and create appropriate provider
        let provider = create_provider(&source_path)
            .with_context(|| format!("Failed to create provider for: {}", source_path.display()))?;

        let asset_compiler = Eu4AssetCompliler;
        let imaging = ImageMagickProcessor::create()?;

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
