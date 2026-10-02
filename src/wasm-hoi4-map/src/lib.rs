use hoi4app::MapTextures;
use pdx_map::{
    CanvasDimensions, Clock, GpuLocationIdx, GpuSurfaceContext, Hemisphere, InteractionController,
    KeyboardKey, LocationArrays, LogicalPoint, LogicalSize, MapViewController, MouseButton,
    PhysicalSize, R16, SurfaceMapRenderer, World, WorldLength, WorldPoint, default_clock,
};
use std::time::Duration;
use tsify::Ts;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

pub use wasm_pdx_map::{
    CanvasDisplay, PdxScreenshotRenderer as WasmScreenshotRenderer, WasmQueuedWorkFuture,
    create_screenshot_renderer_for_app, get_surface_target,
};

/// The zoom level at which the borders between provinces become legible.
/// The HOI4 map has a third of the width of the EU5 map. Thus its provinces
/// are large enough to show borders at a lower zoom than EU5 locations.
const PROVINCE_BORDER_ZOOM: f32 = 0.5;

fn show_province_borders(zoom: f32) -> bool {
    zoom >= PROVINCE_BORDER_ZOOM
}

/// The decoded location textures of the map bundle
#[wasm_bindgen]
#[derive(Debug)]
pub struct Hoi4MapTextures {
    textures: MapTextures,
}

#[wasm_bindgen]
impl Hoi4MapTextures {
    /// Decode the map bundle (map.zip)
    #[wasm_bindgen]
    pub fn open(data: &[u8]) -> Result<Hoi4MapTextures, JsError> {
        let textures = hoi4app::read_map_bundle(data)
            .map_err(|e| JsError::new(&format!("Failed to open map bundle: {e}")))?;
        Ok(Hoi4MapTextures { textures })
    }
}

impl Hoi4MapTextures {
    fn hemisphere_size(&self) -> PhysicalSize<u32> {
        PhysicalSize::new(self.textures.meta.width / 2, self.textures.meta.height)
    }

    fn into_world(self) -> World {
        let width = WorldLength::new(self.textures.meta.width).hemisphere();
        let west = Hemisphere::new(self.textures.west, width);
        let east = Hemisphere::new(self.textures.east, width);
        let max = R16::new(self.textures.meta.max_location_index);

        // SAFETY: the asset compiler writes the max location index of the
        // textures into the same bundle.
        unsafe { World::builder(west, east).with_max_location_index_unchecked(max) }.build()
    }
}

#[wasm_bindgen]
pub struct Hoi4CanvasSurface {
    context: GpuSurfaceContext,
    display: CanvasDisplay,
}

impl std::fmt::Debug for Hoi4CanvasSurface {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Hoi4CanvasSurface").finish()
    }
}

#[wasm_bindgen]
impl Hoi4CanvasSurface {
    /// Get a GPU device for the canvas. Fails when the browser has no
    /// WebGPU support or no suitable adapter.
    #[wasm_bindgen]
    pub async fn init(
        canvas: OffscreenCanvas,
        display: Ts<CanvasDisplay>,
    ) -> Result<Hoi4CanvasSurface, JsError> {
        let display = display.to_rust()?;
        let surface = get_surface_target(canvas);
        let context = GpuSurfaceContext::new(surface)
            .await
            .map_err(|e| JsError::new(&format!("Failed to initialize GPU: {e}")))?;
        Ok(Hoi4CanvasSurface { context, display })
    }
}

#[wasm_bindgen]
pub struct Hoi4MapRenderer {
    controller: MapViewController,
    input: InteractionController,
    world: World,
    location_arrays: LocationArrays,
    clock: Box<dyn Clock>,
    last_tick: Option<Duration>,
}

impl std::fmt::Debug for Hoi4MapRenderer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Hoi4MapRenderer").finish()
    }
}

#[wasm_bindgen]
impl Hoi4MapRenderer {
    /// Upload the textures to the GPU and create the renderer
    #[wasm_bindgen]
    pub fn create(
        surface: Hoi4CanvasSurface,
        textures: Hoi4MapTextures,
    ) -> Result<Hoi4MapRenderer, JsError> {
        let display: CanvasDimensions = surface.display.into();
        let hemisphere_size = textures.hemisphere_size();
        let west = surface.context.create_texture(
            &textures.textures.west,
            hemisphere_size,
            "West Texture Input",
        );
        let east = surface.context.create_texture(
            &textures.textures.east,
            hemisphere_size,
            "East Texture Input",
        );

        let renderer =
            SurfaceMapRenderer::new(surface.context, west, east, display.physical_size());
        let map_size = renderer.hemisphere_size().world();
        let world = textures.into_world();
        let mut controller = MapViewController::new(renderer);
        let input = InteractionController::new(display.logical_size(), map_size);
        controller
            .renderer_mut()
            .set_location_borders(show_province_borders(input.zoom_level()));

        Ok(Hoi4MapRenderer {
            controller,
            input,
            world,
            location_arrays: LocationArrays::new(),
            clock: default_clock(),
            last_tick: None,
        })
    }

    #[wasm_bindgen]
    pub fn get_zoom(&self) -> f32 {
        self.input.zoom_level()
    }

    /// The province id under the cursor. Zero when there is none.
    #[wasm_bindgen]
    pub fn province_under_cursor(&self) -> u32 {
        if self.location_arrays.is_empty() {
            return 0;
        }

        let r16 = self.world.at(self.input.world_position());
        self.location_arrays
            .get_location_id(GpuLocationIdx::new(r16.value()))
            .value()
    }

    #[wasm_bindgen]
    pub fn on_cursor_move(&mut self, x: f32, y: f32) {
        self.input.on_cursor_move(LogicalPoint::new(x, y));
        self.apply_viewport();
    }

    /// Handle a mouse button (0 = left, 1 = right, 2 = middle)
    #[wasm_bindgen]
    pub fn on_mouse_button(&mut self, button: u8, pressed: bool) {
        let button = match button {
            0 => MouseButton::Left,
            1 => MouseButton::Right,
            2 => MouseButton::Middle,
            _ => return,
        };
        self.input.on_mouse_button(button, pressed);
        self.apply_viewport();
    }

    /// Zoom in (positive lines) or out (negative lines)
    #[wasm_bindgen]
    pub fn on_scroll(&mut self, scroll_lines: f32) {
        self.input.on_scroll(scroll_lines);
        self.apply_viewport();
    }

    #[wasm_bindgen]
    pub fn on_key_down(&mut self, code: String) {
        self.input.on_key_down(KeyboardKey::from_web_code(&code));
    }

    #[wasm_bindgen]
    pub fn on_key_up(&mut self, code: String) {
        self.input.on_key_up(KeyboardKey::from_web_code(&code));
    }

    /// Apply per-frame updates (eg: keyboard panning and pan animations)
    #[wasm_bindgen]
    pub fn tick(&mut self) {
        let now = self.clock.now();
        let delta = now.saturating_sub(self.last_tick.unwrap_or(now));
        self.last_tick = Some(now);
        self.input.tick(delta);
        self.apply_viewport();
    }

    /// Resize the canvas. The width and height are physical pixels.
    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32, scale_factor: f32) {
        self.input.on_resize(LogicalSize::new(
            ((width as f32) / scale_factor) as u32,
            ((height as f32) / scale_factor) as u32,
        ));
        self.apply_viewport();
        self.controller.resize(PhysicalSize::new(width, height));
    }

    /// Replace all location data with the arrays from the save worker
    #[wasm_bindgen]
    pub fn sync_location_array(&mut self, data: js_sys::Uint32Array) -> Result<(), JsError> {
        let arrays = LocationArrays::from_data(data.to_vec());
        if arrays.len() != self.world.location_capacity() {
            return Err(JsError::new("location data does not match the map"));
        }
        self.location_arrays = arrays;
        self.controller
            .renderer_mut()
            .update_locations(&self.location_arrays);
        Ok(())
    }

    /// Replace the flags of each location (eg: highlights)
    #[wasm_bindgen]
    pub fn sync_flag_array(&mut self, flags: js_sys::Uint32Array) -> Result<(), JsError> {
        let destination = self.location_arrays.flag_data_mut();
        if flags.length() as usize != destination.len() {
            return Err(JsError::new("flag data does not match the map"));
        }
        flags.copy_to(destination);
        self.controller
            .renderer_mut()
            .update_flags(&self.location_arrays);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsError> {
        self.controller
            .render()
            .map_err(|e| JsError::new(&format!("Failed to render: {e}")))
    }

    /// Center the view on a province
    #[wasm_bindgen]
    pub fn center_on_province(&mut self, province_id: u32) {
        let Some(idx) = self.gpu_index_of(province_id) else {
            return;
        };

        let center = self.world.center_of(R16::new(idx));
        self.input
            .center_on(WorldPoint::new(center.x as f32, center.y as f32));
        self.apply_viewport();
    }

    /// Zoom out so that the whole map is visible
    #[wasm_bindgen]
    pub fn fit_map(&mut self) {
        self.input.fit_map();
        self.apply_viewport();
    }

    #[wasm_bindgen]
    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.controller.renderer_mut().set_owner_borders(enabled);
    }

    #[wasm_bindgen]
    pub fn queued_work(&self) -> WasmQueuedWorkFuture {
        WasmQueuedWorkFuture::from_queued_work_future(self.controller.queued_work())
    }

    /// The size of the world in world units: `[width, height]`.
    #[wasm_bindgen]
    pub fn world_size(&self) -> Vec<u32> {
        let size = self.controller.hemisphere_size().world();
        vec![size.width, size.height]
    }

    /// Create a renderer for screenshots that shares the GPU resources of
    /// this renderer
    #[wasm_bindgen]
    pub fn create_screenshot_renderer(
        &self,
        canvas: OffscreenCanvas,
    ) -> Result<WasmScreenshotRenderer, JsError> {
        create_screenshot_renderer_for_app(&self.controller, canvas)
            .map_err(|e| JsError::new(&format!("Failed to create screenshot renderer: {e}")))
    }
}

impl Hoi4MapRenderer {
    fn apply_viewport(&mut self) {
        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
        self.controller
            .renderer_mut()
            .set_location_borders(show_province_borders(bounds.zoom_level));
    }

    fn gpu_index_of(&self, province_id: u32) -> Option<u16> {
        let ids = self.location_arrays.buffers().location_ids();
        ids.iter()
            .position(|x| x.value() == province_id)
            .and_then(|x| u16::try_from(x).ok())
    }
}

#[wasm_bindgen]
pub fn setup_hoi4_map_wasm(level: Ts<wasm_pdx_core::log_level::LogLevel>) -> Result<(), JsError> {
    let level = level.to_rust()?;
    wasm_pdx_core::console_error_panic_hook::set_once();
    wasm_pdx_core::console_writer::init_with_level(level.into());
    Ok(())
}
