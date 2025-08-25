mod montager;
pub mod tarball;

use self::tarball::PackageOptions;
use clap::Args;
use std::{path::PathBuf, process::ExitCode};

/// Compiles assets from an asset bundle
#[derive(Args)]
pub struct CompileAssetsArgs {
    /// Skip compiling common assets
    #[clap(long)]
    skip_common: bool,

    /// Regenerate images
    #[clap(long)]
    regen: bool,

    /// Path to asset bundle
    #[clap(value_parser)]
    bundle_path: PathBuf,
}

impl CompileAssetsArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let options = PackageOptions {
            common: !self.skip_common,
            regen: self.regen,
            path: self.bundle_path.clone(),
        };

        tarball::parse_game_bundle(&options)?;
        Ok(ExitCode::SUCCESS)
    }
}
