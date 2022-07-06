mod cli;

/* Commands */

#[cfg(any(feature = "compile_assets", feature = "fun"))]
#[path = "cmd/compile_assets/mod.rs"]
mod compile_assets;
#[cfg(feature = "create_bundle")]
#[path = "cmd/create_bundle.rs"]
mod create_bundle;
#[cfg(feature = "fetch_assets")]
#[path = "cmd/fetch_assets.rs"]
mod fetch_assets;
#[cfg(feature = "admin")]
#[path = "cmd/reprocess.rs"]
mod reprocess;
#[cfg(feature = "tokenize")]
#[path = "cmd/tokenize.rs"]
mod tokenize;

/* Fun commands */

#[cfg(feature = "fun")]
#[path = "cmd-fun/ai_development.rs"]
mod ai_development;
#[cfg(feature = "fun")]
#[path = "cmd-fun/province_borders.rs"]
mod province_borders;
#[cfg(feature = "fun")]
#[path = "cmd-fun/smallest_province.rs"]
mod smallest_province;

/* Shared modules */

#[cfg(any(feature = "tokenize", feature = "compile_assets"))]
#[path = "storage/brotli_tee.rs"]
mod brotli_tee;
#[allow(dead_code)]
#[cfg(any(feature = "compile_assets", feature = "fun"))]
mod rawbmp;
#[cfg(any(feature = "admin", feature = "fun"))]
#[path = "storage/remote_parse.rs"]
mod remote_parse;

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
    #[cfg(feature = "admin")]
    Reprocess(reprocess::ReprocessArgs),
    #[cfg(feature = "tokenize")]
    Tokenize(tokenize::TokenizeArgs),
    #[cfg(feature = "fun")]
    AiDevelopment(ai_development::AiDevelopmentArgs),
    #[cfg(feature = "compile_assets")]
    CompileAssets(compile_assets::CompileAssetsArgs),
    #[cfg(feature = "fun")]
    ProvinceBorders(province_borders::ProvinceBordersArgs),
    #[cfg(feature = "fun")]
    SmallestProvince(smallest_province::SmallestProvinceArgs),
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
        #[cfg(feature = "admin")]
        Commands::Reprocess(x) => x.run(),
        #[cfg(feature = "tokenize")]
        Commands::Tokenize(x) => x.run(),
        #[cfg(feature = "fun")]
        Commands::AiDevelopment(x) => x.run(),
        #[cfg(feature = "compile_assets")]
        Commands::CompileAssets(x) => x.run(),
        #[cfg(feature = "fun")]
        Commands::ProvinceBorders(x) => x.run(),
        #[cfg(feature = "fun")]
        Commands::SmallestProvince(x) => x.run(),
    };

    match exit_code {
        Ok(e) => e,
        Err(err) => {
            log::error!("{:?}", &err);
            ExitCode::FAILURE
        }
    }
}
