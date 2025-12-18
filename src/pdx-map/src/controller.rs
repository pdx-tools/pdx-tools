use crate::{
    CanvasDimensions, MapViewport, RenderError, SurfaceMapRenderer,
    renderer::{ColorIdReadback, QueuedWorkFuture},
};

pub struct MapViewController {
    renderer: SurfaceMapRenderer,
    viewport: MapViewport,
}

impl MapViewController {
    pub fn new(renderer: SurfaceMapRenderer, tile_width: u32, tile_height: u32) -> Self {
        let viewport = MapViewport::new(
            renderer.dimensions().canvas_width,
            renderer.dimensions().canvas_height,
            tile_width,
            tile_height,
        );

        MapViewController { renderer, viewport }
    }

    pub fn get_zoom(&self) -> f32 {
        self.viewport.zoom_level()
    }

    pub fn canvas_to_world(&self, canvas_x: f32, canvas_y: f32) -> (f32, f32) {
        self.viewport.canvas_to_world(canvas_x, canvas_y)
    }

    /// Get access to the underlying renderer
    pub fn renderer(&self) -> &SurfaceMapRenderer {
        &self.renderer
    }

    /// Get mutable access to the underlying renderer
    pub fn renderer_mut(&mut self) -> &mut SurfaceMapRenderer {
        &mut self.renderer
    }

    /// Get the canvas dimensions
    pub fn canvas_dimensions(&self) -> CanvasDimensions {
        self.renderer.dimensions()
    }

    /// Get the tile width (half of map width)
    pub fn tile_width(&self) -> u32 {
        self.viewport.map_width() / 2
    }

    /// Get the tile height (same as map height)
    pub fn tile_height(&self) -> u32 {
        self.viewport.map_height()
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
    pub fn resize(&mut self, logical_width: u32, logical_height: u32) {
        let new_dimensions = CanvasDimensions {
            canvas_width: logical_width,
            canvas_height: logical_height,
            scale_factor: self.renderer.dimensions().scale_factor,
        };
        self.renderer.resize(new_dimensions);
        self.viewport.resize(logical_width, logical_height);
    }

    /// See [`MapViewport::zoom_at_point`]
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(cursor_x, cursor_y, zoom_delta))
    )]
    pub fn zoom_at_point(&mut self, cursor_x: f32, cursor_y: f32, zoom_delta: f32) {
        self.viewport.zoom_at_point(cursor_x, cursor_y, zoom_delta);
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
        world_x: f32,
        world_y: f32,
        canvas_x: f32,
        canvas_y: f32,
    ) {
        self.viewport
            .set_world_point_under_cursor(world_x, world_y, canvas_x, canvas_y);
    }

    /// Get location information under cursor coordinates
    pub fn create_color_id_readback_at(
        &self,
        canvas_x: f32,
        canvas_y: f32,
    ) -> Result<ColorIdReadback, RenderError> {
        // Convert canvas coordinates to world coordinates
        let (world_x, world_y) = self.canvas_to_world(canvas_x, canvas_y);
        let readback = self
            .renderer
            .create_color_id_readback_at(world_x as i32, world_y as i32)?;

        Ok(readback)
    }

    pub fn center_at_world(&mut self, world_x: f32, world_y: f32) {
        let canvas_x = self.renderer.dimensions().canvas_width as f32 / 2.0;
        let canvas_y = self.renderer.dimensions().canvas_height as f32 / 2.0;
        self.set_world_point_under_cursor(world_x, world_y, canvas_x, canvas_y);
    }

    pub fn with_renderer(&self, renderer: SurfaceMapRenderer) -> Self {
        let dimensions = renderer.dimensions();
        let mut controller = MapViewController {
            renderer,
            viewport: self.viewport.clone(),
        };

        controller.resize(dimensions.canvas_width, dimensions.canvas_height);
        controller
    }
}
