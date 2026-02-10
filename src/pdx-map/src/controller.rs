use crate::{
    HemisphereSize, PhysicalSize, RenderError, SurfaceMapRenderer, ViewportBounds, WorldPoint,
    renderer::{ColorIdReadback, QueuedWorkFuture},
};

pub struct MapViewController {
    renderer: SurfaceMapRenderer,
    viewport_bounds: ViewportBounds,
}

impl MapViewController {
    pub fn new(renderer: SurfaceMapRenderer) -> Self {
        // Initialize with default viewport bounds
        let viewport_bounds = ViewportBounds::new(renderer.hemisphere_size().world());

        MapViewController {
            renderer,
            viewport_bounds,
        }
    }

    /// Set viewport bounds from input controller.
    ///
    /// This method should be called after input events to update the viewport
    /// used for rendering.
    pub fn set_viewport_bounds(&mut self, bounds: ViewportBounds) {
        self.viewport_bounds = bounds;
    }

    /// Get current zoom level from viewport bounds.
    pub fn get_zoom(&self) -> f32 {
        self.viewport_bounds.zoom_level
    }

    /// Get access to the underlying renderer
    pub fn renderer(&self) -> &SurfaceMapRenderer {
        &self.renderer
    }

    /// Get mutable access to the underlying renderer
    pub fn renderer_mut(&mut self) -> &mut SurfaceMapRenderer {
        &mut self.renderer
    }

    /// Get the tile size
    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.renderer.hemisphere_size()
    }

    /// Get current viewport bounds.
    pub fn viewport_bounds(&self) -> ViewportBounds {
        self.viewport_bounds
    }

    pub fn render(&mut self) -> Result<(), RenderError> {
        self.renderer.render(self.viewport_bounds)
    }

    pub fn queued_work(&self) -> QueuedWorkFuture {
        self.renderer.queued_work()
    }

    /// Resize with surface reconfiguration.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(physical_width, physical_height))
    )]
    pub fn resize(&mut self, size: PhysicalSize<u32>) {
        self.renderer.resize(size);
    }

    /// Get location information at world coordinates.
    pub fn create_color_id_readback_at(
        &self,
        world_pos: WorldPoint<i32>,
    ) -> Result<ColorIdReadback, RenderError> {
        self.renderer.create_color_id_readback_at(world_pos)
    }
}
