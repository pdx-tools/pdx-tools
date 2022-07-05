mod cli;
#[cfg(feature = "create_bundle")]
#[path = "cmd/create_bundle.rs"]
mod create_bundle;
#[cfg(feature = "fetch_assets")]
#[path = "cmd/fetch_assets.rs"]
mod fetch_assets;
#[cfg(feature = "tokenize")]
#[path = "cmd/tokenize.rs"]
mod tokenize;

#[cfg(feature = "tokenize")]
#[path = "storage/brotli_tee.rs"]
mod brotli_tee;

use clap::{Parser, Subcommand};
use cli::InfoLevel;
use std::process::ExitCode;

#[derive(Parser)]
#[clap(author, version, about, long_about = None)]
#[clap(propagate_version = true)]
struct Cli {
    #[clap(flatten)]
    verbose: cli::Verbosity<InfoLevel>,

    #[clap(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[cfg(feature = "create_bundle")]
    CreateBundle(create_bundle::CreateBundleArgs),
    #[cfg(feature = "fetch_assets")]
    FetchAssets(fetch_assets::FetchAssetsArgs),
    #[cfg(feature = "tokenize")]
    Tokenize(tokenize::TokenizeArgs),
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    env_logger::Builder::from_default_env()
        .filter_level(cli.verbose.log_level_filter())
        .target(env_logger::Target::Stdout)
        .init();

    let exit_code = match &cli.command {
        #[cfg(feature = "create_bundle")]
        Commands::CreateBundle(x) => x.run(),
        #[cfg(feature = "fetch_assets")]
        Commands::FetchAssets(x) => x.run(),
        #[cfg(feature = "tokenize")]
        Commands::Tokenize(x) => x.run(),
    };

    match exit_code {
        Ok(e) => e,
        Err(err) => {
            log::error!("{:?}", &err);
            ExitCode::FAILURE
        }
    }
}
