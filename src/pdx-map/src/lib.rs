mod color;
mod image;
mod loc_arrays;
mod picker;
mod units;
mod viewport;

#[cfg(feature = "render")]
mod controller;
#[cfg(feature = "render")]
mod error;
#[cfg(feature = "interaction")]
mod interaction;
#[cfg(feature = "render")]
mod renderer;

pub use color::GpuColor;
pub use image::*;
pub use loc_arrays::*;
pub use picker::*;
pub use units::{
    Logical, LogicalPoint, LogicalRect, LogicalSize, Physical, PhysicalPoint, PhysicalRect,
    PhysicalSize, Point, Rect, Size, World, WorldPoint, WorldRect, WorldSize,
};
pub use viewport::*;

#[cfg(feature = "render")]
pub use controller::MapViewController;
#[cfg(feature = "render")]
pub use error::{RenderError, RenderErrorKind};
#[cfg(feature = "interaction")]
pub use interaction::{Clock, InteractionController, KeyboardKey, MouseButton, default_clock};
#[cfg(feature = "render")]
pub use renderer::{
    ColorIdReadback, GpuContext, GpuSurfaceContext, HeadlessMapRenderer, MapRenderer, MapResources,
    MapScene, MapTexture, QueuedWorkFuture, RenderConfig, RenderLayer, SurfaceMapRenderer,
};
#[cfg(feature = "render")]
pub use wgpu;

/// Canvas dimensions in logical pixels (eg: browser window size)
///
/// Helper type bundling logical size and scale factor.
/// Used by controller and WASM bindings for convenience.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CanvasDimensions {
    size: LogicalSize<u32>,
    scale_factor: f32,
}

impl CanvasDimensions {
    pub fn new(width: u32, height: u32, scale_factor: f32) -> Self {
        Self {
            size: LogicalSize::new(width, height),
            scale_factor,
        }
    }

    pub fn scale_factor(&self) -> f32 {
        self.scale_factor
    }

    pub fn logical_size(&self) -> LogicalSize<u32> {
        self.size
    }

    pub fn physical_size(&self) -> PhysicalSize<u32> {
        self.size.to_physical(self.scale_factor)
    }
}

impl std::fmt::Display for CanvasDimensions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let physical = self.physical_size();
        write!(
            f,
            "{}x{} @ {:.2}x = {}x{}",
            self.size.width, self.size.height, self.scale_factor, physical.width, physical.height
        )
    }
}
