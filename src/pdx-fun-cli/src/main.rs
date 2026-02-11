// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod ai_development;
mod eu5_date_layer;
mod eu5_render;
mod index_image;
mod province_borders;
mod province_names;
mod smallest_province;
mod terrain_mapper;

use clap::{Parser, Subcommand};
use std::process::ExitCode;
use tracing_subscriber::filter::LevelFilter;

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
    /// Render EU5 save files to PNG images
    Eu5Render(eu5_render::Eu5RenderArgs),
    /// Converts images into split R16 hemisphere textures
    IndexImage(index_image::IndexImageArgs),
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
        0 => LevelFilter::WARN,
        1 => LevelFilter::INFO,
        2 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    tracing_subscriber::fmt()
        .with_target(false)
        .with_level(true)
        .with_max_level(log_level)
        .with_writer(std::io::stdout)
        .compact()
        .init();

    let exit_code = match &cli.command {
        Commands::AiDevelopment(x) => x.run(),
        Commands::Eu5Render(x) => x.run(),
        Commands::IndexImage(x) => x.run(),
        Commands::ProvinceBorders(x) => x.run(),
        Commands::ProvinceNames(x) => x.run(),
        Commands::SmallestProvince(x) => x.run(),
        Commands::TerrainMapper(x) => x.run(),
    };

    match exit_code {
        Ok(e) => e,
        Err(err) => {
            tracing::error!(
                name: "cli.execution.error",
                error_message = %err,
                error_debug = ?err,
                "application error"
            );
            ExitCode::FAILURE
        }
    }
}
