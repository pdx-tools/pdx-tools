// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

mod color_mapper;
mod reprocess;
mod transcode;

use clap::{Parser, Subcommand};
use std::process::ExitCode;
use tracing_subscriber::filter::LevelFilter;

#[derive(Parser)]
#[command(author, version, about = "PDX Tools admin commands for maintainers", long_about = None)]
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
    /// Produces a delta to apply to database from reparsed saves
    Reprocess(reprocess::ReprocessArgs),
    /// Re-encode save container format
    Transcode(transcode::TranscodeArgs),
    /// Re-encode from eu4 color format to the pdx-map format
    ColorMapper(color_mapper::ColorMapperArgs),
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
        Commands::Reprocess(x) => x.run(),
        Commands::Transcode(x) => x.run(),
        Commands::ColorMapper(x) => x.run(),
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
