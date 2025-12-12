use pdx_map::{
    CanvasDimensions, ColorIdReadback, GpuColor, GpuLocationIdx, GpuSurfaceContext, LocationArrays,
    LocationFlags, MapTexture, MapViewController, QueuedWorkFuture, R16Palette, RenderError,
    ScreenshotRenderer, SurfaceMapRenderer,
};
use serde::{Deserialize, Serialize};
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
    app: MapViewController,
    location_arrays: LocationArrays,
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

        // Get tile dimensions from west texture
        let tile_width = west_texture.data.width();
        let tile_height = west_texture.data.height();

        let renderer = SurfaceMapRenderer::new(
            surface.pipeline_components,
            west_texture.data,
            east_texture.data,
            canvas_dims,
        );

        let mut location_arrays = LocationArrays::allocate(image.palette.len());
        let init_colors = image.palette.map(|_, x| GpuColor::from(x.as_rgb()));
        location_arrays.set_primary_colors(init_colors.as_slice());
        location_arrays.set_secondary_colors(init_colors.as_slice());
        location_arrays.set_owner_colors(init_colors.as_slice());
        let app = MapViewController::new(renderer, canvas_dims, tile_width, tile_height);

        let mut map_renderer = PdxMapRenderer {
            app,
            location_arrays,
        };
        map_renderer.upload_location_arrays();

        Ok(map_renderer)
    }

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
    pub fn create_location_color_id_readback(
        &self,
        x: f32,
        y: f32,
    ) -> Result<WasmGpuLocationIdxReadback, JsError> {
        let readback = self
            .app
            .create_color_id_readback_at(x, y)
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
        self.app.center_at_world(x, y)
    }

    /// Enable or disable owner border rendering
    #[wasm_bindgen]
    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.app.renderer_mut().set_owner_borders(enabled);
    }

    #[wasm_bindgen]
    pub fn queued_work(&self) -> WasmQueuedWorkFuture {
        WasmQueuedWorkFuture {
            future: self.app.queued_work(),
        }
    }

    /// Create a separate screenshot renderer that shares GPU resources but operates independently
    #[wasm_bindgen]
    pub fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<PdxScreenshotRenderer, JsError> {
        create_screenshot_renderer_for_app(&self.app, canvas)
            .map_err(|e| JsError::new(&format!("Failed to create screenshot renderer: {e}")))
    }
}

impl PdxMapRenderer {
    fn upload_location_arrays(&mut self) {
        let renderer = self.app.renderer_mut();
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
        CanvasDimensions {
            canvas_width: display.width as u32,
            canvas_height: display.height as u32,
            scale_factor: display.scale_factor,
        }
    }
}

#[wasm_bindgen]
pub struct PdxTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub struct PdxScreenshotRenderer {
    renderer: ScreenshotRenderer<SurfaceMapRenderer>,
}

#[wasm_bindgen]
impl PdxScreenshotRenderer {
    /// Render the western tile to the screenshot surface
    #[wasm_bindgen]
    pub fn render_west_tile(&mut self) -> Result<(), JsError> {
        self.renderer
            .render_west()
            .map_err(|e| JsError::new(&format!("Failed to render west tile: {e}")))
    }

    /// Render the eastern tile to the screenshot surface
    #[wasm_bindgen]
    pub fn render_east_tile(&mut self) -> Result<(), JsError> {
        self.renderer
            .render_east()
            .map_err(|e| JsError::new(&format!("Failed to render east tile: {e}")))
    }
}

/// Shared helper to create a screenshot renderer for any MapApp<SurfaceMapRenderer>
pub fn create_screenshot_renderer_for_app(
    app: &MapViewController,
    canvas: OffscreenCanvas,
) -> Result<PdxScreenshotRenderer, RenderError> {
    let canvas_width = canvas.width();
    let canvas_height = canvas.height();
    let surface_target = get_surface_target(canvas);
    let dimensions = CanvasDimensions {
        canvas_width,
        canvas_height,
        scale_factor: 1.0,
    };
    let screenshot_renderer = app.create_screenshot_renderer(surface_target, dimensions)?;
    Ok(PdxScreenshotRenderer {
        renderer: screenshot_renderer,
    })
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
