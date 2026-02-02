use eu5app::{
    game_data::{TextureProvider, optimized::OptimizedTextureBundle},
    should_highlight_individual_locations, tile_dimensions,
};
use pdx_map::{
    CanvasDimensions, Clock, GpuLocationIdx, GpuSurfaceContext, InteractionController, KeyboardKey,
    LocationArrays, LocationFlags, LogicalPoint, LogicalSize, MapTexture, MapViewController,
    MouseButton, PhysicalSize, SurfaceMapRenderer, WorldPoint, WorldSize, default_clock,
};
use std::time::Duration;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

// Re-export common types from wasm-pdxmap
pub use wasm_pdx_map::{
    CanvasDisplay, PdxScreenshotRenderer as WasmScreenshotRenderer, WasmGpuColor,
    WasmGpuLocationIdx, WasmGpuLocationIdxReadback, WasmQueuedWorkFuture,
    create_screenshot_renderer_for_app, get_surface_target,
};

#[wasm_bindgen]
pub struct Eu5CanvasSurface {
    pipeline_components: GpuSurfaceContext,
    display: CanvasDisplay,
}

impl std::fmt::Debug for Eu5CanvasSurface {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Eu5CanvasSurface").finish()
    }
}

#[wasm_bindgen]
impl Eu5CanvasSurface {
    #[wasm_bindgen]
    pub async fn init(
        canvas: OffscreenCanvas,
        display: CanvasDisplay,
    ) -> Result<Eu5CanvasSurface, JsError> {
        let surface = get_surface_target(canvas);
        let pipeline_components = pdx_map::GpuSurfaceContext::new(surface)
            .await
            .map_err(|e| JsError::new(&format!("Failed to initialize GPU and pipelines: {e}")))?;

        Ok(Eu5CanvasSurface {
            pipeline_components,
            display,
        })
    }

    #[wasm_bindgen]
    pub fn upload_west_texture(
        &self,
        data: &Eu5WasmTextureData,
    ) -> Result<Eu5WasmTexture, JsError> {
        let (tile_width, tile_height) = tile_dimensions();
        let size = PhysicalSize::new(tile_width, tile_height);
        let view = self
            .pipeline_components
            .create_texture(&data.data, size, "West Texture Input");
        Ok(Eu5WasmTexture { data: view })
    }

    #[wasm_bindgen]
    pub fn upload_east_texture(
        &self,
        data: &Eu5WasmTextureData,
    ) -> Result<Eu5WasmTexture, JsError> {
        let (tile_width, tile_height) = tile_dimensions();
        let size = PhysicalSize::new(tile_width, tile_height);
        let view = self
            .pipeline_components
            .create_texture(&data.data, size, "East Texture Input");
        Ok(Eu5WasmTexture { data: view })
    }
}

#[wasm_bindgen]
pub struct Eu5WasmMapRenderer {
    controller: MapViewController,
    input: InteractionController,
    picker: pdx_map::MapPicker,
    location_arrays: LocationArrays,
    clock: Box<dyn Clock>,
    last_tick: Option<Duration>,
}

impl std::fmt::Debug for Eu5WasmMapRenderer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Eu5WasmMapRenderer").finish()
    }
}

#[wasm_bindgen]
impl Eu5WasmMapRenderer {
    #[wasm_bindgen]
    pub fn create(
        surface: Eu5CanvasSurface,
        west_texture: Eu5WasmTexture,
        east_texture: Eu5WasmTexture,
        west_data: Eu5WasmTextureData,
        east_data: Eu5WasmTextureData,
    ) -> Result<Self, JsError> {
        let display: CanvasDimensions = surface.display.into();
        let renderer = SurfaceMapRenderer::new(
            surface.pipeline_components,
            west_texture.data,
            east_texture.data,
            display.physical_size(),
        );

        let tile_width = renderer.tile_width();
        let tile_height = renderer.tile_height();
        let picker = pdx_map::MapPicker::new(west_data.data, east_data.data, tile_width * 2);
        let mut controller =
            MapViewController::new(renderer, display.logical_size(), display.scale_factor());

        // Initialize input controller with map size
        let map_size = WorldSize::new(tile_width * 2, tile_height);
        let input = InteractionController::new(display.logical_size(), map_size);

        let show_location_borders = should_highlight_individual_locations(controller.get_zoom());
        controller
            .renderer_mut()
            .set_location_borders(show_location_borders);

        Ok(Eu5WasmMapRenderer {
            controller,
            input,
            picker,
            location_arrays: LocationArrays::new(),
            clock: default_clock(),
            last_tick: None,
        })
    }

    /// Get current raw zoom value
    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f32 {
        self.input.zoom_level()
    }

    /// Report current world coordinates under current cursor
    #[wasm_bindgen]
    pub fn canvas_to_world(&self) -> Vec<f32> {
        let world_pos = self.input.world_position();
        vec![world_pos.x, world_pos.y]
    }

    #[wasm_bindgen]
    pub fn pick_location(&mut self) -> u16 {
        let world_coords = self.input.world_position();
        let location = self.picker.pick(world_coords);
        location.value()
    }

    #[wasm_bindgen]
    pub fn gpu_loc_to_app(&mut self, gpu_loc: u16) -> u32 {
        let idx = GpuLocationIdx::new(gpu_loc);
        self.location_arrays.get_location_id(idx).value()
    }

    /// Handle cursor movement
    #[wasm_bindgen]
    pub fn on_cursor_move(&mut self, x: f32, y: f32) {
        self.input.on_cursor_move(LogicalPoint::new(x, y));

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Handle mouse button press/release
    ///
    /// # Arguments
    /// * `button` - Mouse button (0 = Left, 1 = Right, 2 = Middle)
    /// * `pressed` - true if pressed, false if released
    #[wasm_bindgen]
    pub fn on_mouse_button(&mut self, button: u8, pressed: bool) {
        let mouse_button = match button {
            0 => MouseButton::Left,
            1 => MouseButton::Right,
            2 => MouseButton::Middle,
            _ => return,
        };

        self.input.on_mouse_button(mouse_button, pressed);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Handle scroll/zoom input
    ///
    /// # Arguments
    /// * `scroll_lines` - Scroll amount in lines (positive = zoom in, negative = zoom out)
    #[wasm_bindgen]
    pub fn on_scroll(&mut self, scroll_lines: f32) {
        self.input.on_scroll(scroll_lines);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);

        // Update location borders based on zoom level
        let show_borders = should_highlight_individual_locations(bounds.zoom_level);
        self.controller
            .renderer_mut()
            .set_location_borders(show_borders);
    }

    /// Handle keyboard input for movement.
    #[wasm_bindgen]
    pub fn on_key_down(&mut self, code: String) {
        let key = KeyboardKey::from_web_code(&code);
        self.input.on_key_down(key);
    }

    /// Handle keyboard input for movement.
    #[wasm_bindgen]
    pub fn on_key_up(&mut self, code: String) {
        let key = KeyboardKey::from_web_code(&code);
        self.input.on_key_up(key);
    }

    /// Apply per-frame updates.
    #[wasm_bindgen]
    pub fn tick(&mut self) {
        let now = self.clock.now();
        let last_tick = self.last_tick.unwrap_or(now);
        let delta = now.saturating_sub(last_tick);
        self.last_tick = Some(now);

        self.input.tick(delta);
        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Check if currently dragging
    #[wasm_bindgen]
    pub fn is_dragging(&self) -> bool {
        self.input.is_dragging()
    }

    /// Resize the canvas and reconfigure the surface
    #[wasm_bindgen]
    pub fn resize(&mut self, logical_width: u32, logical_height: u32) {
        let size = LogicalSize::new(logical_width, logical_height);
        self.input.on_resize(size);

        // Transfer updated viewport bounds to render controller
        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);

        self.controller.resize(size);
    }

    /// Create a separate screenshot renderer that shares GPU resources but operates independently
    #[wasm_bindgen]
    pub fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<WasmScreenshotRenderer, JsError> {
        create_screenshot_renderer_for_app(&self.controller, canvas)
            .map_err(|e| JsError::new(&format!("Failed to create screenshot renderer: {e}")))
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

    /// Center the viewport at a world point
    #[wasm_bindgen]
    pub fn center_at_world(&mut self, x: f32, y: f32) {
        let world = WorldPoint::new(x, y);
        self.input.center_on(world);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Enable or disable owner border rendering
    #[wasm_bindgen]
    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.controller.renderer_mut().set_owner_borders(enabled);
    }

    #[wasm_bindgen]
    pub fn queued_work(&self) -> WasmQueuedWorkFuture {
        WasmQueuedWorkFuture::from_queued_work_future(self.controller.queued_work())
    }
}

impl Eu5WasmMapRenderer {
    fn upload_location_arrays(&mut self) {
        let renderer = self.controller.renderer_mut();
        renderer.update_locations(&self.location_arrays);
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmGameBundle {
    textures: OptimizedTextureBundle<Vec<u8>>,
}

#[wasm_bindgen]
impl Eu5WasmGameBundle {
    #[wasm_bindgen]
    pub fn open(data: Vec<u8>) -> Result<Self, JsError> {
        OptimizedTextureBundle::open(data)
            .map(|textures| Eu5WasmGameBundle { textures })
            .map_err(|e| JsError::new(&format!("Failed to open game bundle: {e}")))
    }

    #[wasm_bindgen]
    pub fn west_texture_data(&mut self) -> Result<Eu5WasmTextureData, JsError> {
        let data = self
            .textures
            .load_west_texture(Vec::new())
            .map_err(|e| JsError::new(&format!("Failed to get west texture data: {e}")))?;
        Ok(Eu5WasmTextureData { data })
    }

    #[wasm_bindgen]
    pub fn east_texture_data(&mut self) -> Result<Eu5WasmTextureData, JsError> {
        let data = self
            .textures
            .load_east_texture(Vec::new())
            .map_err(|e| JsError::new(&format!("Failed to get east texture data: {e}")))?;
        Ok(Eu5WasmTextureData { data })
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmTextureData {
    data: Vec<pdx_map::R16>,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub fn setup_eu5_map_wasm() {
    wasm_pdx_core::console_error_panic_hook::set_once();
    wasm_pdx_core::console_writer::init_with_level(tracing::Level::DEBUG);
}
