use crate::{
    Aabb, LogicalPoint, LogicalSize, MapViewport, ViewportBounds, WorldSize,
    units::{WorldLength, WorldPoint, WorldRect},
    viewport::{JumpZoom, PanTarget, ViewportInsets},
};
use std::time::Duration;

use super::keyboard::{KeyboardKey, KeyboardState};
use super::mouse::MouseButton;

const PAN_SNAP_PX: f32 = 20.0;
const MOVE_DURATION_MS: u64 = 300;

/// A programmatic camera move. The world point under `anchor` changes from
/// `from` to `to`, and the zoom changes from `from_zoom` to `to_zoom`.
#[derive(Debug, Clone, Copy)]
struct CameraAnimation {
    anchor: LogicalPoint<f32>,
    from: WorldPoint<f32>,
    to: WorldPoint<f32>,
    from_zoom: f32,
    to_zoom: f32,
    elapsed: Duration,
    duration: Duration,
}

impl CameraAnimation {
    /// The zoom, and the world point under `anchor`, at the elapsed time.
    fn frame(&self, map_width: f32) -> (f32, WorldPoint<f32>) {
        if self.elapsed >= self.duration {
            return (self.to_zoom, self.to);
        }

        let t = self.elapsed.as_secs_f32() / self.duration.as_secs_f32();
        let eased = 1.0 - (1.0 - t).powi(3);

        // Shortest-path signed delta in world space; handles antimeridian wrap.
        let delta = WorldLength::wrapped_delta(
            WorldLength::new(self.from.x),
            WorldLength::new(self.to.x),
            WorldLength::new(map_width),
        );
        // Equal zoom ratios per step make the zoom look steady.
        let zoom = self.from_zoom * (self.to_zoom / self.from_zoom).powf(eased);
        // Scale the remaining distance by the zoom, so that `to` moves to the
        // anchor in a straight line on the screen.
        let remaining = (1.0 - eased) * self.from_zoom / zoom;
        let x = self.to.x - delta.value * remaining;
        let y = self.to.y + (self.from.y - self.to.y) * remaining;
        (zoom, WorldPoint::new(x, y))
    }
}

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
    animation: Option<CameraAnimation>,
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
            animation: None,
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
            self.animation = None;
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

        self.animation = None;

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
        if key.is_pan_key() {
            self.animation = None;
        }
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
        // Advance the camera animation before keyboard so a key press that same frame overrides it.
        if let Some(mut anim) = self.animation {
            anim.elapsed = (anim.elapsed + delta).min(anim.duration);
            self.animation = (anim.elapsed < anim.duration).then_some(anim);
            let (zoom, point) = anim.frame(self.viewport.map_size().width as f32);
            self.viewport
                .set_zoom_with_point_at(zoom, point, anim.anchor);
        }

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

    /// Convert a canvas-local logical pixel position to world coordinates.
    pub fn canvas_to_world(&self, canvas: LogicalPoint<f32>) -> WorldPoint<f32> {
        self.viewport.canvas_to_world(canvas)
    }

    /// Convert a canvas-space rectangle to world-space AABBs, handling map wrap-around.
    pub fn canvas_rect_to_world_aabbs(
        &self,
        start: LogicalPoint<f32>,
        end: LogicalPoint<f32>,
    ) -> (Aabb, Option<Aabb>) {
        self.viewport.canvas_rect_to_world_aabbs(start, end)
    }

    /// Start an animated pan toward the resolved target.
    ///
    /// Returns `true` if a pan was kicked off (animated or snapped), `false` if no pan was needed.
    pub fn pan_to_visible_region(&mut self, target: PanTarget, insets: ViewportInsets) -> bool {
        let Some(resolved) = self.viewport.resolve_pan(target, insets) else {
            return false;
        };

        let mut end = self.viewport.clone();
        end.set_position_clamped(resolved);
        self.move_to(end, insets);
        true
    }

    /// Move the camera to the `end` view, with the center of the region that
    /// the insets leave as the anchor. A short pan snaps.
    fn move_to(&mut self, end: MapViewport, insets: ViewportInsets) {
        let anchor = self.viewport.visible_region(insets).center();
        let from = self.viewport.canvas_to_world(anchor);
        let to = end.canvas_to_world(anchor);
        let from_zoom = self.viewport.zoom_level();
        let to_zoom = end.zoom_level();

        // Screen-space distance via the short horizontal wrap path.
        let dx_canvas = WorldLength::wrapped_delta(
            WorldLength::new(from.x),
            WorldLength::new(to.x),
            WorldLength::new(self.viewport.map_size().width as f32),
        )
        .to_logical(from_zoom);
        let dy_canvas = (to.y - from.y) * from_zoom;
        let distance = (dx_canvas.value * dx_canvas.value + dy_canvas * dy_canvas).sqrt();

        if from_zoom == to_zoom && distance < PAN_SNAP_PX {
            self.viewport = end;
            self.animation = None;
        } else {
            self.animation = Some(CameraAnimation {
                anchor,
                from,
                to,
                from_zoom,
                to_zoom,
                elapsed: Duration::ZERO,
                duration: Duration::from_millis(MOVE_DURATION_MS),
            });
        }
    }

    /// Whether `target` is currently fully contained in the visible region.
    pub fn is_target_visible(&self, target: PanTarget, insets: ViewportInsets) -> bool {
        self.viewport.is_target_visible(target, insets)
    }

    /// Whether a programmatic camera move is currently in flight.
    pub fn is_animating(&self) -> bool {
        self.animation.is_some()
    }

    /// Show the whole map, as large as the zoom limits allow.
    pub fn fit_map(&mut self) {
        self.animation = None;
        self.viewport.fit_map();
    }

    /// Fit the rectangle within the camera zoom limits.
    pub fn fit(&mut self, rect: WorldRect<u32>) {
        self.animation = None;
        self.viewport.fit(rect);
    }

    /// Show `target` in the region that the insets do not cover. From a view
    /// below `zoom.zoom_in_below`, also zoom in to `zoom.to`, so that the target
    /// is large enough to see. A closer view keeps its zoom and pans.
    pub fn jump_to(&mut self, target: WorldPoint<f32>, insets: ViewportInsets, zoom: JumpZoom) {
        if self.viewport.zoom_level() < zoom.zoom_in_below {
            let mut end = self.viewport.clone();
            end.zoom_to(target, zoom.to, insets);
            self.move_to(end, insets);
        } else {
            self.pan_to_visible_region(PanTarget::Point(target), insets);
        }
    }

    /// Center on world point.
    pub fn center_on(&mut self, world: WorldPoint<f32>) {
        self.animation = None;
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

    use crate::units::Length;
    use crate::viewport::{PanTarget, ViewportInsets};

    fn no_insets() -> ViewportInsets {
        ViewportInsets::default()
    }

    fn side_insets(each: f32) -> ViewportInsets {
        ViewportInsets {
            left: Length::new(each),
            right: Length::new(each),
            top: Length::new(0.0),
            bottom: Length::new(0.0),
        }
    }

    /// Controller with viewport positioned at a specific world coordinate.
    fn make_controller_at(
        canvas_size: LogicalSize<u32>,
        map_size: WorldSize<u32>,
        vp_x: f32,
        vp_y: f32,
    ) -> InteractionController {
        let mut c = InteractionController::new(canvas_size, map_size);
        c.viewport.set_position_clamped(WorldPoint::new(vp_x, vp_y));
        c
    }

    #[test]
    fn test_pan_animation_starts_and_completes() {
        // Canvas 800x600, map 2000x1000. Target off-screen → animation starts.
        let mut c = make_controller(LogicalSize::new(800, 600), WorldSize::new(2000, 1000));
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        let started = c.pan_to_visible_region(target, no_insets());
        assert!(started);
        assert!(c.is_animating());

        // Tick past the full duration.
        c.tick(Duration::from_millis(MOVE_DURATION_MS + 10));
        assert!(!c.is_animating(), "animation should be done");
    }

    #[test]
    fn test_pan_animation_easeout_midpoint_exact() {
        // Cubic ease-out at t=0.5: eased = 1 - 0.5^3 = 0.875.
        // Target at (1000, 300) is off-screen right (canvas_x=1000 > 800).
        // resolved.x = 1000 - 400 = 600, no antimeridian wrap involved.
        let mut c = make_controller_at(
            LogicalSize::new(800, 600),
            WorldSize::new(2000, 1000),
            0.0,
            0.0,
        );
        let target = PanTarget::Point(WorldPoint::new(1000.0, 300.0));
        let from_x = c.viewport.viewport_position().x; // 0.0
        c.pan_to_visible_region(target, no_insets());
        let to_x = c
            .viewport
            .resolve_pan(target, no_insets())
            .map(|p| p.x)
            .unwrap_or(from_x); // 600.0

        c.tick(Duration::from_millis(MOVE_DURATION_MS / 2));

        let mid_x = c.viewport.viewport_position().x;
        let expected = from_x + (to_x - from_x) * 0.875;
        assert!(
            (mid_x - expected).abs() < 1.0,
            "cubic ease-out midpoint: expected {expected:.1}, got {mid_x:.1}"
        );
    }

    #[test]
    fn test_pan_animation_lands_on_target() {
        let mut c = make_controller_at(
            LogicalSize::new(800, 600),
            WorldSize::new(2000, 1000),
            0.0,
            0.0,
        );
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        let resolved = c.viewport.resolve_pan(target, no_insets()).unwrap();
        c.pan_to_visible_region(target, no_insets());
        c.tick(Duration::from_millis(MOVE_DURATION_MS + 50));

        let pos = c.viewport.viewport_position();
        assert!((pos.x - resolved.x).abs() < 1.0, "x should land on target");
        assert!((pos.y - resolved.y).abs() < 1.0, "y should land on target");
    }

    #[test]
    fn test_short_pan_snaps_immediately() {
        // Canvas 800x600, zoom=1. Side panels shrink visible x to [390, 410] (20px wide).
        // Target at world x=415 → canvas_x=415 > vis_right=410 → just off right edge.
        // resolve_pan centers it at vis_center=400: new_vp_x = 415 - 400 = 15.
        // Canvas delta = (15 - 0)*1 = 15px < 20 → snap, not animate.
        let mut c = make_controller_at(
            LogicalSize::new(800, 600),
            WorldSize::new(2000, 1000),
            0.0,
            0.0,
        );
        let insets = side_insets(390.0);
        let target = PanTarget::Point(WorldPoint::new(415.0, 300.0));
        let result = c.pan_to_visible_region(target, insets);
        assert!(result, "pan should be triggered");
        assert!(!c.is_animating(), "sub-20px pan should snap, not animate");
    }

    #[test]
    fn test_drag_interrupts_animation() {
        let mut c = make_controller(LogicalSize::new(800, 600), WorldSize::new(2000, 1000));
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        c.pan_to_visible_region(target, no_insets());
        assert!(c.is_animating());

        // Tick partway.
        c.tick(Duration::from_millis(100));
        assert!(c.is_animating());

        // Drag start clears animation.
        c.on_cursor_move(LogicalPoint::new(400.0, 300.0));
        c.on_mouse_button(MouseButton::Left, true);
        assert!(!c.is_animating(), "drag should interrupt animation");
        assert!(c.is_dragging());
    }

    #[test]
    fn test_second_pan_snapshots_current_position_as_from() {
        let mut c = make_controller_at(
            LogicalSize::new(800, 600),
            WorldSize::new(2000, 1000),
            0.0,
            0.0,
        );
        let target_a = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        c.pan_to_visible_region(target_a, no_insets());

        // Tick to halfway.
        c.tick(Duration::from_millis(MOVE_DURATION_MS / 2));
        let mid_pos = c.viewport.viewport_position();

        // Start a second pan toward a different target.
        let target_b = PanTarget::Point(WorldPoint::new(200.0, 450.0));
        c.pan_to_visible_region(target_b, no_insets());

        // A zero-delta tick evaluates the animation at t=0, which produces exactly `from`.
        // If animation B snapshotted mid_pos as its `from`, position returns to mid_pos.
        c.tick(Duration::ZERO);
        let after_zero_tick = c.viewport.viewport_position();
        assert!(
            (after_zero_tick.x - mid_pos.x).abs() < 1.0
                && (after_zero_tick.y - mid_pos.y).abs() < 1.0,
            "animation B's from should be A's mid-flight position: mid={mid_pos:?} got={after_zero_tick:?}"
        );
    }

    #[test]
    fn test_keys_and_scroll_interrupt_animation() {
        let mut c = make_controller(LogicalSize::new(800, 600), WorldSize::new(2000, 1000));
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        c.pan_to_visible_region(target, no_insets());
        assert!(c.is_animating());

        c.on_key_down(KeyboardKey::ArrowLeft);
        assert!(!c.is_animating(), "arrow key should interrupt animation");

        c.pan_to_visible_region(target, no_insets());
        c.on_scroll(1.0);
        assert!(!c.is_animating(), "scroll should interrupt animation");
    }

    #[test]
    fn test_interruption_leaves_intermediate_position() {
        let mut c = make_controller_at(
            LogicalSize::new(800, 600),
            WorldSize::new(2000, 1000),
            0.0,
            0.0,
        );
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        let from = c.viewport.viewport_position();
        c.pan_to_visible_region(target, no_insets());
        let to = c.viewport.resolve_pan(target, no_insets());

        c.tick(Duration::from_millis(100));
        let interrupted = c.viewport.viewport_position();
        c.on_mouse_button(MouseButton::Left, true);

        // Position should be between from and to, not at either extreme.
        if let Some(to_pos) = to {
            assert!(
                (interrupted.x - from.x).abs() > 0.1 || (interrupted.y - from.y).abs() > 0.1,
                "should have moved from start"
            );
            assert!(
                (interrupted.x - to_pos.x).abs() > 0.1 || (interrupted.y - to_pos.y).abs() > 0.1,
                "should not have reached target yet"
            );
        }
    }

    const JUMP_ZOOM: JumpZoom = JumpZoom::new(0.4, 1.0);

    #[test]
    fn a_jump_from_a_far_view_zooms_in_on_the_target() {
        let mut c = make_controller(LogicalSize::new(1600, 900), WorldSize::new(16384, 8192));
        let insets = ViewportInsets {
            left: Length::new(332.0),
            right: Length::new(400.0),
            ..ViewportInsets::default()
        };

        // A far view that shows half the world, with a pan in progress.
        c.fit(WorldRect::new(
            WorldPoint::new(0, 0),
            WorldSize::new(8192, 4096),
        ));
        assert!(c.zoom_level() < JUMP_ZOOM.zoom_in_below);
        c.pan_to_visible_region(PanTarget::Point(WorldPoint::new(12000.0, 500.0)), insets);
        assert!(c.is_animating());

        let target = WorldPoint::new(5000.0, 3000.0);
        let on_canvas = |c: &InteractionController| {
            let pos = c.viewport.viewport_position();
            let zoom = c.zoom_level();
            LogicalPoint::new((target.x - pos.x) * zoom, (target.y - pos.y) * zoom)
        };
        let start_zoom = c.zoom_level();
        let start = on_canvas(&c);
        c.jump_to(target, insets, JUMP_ZOOM);

        // At half time, the cubic ease-out is at 0.875. The zoom is at 0.875 of
        // the zoom ratio, and the target is at 0.875 of a straight line to the
        // center of the free region (x = 766, y = 450).
        c.tick(Duration::from_millis(MOVE_DURATION_MS / 2));
        let expected = start_zoom * (JUMP_ZOOM.to / start_zoom).powf(0.875);
        assert!((c.zoom_level() - expected).abs() < 1e-4);
        let mid = on_canvas(&c);
        assert!((mid.x - (start.x + (766.0 - start.x) * 0.875)).abs() < 0.5);
        assert!((mid.y - (start.y + (450.0 - start.y) * 0.875)).abs() < 0.5);

        c.tick(Duration::from_millis(MOVE_DURATION_MS));
        assert!(!c.is_animating());
        assert_eq!(c.zoom_level(), JUMP_ZOOM.to);
        // The free region is x = 332..1200, so its center is x = 766.
        assert_eq!(c.canvas_to_world(LogicalPoint::new(766.0, 450.0)), target);
    }

    #[test]
    fn a_jump_from_a_close_view_keeps_its_zoom() {
        let mut c = make_controller(LogicalSize::new(1600, 900), WorldSize::new(16384, 8192));
        c.fit(WorldRect::new(
            WorldPoint::new(4000, 2000),
            WorldSize::new(2400, 1350),
        ));
        let zoom = c.zoom_level();
        assert!(zoom >= JUMP_ZOOM.zoom_in_below);

        c.jump_to(WorldPoint::new(12000.0, 3000.0), no_insets(), JUMP_ZOOM);
        assert!(c.is_animating());
        assert_eq!(c.zoom_level(), zoom);
    }

    #[test]
    fn test_pan_to_visible_region_delegates_to_viewport() {
        let mut c = make_controller(LogicalSize::new(800, 600), WorldSize::new(2000, 1000));
        let target = PanTarget::Point(WorldPoint::new(1600.0, 300.0));
        let insets = no_insets();
        // resolve_pan on the viewport itself should agree with pan_to_visible_region return.
        let viewport_says = c.viewport.resolve_pan(target, insets).is_some();
        let controller_says = c.pan_to_visible_region(target, insets);
        assert_eq!(viewport_says, controller_says);
    }
}
