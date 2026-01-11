use pdx_map::{
    CanvasDimensions, Clock, ColorIdReadback, GpuColor, GpuLocationIdx, GpuSurfaceContext,
    InteractionController, KeyboardKey, LocationArrays, LocationFlags, LogicalPoint, LogicalSize,
    MapTexture, MapViewController, MouseButton, PhysicalSize, QueuedWorkFuture, R16Palette,
    RenderError, SurfaceMapRenderer, WorldPoint, WorldSize, default_clock,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

#[wasm_bindgen]
pub struct PdxMapImage {
    west: Vec<u8>,
    east: Vec<u8>,
    palette: R16Palette,
    tile_width: u32,
    tile_height: u32,
}

#[wasm_bindgen]
impl PdxMapImage {
    #[wasm_bindgen]
    pub fn from_rgba(data: &[u8], width: u32, height: u32) -> Result<PdxMapImage, JsError> {
        let (west, east, palette) = pdx_map::split_rgba8_to_indexed_r16(data, width);
        Ok(PdxMapImage {
            west,
            east,
            palette,
            tile_width: width / 2,
            tile_height: height,
        })
    }
}

#[wasm_bindgen]
pub struct PdxCanvasSurface {
    pipeline_components: GpuSurfaceContext,
}

#[wasm_bindgen]
impl PdxCanvasSurface {
    #[wasm_bindgen]
    pub async fn init(
        canvas: OffscreenCanvas,
        _display: CanvasDisplay,
    ) -> Result<PdxCanvasSurface, JsError> {
        let surface = get_surface_target(canvas);

        let pipeline_components = GpuSurfaceContext::new(surface)
            .await
            .map_err(|e| JsError::new(&format!("Failed to initialize GPU and pipelines: {e}")))?;

        Ok(PdxCanvasSurface {
            pipeline_components,
        })
    }

    #[wasm_bindgen]
    pub fn upload_west_texture(&self, image: &PdxMapImage) -> Result<PdxTexture, JsError> {
        let texture = self.pipeline_components.create_texture(
            &image.west,
            image.tile_width,
            image.tile_height,
            "West Texture Input",
        );
        Ok(PdxTexture { data: texture })
    }

    #[wasm_bindgen]
    pub fn upload_east_texture(&self, image: &PdxMapImage) -> Result<PdxTexture, JsError> {
        let texture = self.pipeline_components.create_texture(
            &image.east,
            image.tile_width,
            image.tile_height,
            "East Texture Input",
        );
        Ok(PdxTexture { data: texture })
    }
}

#[wasm_bindgen]
pub struct PdxMapRenderer {
    controller: MapViewController,
    interaction: InteractionController,
    location_arrays: LocationArrays,
    clock: Box<dyn Clock>,
    last_tick: Option<Duration>,
}

#[wasm_bindgen]
impl PdxMapRenderer {
    #[wasm_bindgen]
    pub fn create(
        surface: PdxCanvasSurface,
        image: PdxMapImage,
        west_texture: PdxTexture,
        east_texture: PdxTexture,
        display: CanvasDisplay,
    ) -> Result<Self, JsError> {
        let canvas_dims: CanvasDimensions = display.into();

        let renderer = SurfaceMapRenderer::new(
            surface.pipeline_components,
            west_texture.data,
            east_texture.data,
            canvas_dims.physical_size(),
        );

        let mut location_arrays = LocationArrays::allocate(image.palette.len());
        let init_colors = image.palette.map(|_, x| GpuColor::from(x.as_rgb()));
        location_arrays.set_primary_colors(init_colors.as_slice());
        location_arrays.set_secondary_colors(init_colors.as_slice());
        location_arrays.set_owner_colors(init_colors.as_slice());

        let controller = MapViewController::new(
            renderer,
            canvas_dims.logical_size(),
            canvas_dims.scale_factor(),
        );

        // Create input controller with map dimensions
        let map_size = WorldSize::new(image.tile_width * 2, image.tile_height);
        let interaction = InteractionController::new(canvas_dims.logical_size(), map_size);

        let mut map_renderer = PdxMapRenderer {
            controller,
            interaction,
            location_arrays,
            clock: default_clock(),
            last_tick: None,
        };
        map_renderer.upload_location_arrays();

        Ok(map_renderer)
    }

    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f32 {
        self.controller.get_zoom()
    }

    /// Handle cursor movement - delegates to input controller (handles drag internally)
    #[wasm_bindgen]
    pub fn on_cursor_move(&mut self, x: f32, y: f32) {
        self.interaction.on_cursor_move(LogicalPoint::new(x, y));

        // Transfer viewport bounds to render controller
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Handle mouse button press/release
    #[wasm_bindgen]
    pub fn on_mouse_button(&mut self, button: u8, pressed: bool) {
        // Convert u8 to MouseButton enum (0 = Left, 1 = Right, 2 = Middle)
        let mouse_button = match button {
            0 => MouseButton::Left,
            1 => MouseButton::Right,
            2 => MouseButton::Middle,
            _ => return,
        };

        self.interaction.on_mouse_button(mouse_button, pressed);

        // Transfer viewport bounds
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Handle scroll/zoom
    #[wasm_bindgen]
    pub fn on_scroll(&mut self, delta: f32) {
        self.interaction.on_scroll(delta);

        // Transfer viewport bounds
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Handle keyboard input for movement.
    #[wasm_bindgen]
    pub fn on_key_down(&mut self, code: String) {
        let key = KeyboardKey::from_web_code(&code);
        self.interaction.on_key_down(key);
    }

    /// Handle keyboard input for movement.
    #[wasm_bindgen]
    pub fn on_key_up(&mut self, code: String) {
        let key = KeyboardKey::from_web_code(&code);
        self.interaction.on_key_up(key);
    }

    /// Apply per-frame updates.
    #[wasm_bindgen]
    pub fn tick(&mut self) {
        let now = self.clock.now();
        let last_tick = self.last_tick.unwrap_or(now);
        let delta = now.saturating_sub(last_tick);
        self.last_tick = Some(now);

        self.interaction.tick(delta);
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Check if currently dragging
    #[wasm_bindgen]
    pub fn is_dragging(&self) -> bool {
        self.interaction.is_dragging()
    }

    /// Resize the canvas and reconfigure the surface
    #[wasm_bindgen]
    pub fn resize(&mut self, logical_width: u32, logical_height: u32) {
        let size = LogicalSize::new(logical_width, logical_height);

        // Update both controllers
        self.interaction.on_resize(size);

        // Transfer updated viewport bounds to render controller
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);

        self.controller.resize(size);
    }

    /// Convert canvas coordinates to world coordinates
    #[wasm_bindgen]
    pub fn canvas_to_world(&self) -> Vec<f32> {
        let world_pos = self.interaction.world_position();
        vec![world_pos.x, world_pos.y]
    }

    /// Synchronize a location array from JS to Rust
    #[wasm_bindgen]
    pub fn sync_location_array(&mut self, location_array: js_sys::Uint32Array) {
        if self.location_arrays.is_empty() {
            self.location_arrays = LocationArrays::from_data(location_array.to_vec());
        } else {
            let dst = self.location_arrays.as_mut_data();
            location_array.copy_to(dst);
        }

        self.upload_location_arrays();
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsError> {
        self.controller
            .render()
            .map_err(|e| JsError::new(&format!("Failed to render: {e}")))
    }

    #[wasm_bindgen]
    pub fn create_location_color_id_readback(
        &self,
        x: i32,
        y: i32,
    ) -> Result<WasmGpuLocationIdxReadback, JsError> {
        let readback = self
            .controller
            .create_color_id_readback_at(WorldPoint::new(x, y))
            .map_err(|e| JsError::new(&format!("unable to create readback: {e:?}")))?;
        Ok(WasmGpuLocationIdxReadback { readback })
    }

    #[wasm_bindgen]
    pub fn lookup_location_id(&self, idx: &WasmGpuLocationIdx) -> u32 {
        self.location_arrays.get_location_id(idx.idx).value()
    }

    #[wasm_bindgen]
    pub fn highlight_location(&mut self, idx: u16) {
        self.location_arrays
            .get_mut(GpuLocationIdx::new(idx))
            .flags_mut()
            .set(LocationFlags::HIGHLIGHTED);
        self.upload_location_arrays();
    }

    #[wasm_bindgen]
    pub fn highlight_app_location(&mut self, idx: u32) {
        let mut updated = false;
        let mut iter = self.location_arrays.iter_mut();
        while let Some(mut location) = iter.next_location() {
            if location.location_id().value() == idx {
                location.flags_mut().set(LocationFlags::HIGHLIGHTED);
                updated = true;
            }
        }

        if updated {
            self.upload_location_arrays();
        }
    }

    #[wasm_bindgen]
    pub fn unhighlight_location(&mut self, idx: u16) {
        self.location_arrays
            .get_mut(GpuLocationIdx::new(idx))
            .flags_mut()
            .clear(LocationFlags::HIGHLIGHTED);
        self.upload_location_arrays();
    }

    #[wasm_bindgen]
    pub fn center_at_world(&mut self, x: f32, y: f32) {
        let world = WorldPoint::new(x, y);
        self.interaction.center_on(world);

        // Transfer viewport to render controller
        let bounds = self.interaction.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Enable or disable owner border rendering
    #[wasm_bindgen]
    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.controller.renderer_mut().set_owner_borders(enabled);
    }

    #[wasm_bindgen]
    pub fn queued_work(&self) -> WasmQueuedWorkFuture {
        WasmQueuedWorkFuture {
            future: self.controller.queued_work(),
        }
    }

    /// Create a separate screenshot renderer that shares GPU resources but operates independently
    #[wasm_bindgen]
    pub fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<PdxScreenshotRenderer, JsError> {
        create_screenshot_renderer_for_app(&self.controller, canvas)
            .map_err(|e| JsError::new(&format!("Failed to create screenshot renderer: {e}")))
    }
}

impl PdxMapRenderer {
    fn upload_location_arrays(&mut self) {
        let renderer = self.controller.renderer_mut();
        renderer.update_locations(&self.location_arrays);
    }
}

#[wasm_bindgen]
pub struct WasmGpuLocationIdx {
    idx: GpuLocationIdx,
}

#[wasm_bindgen]
impl WasmGpuLocationIdx {
    #[wasm_bindgen]
    pub fn value(&self) -> u16 {
        self.idx.value()
    }
}

impl WasmGpuLocationIdx {
    /// Create a new WasmLocationIdx from a GpuLocationIdx (for library use)
    pub fn from_gpu_location_idx(idx: GpuLocationIdx) -> Self {
        Self { idx }
    }

    /// Get the inner GpuLocationIdx
    pub fn inner(&self) -> GpuLocationIdx {
        self.idx
    }
}

#[wasm_bindgen]
pub struct WasmGpuColor {
    pub(crate) color: GpuColor,
}

impl WasmGpuColor {
    /// Create a new WasmGpuColor from a GpuColor (for library use)
    pub fn from_gpu_color(color: GpuColor) -> Self {
        Self { color }
    }

    /// Get the inner GpuColor
    pub fn inner(&self) -> GpuColor {
        self.color
    }
}

#[wasm_bindgen]
pub struct WasmGpuLocationIdxReadback {
    pub(crate) readback: ColorIdReadback,
}

#[wasm_bindgen]
impl WasmGpuLocationIdxReadback {
    #[wasm_bindgen]
    pub async fn read_id(self) -> WasmGpuLocationIdx {
        let idx = self.readback.read_id().await;
        WasmGpuLocationIdx::from_gpu_location_idx(idx)
    }
}

impl WasmGpuLocationIdxReadback {
    /// Create a new WasmColorIdReadback from a ColorIdReadback
    pub fn from_color_id_readback(readback: ColorIdReadback) -> Self {
        Self { readback }
    }
}

#[wasm_bindgen]
pub struct WasmQueuedWorkFuture {
    pub(crate) future: QueuedWorkFuture,
}

#[wasm_bindgen]
impl WasmQueuedWorkFuture {
    #[wasm_bindgen]
    pub async fn wait(self) {
        self.future.wait().await;
    }
}

impl WasmQueuedWorkFuture {
    /// Create a new WasmQueuedWorkFuture from a QueuedWorkFuture (for library use)
    pub fn from_queued_work_future(future: QueuedWorkFuture) -> Self {
        Self { future }
    }
}

#[derive(Copy, Clone, Debug, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDisplay {
    width: f32,
    height: f32,
    scale_factor: f32,
}

impl CanvasDisplay {
    /// Create a new CanvasDisplay
    pub fn new(width: f32, height: f32, scale_factor: f32) -> Self {
        Self {
            width,
            height,
            scale_factor,
        }
    }
}

impl From<CanvasDisplay> for CanvasDimensions {
    fn from(display: CanvasDisplay) -> Self {
        CanvasDimensions::new(
            display.width as u32,
            display.height as u32,
            display.scale_factor,
        )
    }
}

#[wasm_bindgen]
pub struct PdxTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub struct PdxScreenshotRenderer {
    map: MapViewController,
}

#[wasm_bindgen]
impl PdxScreenshotRenderer {
    /// Render the western tile to the screenshot surface
    #[wasm_bindgen]
    pub fn render_west_tile(&mut self) -> Result<(), JsError> {
        let mut bounds = self.map.viewport_bounds();
        bounds.rect.origin = WorldPoint::new(0, 0);
        bounds.rect.size = self.map.tile_size();
        bounds.zoom_level = 1.0;
        self.map.set_viewport_bounds(bounds);
        self.map
            .render()
            .map_err(|e| JsError::new(&format!("Failed to render west tile: {e}")))
    }

    /// Render the eastern tile to the screenshot surface
    #[wasm_bindgen]
    pub fn render_east_tile(&mut self) -> Result<(), JsError> {
        let mut bounds = self.map.viewport_bounds();
        bounds.rect.size = self.map.tile_size();
        bounds.rect.origin = WorldPoint::new(self.map.tile_size().width, 0);
        bounds.zoom_level = 1.0;
        self.map.set_viewport_bounds(bounds);
        self.map
            .render()
            .map_err(|e| JsError::new(&format!("Failed to render east tile: {e}")))
    }
}

/// Shared helper to create a screenshot renderer for any MapApp<SurfaceMapRenderer>
pub fn create_screenshot_renderer_for_app(
    app: &MapViewController,
    canvas: OffscreenCanvas,
) -> Result<PdxScreenshotRenderer, RenderError> {
    let size = PhysicalSize::new(canvas.width(), canvas.height());
    let logical_size = LogicalSize::new(canvas.width(), canvas.height());
    let surface_target = get_surface_target(canvas);
    let screenshot_renderer = app
        .renderer()
        .create_screenshot_renderer(surface_target, size)?;
    let map = MapViewController::new(screenshot_renderer, logical_size, 1.0);
    Ok(PdxScreenshotRenderer { map })
}

#[cfg(target_family = "wasm")]
pub fn get_surface_target(
    canvas: web_sys::OffscreenCanvas,
) -> pdx_map::wgpu::SurfaceTarget<'static> {
    pdx_map::wgpu::SurfaceTarget::OffscreenCanvas(canvas)
}

#[cfg(not(target_family = "wasm"))]
pub fn get_surface_target(
    _canvas: web_sys::OffscreenCanvas,
) -> pdx_map::wgpu::SurfaceTarget<'static> {
    panic!("Surface target not supported on this platform")
}
