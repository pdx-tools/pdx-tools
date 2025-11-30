use clap::Parser;
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
};
use eu5save::{BasicTokenResolver, Eu5File};
use std::path::PathBuf;

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
    let args = Args::parse();

    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("Failed to build single-threaded Tokio runtime");

    rt.block_on(async { main_async(args).await })
}

async fn main_async(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    println!("Using save file: {}", args.save_file.display());
    let file = std::fs::File::open(&args.save_file)?;
    let file = Eu5File::from_file(file)?;

    println!("Using tokens file: {}", args.tokens.display());
    let file_data = std::fs::read(&args.tokens)?;
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

    let parser = Eu5SaveLoader::open(file, resolver)?;

    let start = std::time::Instant::now();
    let save = parser.parse()?;
    println!("Parsed save file in {}ms", start.elapsed().as_millis());

    println!("Using game data: {}", args.game_data.display());
    let game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let start = std::time::Instant::now();
    let pipeline_components = pdx_map::GpuContext::new().await?;
    println!(
        "Initialized GPU and pipelines in {}ms",
        start.elapsed().as_millis()
    );

    let texture_size = eu5app::texture_buffer_size();
    let mut texture_data = vec![0u8; texture_size];

    let start = std::time::Instant::now();
    game_bundle.load_west_texture(&mut texture_data)?;
    println!("Read west texture in {}ms", start.elapsed().as_millis());

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let start = std::time::Instant::now();
    let west_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "West Texture");
    println!(
        "Uploaded west texture view in {}ms",
        start.elapsed().as_millis()
    );

    let start = std::time::Instant::now();
    game_bundle.load_east_texture(&mut texture_data)?;
    println!("Read east texture in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    let east_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "East Texture");
    println!(
        "Uploaded east texture view in {}ms",
        start.elapsed().as_millis()
    );

    let mut renderer = pdx_map::HeadlessMapRenderer::new(
        pipeline_components,
        west_view,
        east_view,
        tile_width,
        tile_height,
    )?;

    let mut map_app = Eu5Workspace::new(save, game_bundle)?;
    map_app.set_map_mode(MapMode::Political)?;
    renderer.set_location_arrays(map_app.location_arrays().clone());

    let (full_width, full_height) = eu5app::world_dimensions();
    let mut combined_buffer = vec![0u8; (full_width * full_height * 4) as usize];

    let mut screenshot_renderer = renderer.into_screenshot_renderer();

    // Render west tile and copy to left half of buffer
    let start = std::time::Instant::now();
    screenshot_renderer.render_west();
    println!("Rendered west tile in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    screenshot_renderer
        .readback_west(&mut combined_buffer)
        .await?;
    println!(
        "Read back west tile data in {}ms",
        start.elapsed().as_millis()
    );

    // Render east tile and copy to right half of buffer
    let start = std::time::Instant::now();
    screenshot_renderer.render_east();
    println!("Rendered east tile in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    screenshot_renderer
        .readback_east(&mut combined_buffer)
        .await?;
    println!(
        "Read back east tile data in {}ms",
        start.elapsed().as_millis()
    );

    // Create image directly from raw buffer and save
    let start = std::time::Instant::now();
    let output_img = image::RgbaImage::from_raw(full_width, full_height, combined_buffer)
        .ok_or("Failed to create image from raw buffer")?;
    println!("Created output image in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    output_img.save(&args.output)?;
    println!(
        "Saved image to {} in {}ms",
        args.output.display(),
        start.elapsed().as_millis()
    );
    Ok(())
}
