use std::path::PathBuf;

use crate::{Args, date_layer::DateLayer};
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
};
use eu5save::{BasicTokenResolver, Eu5File};
use pdx_map::{PhysicalSize, StitchedImage, ViewportBounds, WorldSize};
use tracing::{info, info_span};

/// Validate that width and height are both provided or both absent
fn validate_dimensions(
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), Box<dyn std::error::Error>> {
    match (width, height) {
        (Some(w), Some(h)) => {
            if w == 0 || h == 0 {
                return Err("Width and height must be greater than 0".into());
            }
            let (_, world_height) = eu5app::world_dimensions();
            if h > world_height {
                return Err(format!("Height {} exceeds world height {}", h, world_height).into());
            }
            Ok(())
        }
        (None, None) => Ok(()),
        _ => Err("Both --width and --height must be specified together".into()),
    }
}

/// Calculate viewport bounds centered on player's capital (or world center as fallback)
/// Returns (x_offset, y_offset)
fn calculate_viewport_bounds(map_app: &Eu5Workspace, width: u32, height: u32) -> (u32, u32) {
    let (world_width, world_height) = eu5app::world_dimensions();

    // Get player capital or fallback to world center
    let (capital_x, capital_y) = map_app
        .player_capital_coordinates()
        .unwrap_or((world_width as u16 / 2, world_height as u16 / 2));

    // Center horizontally with proper wraparound handling
    let x_centered = capital_x as i32 - (width / 2) as i32;
    let x = x_centered.rem_euclid(world_width as i32) as u32;

    let y = (capital_y as i32 - (height / 2) as i32)
        .max(0)
        .min((world_height - height) as i32) as u32;

    (x, y)
}

/// Calculate proportional text scale based on viewport height
fn calculate_text_scale(viewport_height: u32) -> u32 {
    // Scale formula: height / 400 gives good proportions
    // Examples: 8192→20, 4096→10, 2048→5, 1024→2
    (viewport_height / 400).max(2)
}

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

    let mut save = parser.parse()?;

    let mut game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let pipeline_components = pdx_map::GpuContext::new().await?;
    let texture_data = game_bundle.load_west_texture(Vec::new())?;

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let size = PhysicalSize::new(tile_width, tile_height);
    let west_view = pipeline_components.create_texture(&texture_data, size, "West Texture");

    let texture_data = game_bundle.load_east_texture(Vec::new())?;

    let east_view = pipeline_components.create_texture(&texture_data, size, "East Texture");

    let map_app = Eu5Workspace::new(save.take_gamestate(), game_bundle.into_game_data())?;
    let save_date = map_app.gamestate().metadata().date.date_fmt().to_string();

    // Validate dimensions
    validate_dimensions(args.width, args.height)?;

    // Determine dimensions and centering
    let (width, height, center_on_capital) = if let (Some(w), Some(h)) = (args.width, args.height) {
        info!("Rendering custom viewport: {}×{}", w, h);
        (w, h, true)
    } else {
        let (world_width, world_height) = eu5app::world_dimensions();
        info!("Rendering full world: {}×{}", world_width, world_height);
        (world_width, world_height, false)
    };

    render_viewport(
        map_app,
        &pipeline_components,
        west_view,
        east_view,
        save_date,
        width,
        height,
        center_on_capital,
        &args.output.expect("output buf to be defined"),
    )
    .await
}

#[expect(clippy::too_many_arguments)]
async fn render_viewport(
    mut map_app: Eu5Workspace<'_>,
    pipeline_components: &'_ pdx_map::GpuContext,
    west_view: pdx_map::MapTexture,
    east_view: pdx_map::MapTexture,
    save_date: String,
    width: u32,
    height: u32,
    center_on_capital: bool,
    output: &'_ PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    // Calculate viewport position
    let (x_offset, y_offset) = if center_on_capital {
        calculate_viewport_bounds(&map_app, width, height)
    } else {
        (0, 0) // Full world starts at origin
    };

    let (tile_width, _) = eu5app::tile_dimensions();

    let viewport_width = if width > tile_width { width / 2 } else { width };

    let mut viewport = ViewportBounds::new(WorldSize::new(viewport_width, height));
    viewport.rect.origin.x = x_offset;
    viewport.rect.origin.y = y_offset;

    let mut renderer = pdx_map::HeadlessMapRenderer::new(
        pipeline_components.clone(),
        west_view,
        east_view,
        viewport.rect.size.width,
        height,
    )?;

    map_app.set_map_mode(MapMode::Political);
    renderer.update_locations(map_app.location_arrays());

    let text_scale = calculate_text_scale(height);
    let date_layer = renderer.add_layer(DateLayer::new(save_date, text_scale));

    // For viewports wider than tile_width (8192), we need to stitch two renders together
    let image_data = if width > tile_width {
        assert!(
            width <= tile_width * 2,
            "viewport width exceeds maximum for stitching"
        );

        let mut stitched_data = StitchedImage::new(width, height);

        // Render west half
        let span = info_span!("readback_west");
        let _enter = span.enter();
        let viewport_data = renderer.capture_viewport(viewport).await?;
        stitched_data.write_west(viewport_data.rows());
        viewport_data.finish();
        drop(_enter);

        // Hide date layer for east half (only show once)
        renderer.set_layer_visible(date_layer, false);

        // Render east half
        let span = info_span!("readback_east");
        let _enter = span.enter();
        viewport.rect.origin.x += viewport.rect.size.width;
        let viewport_data = renderer.capture_viewport(viewport).await?;
        stitched_data.write_east(viewport_data.rows());
        viewport_data.finish();
        stitched_data.into_inner()
    } else {
        let mut image_buffer = vec![0u8; (width * height * 4) as usize];

        let span = info_span!("readback_viewport_data");
        let _enter = span.enter();
        let viewport_data = renderer.capture_viewport(viewport).await?;

        for (src, dst) in viewport_data
            .rows()
            .zip(image_buffer.chunks_exact_mut(width as usize * 4))
        {
            dst.copy_from_slice(src);
        }

        viewport_data.finish();
        image_buffer
    };

    let span = info_span!("RgbaImage::from_raw");
    let _enter = span.enter();
    let output_img = image::RgbaImage::from_raw(width, height, image_data)
        .ok_or("Failed to create image from raw buffer")?;
    drop(_enter);

    let span = info_span!("RgbaImage::save", output = %output.display());
    let _enter = span.enter();
    output_img.save(output)?;
    drop(_enter);

    Ok(())
}
