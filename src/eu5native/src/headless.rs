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
    let save = parser.parse()?;

    info!("Using game data: {}", args.game_data.display());
    let mut game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let pipeline_components = pdx_map::GpuContext::new().await?;

    let texture_size = eu5app::texture_buffer_size();
    let mut texture_data = vec![0u8; texture_size];

    texture_data = game_bundle.load_west_texture(texture_data)?;

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let west_view =
        pipeline_components.create_texture(&texture_data, tile_width, tile_height, "West Texture");

    texture_data = game_bundle.load_east_texture(texture_data)?;

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
    renderer.set_location_arrays(map_app.location_arrays().clone());

    let (full_width, full_height) = eu5app::world_dimensions();
    let mut combined_buffer = vec![0u8; (full_width * full_height * 4) as usize];

    let mut screenshot_renderer = renderer.into_screenshot_renderer();

    // Render west tile and copy to left half of buffer
    screenshot_renderer.render_west();
    screenshot_renderer
        .readback_west(&mut combined_buffer)
        .await?;

    // Render east tile and copy to right half of buffer
    screenshot_renderer.render_east();
    screenshot_renderer
        .readback_east(&mut combined_buffer)
        .await?;

    // Create image directly from raw buffer and save
    let output_img = image::RgbaImage::from_raw(full_width, full_height, combined_buffer)
        .ok_or("Failed to create image from raw buffer")?;

    let output_path = args.output.as_ref().unwrap();
    output_img.save(output_path)?;

    Ok(())
}
