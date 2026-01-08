use crate::{
    LogicalPoint, LogicalSize, MapViewport, RenderError, SurfaceMapRenderer, WorldSize,
    renderer::{ColorIdReadback, QueuedWorkFuture},
    units::WorldPoint,
};

pub struct MapViewController {
    renderer: SurfaceMapRenderer,
    viewport: MapViewport,
    size: LogicalSize<u32>,
    scale_factor: f32,
}

impl MapViewController {
    pub fn new(renderer: SurfaceMapRenderer, size: LogicalSize<u32>, scale_factor: f32) -> Self {
        let tile_width = renderer.tile_width();
        let tile_height = renderer.tile_height();
        let viewport = MapViewport::new(size, WorldSize::new(tile_width, tile_height));

        MapViewController {
            renderer,
            viewport,
            size,
            scale_factor,
        }
    }

    pub fn get_zoom(&self) -> f32 {
        self.viewport.zoom_level()
    }

    pub fn canvas_to_world(&self, canvas_x: f32, canvas_y: f32) -> WorldPoint<f32> {
        self.viewport
            .canvas_to_world(LogicalPoint::new(canvas_x, canvas_y))
    }

    /// Get access to the underlying renderer
    pub fn renderer(&self) -> &SurfaceMapRenderer {
        &self.renderer
    }

    /// Get mutable access to the underlying renderer
    pub fn renderer_mut(&mut self) -> &mut SurfaceMapRenderer {
        &mut self.renderer
    }

    /// Get the logical size of the canvas
    pub fn logical_size(&self) -> LogicalSize<u32> {
        self.size
    }

    /// Get the scale factor
    pub fn scale_factor(&self) -> f32 {
        self.scale_factor
    }

    /// Get the tile width (half of map width)
    pub fn tile_width(&self) -> u32 {
        self.renderer().tile_width()
    }

    /// Get the tile height (same as map height)
    pub fn tile_height(&self) -> u32 {
        self.renderer().tile_height()
    }

    pub fn render(&mut self) -> Result<(), RenderError> {
        let bounds = self.viewport.viewport_bounds();
        self.renderer.render(bounds)
    }

    pub fn queued_work(&self) -> QueuedWorkFuture {
        self.renderer.queued_work()
    }

    /// Resize with surface reconfiguration
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(logical_width, logical_height))
    )]
    pub fn resize(&mut self, size: LogicalSize<u32>) {
        self.size = size;
        self.renderer.resize(size.to_physical(self.scale_factor));
        self.viewport.resize(size);
    }

    /// See [`MapViewport::zoom_at_point`]
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(cursor_x, cursor_y, zoom_delta))
    )]
    pub fn zoom_at_point(&mut self, cursor_x: f32, cursor_y: f32, zoom_delta: f32) {
        self.viewport
            .zoom_at_point(LogicalPoint::new(cursor_x, cursor_y), zoom_delta);
    }

    /// Set world point under cursor
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(
            skip_all,
            level = "debug",
            fields(world_x, world_y, canvas_x, canvas_y)
        )
    )]
    pub fn set_world_point_under_cursor(
        &mut self,
        world: WorldPoint<f32>,
        canvas: LogicalPoint<f32>,
    ) {
        self.viewport.set_world_point_under_cursor(world, canvas);
    }

    /// Get location information under cursor coordinates
    pub fn create_color_id_readback_at(
        &self,
        canvas_x: f32,
        canvas_y: f32,
    ) -> Result<ColorIdReadback, RenderError> {
        // Convert canvas coordinates to world coordinates
        let world_coords = self.canvas_to_world(canvas_x, canvas_y);
        let readback = self
            .renderer
            .create_color_id_readback_at(world_coords.x as i32, world_coords.y as i32)?;

        Ok(readback)
    }

    pub fn center_at_world(&mut self, world: WorldPoint<f32>) {
        let canvas_x = self.size.width as f32 / 2.0;
        let canvas_y = self.size.height as f32 / 2.0;
        let canvas = LogicalPoint::new(canvas_x, canvas_y);
        self.set_world_point_under_cursor(world, canvas);
    }
}
