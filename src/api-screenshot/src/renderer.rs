use anyhow::{Context, Result};
use pdx_map::{
    GpuColor, GpuContext, GpuLocationIdx, HeadlessMapRenderer, LocationArrays, LocationFlags,
    LocationId,
};

use crate::date_layer::DateLayer;
use crate::parser::ParsedSave;
use crate::viewport;

/// Render a screenshot from parsed save data
pub async fn render_screenshot(
    parsed: ParsedSave,
    gpu: &GpuContext,
    west_texture: Vec<u8>,
    west_width: u32,
    west_height: u32,
    east_texture: Vec<u8>,
    east_width: u32,
    east_height: u32,
    game_data: Vec<u8>,
    color_index: Vec<u16>,
    color_count: usize,
    is_multiplayer: bool,
) -> Result<Vec<u8>> {
    tracing::info!("Starting screenshot rendering");

    // Load game data
    let game = eu4game::game::Game::from_flatbuffer(&game_data);

    // Generate political map colors
    tracing::debug!("Generating political map colors");
    let (primary_colors, secondary_colors) = crate::colors::generate_political_colors(
        &parsed.save,
        &parsed.query,
        &game,
        &color_index,
        color_count,
    );

    tracing::debug!(
        "Creating location arrays (size: {}, provinces: {})",
        color_count,
        color_index.len()
    );
    let mut location_arrays = LocationArrays::allocate(color_count);

    // Populate location arrays with colors
    // The primary/secondary color buffers are indexed by color_idx (from color-order)
    for color_idx in 0..color_count {
        let offset = color_idx * 4;

        // Get RGBA colors from buffers (if they exist in this range)
        let (primary_r, primary_g, primary_b) = if offset + 2 < primary_colors.len() {
            (
                primary_colors[offset],
                primary_colors[offset + 1],
                primary_colors[offset + 2],
            )
        } else {
            (0, 0, 0) // Default for missing colors
        };

        let (secondary_r, secondary_g, secondary_b) = if offset + 2 < secondary_colors.len() {
            (
                secondary_colors[offset],
                secondary_colors[offset + 1],
                secondary_colors[offset + 2],
            )
        } else {
            (0, 0, 0) // Default for missing colors
        };

        // Set colors in location array
        // GpuLocationIdx is the color index (from color-order)
        // LocationId should be set to the province ID that uses this color, but for EU4 we use color_idx
        let gpu_idx = GpuLocationIdx::new(color_idx as u16);
        let mut gpu_location = location_arrays.get_mut(gpu_idx);
        gpu_location.set_location_id(LocationId::new(color_idx as u32));
        gpu_location.set_primary_color(GpuColor::from_rgb(primary_r, primary_g, primary_b));
        gpu_location.set_secondary_color(GpuColor::from_rgb(secondary_r, secondary_g, secondary_b));
        gpu_location.set_owner_color(GpuColor::from_rgb(primary_r, primary_g, primary_b));
    }

    for province in game.provinces() {
        if province.is_habitable() {
            continue;
        }

        let id_u16 = province.id.as_u16() as usize;
        if id_u16 >= color_index.len() {
            continue;
        }

        let color_idx = color_index[id_u16] as usize;
        if color_idx >= color_count {
            continue;
        }

        let gpu_idx = GpuLocationIdx::new(color_idx as u16);
        let mut gpu_location = location_arrays.get_mut(gpu_idx);
        gpu_location
            .flags_mut()
            .set(LocationFlags::NO_LOCATION_BORDERS);
    }

    // Determine viewport based on single-player vs multiplayer
    let viewport = if is_multiplayer {
        tracing::info!("Using full world viewport (multiplayer)");
        viewport::calculate_mp_viewport()
    } else {
        // Get player capital coordinates
        let (capital_x, capital_y) =
            crate::colors::get_player_capital_coordinates(&parsed.save, &parsed.query, &game)
                .unwrap_or_else(|| {
                    let (world_width, world_height) = viewport::world_dimensions();
                    tracing::warn!("Could not find player capital, using world center");
                    (world_width as u16 / 2, world_height as u16 / 2)
                });

        tracing::info!(
            "Centering viewport on capital ({}, {})",
            capital_x,
            capital_y
        );
        viewport::calculate_sp_viewport(capital_x, capital_y)
    };

    // Create textures
    let (output_width, output_height) = viewport::output_dimensions();

    tracing::debug!(
        "Creating GPU textures (west: {}×{}, east: {}×{})",
        west_width,
        west_height,
        east_width,
        east_height
    );
    let west_view = gpu.create_texture(&west_texture, west_width, west_height, "West Texture");
    let east_view = gpu.create_texture(&east_texture, east_width, east_height, "East Texture");

    // Create headless renderer
    tracing::debug!(
        "Creating headless renderer (output: {}×{})",
        output_width,
        output_height
    );
    let mut renderer = HeadlessMapRenderer::new(
        gpu.clone(),
        west_view,
        east_view,
        output_width,
        output_height,
    )
    .context("Failed to create headless renderer")?;

    // Add date layer
    tracing::debug!("Adding date layer overlay");
    let text_scale = calculate_text_scale(output_height);
    let date_layer = DateLayer::new(parsed.metadata.date.clone(), text_scale);
    renderer.add_layer(date_layer);

    // Update locations
    tracing::debug!("Updating renderer locations");
    renderer.update_locations(&location_arrays);

    // Capture viewport
    tracing::info!("Capturing viewport");
    let viewport_data = renderer
        .capture_viewport(viewport)
        .await
        .context("Failed to capture viewport")?;

    // Copy image data
    let mut image_buffer = vec![0u8; (output_width * output_height * 4) as usize];
    for (src, dst) in viewport_data
        .rows()
        .zip(image_buffer.chunks_exact_mut(output_width as usize * 4))
    {
        dst.copy_from_slice(src);
    }

    viewport_data.finish();

    tracing::info!("Screenshot rendering complete");
    Ok(image_buffer)
}

/// Calculate text scale based on viewport height
fn calculate_text_scale(viewport_height: u32) -> u32 {
    ((viewport_height / 400).max(1)) * 2
}
