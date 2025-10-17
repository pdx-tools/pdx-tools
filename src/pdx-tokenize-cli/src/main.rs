mod tokenize;

use clap::Parser;
use std::process::ExitCode;

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
        0 => log::LevelFilter::Warn,
        1 => log::LevelFilter::Info,
        2 => log::LevelFilter::Debug,
        _ => log::LevelFilter::Trace,
    };

    env_logger::Builder::from_default_env()
        .filter_level(log_level)
        .target(env_logger::Target::Stdout)
        .init();

    let args = tokenize::TokenizeArgs {
        tokens_dir: cli.tokens_dir,
    };

    match args.run() {
        Ok(code) => code,
        Err(err) => {
            log::error!("{:?}", err);
            ExitCode::FAILURE
        }
    }
}
