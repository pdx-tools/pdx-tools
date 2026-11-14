mod color;
mod hash;
mod loc_arrays;
mod pixel;
mod units;
mod viewport;
mod world;

#[cfg(feature = "render")]
mod error;
#[cfg(feature = "render")]
mod frame_tracker;
#[cfg(feature = "render")]
mod image;
#[cfg(feature = "interaction")]
mod interaction;
#[cfg(feature = "date-layer")]
pub mod layers;
#[cfg(feature = "render")]
mod renderer;

pub use color::GpuColor;
pub use loc_arrays::*;
pub use pixel::{R16, R16Palette, R16SecondaryMap, Rgb};
pub use units::*;
pub use viewport::{JumpZoom, MapViewport, PanTarget, ViewportBounds, ViewportInsets};
pub use world::{Aabb, Hemisphere, LocationBitset, SpatialIndex, TopologyIndex, World};

#[cfg(feature = "render")]
pub use error::{RenderError, RenderErrorKind, SurfaceError};
#[cfg(feature = "render")]
pub use image::{Strip, StripPlan};
#[cfg(feature = "interaction")]
pub use interaction::{Clock, InteractionController, KeyboardKey, MouseButton, default_clock};
#[cfg(feature = "render")]
pub use renderer::{
    ColorIdReadback, GpuContext, GpuSurfaceContext, HeadlessMapRenderer, LayerId, MapTexture,
    QueuedWorkFuture, RenderLayer, ScreenshotRenderer, SurfaceMapRenderer,
};
#[cfg(feature = "render")]
pub use wgpu;

/// Canvas dimensions with a logical size and scale factor.
///
/// Helper type bundling logical size and scale factor.
/// Used by WASM bindings and platform integration layers for convenience.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CanvasDimensions {
    size: LogicalSize<u32>,
    scale_factor: f32,
}

impl CanvasDimensions {
    /// Create a new CanvasDimensions from a logical size.
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
