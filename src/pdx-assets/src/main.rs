use clap::{Parser, Subcommand};
use pdx_assets::{BundleArgs, CompileArgs};
use std::process::ExitCode;
use tracing_subscriber::filter::LevelFilter;

// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    #[clap(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Bundle(BundleArgs),
    Compile(CompileArgs),
}

fn main() -> ExitCode {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_level(true)
        .with_max_level(LevelFilter::INFO)
        .with_writer(std::io::stdout)
        .compact()
        .init();

    let cli = Cli::parse();

    let exit_code = match cli.command {
        Commands::Bundle(args) => args.run(),
        Commands::Compile(args) => args.run(),
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
