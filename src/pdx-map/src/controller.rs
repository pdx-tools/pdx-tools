use crate::{
    CanvasDimensions, MapViewport, RenderError, SurfaceMapRenderer, ViewportBounds,
    renderer::{ColorIdReadback, HeadlessMapRenderer, QueuedWorkFuture},
    wgpu::SurfaceTarget,
};

pub struct MapViewController {
    renderer: SurfaceMapRenderer,
    viewport: MapViewport,
    canvas_dimensions: CanvasDimensions,
}

impl MapViewController {
    pub fn new(
        renderer: SurfaceMapRenderer,
        display: CanvasDimensions,
        tile_width: u32,
        tile_height: u32,
    ) -> Self {
        let viewport = MapViewport::new(
            display.canvas_width,
            display.canvas_height,
            tile_width,
            tile_height,
        );

        MapViewController {
            renderer,
            viewport,
            canvas_dimensions: display,
        }
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
        self.canvas_dimensions
    }

    /// Get the tile width (half of map width)
    pub fn tile_width(&self) -> u32 {
        self.viewport.map_width() / 2
    }

    /// Get the tile height (same as map height)
    pub fn tile_height(&self) -> u32 {
        self.viewport.map_height()
    }
}

impl MapViewController {
    pub fn render(&mut self) -> Result<(), RenderError> {
        let bounds = self.viewport.viewport_bounds();
        let mut frame = self.renderer.begin_frame()?;
        frame.draw(self.renderer.queue(), self.renderer.resources(), bounds);
        frame.present(self.renderer.queue());
        Ok(())
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
        self.renderer.resize(logical_width, logical_height);
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
        let canvas_x = self.canvas_dimensions.canvas_width as f32 / 2.0;
        let canvas_y = self.canvas_dimensions.canvas_height as f32 / 2.0;
        self.set_world_point_under_cursor(world_x, world_y, canvas_x, canvas_y);
    }

    /// Create a screenshot renderer from this app
    ///
    /// Creates a new SurfaceMapRenderer with an independent surface (e.g., offscreen canvas)
    /// that shares GPU resources but operates independently for screenshot generation.
    pub fn create_screenshot_renderer(
        &self,
        target: SurfaceTarget<'static>,
        dimensions: CanvasDimensions,
    ) -> Result<ScreenshotRenderer<SurfaceMapRenderer>, RenderError> {
        let screenshot_surface_renderer = self
            .renderer()
            .create_screenshot_renderer(target, dimensions)?;

        Ok(ScreenshotRenderer::new_surface(
            screenshot_surface_renderer,
            self.tile_width(),
            self.tile_height(),
        ))
    }
}

/// Specialized renderer for generating full-map screenshots
pub struct ScreenshotRenderer<R> {
    renderer: R,
    tile_width: u32,
    tile_height: u32,
}

impl ScreenshotRenderer<SurfaceMapRenderer> {
    /// Create a new surface-backed ScreenshotRenderer
    pub fn new_surface(
        mut renderer: SurfaceMapRenderer,
        tile_width: u32,
        tile_height: u32,
    ) -> Self {
        renderer.set_location_borders(true);
        Self {
            renderer,
            tile_width,
            tile_height,
        }
    }

    fn render_bounds(&mut self, bounds: ViewportBounds) -> Result<(), RenderError> {
        let mut frame = self.renderer.begin_frame()?;
        frame.draw(self.renderer.queue(), self.renderer.resources(), bounds);
        frame.present(self.renderer.queue());
        Ok(())
    }

    /// Render the western tile
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    pub fn render_west(&mut self) -> Result<(), RenderError> {
        let west_bounds = ViewportBounds {
            x: 0,
            y: 0,
            width: self.tile_width,
            height: self.tile_height,
            zoom_level: 1.0,
        };
        self.render_bounds(west_bounds)
    }

    /// Render the eastern tile
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    pub fn render_east(&mut self) -> Result<(), RenderError> {
        let east_bounds = ViewportBounds {
            x: self.tile_width,
            y: 0,
            width: self.tile_width,
            height: self.tile_height,
            zoom_level: 1.0,
        };
        self.render_bounds(east_bounds)
    }
}

/// Headless-specific screenshot methods
impl ScreenshotRenderer<HeadlessMapRenderer> {
    pub fn new_headless(
        mut renderer: HeadlessMapRenderer,
        tile_width: u32,
        tile_height: u32,
    ) -> Self {
        renderer.set_location_borders(true);
        Self {
            renderer,
            tile_width,
            tile_height,
        }
    }

    /// Render and read back the western tile
    pub async fn readback_west(&mut self, buffer: &mut [u8]) -> Result<(), RenderError> {
        self.renderer
            .readback_viewport_data(self.tile_width, self.tile_height, buffer, 0)
            .await
    }

    /// Render and read back the eastern tile
    pub async fn readback_east(&mut self, buffer: &mut [u8]) -> Result<(), RenderError> {
        self.renderer
            .readback_viewport_data(self.tile_width, self.tile_height, buffer, self.tile_width)
            .await
    }
}
