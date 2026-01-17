use pdx_map::{
    GpuColor, GpuContext, GpuLocationIdx, HeadlessMapRenderer, LocationArrays, LocationFlags,
    LocationId,
};

use super::save::ParsedSave;
use super::viewport;
use super::{PatchScreenshotAssets, ScreenshotError};
use pdx_map::WorldPoint;
use pdx_map::layers::DateLayer;

/// Render a screenshot from parsed save data
#[tracing::instrument(
    level = "debug",
    name = "screenshot.render",
    skip(parsed, gpu, patch_assets, game_data),
    fields(
        color_count = patch_assets.color_count,
        provinces = patch_assets.color_index.len(),
    )
)]
pub async fn render_screenshot(
    parsed: ParsedSave,
    gpu: &GpuContext,
    patch_assets: &PatchScreenshotAssets,
    game_data: &[u8],
) -> Result<Vec<u8>, ScreenshotError> {
    let game = eu4game::game::Game::from_flatbuffer(game_data);

    let (primary_colors, secondary_colors) = super::colors::generate_political_colors(
        parsed.query.save(),
        &game,
        &patch_assets.color_index,
        patch_assets.color_count,
    );

    let mut location_arrays = LocationArrays::allocate(patch_assets.color_count);

    for (color_idx, (primary_color, secondary_color)) in primary_colors
        .chunks_exact(4)
        .zip(secondary_colors.chunks_exact(4))
        .enumerate()
    {
        let gpu_idx = GpuLocationIdx::new(color_idx as u16);
        let mut gpu_location = location_arrays.get_mut(gpu_idx);
        gpu_location.set_location_id(LocationId::new(color_idx as u32));
        gpu_location.set_primary_color(GpuColor::from_rgb(
            primary_color[0],
            primary_color[1],
            primary_color[2],
        ));
        gpu_location.set_secondary_color(GpuColor::from_rgb(
            secondary_color[0],
            secondary_color[1],
            secondary_color[2],
        ));
        gpu_location.set_owner_color(GpuColor::from_rgb(
            primary_color[0],
            primary_color[1],
            primary_color[2],
        ));
    }

    for province in game.provinces() {
        if province.is_habitable() {
            continue;
        }

        let Some(&color_slot) = patch_assets.color_index.get(province.id.as_u16() as usize) else {
            continue;
        };
        let color_idx = color_slot as usize;
        if color_idx >= patch_assets.color_count {
            continue;
        }

        let gpu_idx = GpuLocationIdx::new(color_idx as u16);
        let mut gpu_location = location_arrays.get_mut(gpu_idx);
        gpu_location
            .flags_mut()
            .set(LocationFlags::NO_LOCATION_BORDERS);
    }

    let viewport = if parsed.is_multiplayer() {
        viewport::calculate_mp_viewport()
    } else {
        let center = viewport::player_capital_anchor(&parsed.query, &game)
            .map(|(x, y)| WorldPoint::new(x as u32, y as u32))
            .unwrap_or_else(|| {
                tracing::warn!("player capital not found, using world center");
                let world_center = viewport::EU4_WORLD_SIZE / 2;
                WorldPoint::new(world_center.width, world_center.height)
            });

        viewport::calculate_sp_viewport(center)
    };

    let output_size = viewport::OUTPUT_IMAGE_SIZE;
    let texture_size = viewport::EU4_HEMISPHERE_SIZE.physical();
    let west_view = gpu.create_texture(&patch_assets.west_r16, texture_size, "West Texture");
    let east_view = gpu.create_texture(&patch_assets.east_r16, texture_size, "East Texture");

    let mut renderer = HeadlessMapRenderer::new(
        gpu.clone(),
        west_view,
        east_view,
        output_size.width,
        output_size.height,
    )
    .map_err(ScreenshotError::CreateRenderer)?;

    let date_layer = DateLayer::new(parsed.date(), ((output_size.height / 400).max(1)) * 2);
    renderer.add_layer(date_layer);
    renderer.update_locations(&location_arrays);

    let viewport_data = renderer
        .capture_viewport(viewport)
        .await
        .map_err(ScreenshotError::CaptureViewport)?;

    let mut image_buffer = vec![0u8; (output_size.width * output_size.height * 4) as usize];
    for (src, dst) in viewport_data
        .rows()
        .zip(image_buffer.chunks_exact_mut(output_size.width as usize * 4))
    {
        dst.copy_from_slice(src);
    }

    viewport_data.finish();

    Ok(image_buffer)
}
