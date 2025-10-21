mod app;

pub use app::*;

/// Information about a location returned by cursor lookup
#[derive(Debug, Clone)]
pub struct PickedLocation {
    /// The location ID from the save file
    pub location_id: eu5save::models::LocationId,
}

pub(crate) const EU5_TILE_WIDTH: u32 = 8192;
pub(crate) const EU5_TILE_HEIGHT: u32 = 8192;

/// Get EU5 texture buffer size (width × height × 4 bytes RGBA)
pub const fn texture_buffer_size() -> usize {
    (EU5_TILE_WIDTH * EU5_TILE_HEIGHT * 4) as usize
}

pub const fn world_dimensions() -> (u32, u32) {
    (EU5_TILE_WIDTH * 2, EU5_TILE_HEIGHT)
}

pub const fn tile_dimensions() -> (u32, u32) {
    (EU5_TILE_WIDTH, EU5_TILE_HEIGHT)
}
