mod tokenize;

use clap::Parser;
use std::process::ExitCode;
use tracing_subscriber::filter::LevelFilter;

#[derive(Parser)]
#[command(author, version, about = "Converts token text files into flatbuffers", long_about = None)]
struct Cli {
    /// Directory containing token text files
    tokens_dir: std::path::PathBuf,

    /// Verbosity level (use -v, -vv, -vvv, etc.)
    #[arg(short, long, action = clap::ArgAction::Count)]
    verbose: u8,
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let log_level = match cli.verbose {
        0 => LevelFilter::INFO,
        1 => LevelFilter::DEBUG,
        _ => LevelFilter::TRACE,
    };

    tracing_subscriber::fmt().with_max_level(log_level).init();

    let args = tokenize::TokenizeArgs {
        tokens_dir: cli.tokens_dir,
    };

    match args.run() {
        Ok(code) => code,
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
