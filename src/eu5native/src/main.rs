use clap::Parser;
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

/// EU5 native map renderer - renders EU5 save files to PNG images or GUI window
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

    /// Output PNG file path (required when --gui is not set)
    #[arg(short = 'o', long)]
    pub output: Option<PathBuf>,

    /// Launch GUI window instead of generating PNG
    #[arg(long)]
    pub gui: bool,

    /// Window width (GUI mode only)
    #[arg(long, default_value = "1920")]
    pub width: u32,

    /// Window height (GUI mode only)
    #[arg(long, default_value = "1080")]
    pub height: u32,
}

mod gui;
mod headless;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
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
