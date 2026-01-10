use clap::Parser;
use std::{io::IsTerminal, path::PathBuf};
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

mod date_layer;

/// EU5 native map renderer - renders EU5 save files to PNG images
#[derive(Parser, Debug)]
#[command(name = "eu5native")]
#[command(about = "Render EU5 save files to PNG images or GUI window", long_about = None)]
pub struct Args {
    /// Path to the EU5 save file
    #[arg(value_name = "SAVE_FILE")]
    pub save_file: PathBuf,

    /// Path to game data (directory, source bundle, or compiled bundle)
    #[arg(short = 'g', long, default_value = "assets")]
    pub game_data: PathBuf,

    /// Path to EU5 tokens file
    #[arg(short = 't', long, default_value = "assets/eu5.txt")]
    pub tokens: PathBuf,

    /// Optional width for custom viewport screenshot
    #[arg(short = 'w', long)]
    width: Option<u32>,

    /// Optional height for custom viewport screenshot
    #[arg(short = 'h', long)]
    height: Option<u32>,

    /// Output PNG file path (required when --gui is not set)
    #[arg(short = 'o', long)]
    pub output: Option<PathBuf>,

    /// Launch GUI window instead of generating PNG
    #[arg(long)]
    pub gui: bool,
}

mod gui;
mod headless;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let is_terminal = std::io::stdout().is_terminal();

    #[cfg(windows)]
    {
        if is_terminal {
            nu_ansi_term::enable_ansi_support().expect("Failed to enable ANSI support on Windows");
        }
    }

    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_ansi(is_terminal)
        .with_span_events(FmtSpan::CLOSE)
        .init();

    let args = Args::parse();

    // Validate arguments
    if !args.gui && args.output.is_none() {
        eprintln!("--output is required when not using --gui mode");
        std::process::exit(1);
    }

    if args.gui {
        gui::run_gui(args)?;
    } else {
        headless::run_headless(args)?;
    }

    Ok(())
}
