mod color;
mod image;
mod loc_arrays;
mod picker;
mod viewport;

#[cfg(feature = "render")]
mod controller;
#[cfg(feature = "render")]
mod error;
#[cfg(feature = "render")]
mod renderer;

pub use color::GpuColor;
pub use image::*;
pub use loc_arrays::*;
pub use picker::*;
pub use viewport::*;

#[cfg(feature = "render")]
pub use controller::MapViewController;
#[cfg(feature = "render")]
pub use error::{RenderError, RenderErrorKind};
#[cfg(feature = "render")]
pub use renderer::{
    ColorIdReadback, GpuContext, GpuSurfaceContext, HeadlessMapRenderer, MapRenderer, MapResources,
    MapScene, MapTexture, QueuedWorkFuture, RenderConfig, RenderLayer, SurfaceMapRenderer,
};
#[cfg(feature = "render")]
pub use wgpu;

/// Canvas dimensions in logical pixels (eg: browser window size)
#[derive(Debug, Clone, Copy, PartialEq)]
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

impl std::fmt::Display for CanvasDimensions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}x{} @ {:.2}x = {}x{}",
            self.canvas_width,
            self.canvas_height,
            self.scale_factor,
            self.physical_width(),
            self.physical_height()
        )
    }
}
