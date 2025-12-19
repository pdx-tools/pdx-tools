use eu5app::{
    game_data::{TextureProvider, optimized::OptimizedTextureBundle},
    should_highlight_individual_locations, tile_dimensions,
};
use pdx_map::{
    CanvasDimensions, GpuLocationIdx, GpuSurfaceContext, LocationArrays, LocationFlags, MapTexture,
    SurfaceMapRenderer,
};
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

mod console_error_panic_hook;

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
        let view = self.pipeline_components.create_texture(
            &data.data,
            tile_width,
            tile_height,
            "West Texture Input",
        );
        Ok(Eu5WasmTexture { data: view })
    }

    #[wasm_bindgen]
    pub fn upload_east_texture(
        &self,
        data: &Eu5WasmTextureData,
    ) -> Result<Eu5WasmTexture, JsError> {
        let (tile_width, tile_height) = tile_dimensions();
        let view = self.pipeline_components.create_texture(
            &data.data,
            tile_width,
            tile_height,
            "East Texture Input",
        );
        Ok(Eu5WasmTexture { data: view })
    }
}

#[wasm_bindgen]
pub struct Eu5WasmMapRenderer {
    app: pdx_map::MapViewController,
    picker: pdx_map::MapPickerSingle,
    location_arrays: LocationArrays,
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
            display,
        );

        let (tile_width, tile_height) = tile_dimensions();
        let picker = pdx_map::MapPickerSingle::new(west_data.data, east_data.data, tile_width * 2);
        let mut app = pdx_map::MapViewController::new(renderer, tile_width, tile_height);

        let show_location_borders = should_highlight_individual_locations(app.get_zoom());
        app.renderer_mut()
            .set_location_borders(show_location_borders);

        Ok(Eu5WasmMapRenderer {
            app,
            picker,
            location_arrays: LocationArrays::new(),
        })
    }

    /// Get current raw zoom value
    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f32 {
        self.app.get_zoom()
    }

    #[wasm_bindgen]
    pub fn canvas_to_world(&self, canvas_x: f32, canvas_y: f32) -> Vec<f32> {
        let world_coords = self.app.canvas_to_world(canvas_x, canvas_y);
        vec![world_coords.x, world_coords.y]
    }

    #[wasm_bindgen]
    pub fn pick_location(&mut self, canvas_x: f32, canvas_y: f32) -> u16 {
        let world_coords = self.app.canvas_to_world(canvas_x, canvas_y);
        let location = self.picker.pick(world_coords);
        location.value()
    }

    #[wasm_bindgen]
    pub fn gpu_loc_to_app(&mut self, gpu_loc: u16) -> u32 {
        let idx = GpuLocationIdx::new(gpu_loc);
        self.location_arrays.get_location_id(idx).value()
    }

    /// Position a world point under a specific canvas cursor position
    #[wasm_bindgen]
    pub fn set_world_point_under_cursor(
        &mut self,
        world_x: f32,
        world_y: f32,
        canvas_x: f32,
        canvas_y: f32,
    ) {
        self.app
            .set_world_point_under_cursor(world_x, world_y, canvas_x, canvas_y);
    }

    /// Resize the canvas and reconfigure the surface
    #[wasm_bindgen]
    pub fn resize(&mut self, logical_width: u32, logical_height: u32) {
        self.app.resize(logical_width, logical_height);
    }

    /// Zoom at a specific point (Google Maps style cursor-centric zoom)
    #[wasm_bindgen]
    pub fn zoom_at_point(&mut self, cursor_x: f32, cursor_y: f32, zoom_delta: f32) {
        self.app.zoom_at_point(cursor_x, cursor_y, zoom_delta);
        let show_location_borders = should_highlight_individual_locations(self.app.get_zoom());
        self.app
            .renderer_mut()
            .set_location_borders(show_location_borders);
    }

    /// Create a separate screenshot renderer that shares GPU resources but operates independently
    #[wasm_bindgen]
    pub fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<WasmScreenshotRenderer, JsError> {
        create_screenshot_renderer_for_app(&self.app, canvas)
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
        self.app
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

    #[wasm_bindgen]
    pub fn center_at_world(&mut self, x: f32, y: f32) {
        self.app.center_at_world(x, y)
    }

    /// Enable or disable owner border rendering
    #[wasm_bindgen]
    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.app.renderer_mut().set_owner_borders(enabled);
    }

    #[wasm_bindgen]
    pub fn queued_work(&self) -> WasmQueuedWorkFuture {
        WasmQueuedWorkFuture::from_queued_work_future(self.app.queued_work())
    }
}

impl Eu5WasmMapRenderer {
    fn upload_location_arrays(&mut self) {
        let renderer = self.app.renderer_mut();
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
    data: Vec<u8>,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub fn setup_eu5_map_wasm() {
    crate::console_error_panic_hook::set_once();
}
