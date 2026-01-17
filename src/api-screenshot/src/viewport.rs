use pdx_map::{ViewportBounds, WorldSize};

// EU4 map dimensions
const EU4_WORLD_WIDTH: u32 = 8192;
const EU4_WORLD_HEIGHT: u32 = 4096;

// Fixed output dimensions for screenshots
const OUTPUT_WIDTH: u32 = 1200;
const OUTPUT_HEIGHT: u32 = 630;

/// Calculate viewport for single-player (centered on capital)
pub fn calculate_sp_viewport(capital_x: u16, capital_y: u16) -> ViewportBounds {
    let mut viewport = ViewportBounds::new(WorldSize::new(OUTPUT_WIDTH, OUTPUT_HEIGHT));

    // Center horizontally with proper wraparound handling
    let x_centered = capital_x as i32 - (OUTPUT_WIDTH / 2) as i32;
    let x = x_centered.rem_euclid(EU4_WORLD_WIDTH as i32) as u32;

    // Center vertically, clamped to world bounds
    let y = (capital_y as i32 - (OUTPUT_HEIGHT / 2) as i32)
        .max(0)
        .min((EU4_WORLD_HEIGHT - OUTPUT_HEIGHT) as i32) as u32;

    viewport.rect.origin.x = x;
    viewport.rect.origin.y = y;

    viewport
}

/// Calculate viewport for multiplayer (full world)
pub fn calculate_mp_viewport() -> ViewportBounds {
    // For multiplayer, we want to capture the entire world
    // The output will be 1200×630, but we render the full world (8192×4096)
    // and let the renderer handle the downscaling
    let mut viewport = ViewportBounds::new(WorldSize::new(EU4_WORLD_WIDTH, EU4_WORLD_HEIGHT));

    viewport.rect.origin.x = 0;
    viewport.rect.origin.y = 0;

    viewport
}

/// Get output dimensions (always 1200×630)
pub fn output_dimensions() -> (u32, u32) {
    (OUTPUT_WIDTH, OUTPUT_HEIGHT)
}

/// Get EU4 world dimensions
pub fn world_dimensions() -> (u32, u32) {
    (EU4_WORLD_WIDTH, EU4_WORLD_HEIGHT)
}
