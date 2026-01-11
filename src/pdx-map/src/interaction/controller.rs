use crate::{LogicalPoint, LogicalSize, MapViewport, ViewportBounds, WorldSize, units::WorldPoint};
use std::time::Duration;

use super::keyboard::{KeyboardKey, KeyboardState};
use super::mouse::MouseButton;

/// Input controller for map navigation.
///
/// Manages cursor position, drag state, and processes input events.
pub struct InteractionController {
    /// Owned viewport for performing coordinate conversions and updates
    viewport: MapViewport,

    /// Current cursor position in canvas coordinates (logical pixels)
    cursor_pos: Option<LogicalPoint<f32>>,

    /// World coordinates captured when drag started
    drag_anchor_world: Option<WorldPoint<f32>>,

    /// Whether currently dragging
    is_dragging: bool,

    keyboard_state: KeyboardState,
    was_keyboard_active: bool,
}

impl InteractionController {
    /// Create a new input controller with an initial viewport.
    pub fn new(canvas_size: LogicalSize<u32>, map_size: WorldSize<u32>) -> Self {
        let tile_size = WorldSize::new(map_size.width / 2, map_size.height);
        let viewport = MapViewport::new(canvas_size, tile_size);

        Self {
            viewport,
            cursor_pos: None,
            drag_anchor_world: None,
            is_dragging: false,
            keyboard_state: KeyboardState {
                up: false,
                down: false,
                left: false,
                right: false,
            },
            was_keyboard_active: false,
        }
    }

    /// Handle cursor movement.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.ui.cursor-move", skip(self), level = "trace", fields(%cursor))
    )]
    pub fn on_cursor_move(&mut self, cursor: LogicalPoint<f32>) {
        self.cursor_pos = Some(cursor);

        if self.is_dragging {
            // During drag: pan the map to keep drag anchor under cursor
            if let Some(anchor) = self.drag_anchor_world {
                self.viewport.set_world_point_under_cursor(anchor, cursor);
            }
        }
    }

    /// Handle mouse button press or release.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.ui.mouse-button", skip(self), level = "debug")
    )]
    pub fn on_mouse_button(&mut self, button: MouseButton, pressed: bool) {
        if button != MouseButton::Left {
            return;
        }

        if pressed {
            // Start drag: capture world coordinates under cursor
            let canvas_pos = self.cursor_position();
            self.drag_anchor_world = Some(self.viewport.canvas_to_world(canvas_pos));
            self.is_dragging = true;
        } else {
            // End drag: clear anchor
            self.is_dragging = false;
            self.drag_anchor_world = None;
        }
    }

    /// Handle scroll/zoom input. Applies zoom at the current cursor position.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.ui.scroll", skip(self), level = "debug")
    )]
    pub fn on_scroll(&mut self, scroll_lines: f32) {
        if scroll_lines.abs() < f32::EPSILON {
            return;
        }

        // Clamp scroll to prevent extreme zoom changes
        let clamped = scroll_lines.clamp(-6.0, 6.0);

        // Convert to zoom delta (exponential scaling)
        let zoom_delta = 1.1_f32.powf(clamped);

        // Apply zoom at cursor
        self.viewport
            .zoom_at_point(self.cursor_position(), zoom_delta);

        // Update drag anchor if currently dragging
        if self.is_dragging {
            self.drag_anchor_world = Some(self.viewport.canvas_to_world(self.cursor_position()));
        }
    }

    /// Track keyboard state for directional movement.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.ui.key-down", skip(self), level = "debug")
    )]
    pub fn on_key_down(&mut self, key: KeyboardKey) {
        self.keyboard_state.set(key, true);
    }

    /// Track keyboard state for directional movement.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.ui.key-up", skip(self), level = "debug")
    )]
    pub fn on_key_up(&mut self, key: KeyboardKey) {
        self.keyboard_state.set(key, false);
    }

    /// Apply per-frame updates.
    pub fn tick(&mut self, mut delta: Duration) {
        let is_active = self.keyboard_state.active();

        if is_active && !self.was_keyboard_active {
            delta = Duration::ZERO;
        }

        self.was_keyboard_active = is_active;

        if is_active {
            self.apply_keyboard(delta);
        }
    }

    fn apply_keyboard(&mut self, delta: Duration) {
        if !self.keyboard_state.active() {
            return;
        }

        let bounds = self.viewport.viewport_bounds();
        let base_step =
            bounds.rect.size.width.min(bounds.rect.size.height) as f32 * 1.0 * delta.as_secs_f32();

        let mut dir_x: f32 = 0.0;
        let mut dir_y: f32 = 0.0;

        if self.keyboard_state.left {
            dir_x -= 1.0;
        }
        if self.keyboard_state.right {
            dir_x += 1.0;
        }
        if self.keyboard_state.up {
            dir_y -= 1.0;
        }
        if self.keyboard_state.down {
            dir_y += 1.0;
        }

        let magnitude = (dir_x * dir_x + dir_y * dir_y).sqrt();
        if magnitude < f32::EPSILON {
            return;
        }

        dir_x /= magnitude;
        dir_y /= magnitude;

        self.viewport
            .pan_by(WorldPoint::new(dir_x * base_step, dir_y * base_step));

        if self.is_dragging {
            self.drag_anchor_world = Some(self.viewport.canvas_to_world(self.cursor_position()));
        }
    }

    /// Check if any keyboard movement is active.
    pub fn keyboard_active(&self) -> bool {
        self.keyboard_state.active()
    }

    /// Handle canvas resize.
    pub fn on_resize(&mut self, canvas_size: LogicalSize<u32>) {
        self.viewport.resize(canvas_size);
    }

    /// Get the current viewport bounds.
    pub fn viewport_bounds(&self) -> ViewportBounds {
        self.viewport.viewport_bounds()
    }

    /// Get the current zoom level.
    ///
    /// Useful for render-specific logic like determining whether to show
    /// location borders.
    pub fn zoom_level(&self) -> f32 {
        self.viewport.zoom_level()
    }

    /// Check if currently dragging.
    pub fn is_dragging(&self) -> bool {
        self.is_dragging
    }

    /// Get the current cursor position.
    pub fn cursor_position(&self) -> LogicalPoint<f32> {
        self.cursor_pos.unwrap_or_else(|| {
            let size = self.viewport.viewport_bounds().rect.size;
            LogicalPoint::new(size.width as f32 / 2.0, size.height as f32 / 2.0)
        })
    }

    /// Get the current world position under the cursor.
    pub fn world_position(&self) -> WorldPoint<f32> {
        self.viewport.canvas_to_world(self.cursor_position())
    }

    /// Center on world point.
    pub fn center_on(&mut self, world: WorldPoint<f32>) {
        let canvas_size = self.viewport_bounds().rect.size;
        let canvas_center = LogicalPoint::new(
            canvas_size.width as f32 / 2.0,
            canvas_size.height as f32 / 2.0,
        );
        self.viewport
            .set_world_point_under_cursor(world, canvas_center);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn make_controller(
        canvas_size: LogicalSize<u32>,
        map_size: WorldSize<u32>,
    ) -> InteractionController {
        InteractionController::new(canvas_size, map_size)
    }

    #[test]
    fn test_drag_lifecycle() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);

        // Initially not dragging
        assert!(!input.is_dragging());
        assert_eq!(input.drag_anchor_world, None);

        // Move cursor to a position
        input.on_cursor_move(LogicalPoint::new(400.0, 300.0));
        assert_eq!(input.cursor_position(), LogicalPoint::new(400.0, 300.0));

        // Start drag
        input.on_mouse_button(MouseButton::Left, true);
        assert!(input.is_dragging());
        assert!(input.drag_anchor_world.is_some());

        // Move cursor while dragging
        let initial_bounds = input.viewport_bounds();
        input.on_cursor_move(LogicalPoint::new(450.0, 350.0));
        let dragged_bounds = input.viewport_bounds();

        // Viewport should have changed due to drag
        assert_ne!(initial_bounds, dragged_bounds);

        // End drag
        input.on_mouse_button(MouseButton::Left, false);
        assert!(!input.is_dragging());
        assert_eq!(input.drag_anchor_world, None);
    }

    #[test]
    fn test_zoom_without_cursor() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);

        let _initial_zoom = input.zoom_level();

        // Zoom in without cursor (should zoom at canvas center)
        input.on_scroll(1.0);

        let zoomed = input.zoom_level();
        assert!(zoomed > _initial_zoom);
    }

    #[test]
    fn test_scroll_clamping() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);

        let _initial_zoom = input.zoom_level();

        // Extreme scroll should be clamped
        input.on_scroll(100.0); // Would be clamped to 6.0
        let zoom_clamped = input.zoom_level();

        // Reset
        let mut input2 = make_controller(canvas_size, map_size);
        input2.on_scroll(6.0); // Already at clamp limit
        let zoom_normal = input2.zoom_level();

        // Both should produce same result due to clamping
        assert_eq!(zoom_clamped, zoom_normal);
    }

    #[test]
    fn test_right_button_ignored() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);

        // Right button should not start drag
        input.on_mouse_button(MouseButton::Right, true);
        assert!(!input.is_dragging());

        // Middle button should not start drag
        input.on_mouse_button(MouseButton::Middle, true);
        assert!(!input.is_dragging());
    }

    #[test]
    fn test_resize() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);

        let initial_bounds = input.viewport_bounds();

        // Resize canvas
        let new_size = LogicalSize::new(1024, 768);
        input.on_resize(new_size);

        let resized_bounds = input.viewport_bounds();

        // Bounds should reflect new canvas size
        // (exact behavior depends on MapViewport::resize implementation)
        assert_ne!(initial_bounds.rect.size, resized_bounds.rect.size);
    }

    #[test]
    fn test_keyboard_pan() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);
        let delta = Duration::from_secs(1);

        let initial_bounds = input.viewport_bounds();
        input.on_key_down(KeyboardKey::ArrowUp);
        input.tick(delta);
        input.tick(delta);
        let moved_bounds = input.viewport_bounds();

        assert!(moved_bounds.rect.origin.y <= initial_bounds.rect.origin.y);

        input.on_key_up(KeyboardKey::ArrowUp);
        input.tick(delta);
    }

    #[test]
    fn test_keyboard_pan_with_wasd() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(1000, 500);
        let mut input = make_controller(canvas_size, map_size);
        let delta = Duration::from_secs(1);

        let initial_bounds = input.viewport_bounds();
        input.on_key_down(KeyboardKey::KeyW);
        input.tick(delta);
        input.tick(delta);
        let moved_bounds = input.viewport_bounds();

        assert!(moved_bounds.rect.origin.y <= initial_bounds.rect.origin.y);

        input.on_key_up(KeyboardKey::KeyW);
        input.tick(delta);
    }

    #[test]
    fn test_keyboard_tap_after_idle_does_not_jump() {
        let canvas_size = LogicalSize::new(800, 600);
        let map_size = WorldSize::new(10_000, 5_000);
        let step = Duration::from_millis(10);
        let mut input = make_controller(canvas_size, map_size);

        input.tick(step);
        let initial_bounds = input.viewport_bounds();
        let expected_delta = (initial_bounds
            .rect
            .size
            .width
            .min(initial_bounds.rect.size.height) as f32
            * step.as_secs_f32())
        .round() as i32;

        input.on_key_down(KeyboardKey::ArrowRight);
        input.tick(step);
        input.tick(step);
        let first_bounds = input.viewport_bounds();
        let first_delta_x = first_bounds.rect.origin.x as i32 - initial_bounds.rect.origin.x as i32;

        input.on_key_up(KeyboardKey::ArrowRight);
        input.tick(step);

        input.tick(step);
        input.tick(step);
        input.tick(step);

        input.on_key_down(KeyboardKey::ArrowRight);
        input.tick(step);
        input.tick(step);
        let second_bounds = input.viewport_bounds();
        let second_delta_x = second_bounds.rect.origin.x as i32 - first_bounds.rect.origin.x as i32;

        assert_eq!(first_delta_x, expected_delta);
        assert_eq!(second_delta_x, expected_delta);

        input.on_key_up(KeyboardKey::ArrowRight);
    }
}
