use clap::Parser;
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
};
use eu5save::{BasicTokenResolver, Eu5File};
use std::{io::IsTerminal, path::PathBuf};
use tracing::{info, info_span, level_filters::LevelFilter};
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

/// EU5 native map renderer - renders EU5 save files to PNG images
#[derive(Parser, Debug)]
#[command(name = "eu5native")]
#[command(about = "Render EU5 save files to PNG images", long_about = None)]
struct Args {
    /// Path to the EU5 save file
    #[arg(value_name = "SAVE_FILE")]
    save_file: PathBuf,

    /// Path to game data (directory, source bundle, or compiled bundle)
    #[arg(short = 'g', long, default_value = "assets")]
    game_data: PathBuf,

    /// Path to EU5 tokens file
    #[arg(short = 't', long, default_value = "assets/eu5.txt")]
    tokens: PathBuf,

    /// Output PNG file path
    #[arg(short = 'o', long, default_value = "locations-development-mode.png")]
    output: PathBuf,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let env_filter = EnvFilter::builder()
        .with_default_directive(LevelFilter::INFO.into())
        .from_env_lossy();

    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_ansi(std::io::stdout().is_terminal())
        .with_span_events(FmtSpan::CLOSE)
        .init();

    let args = Args::parse();

    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("Failed to build single-threaded Tokio runtime");

    rt.block_on(async { main_async(args).await })
}

async fn main_async(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    info!("Using save file: {}", args.save_file.display());
    let file = std::fs::File::open(&args.save_file)?;
    let file = Eu5File::from_file(file)?;

    info!("Using tokens file: {}", args.tokens.display());
    let file_data = std::fs::read(&args.tokens)?;
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

    let parser = Eu5SaveLoader::open(file, resolver)?;

    let save = parser.parse()?;

    let mut game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let pipeline_components = pdx_map::GpuContext::new().await?;
    let texture_data = game_bundle.load_west_texture(Vec::new())?;

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let west_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "West Texture");

    let texture_data = game_bundle.load_east_texture(Vec::new())?;

    let east_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "East Texture");

    let mut renderer = pdx_map::HeadlessMapRenderer::new(
        pipeline_components,
        west_view,
        east_view,
        tile_width,
        tile_height,
    )?;

    let mut map_app = Eu5Workspace::new(save, game_bundle.into_game_data())?;
    map_app.set_map_mode(MapMode::Political)?;
    renderer.update_locations(map_app.location_arrays());

    let (full_width, full_height) = eu5app::world_dimensions();
    let mut combined_buffer = vec![0u8; (full_width * full_height * 4) as usize];

    let mut screenshot_renderer = renderer.into_screenshot_renderer();

    // Render west tile and copy to left half of buffer
    screenshot_renderer
        .readback_west(&mut combined_buffer)
        .await?;

    // Render east tile and copy to right half of buffer
    screenshot_renderer
        .readback_east(&mut combined_buffer)
        .await?;

    // Create image directly from raw buffer and save
    let span = info_span!("RgbaImage::from_raw");
    let enter = span.enter();
    let output_img = image::RgbaImage::from_raw(full_width, full_height, combined_buffer)
        .ok_or("Failed to create image from raw buffer")?;
    drop(enter);

    let span = info_span!("RgbaImage::save", output = %args.output.display());
    let enter = span.enter();
    output_img.save(&args.output)?;
    drop(enter);
    Ok(())
}
