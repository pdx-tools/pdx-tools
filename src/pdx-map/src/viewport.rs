use crate::{LogicalPoint, LogicalSize, Rect, WorldRect, WorldSize, units::WorldPoint};
use std::fmt;

/// Represents the bounds of the current viewport in world coordinates
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewportBounds {
    pub rect: WorldRect<u32>,
    pub zoom_level: f32,
}

impl ViewportBounds {
    pub fn new(size: WorldSize<u32>) -> Self {
        Self {
            rect: Rect::new(WorldPoint::new(0, 0), size),
            zoom_level: 1.0,
        }
    }
}

impl std::fmt::Display for ViewportBounds {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} z:{:.2}", self.rect, self.zoom_level)
    }
}

/// Platform-agnostic map navigation and viewport controller
///
/// Handles viewport positioning, zoom levels, coordinate transformations,
/// and map interaction logic without any rendering or platform-specific concerns.
#[derive(Debug, Clone)]
pub struct MapViewport {
    /// Current viewport position in world coordinates
    viewport_position: WorldPoint<u32>,

    /// Canvas dimensions in logical pixels (display surface size)
    canvas_size: LogicalSize<u32>,

    /// Current zoom level (1.0 = 1:1 pixel mapping)
    zoom_level: f32,

    /// These represent the full logical game world size
    map_size: WorldSize<u32>,
}

impl MapViewport {
    const MAX_ZOOM: f32 = 2.0;

    /// Create a new MapController with the given canvas and tile dimensions
    pub fn new(canvas_size: LogicalSize<u32>, tile_size: WorldSize<u32>) -> Self {
        // Calculate world dimensions (always 2 horizontal tiles)
        let map_width = tile_size.width * 2;
        let map_height = tile_size.height;
        let map_size = WorldSize::new(map_width, map_height);

        // Calculate minimum zoom to ensure texture always fills viewport
        let min_zoom = Self::min_zoom_for_canvas(canvas_size, map_size).max(1.0);

        let mut result = Self {
            viewport_position: WorldPoint::new(0, 0),
            canvas_size,
            zoom_level: min_zoom,
            map_size,
        };

        // Center viewport on map initially
        let world = WorldPoint::new(tile_size.width as f32, tile_size.height as f32 / 2.0);
        let canvas = LogicalPoint::new(
            canvas_size.width as f32 / 2.0,
            canvas_size.height as f32 / 2.0,
        );
        result.set_world_point_under_cursor(world, canvas);

        result
    }

    /// Zoom at a specific point (Google Maps style cursor-centric zoom)
    ///
    /// # Arguments
    /// * `cursor` - Cursor position in canvas logical pixels
    /// * `zoom_delta` - Zoom multiplier (e.g., 1.1 to zoom in, 0.9 to zoom out)
    ///
    /// The world point under the cursor will remain stationary during the zoom
    pub fn zoom_at_point(&mut self, cursor: LogicalPoint<f32>, zoom_delta: f32) {
        let world = self.canvas_to_world(cursor);

        // Update zoom level with dynamic minimum zoom bounds checking
        self.zoom_level *= zoom_delta;
        self.zoom_level = self.zoom_level.clamp(self.min_zoom(), Self::MAX_ZOOM);
        self.set_world_point_under_cursor(world, cursor);
    }

    /// Resize the canvas and recalculate zoom constraints
    ///
    /// This will adjust the zoom level if necessary to maintain minimum zoom constraints
    /// and ensure the viewport position remains valid
    pub fn resize(&mut self, size: LogicalSize<u32>) {
        self.canvas_size = size;

        // Recalculate and apply minimum zoom constraints for new canvas dimensions
        self.zoom_level = self
            .zoom_level
            .max(Self::min_zoom_for_canvas(size, self.map_size));

        // Ensure viewport position is still valid with new dimensions
        // Remove horizontal bounds checking (wraparound), keep vertical bounds
        let world_height = (size.height as f32 / self.zoom_level) as u32;
        let max_y = self.map_size.height.saturating_sub(world_height);
        self.viewport_position.x %= self.map_size.width; // Normalize with wraparound
        self.viewport_position.y = self.viewport_position.y.min(max_y);
    }

    /// Get current zoom level
    pub fn zoom_level(&self) -> f32 {
        self.zoom_level
    }

    /// Get the world area currently being displayed (in world coordinates)
    fn world_area(&self) -> WorldSize<u32> {
        let world_width = (self.canvas_size.width as f32 / self.zoom_level) as u32;
        let world_height = (self.canvas_size.height as f32 / self.zoom_level) as u32;
        WorldSize::new(world_width, world_height)
    }

    /// Get viewport bounds in world coordinates
    pub fn viewport_bounds(&self) -> ViewportBounds {
        let size = self.world_area();
        ViewportBounds {
            rect: Rect::new(self.viewport_position, size),
            zoom_level: self.zoom_level,
        }
    }

    /// Convert canvas coordinates to world coordinates
    ///
    /// # Arguments
    /// * `canvas` - Position in canvas logical pixels
    ///
    /// # Returns
    /// World coordinates
    pub fn canvas_to_world(&self, canvas: LogicalPoint<f32>) -> WorldPoint<f32> {
        let world_x = self.viewport_position.x as f32 + canvas.x / self.zoom_level;
        let world_y = self.viewport_position.y as f32 + canvas.y / self.zoom_level;

        WorldPoint::new(world_x, world_y)
    }

    /// Position a world point under a specific canvas cursor position
    ///
    /// # Arguments
    /// * `world` - World coordinate to position
    /// * `canvas` - Canvas coordinate (logical pixels) where the world point should appear
    pub fn set_world_point_under_cursor(
        &mut self,
        world: WorldPoint<f32>,
        canvas: LogicalPoint<f32>,
    ) {
        let world_height = self.canvas_size.height as f32 / self.zoom_level;
        let new_viewport_x = world.x - canvas.x / self.zoom_level;
        let new_viewport_y = world.y - canvas.y / self.zoom_level;

        // Apply bounds checking - horizontal wraparound, vertical clamping
        let max_y = self.map_size.height - (world_height as u32);

        // Handle wraparound for x coordinate
        let new_viewport_x_i32 = new_viewport_x as i32;
        self.viewport_position.x = ((new_viewport_x_i32 % self.map_size.width as i32)
            + self.map_size.width as i32) as u32
            % self.map_size.width;
        self.viewport_position.y = (new_viewport_y as i32).max(0).min(max_y as i32) as u32;
    }

    fn min_zoom(&self) -> f32 {
        Self::min_zoom_for_canvas(self.canvas_size, self.map_size)
    }

    fn min_zoom_for_canvas(canvas_size: LogicalSize<u32>, map_size: WorldSize<u32>) -> f32 {
        let min_zoom_x = canvas_size.width as f32 / map_size.width as f32;
        let min_zoom_y = canvas_size.height as f32 / map_size.height as f32;
        min_zoom_x.max(min_zoom_y)
    }
}

impl fmt::Display for MapViewport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let world_area = self.world_area();
        write!(
            f,
            "MapController(viewport=({}, {}), canvas={}x{}, zoom={:.2}, world_area={}x{})",
            self.viewport_position.x,
            self.viewport_position.y,
            self.canvas_size.width,
            self.canvas_size.height,
            self.zoom_level,
            world_area.width,
            world_area.height
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_controller_centers_viewport() {
        let controller = MapViewport::new(LogicalSize::new(1024, 768), WorldSize::new(8192, 8192));
        assert!(controller.zoom_level() >= 1.0);
    }

    #[test]
    fn test_zoom_at_point() {
        let mut controller =
            MapViewport::new(LogicalSize::new(1024, 768), WorldSize::new(8192, 8192));
        let initial_zoom = controller.zoom_level();

        // Zoom in at center
        controller.zoom_at_point(LogicalPoint::new(512.0, 384.0), 2.0);
        assert!(controller.zoom_level() > initial_zoom);

        // Zoom out
        controller.zoom_at_point(LogicalPoint::new(512.0, 384.0), 0.5);
        assert!(controller.zoom_level() < initial_zoom * 2.0);
    }

    #[test]
    fn test_resize() {
        let mut controller =
            MapViewport::new(LogicalSize::new(1024, 768), WorldSize::new(8192, 8192));

        controller.resize(LogicalSize::new(2048, 1536));

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
        let mut controller =
            MapViewport::new(LogicalSize::new(1024, 768), WorldSize::new(8192, 8192));

        // Get world coordinates of center of canvas
        let world_coords = controller.canvas_to_world(LogicalPoint::new(512.0, 384.0));

        // Move that world point to upper-left corner of canvas
        controller.set_world_point_under_cursor(world_coords, LogicalPoint::new(100.0, 100.0));

        // Now that world point should appear at (100, 100) on canvas
        let new_world_coords = controller.canvas_to_world(LogicalPoint::new(100.0, 100.0));

        // Should be approximately the same world coordinates (within floating point precision)
        assert!((new_world_coords.x - world_coords.x).abs() < 1.0);
        assert!((new_world_coords.y - world_coords.y).abs() < 1.0);
    }

    #[test]
    fn test_viewport_bounds_display() {
        let bounds = ViewportBounds {
            rect: crate::units::WorldRect::new(
                crate::units::WorldPoint::new(100u32, 200u32),
                crate::units::WorldSize::new(1920u32, 1080u32),
            ),
            zoom_level: 1.5,
        };
        assert_eq!(format!("{}", bounds), "1920x1080@(100,200) z:1.50");
    }

    #[test]
    fn test_viewport_bounds_display_origin_zero() {
        let bounds = ViewportBounds {
            rect: crate::units::WorldRect::new(
                crate::units::WorldPoint::new(0u32, 0u32),
                crate::units::WorldSize::new(800u32, 600u32),
            ),
            zoom_level: 2.0,
        };
        assert_eq!(format!("{}", bounds), "800x600@(0,0) z:2.00");
    }
}
