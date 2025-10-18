use crate::{
    CanvasDimensions, GpuColor, GpuLocationIdx, MapRenderer, MapViewport, RenderError,
    SurfaceMapRenderer, SurfaceRenderer, ViewportBounds,
    renderer::{ColorIdReadback, HeadlessMapRenderer, QueuedWorkFuture},
};

pub struct MapApp<R: MapRenderer> {
    renderer: R,
    viewport: MapViewport,
    canvas_dimensions: CanvasDimensions,
}

impl<R: MapRenderer> MapApp<R> {
    /// Create a new MapApp with any MapRenderer
    pub fn new(renderer: R, display: CanvasDimensions, tile_width: u32, tile_height: u32) -> Self {
        let viewport = MapViewport::new(
            display.canvas_width,
            display.canvas_height,
            tile_width,
            tile_height,
        );

        MapApp {
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
    pub fn renderer(&self) -> &R {
        &self.renderer
    }

    /// Get mutable access to the underlying renderer
    pub fn renderer_mut(&mut self) -> &mut R {
        &mut self.renderer
    }

    pub fn lookup_color_idx(&self, color: GpuColor) -> Option<GpuLocationIdx> {
        let location_arrays = self.renderer.location_arrays();
        location_arrays.find(color)
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

impl MapApp<SurfaceMapRenderer> {
    pub fn render(&self) {
        let bounds = self.viewport.viewport_bounds();
        self.renderer.render_scene(bounds);
    }

    pub fn queued_work(&self) -> QueuedWorkFuture {
        self.renderer.queued_work()
    }

    pub fn present(&self) -> Result<(), RenderError> {
        self.renderer().present()
    }

    /// Resize with surface reconfiguration
    pub fn resize(&mut self, logical_width: u32, logical_height: u32) {
        self.renderer.resize(logical_width, logical_height);
        self.viewport.resize(logical_width, logical_height);
    }

    /// Zoom with automatic re-render and present
    pub fn zoom_at_point(&mut self, cursor_x: f32, cursor_y: f32, zoom_delta: f32) {
        // Delegate zoom logic to map viewport
        self.viewport.zoom_at_point(cursor_x, cursor_y, zoom_delta);
    }

    /// Set world point under cursor with automatic re-render and present
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
    #[cfg(feature = "render")]
    pub fn create_screenshot_renderer(
        &self,
        surface: wgpu::Surface<'static>,
    ) -> Result<ScreenshotRenderer<SurfaceMapRenderer>, RenderError> {
        let screenshot_surface_renderer = self.renderer().create_screenshot_renderer(surface)?;

        Ok(ScreenshotRenderer::new(
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

impl<R: MapRenderer> ScreenshotRenderer<R> {
    /// Create a new ScreenshotRenderer
    pub fn new(mut renderer: R, tile_width: u32, tile_height: u32) -> Self {
        renderer.set_location_borders(true);
        Self {
            renderer,
            tile_width,
            tile_height,
        }
    }

    /// Render the western tile
    pub fn render_west(&self) {
        let west_bounds = ViewportBounds {
            x: 0,
            y: 0,
            width: self.tile_width,
            height: self.tile_height,
            zoom_level: 1.0,
        };
        self.renderer.render_scene(west_bounds);
    }

    /// Render the eastern tile
    pub fn render_east(&self) {
        let east_bounds = ViewportBounds {
            x: self.tile_width,
            y: 0,
            width: self.tile_width,
            height: self.tile_height,
            zoom_level: 1.0,
        };
        self.renderer.render_scene(east_bounds);
    }
}

/// Surface-specific screenshot methods
impl<R: SurfaceRenderer> ScreenshotRenderer<R> {
    /// Present the rendered content to the surface
    ///
    /// Call this after `render_west()` or `render_east()` to display
    /// the rendered tile on the surface.
    pub fn present(&self) -> Result<(), RenderError> {
        self.renderer.present()
    }
}

/// Headless-specific screenshot methods
impl ScreenshotRenderer<HeadlessMapRenderer> {
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
