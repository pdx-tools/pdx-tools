use crate::eu5_date_layer::DateLayer;
use anyhow::{Result, anyhow};
use clap::Args;
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
};
use eu5save::{BasicTokenResolver, Eu5File};
use pdx_map::{PhysicalSize, StitchedImage, ViewportBounds, World, WorldSize};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use tracing::{info, info_span};

/// Render an EU5 save file into a PNG image.
#[derive(Args)]
pub struct Eu5RenderArgs {
    /// Path to the EU5 save file
    #[arg(value_name = "SAVE_FILE")]
    save_file: PathBuf,

    /// Path to game data (directory, source bundle, or compiled bundle)
    #[arg(short = 'g', long, default_value = "assets")]
    game_data: PathBuf,

    /// Path to EU5 tokens file
    #[arg(short = 't', long, default_value = "assets/eu5.txt")]
    tokens: PathBuf,

    /// Optional width for custom viewport screenshot
    #[arg(short = 'w', long)]
    width: Option<u32>,

    /// Optional height for custom viewport screenshot
    #[arg(short = 'h', long)]
    height: Option<u32>,

    /// Output PNG file path
    #[arg(short = 'o', long, value_name = "OUTPUT")]
    output: PathBuf,
}

impl Eu5RenderArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("Failed to build single-threaded Tokio runtime");

        rt.block_on(async { self.run_async().await })?;
        Ok(ExitCode::SUCCESS)
    }

    async fn run_async(&self) -> Result<()> {
        info!("Using save file: {}", self.save_file.display());
        let file = std::fs::File::open(&self.save_file)?;
        let file = Eu5File::from_file(file)?;

        info!("Using tokens file: {}", self.tokens.display());
        let file_data = std::fs::read(&self.tokens)?;
        let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

        let parser = Eu5SaveLoader::open(file, resolver)?;
        let mut save = parser.parse()?;

        let game_bundle = Eu5GameInstall::open(&self.game_data)?;
        let pipeline_components = pdx_map::GpuContext::new().await?;

        let hemisphere = eu5app::hemisphere_size();
        let size = hemisphere.physical();

        // Access textures as slices directly from the bundle
        let west_view =
            pipeline_components.create_texture(game_bundle.west_texture(), size, "West Texture");
        let east_view =
            pipeline_components.create_texture(game_bundle.east_texture(), size, "East Texture");

        // Zero-copy: Arc::clone just increments ref count (no data duplication)
        let world = game_bundle.world();
        let map_app = Eu5Workspace::new(save.take_gamestate(), game_bundle.into_game_data())?;
        let save_date = map_app.gamestate().metadata().date.date_fmt().to_string();

        // Validate dimensions
        validate_dimensions(self.width, self.height)?;

        // Determine dimensions and centering
        let (width, height, center_on_capital) =
            if let (Some(w), Some(h)) = (self.width, self.height) {
                info!("Rendering custom viewport: {}x{}", w, h);
                (w, h, true)
            } else {
                let world_size = eu5app::hemisphere_size().world();
                info!(
                    "Rendering full world: {}x{}",
                    world_size.width, world_size.height
                );
                (world_size.width, world_size.height, false)
            };

        render_viewport(
            map_app,
            &world,
            &pipeline_components,
            west_view,
            east_view,
            save_date,
            width,
            height,
            center_on_capital,
            &self.output,
        )
        .await
    }
}

/// Validate that width and height are both provided or both absent
fn validate_dimensions(width: Option<u32>, height: Option<u32>) -> Result<()> {
    match (width, height) {
        (Some(w), Some(h)) => {
            if w == 0 || h == 0 {
                return Err(anyhow!("Width and height must be greater than 0"));
            }

            let world_height = eu5app::hemisphere_size().world().height;
            if h > world_height {
                return Err(anyhow!(
                    "Height {} exceeds world height {}",
                    h,
                    world_height
                ));
            }

            Ok(())
        }
        (None, None) => Ok(()),
        _ => Err(anyhow!(
            "Both --width and --height must be specified together"
        )),
    }
}

/// Calculate viewport bounds centered on player's capital (or world center as fallback)
/// Returns (x_offset, y_offset)
fn calculate_viewport_bounds(
    map_app: &Eu5Workspace,
    world: &World<pdx_map::R16>,
    width: u32,
    height: u32,
) -> (u32, u32) {
    let hemisphere = eu5app::hemisphere_size();

    let (capital_x, capital_y) = map_app
        .player_capital_color_id()
        .map(|color_id| {
            let center = world.center_of(pdx_map::R16::new(color_id.value()));
            (center.x as u16, center.y as u16)
        })
        .unwrap_or((hemisphere.width as u16, hemisphere.height as u16 / 2));

    let x_centered = capital_x as i32 - (width / 2) as i32;
    let x = x_centered.rem_euclid(hemisphere.world().width as i32) as u32;

    let y = (capital_y as i32 - (height / 2) as i32)
        .max(0)
        .min((hemisphere.world().height - height) as i32) as u32;

    (x, y)
}

/// Calculate proportional text scale based on viewport height
fn calculate_text_scale(viewport_height: u32) -> u32 {
    // Scale formula: height / 400 gives good proportions
    // Examples: 8192->20, 4096->10, 2048->5, 1024->2
    (viewport_height / 400).max(2)
}

#[expect(clippy::too_many_arguments)]
async fn render_viewport(
    mut map_app: Eu5Workspace<'_>,
    world: &World<pdx_map::R16>,
    pipeline_components: &'_ pdx_map::GpuContext,
    west_view: pdx_map::MapTexture,
    east_view: pdx_map::MapTexture,
    save_date: String,
    width: u32,
    height: u32,
    center_on_capital: bool,
    output: &'_ Path,
) -> Result<()> {
    // Calculate viewport position
    let (x_offset, y_offset) = if center_on_capital {
        calculate_viewport_bounds(&map_app, world, width, height)
    } else {
        // Full world starts at origin
        (0, 0)
    };

    let hemisphere = eu5app::hemisphere_size();
    let viewport_width = if width > hemisphere.width {
        width / 2
    } else {
        width
    };

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

    // For viewports wider than tile_width (8192), stitch two renders together
    let image_data = if width > hemisphere.width {
        assert!(
            width <= hemisphere.width * 2,
            "viewport width exceeds maximum for stitching"
        );

        let mut stitched_data = StitchedImage::new(PhysicalSize::new(width, height));

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
        .ok_or_else(|| anyhow!("Failed to create image from raw buffer"))?;
    drop(_enter);

    let span = info_span!("RgbaImage::save", output = %output.display());
    let _enter = span.enter();
    output_img.save(output)?;
    drop(_enter);

    Ok(())
}
