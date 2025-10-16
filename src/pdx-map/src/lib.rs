mod color;
mod hashtable;
mod viewport;

#[cfg(feature = "render")]
mod app;
#[cfg(feature = "render")]
mod error;
#[cfg(feature = "render")]
mod renderer;

pub use color::GpuColor;
pub use hashtable::*;
pub use viewport::*;

#[cfg(feature = "render")]
pub use app::{MapApp, ScreenshotRenderer};
#[cfg(feature = "render")]
pub use error::{RenderError, RenderErrorKind};
#[cfg(feature = "render")]
pub use renderer::{
    ColorIdReadback, GpuContext, GpuSurfaceContext, HeadlessMapRenderer, MapRenderer, MapTexture,
    QueuedWorkFuture, Renderer, SurfaceMapRenderer, SurfaceRenderer,
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
