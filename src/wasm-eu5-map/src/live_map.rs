use pdx_map::{
    HemisphereSize, LocationArrays, MapViewController, PhysicalSize, QueuedWorkFuture, RenderError,
    ViewportBounds,
};
use wasm_pdx_map::{PdxScreenshotRenderer, create_screenshot_renderer_for_app};
use web_sys::OffscreenCanvas;

/// The map on the player's canvas, and whether the canvas still shows its
/// current picture. Every change to what the map draws goes through here and
/// marks a frame as due, so no change can leave the canvas behind.
pub(crate) struct LiveMap {
    controller: MapViewController,
    frame_due: bool,
}

impl LiveMap {
    pub(crate) fn new(controller: MapViewController) -> Self {
        Self {
            controller,
            frame_due: true,
        }
    }

    /// A renderer of its own surface that shares the map's buffers. Its
    /// frames leave the canvas untouched.
    pub(crate) fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<PdxScreenshotRenderer, RenderError> {
        create_screenshot_renderer_for_app(&self.controller, canvas)
    }

    pub(crate) fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.controller.hemisphere_size()
    }

    pub(crate) fn queued_work(&self) -> QueuedWorkFuture {
        self.controller.queued_work()
    }

    /// Whether the picture has changed since the last frame was drawn.
    pub(crate) fn frame_due(&self) -> bool {
        self.frame_due
    }

    /// Draw the next frame on a canvas that may have lost its picture.
    pub(crate) fn request_frame(&mut self) {
        self.frame_due = true;
    }

    /// Draw the current picture. A failed frame stays due.
    pub(crate) fn render(&mut self) -> Result<(), RenderError> {
        self.controller.render()?;
        self.frame_due = false;
        Ok(())
    }

    pub(crate) fn set_viewport_bounds(&mut self, bounds: ViewportBounds) {
        if self.controller.viewport_bounds() != bounds {
            self.controller.set_viewport_bounds(bounds);
            self.frame_due = true;
        }
    }

    pub(crate) fn set_location_borders(&mut self, enabled: bool) {
        let renderer = self.controller.renderer_mut();
        if renderer.location_borders() != enabled {
            renderer.set_location_borders(enabled);
            self.frame_due = true;
        }
    }

    pub(crate) fn set_owner_borders(&mut self, enabled: bool) {
        let renderer = self.controller.renderer_mut();
        if renderer.owner_borders() != enabled {
            renderer.set_owner_borders(enabled);
            self.frame_due = true;
        }
    }

    pub(crate) fn update_locations(&mut self, arrays: &LocationArrays) {
        self.controller.renderer_mut().update_locations(arrays);
        self.frame_due = true;
    }

    pub(crate) fn update_colors(&mut self, arrays: &LocationArrays) {
        self.controller.renderer_mut().update_colors(arrays);
        self.frame_due = true;
    }

    pub(crate) fn update_flags(&mut self, arrays: &LocationArrays) {
        self.controller.renderer_mut().update_flags(arrays);
        self.frame_due = true;
    }

    /// Reconfiguring the surface clears the canvas, so a frame is always due.
    pub(crate) fn resize(&mut self, size: PhysicalSize<u32>) {
        self.controller.resize(size);
        self.frame_due = true;
    }
}
