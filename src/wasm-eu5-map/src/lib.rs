use eu5app::{
    GroupId, GroupingTable, OpeningView, game_data::OptimizedMapBundle,
    should_highlight_individual_locations,
};
use eu5save::hash::FnvHashSet;
use pdx_map::{
    Aabb, CanvasDimensions, Clock, GpuLocationIdx, GpuSurfaceContext, Hemisphere, HemisphereLength,
    InteractionController, KeyboardKey, LocationArrays, LocationBitset, LocationFlags,
    LogicalPoint, LogicalSize, MapTexture, MapViewController, MouseButton, PanTarget, PhysicalSize,
    R16, SpatialIndex, SurfaceMapRenderer, ViewportInsets, World, WorldPoint, WorldRect,
    default_clock,
};
use std::time::Duration;
use tsify::Ts;
use wasm_bindgen::prelude::*;
use web_sys::OffscreenCanvas;

// Re-export common types from wasm-pdxmap
pub use wasm_pdx_map::{
    CanvasDisplay, PdxScreenshotRenderer as WasmScreenshotRenderer, WasmGpuColor,
    WasmGpuLocationIdx, WasmGpuLocationIdxReadback, WasmQueuedWorkFuture, WasmViewportInsets,
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
        display: Ts<CanvasDisplay>,
    ) -> Result<Eu5CanvasSurface, JsError> {
        let display = display.to_rust()?;
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
        data: &Eu5WasmTextureHemispheres,
    ) -> Result<Eu5WasmTexture, JsError> {
        let view = self.pipeline_components.create_texture(
            &data.west,
            eu5app::hemisphere_size().physical(),
            "West Texture Input",
        );
        Ok(Eu5WasmTexture { data: view })
    }

    #[wasm_bindgen]
    pub fn upload_east_texture(
        &self,
        data: &Eu5WasmTextureHemispheres,
    ) -> Result<Eu5WasmTexture, JsError> {
        let view = self.pipeline_components.create_texture(
            &data.east,
            eu5app::hemisphere_size().physical(),
            "East Texture Input",
        );
        Ok(Eu5WasmTexture { data: view })
    }
}

/// Whether the map at `zoom` draws the borders between locations. The same
/// rule the live map applies as the player zooms, for a surface that renders
/// at a zoom of its own.
#[wasm_bindgen]
pub fn location_borders_at_zoom(zoom: f32) -> bool {
    should_highlight_individual_locations(zoom)
}

#[wasm_bindgen]
pub struct Eu5WasmMapRenderer {
    controller: MapViewController,
    input: InteractionController,
    world: World,
    spatial_index: SpatialIndex,
    spatial_scratch: LocationBitset,
    location_arrays: LocationArrays,
    /// The locations inside the current box-select drag.
    preview_locations: LocationBitset,
    grouping_table: GroupingTable,
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
        texture_data: Eu5WasmTextureHemispheres,
    ) -> Result<Self, JsError> {
        let display: CanvasDimensions = surface.display.into();
        let renderer = SurfaceMapRenderer::new(
            surface.pipeline_components,
            west_texture.data,
            east_texture.data,
            display.physical_size(),
        );

        let map_size = renderer.hemisphere_size().world();
        let world = texture_data.into_world(renderer.hemisphere_size().width_length());
        let spatial_index = world.build_spatial_index();
        let mut controller = MapViewController::new(renderer);

        // Initialize input controller with map size
        let input = InteractionController::new(display.logical_size(), map_size);

        let show_location_borders = should_highlight_individual_locations(controller.get_zoom());
        controller
            .renderer_mut()
            .set_location_borders(show_location_borders);

        Ok(Eu5WasmMapRenderer {
            controller,
            input,
            world,
            spatial_index,
            spatial_scratch: LocationBitset::new(),
            location_arrays: LocationArrays::new(),
            preview_locations: LocationBitset::new(),
            grouping_table: GroupingTable::empty(),
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

    /// The rectangle of the world the live map shows: `[x, y, width, height]`
    /// in world units.
    ///
    /// A recording of the current view frames itself from this, so the film
    /// shows what the player framed rather than what their window happens to
    /// be shaped like.
    #[wasm_bindgen]
    pub fn viewport_world_rect(&self) -> Vec<u32> {
        let rect = self.input.viewport_bounds().rect;
        vec![
            rect.origin.x,
            rect.origin.y,
            rect.size.width,
            rect.size.height,
        ]
    }

    /// The size of the whole world in world units: `[width, height]`.
    #[wasm_bindgen]
    pub fn world_size(&self) -> Vec<u32> {
        let size = self.controller.hemisphere_size().world();
        vec![size.width, size.height]
    }

    /// Update the grouping table used for box-select preview highlighting.
    /// `raw` is the flat array returned by the game worker's `grouping_table()` method.
    #[wasm_bindgen]
    pub fn sync_grouping_table(&mut self, raw: js_sys::Uint32Array) {
        let groups: Vec<GroupId> = raw.to_vec().into_iter().map(GroupId::from_raw).collect();
        self.grouping_table = GroupingTable::new(groups);
    }

    /// Highlight all GPU locations that share a group with any location inside the canvas rect.
    /// Called on every drag-update frame during a box-select drag.
    #[wasm_bindgen]
    pub fn preview_box_highlight(&mut self, start_x: f32, start_y: f32, end_x: f32, end_y: f32) {
        let start = LogicalPoint::new(start_x, start_y);
        let end = LogicalPoint::new(end_x, end_y);
        self.fill_preview_groups(start, end);
        self.upload_preview();
    }

    /// Resolve the canvas rect to a flat array of app-level location indices,
    /// expanding each hit location to all members of the same group.
    /// Called once on pointer-up to produce the final selection payload.
    #[wasm_bindgen]
    pub fn commit_box_selection(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    ) -> js_sys::Uint32Array {
        if self.preview_locations.count() == 0 {
            let start = LogicalPoint::new(start_x, start_y);
            let end = LogicalPoint::new(end_x, end_y);
            self.fill_preview_groups(start, end);
        }
        self.take_preview()
    }

    /// Clear all box-select preview highlights.
    /// Called after the commit has been applied to the game worker.
    #[wasm_bindgen]
    pub fn clear_box_highlight(&mut self) {
        self.preview_locations.clear();
        self.upload_preview();
    }

    /// Highlight individual GPU locations (not entity-expanded) within the canvas rect.
    /// Called on every drag-update frame during a Ctrl+drag box-select.
    #[wasm_bindgen]
    pub fn preview_box_highlight_locations(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    ) {
        let start = LogicalPoint::new(start_x, start_y);
        let end = LogicalPoint::new(end_x, end_y);
        self.fill_preview_locations(start, end);
        self.upload_preview();
    }

    /// Resolve the canvas rect to individual app-level location indices without entity expansion.
    /// Called once on pointer-up during a Ctrl+drag box-select.
    #[wasm_bindgen]
    pub fn commit_box_selection_locations(
        &mut self,
        start_x: f32,
        start_y: f32,
        end_x: f32,
        end_y: f32,
    ) -> js_sys::Uint32Array {
        if self.preview_locations.count() == 0 {
            let start = LogicalPoint::new(start_x, start_y);
            let end = LogicalPoint::new(end_x, end_y);
            self.fill_preview_locations(start, end);
        }
        self.take_preview()
    }

    #[wasm_bindgen]
    pub fn pick_location(&mut self) -> u16 {
        let world_coords = self.input.world_position();
        self.world.at(world_coords).value()
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

    /// Resize the canvas and reconfigure the surface.
    ///
    /// Width and height are physical pixels.
    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32, scale_factor: f32) {
        self.input.on_resize(LogicalSize::new(
            ((width as f32) / scale_factor) as u32,
            ((height as f32) / scale_factor) as u32,
        ));

        // Transfer updated viewport bounds to render controller
        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);

        self.controller.resize(PhysicalSize::new(width, height));
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

        self.compose_preview();
        self.upload_location_arrays();
    }

    #[wasm_bindgen]
    pub fn sync_color_array(&mut self, color_data: js_sys::Uint32Array) {
        let destination = self.location_arrays.color_data_mut();
        assert_eq!(
            color_data.length() as usize,
            destination.len(),
            "Color data length must match initialized location arrays"
        );
        color_data.copy_to(destination);
        self.controller
            .renderer_mut()
            .update_colors(&self.location_arrays);
    }

    #[wasm_bindgen]
    pub fn sync_flag_array(&mut self, state_flags: js_sys::Uint32Array) {
        let destination = self.location_arrays.flag_data_mut();
        assert_eq!(
            state_flags.length() as usize,
            destination.len(),
            "Flag data length must match initialized location arrays"
        );
        state_flags.copy_to(destination);
        self.upload_preview();
    }

    #[wasm_bindgen]
    pub fn render(&mut self) -> Result<(), JsError> {
        self.controller
            .render()
            .map_err(|e| JsError::new(&format!("Failed to render: {e}")))
    }

    /// Center the viewport at a world point
    #[wasm_bindgen]
    pub fn center_at_world(&mut self, x: f32, y: f32) {
        let world = WorldPoint::new(x, y);
        self.input.center_on(world);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Open the map on the view the save calls for.
    #[wasm_bindgen]
    pub fn open_view(&mut self, view: Ts<OpeningView>) -> Result<(), JsError> {
        match view.to_rust()? {
            OpeningView::Capital { color_id } => self.center_at_color_id(color_id.value()),
            OpeningView::World => self.fit(self.input.map_rect()),
        }
        Ok(())
    }

    /// Show all of `rect`, as large as the zoom limits allow.
    fn fit(&mut self, rect: WorldRect<u32>) {
        self.input.fit(rect);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);

        let show_borders = should_highlight_individual_locations(bounds.zoom_level);
        self.controller
            .renderer_mut()
            .set_location_borders(show_borders);
    }

    /// Center the viewport at a location by its color ID (R16 texture index).
    #[wasm_bindgen]
    pub fn center_at_color_id(&mut self, color_id: u16) {
        let r16 = R16::new(color_id);
        let center = self.world.center_of(r16);

        // Convert u32 world coordinates to f32 for viewport
        let world = WorldPoint::new(center.x as f32, center.y as f32);
        self.input.center_on(world);

        let bounds = self.input.viewport_bounds();
        self.controller.set_viewport_bounds(bounds);
    }

    /// Pan to make the location with `color_id` (R16 texture index) visible,
    /// respecting panel insets. Returns true if a pan was started.
    /// Uses a concrete pixel from the spatial index, so wrapping locations pan
    /// to an actual owned pixel instead of an invalid world-midpoint AABB.
    #[wasm_bindgen]
    pub fn pan_to_color_id(
        &mut self,
        color_id: u16,
        insets: Ts<WasmViewportInsets>,
    ) -> Result<bool, JsError> {
        let point = self.spatial_index.point_of(R16::new(color_id));
        let center = WorldPoint::new(point.x as f32, point.y as f32);
        let insets = insets.to_rust()?;
        let viewport_insets: ViewportInsets = insets.into();
        Ok(self
            .input
            .pan_to_visible_region(PanTarget::Point(center), viewport_insets))
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

    fn fill_locations_in_rect(&mut self, start: LogicalPoint<f32>, end: LogicalPoint<f32>) {
        let (primary, secondary) = self.input.canvas_rect_to_world_aabbs(start, end);
        let rects: &[Aabb] = match &secondary {
            Some(s) => &[primary, *s],
            None => std::slice::from_ref(&primary),
        };
        self.spatial_index
            .query_exact(rects, &mut self.spatial_scratch);
    }

    /// Mark every location that shares a group with a location in the rect.
    fn fill_preview_groups(&mut self, start: LogicalPoint<f32>, end: LogicalPoint<f32>) {
        self.fill_locations_in_rect(start, end);
        let groups: FnvHashSet<GroupId> = self
            .spatial_scratch
            .drain()
            .map(|r16| self.grouping_table.get(GpuLocationIdx::new(r16.value())))
            .filter(|group| !group.is_none())
            .collect();

        self.preview_locations.clear();
        for (gpu, group) in self.grouping_table.iter() {
            if groups.contains(&group) {
                self.preview_locations.set(R16::new(gpu.value()));
            }
        }
    }

    /// Mark every grouped location in the rect, without group expansion.
    fn fill_preview_locations(&mut self, start: LogicalPoint<f32>, end: LogicalPoint<f32>) {
        self.fill_locations_in_rect(start, end);
        self.preview_locations.clear();
        for r16 in self.spatial_scratch.drain() {
            if !self
                .grouping_table
                .get(GpuLocationIdx::new(r16.value()))
                .is_none()
            {
                self.preview_locations.set(r16);
            }
        }
    }

    /// Drain the preview into app-level location ids and clear it from the map.
    fn take_preview(&mut self) -> js_sys::Uint32Array {
        let app_ids: Vec<u32> = self
            .preview_locations
            .drain()
            .map(|r16| {
                self.location_arrays
                    .get_location_id(GpuLocationIdx::new(r16.value()))
                    .value()
            })
            .collect();
        self.upload_preview();
        js_sys::Uint32Array::from(app_ids.as_slice())
    }

    /// Write the preview bit of every location from `preview_locations`.
    /// The other flags come from the game worker and stay untouched.
    fn compose_preview(&mut self) {
        let preview = &self.preview_locations;
        for (index, flags) in self.location_arrays.flag_data_mut().iter_mut().enumerate() {
            let bit = LocationFlags::PREVIEW.bits();
            if preview.contains(R16::new(index as u16)) {
                *flags |= bit;
            } else {
                *flags &= !bit;
            }
        }
    }

    fn upload_preview(&mut self) {
        self.compose_preview();
        self.controller
            .renderer_mut()
            .update_flags(&self.location_arrays);
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmMapBundle {
    textures: OptimizedMapBundle<Vec<u8>>,
}

#[wasm_bindgen]
impl Eu5WasmMapBundle {
    #[wasm_bindgen]
    pub fn open(data: Vec<u8>) -> Result<Self, JsError> {
        OptimizedMapBundle::open(data)
            .map(|textures| Eu5WasmMapBundle { textures })
            .map_err(|e| JsError::new(&format!("Failed to open map bundle: {e}")))
    }

    #[wasm_bindgen]
    pub fn load_texture_data(mut self) -> Result<Eu5WasmTextureHemispheres, JsError> {
        let (west_data, east_data) = self
            .textures
            .load_hemispheres()
            .map_err(|e| JsError::new(&format!("Failed to load textures: {e}")))?;
        let max_location_index = self
            .textures
            .load_max_location_index()
            .map_err(|e| JsError::new(&format!("Failed to load world metadata: {e}")))?
            .map(|idx| idx.value());

        Ok(Eu5WasmTextureHemispheres {
            west: west_data,
            east: east_data,
            max_location_index,
        })
    }
}

/// West and east hemisphere texture data.
/// Passed directly to renderer construction.
#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmTextureHemispheres {
    west: Vec<pdx_map::R16>,
    east: Vec<pdx_map::R16>,
    max_location_index: Option<u16>,
}

impl Eu5WasmTextureHemispheres {
    fn into_world(self, hemisphere_width: HemisphereLength<u32>) -> World {
        let west = Hemisphere::new(self.west, hemisphere_width);
        let east = Hemisphere::new(self.east, hemisphere_width);
        let mut world_builder = World::builder(west, east);

        if let Some(max) = self.max_location_index.map(R16::new) {
            // SAFETY: Metadata is produced by the trusted bundle compiler.
            world_builder = unsafe { world_builder.with_max_location_index_unchecked(max) };
        }

        world_builder.build()
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmTexture {
    data: MapTexture,
}

#[wasm_bindgen]
pub fn setup_eu5_map_wasm(level: Ts<wasm_pdx_core::log_level::LogLevel>) -> Result<(), JsError> {
    let level = level.to_rust()?;
    wasm_pdx_core::console_error_panic_hook::set_once();
    wasm_pdx_core::console_writer::init_with_level(level.into());
    Ok(())
}
