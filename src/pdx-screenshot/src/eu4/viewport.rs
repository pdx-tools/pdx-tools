use eu4game::game::Game;
use eu4save::query::Query;
use pdx_map::{HemisphereSize, PhysicalSize, ViewportBounds, WorldPoint, WorldSize};

pub(super) const EU4_HEMISPHERE_SIZE: HemisphereSize<u32> = HemisphereSize::new(2816, 2048);
pub(super) const EU4_WORLD_SIZE: WorldSize<u32> = EU4_HEMISPHERE_SIZE.world();
pub(super) const OUTPUT_IMAGE_SIZE: PhysicalSize<u32> = PhysicalSize::new(1200, 630);

fn viewport_bounds(origin: WorldPoint<u32>, size: WorldSize<u32>) -> ViewportBounds {
    let mut viewport = ViewportBounds::new(size);
    viewport.rect.origin = origin;
    viewport
}

fn centered_viewport(center: WorldPoint<u32>, size: WorldSize<u32>) -> ViewportBounds {
    let half_size = size / 2;
    let x =
        (center.x as i64 - half_size.width as i64).rem_euclid(EU4_WORLD_SIZE.width as i64) as u32;
    let y = center
        .y
        .saturating_sub(half_size.height)
        .min(EU4_WORLD_SIZE.height.saturating_sub(size.height));

    viewport_bounds(WorldPoint::new(x, y), size)
}

/// Calculate viewport for single-player (centered on capital)
pub fn calculate_sp_viewport(center: WorldPoint<u32>) -> ViewportBounds {
    const OUTPUT_WORLD_SIZE: WorldSize<u32> =
        WorldSize::new(OUTPUT_IMAGE_SIZE.width, OUTPUT_IMAGE_SIZE.height);

    centered_viewport(center, OUTPUT_WORLD_SIZE)
}

/// Calculate viewport for multiplayer (full world)
pub fn calculate_mp_viewport() -> ViewportBounds {
    // Match CSS object-fit: cover. The OG image is slightly narrower than the
    // EU4 world aspect ratio, so use full height and crop the east/west edges.
    let width = EU4_WORLD_SIZE.height * OUTPUT_IMAGE_SIZE.width / OUTPUT_IMAGE_SIZE.height;
    viewport_bounds(
        WorldPoint::new((EU4_WORLD_SIZE.width - width) / 2, 0),
        WorldSize::new(width, EU4_WORLD_SIZE.height),
    )
}

/// Get the player's capital coordinates for single-player viewport placement.
pub fn player_capital_anchor(query: &Query, game: &Game) -> Option<(u16, u16)> {
    let player_tag = &query.save().meta.player;
    let country = query.country(player_tag)?;
    let capital_id = country.capital;
    let capital_prov = game.get_province(&capital_id)?;

    Some((capital_prov.center_x, capital_prov.center_y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multiplayer_viewport_covers_output_aspect() {
        let viewport = calculate_mp_viewport();

        assert_eq!(viewport.rect.size.width, 3900);
        assert_eq!(viewport.rect.size.height, EU4_WORLD_SIZE.height);
        assert_eq!(viewport.rect.origin.x, 866);
        assert_eq!(viewport.rect.origin.y, 0);
    }

    #[test]
    fn singleplayer_viewport_wraps_x_and_clamps_y() {
        let viewport = calculate_sp_viewport(WorldPoint::new(100, 100));

        assert_eq!(viewport.rect.size.width, OUTPUT_IMAGE_SIZE.width);
        assert_eq!(viewport.rect.size.height, OUTPUT_IMAGE_SIZE.height);
        assert_eq!(viewport.rect.origin.x, 5132);
        assert_eq!(viewport.rect.origin.y, 0);

        let viewport = calculate_sp_viewport(WorldPoint::new(5500, 2000));

        assert_eq!(viewport.rect.origin.x, 4900);
        assert_eq!(viewport.rect.origin.y, 1418);
    }
}
