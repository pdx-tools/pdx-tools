use eu5app::{
    GameDataProvider, OptimizedGameData, should_highlight_individual_locations,
    texture_buffer_size, tile_dimensions,
};
use pdx_map::{
    CanvasDimensions, GpuLocationIdx, GpuSurfaceContext, LocationArrays, LocationFlags,
    MapRenderer, MapTexture, SurfaceMapRenderer,
};
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

mod console_error_panic_hook;

// Re-export common types from wasm-pdxmap
pub use wasm_pdx_map::{
    CanvasDisplay, PdxScreenshotRenderer as WasmScreenshotRenderer, WasmColorIdReadback,
    WasmGpuColor, WasmLocationIdx, WasmQueuedWorkFuture, create_screenshot_renderer_for_app,
    get_surface_target,
};

#[wasm_bindgen]
pub struct Eu5CanvasSurface {
    pipeline_components: GpuSurfaceContext,
    display: CanvasDisplay,
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

    /// Consumes the data as we don't need to hold the texture info anymore.
    #[wasm_bindgen]
    pub fn upload_east_texture(&self, data: Eu5WasmTextureData) -> Result<Eu5WasmTexture, JsError> {
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
    app: pdx_map::MapApp<pdx_map::SurfaceMapRenderer>,
}

#[wasm_bindgen]
impl Eu5WasmMapRenderer {
    #[wasm_bindgen]
    pub fn create(
        surface: Eu5CanvasSurface,
        west_texture: Eu5WasmTexture,
        east_texture: Eu5WasmTexture,
    ) -> Result<Self, JsError> {
        let display: CanvasDimensions = surface.display.into();
        let display_surface = surface
            .pipeline_components
            .as_ref()
            .display_surface(display);
        let renderer = SurfaceMapRenderer::new(
            surface.pipeline_components,
            west_texture.data,
            east_texture.data,
            display_surface,
            display,
        );

        let (tile_width, tile_height) = tile_dimensions();
        let mut app = pdx_map::MapApp::new(renderer, display, tile_width, tile_height);

        let show_location_borders = should_highlight_individual_locations(app.get_zoom());
        app.renderer_mut()
            .set_location_borders(show_location_borders);

        Ok(Eu5WasmMapRenderer { app })
    }

    /// Get current raw zoom value
    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f32 {
        self.app.get_zoom()
    }

    #[wasm_bindgen]
    pub fn canvas_to_world(&self, canvas_x: f32, canvas_y: f32) -> Vec<f32> {
        let (world_x, world_y) = self.app.canvas_to_world(canvas_x, canvas_y);
        vec![world_x, world_y]
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
        if self.app.renderer().location_arrays().is_empty() {
            let local = location_array.to_vec();
            let location_array = LocationArrays::from_data(local);
            self.app.renderer_mut().set_location_arrays(location_array);
        } else {
            let dst = self.app.renderer_mut().location_arrays_mut().as_mut_data();
            location_array.copy_to(dst);
        }
    }

    #[wasm_bindgen]
    pub fn render(&mut self) {
        self.app.render();
    }

    #[wasm_bindgen]
    pub fn present(&mut self) -> Result<(), JsError> {
        self.app
            .present()
            .map_err(|e| JsError::new(&format!("Failed to present: {e}")))?;
        Ok(())
    }

    #[wasm_bindgen]
    pub fn create_location_color_id_readback(
        &self,
        x: f32,
        y: f32,
    ) -> Result<WasmColorIdReadback, JsError> {
        let readback = self
            .app
            .create_color_id_readback_at(x, y)
            .map_err(|e| JsError::new(&format!("unable to create readback: {e:?}")))?;
        Ok(WasmColorIdReadback::from_color_id_readback(readback))
    }

    #[wasm_bindgen]
    pub fn lookup_color_idx(&self, color: &WasmGpuColor) -> Option<WasmLocationIdx> {
        let val = self.app.lookup_color_idx(color.inner())?;
        Some(WasmLocationIdx::from_gpu_location_idx(val))
    }

    #[wasm_bindgen]
    pub fn lookup_location_id(&self, idx: &WasmLocationIdx) -> u32 {
        let val = self
            .app
            .renderer()
            .location_arrays()
            .get_location_id(idx.inner());
        val.value()
    }

    #[wasm_bindgen]
    pub fn highlight_location(&mut self, idx: u32) {
        let location_arrays = self.app.renderer_mut().location_arrays_mut();
        location_arrays
            .get_mut(GpuLocationIdx::new(idx))
            .flags_mut()
            .set(LocationFlags::HIGHLIGHTED);
    }

    #[wasm_bindgen]
    pub fn highlight_app_location(&mut self, idx: u32) {
        let location_arrays = self.app.renderer_mut().location_arrays_mut();
        let mut iter = location_arrays.iter_mut();
        while let Some(mut location) = iter.next_location() {
            if location.location_id().value() == idx {
                location.flags_mut().set(LocationFlags::HIGHLIGHTED);
            }
        }
    }

    #[wasm_bindgen]
    pub fn unhighlight_location(&mut self, idx: u32) {
        let location_arrays = self.app.renderer_mut().location_arrays_mut();
        location_arrays
            .get_mut(GpuLocationIdx::new(idx))
            .flags_mut()
            .clear(LocationFlags::HIGHLIGHTED);
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

#[wasm_bindgen]
pub struct Eu5WasmGameBundle {
    bundle: OptimizedGameData,
}

#[wasm_bindgen]
impl Eu5WasmGameBundle {
    #[wasm_bindgen]
    pub fn open(data: Vec<u8>) -> Result<Self, JsError> {
        let bundle = OptimizedGameData::open(data)
            .map_err(|e| JsError::new(&format!("Failed to open game bundle: {e}")))?;
        Ok(Eu5WasmGameBundle { bundle })
    }

    #[wasm_bindgen]
    pub fn west_texture_data(&self) -> Result<Eu5WasmTextureData, JsError> {
        let size = texture_buffer_size();
        let mut data = vec![0u8; size];
        self.bundle
            .west_texture(&mut data)
            .map_err(|e| JsError::new(&format!("Failed to get west texture data: {e}")))?;
        Ok(Eu5WasmTextureData { data })
    }

    #[wasm_bindgen]
    pub fn east_texture_data(
        &self,
        mut data: Eu5WasmTextureData,
    ) -> Result<Eu5WasmTextureData, JsError> {
        self.bundle
            .east_texture(&mut data.data)
            .map_err(|e| JsError::new(&format!("Failed to get east texture data: {e}")))?;
        Ok(Eu5WasmTextureData { data: data.data })
    }
}

#[wasm_bindgen]
pub struct Eu5WasmTextureData {
    data: Vec<u8>,
}

#[wasm_bindgen]
pub struct Eu5WasmTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub fn setup_eu5_map_wasm() {
    crate::console_error_panic_hook::set_once();
}
