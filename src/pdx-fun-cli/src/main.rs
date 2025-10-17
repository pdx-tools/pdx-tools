// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod ai_development;
mod province_borders;
mod province_names;
mod smallest_province;
mod terrain_mapper;

use clap::{Parser, Subcommand};
use std::process::ExitCode;

#[derive(Parser)]
#[command(author, version, about = "PDX Tools fun commands for save analysis", long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    /// Verbosity level (use -v, -vv, -vvv, etc.)
    #[arg(short, long, global = true, action = clap::ArgAction::Count)]
    verbose: u8,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Produces a csv of how much the AI has devved provinces
    AiDevelopment(ai_development::AiDevelopmentArgs),
    /// Shows which provinces borders which
    ProvinceBorders(province_borders::ProvinceBordersArgs),
    /// Produces a tsv of most common habitable province letter
    ProvinceNames(province_names::ProvinceNamesArgs),
    /// Finds the smallest province on the map
    SmallestProvince(smallest_province::SmallestProvinceArgs),
    /// Terrain mapper (currently disabled)
    TerrainMapper(terrain_mapper::TerrainMapperArgs),
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let log_level = match cli.verbose {
        0 => log::LevelFilter::Warn,
        1 => log::LevelFilter::Info,
        2 => log::LevelFilter::Debug,
        _ => log::LevelFilter::Trace,
    };

    env_logger::Builder::from_default_env()
        .filter_level(log_level)
        .target(env_logger::Target::Stdout)
        .init();

    let exit_code = match &cli.command {
        Commands::AiDevelopment(x) => x.run(),
        Commands::ProvinceBorders(x) => x.run(),
        Commands::ProvinceNames(x) => x.run(),
        Commands::SmallestProvince(x) => x.run(),
        Commands::TerrainMapper(x) => x.run(),
    };

    match exit_code {
        Ok(e) => e,
        Err(err) => {
            log::error!("{:?}", err);
            ExitCode::FAILURE
        }
    }
}
