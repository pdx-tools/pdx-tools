use pdx_map::{
    GpuColor, GpuContext, GpuLocationIdx, HeadlessMapRenderer, LocationArrays, LocationFlags,
    LocationId,
};

use super::save::ParsedSave;
use super::viewport;
use super::{PatchScreenshotAssets, ScreenshotError};
use pdx_map::WorldPoint;
use pdx_map::layers::DateLayer;

/// Blend a straight-alpha RGBA overlay into the left edge of an image, starting
/// at row `origin_y`. Rows that do not fit in the image are dropped.
fn blend_overlay(
    image: &mut [u8],
    image_width: u32,
    origin_y: u32,
    overlay: &[u8],
    overlay_width: u32,
) {
    debug_assert!(overlay_width <= image_width, "overlay is wider than image");

    let image_stride = image_width as usize * 4;
    let overlay_stride = overlay_width as usize * 4;

    for (src_row, dst_row) in overlay
        .chunks_exact(overlay_stride)
        .zip(image.chunks_exact_mut(image_stride).skip(origin_y as usize))
    {
        let dst_row = &mut dst_row[..overlay_stride];
        for (src, dst) in src_row.chunks_exact(4).zip(dst_row.chunks_exact_mut(4)) {
            let alpha = u32::from(src[3]);
            for channel in 0..3 {
                let blended =
                    u32::from(src[channel]) * alpha + u32::from(dst[channel]) * (255 - alpha);
                dst[channel] = ((blended + 127) / 255) as u8;
            }
            dst[3] = 255;
        }
    }
}

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
    let is_multiplayer = parsed.is_multiplayer();

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

    let viewport = if is_multiplayer {
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
    let map_image_size = if is_multiplayer {
        viewport::MP_MAP_IMAGE_SIZE
    } else {
        output_size
    };
    let texture_size = viewport::EU4_HEMISPHERE_SIZE.physical();
    let west_view = gpu.create_texture(&patch_assets.west_r16, texture_size, "West Texture");
    let east_view = gpu.create_texture(&patch_assets.east_r16, texture_size, "East Texture");

    let mut renderer = HeadlessMapRenderer::new(
        gpu.clone(),
        west_view,
        east_view,
        map_image_size.width,
        map_image_size.height,
    )
    .map_err(ScreenshotError::CreateRenderer)?;

    let date_scale = ((map_image_size.height / 400).max(1)) * 2;

    if is_multiplayer {
        renderer.set_location_borders(false);
    }
    renderer.update_locations(&location_arrays);

    let viewport_data = renderer
        .capture_viewport(viewport)
        .await
        .map_err(ScreenshotError::CaptureViewport)?;

    let image_stride = output_size.width as usize * 4;
    let mut image_buffer = vec![0u8; image_stride * output_size.height as usize];

    for (src, dst) in viewport_data
        .rows()
        .zip(image_buffer.chunks_exact_mut(image_stride))
    {
        dst.copy_from_slice(src);
    }
    viewport_data.finish();

    // The band below the map continues the ocean, so the seam is invisible.
    let ocean_row = super::colors::OCEAN.repeat(output_size.width as usize);
    for dst in image_buffer
        .chunks_exact_mut(image_stride)
        .skip(map_image_size.height as usize)
    {
        dst.copy_from_slice(&ocean_row);
    }

    let (date_pixels, date_size) = DateLayer::rasterize(&parsed.date(), date_scale);
    let date_y = output_size.height - date_size.height;
    blend_overlay(
        &mut image_buffer,
        output_size.width,
        date_y,
        &date_pixels,
        date_size.width,
    );

    Ok(image_buffer)
}
