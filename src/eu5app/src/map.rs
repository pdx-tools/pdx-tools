use pdx_map::HemisphereSize;
use serde::{Deserialize, Serialize};

/// Information about a location returned by cursor lookup
#[derive(Debug, Clone)]
pub struct PickedLocation {
    /// The location ID from the save file
    pub location_id: eu5save::models::LocationId,
}

/// Get EU5 texture buffer size (width × height × 4 bytes RGBA)
pub fn texture_buffer_size() -> usize {
    (hemisphere_size().area() * 4) as usize
}

/// Get EU5 hemisphere size in pixels
pub const fn hemisphere_size() -> HemisphereSize<u32> {
    HemisphereSize::new(8192, 8192)
}

/// Determine if the user is zoomed in close enough to show individual locations
pub const fn should_highlight_individual_locations(zoom: f32) -> bool {
    zoom >= 0.85
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MapMode {
    Political,
    Control,
    Development,
    Population,
    Markets,
    RgoLevel,
    BuildingLevels,
    PossibleTax,
    Religion,
}

impl MapMode {
    pub fn name(&self) -> &'static str {
        match self {
            MapMode::Political => "Political",
            MapMode::Control => "Control",
            MapMode::Development => "Development",
            MapMode::Population => "Population",
            MapMode::Markets => "Markets",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::PossibleTax => "Possible Tax",
            MapMode::Religion => "Religion",
        }
    }
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDimensions {
    /// Logical width in pixels
    pub canvas_width: u32,

    /// Logical height in pixels
    pub canvas_height: u32,

    /// Device Pixel Ratio
    pub scale_factor: f32,
}

impl CanvasDimensions {
    pub fn physical_width(&self) -> u32 {
        (self.canvas_width as f32 * self.scale_factor) as u32
    }

    pub fn physical_height(&self) -> u32 {
        (self.canvas_height as f32 * self.scale_factor) as u32
    }
}
