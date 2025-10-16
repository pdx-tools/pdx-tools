use std::fmt;

/// Represents the bounds of the current viewport in world coordinates
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewportBounds {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Platform-agnostic map navigation and viewport controller
///
/// Handles viewport positioning, zoom levels, coordinate transformations,
/// and map interaction logic without any rendering or platform-specific concerns.
#[derive(Debug, Clone)]
pub struct MapViewport {
    /// Current viewport position in world coordinates
    viewport_x: u32,
    viewport_y: u32,

    /// Canvas dimensions in logical pixels (display surface size)
    canvas_width: u32,
    canvas_height: u32,

    /// Current zoom level (1.0 = 1:1 pixel mapping)
    zoom_level: f32,

    /// These represent the full logical game world size
    map_width: u32,
    map_height: u32,
}

impl MapViewport {
    /// Create a new MapController with the given canvas and tile dimensions
    pub fn new(canvas_width: u32, canvas_height: u32, tile_width: u32, tile_height: u32) -> Self {
        // Calculate world dimensions (always 2 horizontal tiles)
        let map_width = tile_width * 2;
        let map_height = tile_height;

        // Calculate minimum zoom to ensure texture always fills viewport
        let min_zoom_x = canvas_width as f32 / map_width as f32;
        let min_zoom_y = canvas_height as f32 / map_height as f32;
        let min_zoom = min_zoom_x.max(min_zoom_y).max(1.0);

        // Initial viewport (center of map)
        let initial_world_width = canvas_width.max((canvas_width as f32 / min_zoom) as u32);
        let initial_world_height = canvas_height.max((canvas_height as f32 / min_zoom) as u32);
        let initial_viewport_x = (map_width - initial_world_width) / 2;
        let initial_viewport_y = (map_height - initial_world_height) / 2;

        Self {
            viewport_x: initial_viewport_x,
            viewport_y: initial_viewport_y,
            canvas_width,
            canvas_height,
            zoom_level: min_zoom,
            map_width,
            map_height,
        }
    }

    /// Zoom at a specific point (Google Maps style cursor-centric zoom)
    ///
    /// # Arguments
    /// * `cursor_x` - X coordinate of cursor in canvas pixels
    /// * `cursor_y` - Y coordinate of cursor in canvas pixels  
    /// * `zoom_delta` - Zoom multiplier (e.g., 1.1 to zoom in, 0.9 to zoom out)
    ///
    /// The world point under the cursor will remain stationary during the zoom
    pub fn zoom_at_point(&mut self, cursor_x: f32, cursor_y: f32, zoom_delta: f32) {
        // Calculate the world area currently being displayed
        let current_world_width = self.canvas_width as f32 / self.zoom_level;
        let current_world_height = self.canvas_height as f32 / self.zoom_level;

        // Calculate world position under cursor before zoom
        let cursor_ratio_x = cursor_x / self.canvas_width as f32;
        let cursor_ratio_y = cursor_y / self.canvas_height as f32;
        let world_x = self.viewport_x as f32 + cursor_ratio_x * current_world_width;
        let world_y = self.viewport_y as f32 + cursor_ratio_y * current_world_height;

        // Update zoom level with dynamic minimum zoom bounds checking
        self.zoom_level *= zoom_delta;

        // Calculate minimum zoom to ensure texture always fills viewport
        let min_zoom_x = self.canvas_width as f32 / self.map_width as f32;
        let min_zoom_y = self.canvas_height as f32 / self.map_height as f32;
        let min_zoom = min_zoom_x.max(min_zoom_y);

        self.zoom_level = self.zoom_level.clamp(min_zoom, 2.0);

        // Calculate new world area that will be displayed
        let new_world_width = (self.canvas_width as f32 / self.zoom_level) as u32;
        let new_world_height = (self.canvas_height as f32 / self.zoom_level) as u32;

        // Adjust viewport to keep same world point under cursor
        let new_viewport_x = world_x - cursor_ratio_x * new_world_width as f32;
        let new_viewport_y = world_y - cursor_ratio_y * new_world_height as f32;

        // Apply bounds checking for viewport position - remove horizontal bounds, normalize with wraparound
        let max_y = self.map_height - new_world_height;

        // Handle wraparound for x coordinate
        let new_viewport_x_i32 = new_viewport_x as i32;
        self.viewport_x = ((new_viewport_x_i32 % self.map_width as i32) + self.map_width as i32)
            as u32
            % self.map_width;
        self.viewport_y = (new_viewport_y as i32).max(0).min(max_y as i32) as u32;
    }

    /// Resize the canvas and recalculate zoom constraints
    ///
    /// # Arguments
    /// * `width` - New canvas width in pixels
    /// * `height` - New canvas height in pixels
    ///
    /// This will adjust the zoom level if necessary to maintain minimum zoom constraints
    /// and ensure the viewport position remains valid
    pub fn resize(&mut self, width: u32, height: u32) {
        // Update canvas dimensions
        self.canvas_width = width;
        self.canvas_height = height;

        // Recalculate and apply minimum zoom constraints for new canvas dimensions
        let min_zoom_x = width as f32 / self.map_width as f32;
        let min_zoom_y = height as f32 / self.map_height as f32;
        let min_zoom = min_zoom_x.max(min_zoom_y);
        self.zoom_level = self.zoom_level.max(min_zoom);

        // Ensure viewport position is still valid with new dimensions
        // Remove horizontal bounds checking (wraparound), keep vertical bounds
        let world_height = (height as f32 / self.zoom_level) as u32;
        let max_y = self.map_height.saturating_sub(world_height);
        self.viewport_x %= self.map_width; // Normalize with wraparound
        self.viewport_y = self.viewport_y.min(max_y);
    }

    /// Get current zoom level
    pub fn zoom_level(&self) -> f32 {
        self.zoom_level
    }

    /// Get map width (full world width, double tile width)
    pub fn map_width(&self) -> u32 {
        self.map_width
    }

    /// Get map height (same as tile height)
    pub fn map_height(&self) -> u32 {
        self.map_height
    }

    /// Get the world area currently being displayed (in world coordinates)
    fn world_area(&self) -> (u32, u32) {
        let world_width = (self.canvas_width as f32 / self.zoom_level) as u32;
        let world_height = (self.canvas_height as f32 / self.zoom_level) as u32;
        (world_width, world_height)
    }

    /// Get viewport bounds in world coordinates
    pub fn viewport_bounds(&self) -> ViewportBounds {
        let (width, height) = self.world_area();
        ViewportBounds {
            x: self.viewport_x,
            y: self.viewport_y,
            width,
            height,
        }
    }

    /// Convert canvas coordinates to world coordinates
    ///
    /// # Arguments
    /// * `canvas_x` - X coordinate in canvas pixels
    /// * `canvas_y` - Y coordinate in canvas pixels
    ///
    /// # Returns
    /// World coordinates (x, y) as a tuple
    pub fn canvas_to_world(&self, canvas_x: f32, canvas_y: f32) -> (f32, f32) {
        let world_width = self.canvas_width as f32 / self.zoom_level;
        let world_height = self.canvas_height as f32 / self.zoom_level;

        let canvas_ratio_x = canvas_x / self.canvas_width as f32;
        let canvas_ratio_y = canvas_y / self.canvas_height as f32;

        let world_x = self.viewport_x as f32 + canvas_ratio_x * world_width;
        let world_y = self.viewport_y as f32 + canvas_ratio_y * world_height;

        (world_x, world_y)
    }

    /// Position a world point under a specific canvas cursor position
    ///
    /// # Arguments
    /// * `world_x` - World X coordinate to position
    /// * `world_y` - World Y coordinate to position  
    /// * `canvas_x` - Canvas X coordinate where the world point should appear
    /// * `canvas_y` - Canvas Y coordinate where the world point should appear
    pub fn set_world_point_under_cursor(
        &mut self,
        world_x: f32,
        world_y: f32,
        canvas_x: f32,
        canvas_y: f32,
    ) {
        let world_width = self.canvas_width as f32 / self.zoom_level;
        let world_height = self.canvas_height as f32 / self.zoom_level;

        let canvas_ratio_x = canvas_x / self.canvas_width as f32;
        let canvas_ratio_y = canvas_y / self.canvas_height as f32;

        let new_viewport_x = world_x - canvas_ratio_x * world_width;
        let new_viewport_y = world_y - canvas_ratio_y * world_height;

        // Apply bounds checking - horizontal wraparound, vertical clamping
        let max_y = self.map_height - (world_height as u32);

        // Handle wraparound for x coordinate
        let new_viewport_x_i32 = new_viewport_x as i32;
        self.viewport_x = ((new_viewport_x_i32 % self.map_width as i32) + self.map_width as i32)
            as u32
            % self.map_width;
        self.viewport_y = (new_viewport_y as i32).max(0).min(max_y as i32) as u32;
    }
}

impl fmt::Display for MapViewport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (world_width, world_height) = self.world_area();
        write!(
            f,
            "MapController(viewport=({}, {}), canvas={}x{}, zoom={:.2}, world_area={}x{})",
            self.viewport_x,
            self.viewport_y,
            self.canvas_width,
            self.canvas_height,
            self.zoom_level,
            world_width,
            world_height
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_controller_centers_viewport() {
        let controller = MapViewport::new(1024, 768, 8192, 8192);
        assert!(controller.zoom_level() >= 1.0);
    }

    #[test]
    fn test_zoom_at_point() {
        let mut controller = MapViewport::new(1024, 768, 8192, 8192);
        let initial_zoom = controller.zoom_level();

        // Zoom in at center
        controller.zoom_at_point(512.0, 384.0, 2.0);
        assert!(controller.zoom_level() > initial_zoom);

        // Zoom out
        controller.zoom_at_point(512.0, 384.0, 0.5);
        assert!(controller.zoom_level() < initial_zoom * 2.0);
    }

    #[test]
    fn test_resize() {
        let mut controller = MapViewport::new(1024, 768, 8192, 8192);

        controller.resize(2048, 1536);

        // Zoom should adjust if minimum constraints changed
        let map_width = 8192 * 2;
        let map_height = 8192;
        let min_zoom_x = 2048.0 / map_width as f32;
        let min_zoom_y = 1536.0 / map_height as f32;
        let expected_min = min_zoom_x.max(min_zoom_y);
        assert!(controller.zoom_level() >= expected_min);
    }

    #[test]
    fn test_set_world_point_under_cursor() {
        let mut controller = MapViewport::new(1024, 768, 8192, 8192);

        // Get world coordinates of center of canvas
        let (world_x, world_y) = controller.canvas_to_world(512.0, 384.0);

        // Move that world point to upper-left corner of canvas
        controller.set_world_point_under_cursor(world_x, world_y, 100.0, 100.0);

        // Now that world point should appear at (100, 100) on canvas
        let (new_world_x, new_world_y) = controller.canvas_to_world(100.0, 100.0);

        // Should be approximately the same world coordinates (within floating point precision)
        assert!((new_world_x - world_x).abs() < 1.0);
        assert!((new_world_y - world_y).abs() < 1.0);
    }
}
