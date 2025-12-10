use clap::{Parser, Subcommand};
use pdx_assets::{BundleArgs, CompileArgs};
use std::{io::IsTerminal, process::ExitCode};
use tracing_subscriber::{EnvFilter, filter::LevelFilter, fmt::format::FmtSpan};

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
    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_ansi(std::io::stdout().is_terminal())
        .with_span_events(FmtSpan::CLOSE)
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
