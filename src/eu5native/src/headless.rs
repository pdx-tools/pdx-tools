use crate::Args;
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
};
use eu5save::{BasicTokenResolver, Eu5File};
use tracing::info;

pub fn run_headless(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .expect("Failed to build single-threaded Tokio runtime");

    rt.block_on(async { run_headless_async(args).await })
}

async fn run_headless_async(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    info!("Using save file: {}", args.save_file.display());
    let file = std::fs::File::open(&args.save_file)?;
    let file = Eu5File::from_file(file)?;

    info!("Using tokens file: {}", args.tokens.display());
    let file_data = std::fs::read(&args.tokens)?;
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

    let parser = Eu5SaveLoader::open(file, resolver)?;

    let start = std::time::Instant::now();
    let save = parser.parse()?;
    info!("Parsed save file in {}ms", start.elapsed().as_millis());

    info!("Using game data: {}", args.game_data.display());
    let game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let start = std::time::Instant::now();
    let pipeline_components = pdx_map::GpuContext::new().await?;
    info!(
        "Initialized GPU and pipelines in {}ms",
        start.elapsed().as_millis()
    );

    let texture_size = eu5app::texture_buffer_size();
    let mut texture_data = vec![0u8; texture_size];

    let start = std::time::Instant::now();
    game_bundle.load_west_texture(&mut texture_data)?;
    info!("Read west texture in {}ms", start.elapsed().as_millis());

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let start = std::time::Instant::now();
    let west_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "West Texture");
    info!(
        "Uploaded west texture view in {}ms",
        start.elapsed().as_millis()
    );

    let start = std::time::Instant::now();
    game_bundle.load_east_texture(&mut texture_data)?;
    info!("Read east texture in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    let east_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "East Texture");
    info!(
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
    info!("Rendered west tile in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    screenshot_renderer
        .readback_west(&mut combined_buffer)
        .await?;
    info!(
        "Read back west tile data in {}ms",
        start.elapsed().as_millis()
    );

    // Render east tile and copy to right half of buffer
    let start = std::time::Instant::now();
    screenshot_renderer.render_east();
    info!("Rendered east tile in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    screenshot_renderer
        .readback_east(&mut combined_buffer)
        .await?;
    info!(
        "Read back east tile data in {}ms",
        start.elapsed().as_millis()
    );

    // Create image directly from raw buffer and save
    let start = std::time::Instant::now();
    let output_img = image::RgbaImage::from_raw(full_width, full_height, combined_buffer)
        .ok_or("Failed to create image from raw buffer")?;
    info!("Created output image in {}ms", start.elapsed().as_millis());

    let output_path = args.output.as_ref().unwrap();
    let start = std::time::Instant::now();
    output_img.save(output_path)?;
    info!(
        "Saved image to {} in {}ms",
        output_path.display(),
        start.elapsed().as_millis()
    );
    Ok(())
}
