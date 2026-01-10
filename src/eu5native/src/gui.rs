use crate::{Args, date_layer::DateLayer};
use anyhow::{Context, Result};
use eu5app::{
    Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{GameData, TextureProvider, game_install::Eu5GameInstall},
    should_highlight_individual_locations,
};
use eu5save::{BasicTokenResolver, Eu5File, models::Gamestate};
use pdx_map::{
    GpuSurfaceContext, InteractionController, LogicalPoint, LogicalSize, MapViewController,
    SurfaceMapRenderer, WorldPoint, WorldSize,
};
use std::{path::PathBuf, sync::Arc};
use tokio::runtime::Runtime;
use tracing::{error, info, instrument};
use winit::{
    application::ApplicationHandler,
    event::{ElementState, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop, EventLoopProxy},
    window::{Window, WindowAttributes, WindowId},
};

enum GuiUserEvent {
    TextureReady(TextureData),
    SaveReady(Box<Eu5LoadedSave>),
    GameDataReady(GameData),
    WorkspaceReady(Box<WorkspaceBundle>),
    LoadFailed(anyhow::Error),
}

struct WorkspaceBundle {
    save: Eu5LoadedSave,
    workspace: Eu5Workspace<'static>,
}

pub fn run_gui(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to build multi-threaded Tokio runtime");

    let event_loop = EventLoop::<GuiUserEvent>::with_user_event().build()?;
    event_loop.set_control_flow(ControlFlow::Poll);

    let proxy = event_loop.create_proxy();
    let save_file = args.save_file.clone();
    let tokens_file = args.tokens.clone();
    let game_data = args.game_data.clone();

    let save_proxy = proxy.clone();
    rt.spawn_blocking(move || {
        let event = match load_save(save_file, tokens_file) {
            Ok(save) => GuiUserEvent::SaveReady(Box::new(save)),
            Err(err) => GuiUserEvent::LoadFailed(err),
        };

        if save_proxy.send_event(event).is_err() {
            error!("Failed to send save event to GUI thread");
        }
    });

    let game_proxy = proxy.clone();
    rt.spawn_blocking(move || match load_game_bundle(game_data) {
        Ok((texture_data, game_data)) => {
            if game_proxy
                .send_event(GuiUserEvent::TextureReady(texture_data))
                .is_err()
            {
                error!("Failed to send texture event to GUI thread");
                return;
            }

            if game_proxy
                .send_event(GuiUserEvent::GameDataReady(game_data))
                .is_err()
            {
                error!("Failed to send game data event to GUI thread");
            }
        }
        Err(err) => {
            if game_proxy
                .send_event(GuiUserEvent::LoadFailed(err))
                .is_err()
            {
                error!("Failed to send game data failure to GUI thread");
            }
        }
    });

    let mut app = App {
        rt,
        proxy,
        save: None,
        game_data: None,
        workspace: None,
        texture_data: None,
        pending_workspace: None,
        workspace_building: false,
        window: None,
        gpu: None,
        controller: None,
        input_controller: None,
        scale_factor: 1.0,
    };

    event_loop.run_app(&mut app)?;

    Ok(())
}

fn load_save(save_file: PathBuf, tokens_file: PathBuf) -> Result<Eu5LoadedSave> {
    info!("Using save file: {}", save_file.display());
    let file = std::fs::File::open(&save_file)
        .with_context(|| format!("Failed to open save file {}", save_file.display()))?;
    let file = Eu5File::from_file(file)
        .with_context(|| format!("Failed to read save file {}", save_file.display()))?;

    info!("Using tokens file: {}", tokens_file.display());
    let file_data = std::fs::read(&tokens_file)
        .with_context(|| format!("Failed to read tokens file {}", tokens_file.display()))?;
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())
        .with_context(|| format!("Failed to parse tokens file {}", tokens_file.display()))?;

    let parser = Eu5SaveLoader::open(file, resolver)
        .with_context(|| format!("Failed to open save file {}", save_file.display()))?;

    let save = parser
        .parse()
        .with_context(|| format!("Failed to parse save file {}", save_file.display()))?;

    Ok(save)
}

fn load_game_bundle(game_data: PathBuf) -> Result<(TextureData, GameData)> {
    let mut game_bundle = Eu5GameInstall::open(&game_data)
        .with_context(|| format!("Failed to load game data {}", game_data.display()))?;
    // Extract textures before workspace consumes the bundle
    let west_texture = game_bundle
        .load_west_texture(Vec::new())
        .context("Failed to load west texture")?;
    let east_texture = game_bundle
        .load_east_texture(Vec::new())
        .context("Failed to load east texture")?;

    let texture_data = TextureData {
        west: west_texture,
        east: east_texture,
    };

    Ok((texture_data, game_bundle.into_game_data()))
}

/// Pre-extracted texture data to avoid re-opening game bundle
struct TextureData {
    west: Vec<u8>,
    east: Vec<u8>,
}

struct App {
    rt: Runtime,
    proxy: EventLoopProxy<GuiUserEvent>,
    save: Option<Box<Eu5LoadedSave>>,
    game_data: Option<GameData>,
    workspace: Option<Eu5Workspace<'static>>,
    texture_data: Option<TextureData>,
    pending_workspace: Option<Box<WorkspaceBundle>>,
    workspace_building: bool,
    window: Option<Arc<Window>>,
    gpu: Option<GpuSurfaceContext>,
    controller: Option<MapViewController>,
    input_controller: Option<InteractionController>,
    scale_factor: f64,
}

impl App {
    fn try_initialize_renderer(&mut self) {
        if self.controller.is_some() {
            return;
        }

        let Some(window) = self.window.as_ref().cloned() else {
            return;
        };

        let Some(gpu) = self.gpu.take() else {
            return;
        };

        let Some(texture_data) = self.texture_data.take() else {
            self.gpu = Some(gpu);
            return;
        };

        let (controller, input_controller) = init_renderer(&window, gpu, &texture_data);
        self.controller = Some(controller);
        self.input_controller = Some(input_controller);
        window.request_redraw();
        self.try_apply_workspace();
    }

    fn try_start_workspace_build(&mut self) {
        if self.workspace.is_some() || self.workspace_building {
            return;
        }

        let Some(save) = self.save.take() else {
            return;
        };

        let Some(game_data) = self.game_data.take() else {
            self.save = Some(save);
            return;
        };

        self.workspace_building = true;
        let proxy = self.proxy.clone();
        self.rt.spawn_blocking(move || {
            let event = match build_workspace(*save, game_data) {
                Ok(bundle) => GuiUserEvent::WorkspaceReady(Box::new(bundle)),
                Err(err) => GuiUserEvent::LoadFailed(err),
            };

            if proxy.send_event(event).is_err() {
                error!("Failed to send workspace event to GUI thread");
            }
        });
    }

    fn try_apply_workspace(&mut self) {
        let Some(controller) = &mut self.controller else {
            return;
        };

        let Some(input_controller) = &mut self.input_controller else {
            return;
        };

        let Some(bundle) = self.pending_workspace.take() else {
            return;
        };

        apply_workspace(controller, input_controller, &bundle.workspace);
        self.save = Some(Box::new(bundle.save));
        self.workspace = Some(bundle.workspace);

        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }
}

impl ApplicationHandler<GuiUserEvent> for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }

        // Use logical (DPI-independent) sizes for map math; physical size is derived via scale_factor
        let window_attrs = WindowAttributes::default()
            .with_title("PDX.Tools")
            .with_inner_size(winit::dpi::PhysicalSize::new(1920, 1080));

        let window = Arc::new(
            event_loop
                .create_window(window_attrs)
                .expect("Failed to create window"),
        );
        self.scale_factor = window.scale_factor();

        // Initialize the GPU context, blocking while until ready it may seem
        // weird to block here, but I guess this is considered idiomatic for
        // winit + wgpu apps, as the window must be referenced on the main
        // thread.
        let gpu = self
            .rt
            .block_on(pdx_map::GpuSurfaceContext::new(window.clone()))
            .expect("Failed to create GPU context");

        self.window = Some(window);
        self.gpu = Some(gpu);
        self.try_initialize_renderer();
    }

    fn user_event(&mut self, event_loop: &ActiveEventLoop, event: GuiUserEvent) {
        match event {
            GuiUserEvent::TextureReady(texture_data) => {
                self.texture_data = Some(texture_data);
                self.try_initialize_renderer();
            }
            GuiUserEvent::SaveReady(save) => {
                self.save = Some(save);
                self.try_start_workspace_build();
            }
            GuiUserEvent::GameDataReady(game_data) => {
                self.game_data = Some(game_data);
                self.try_start_workspace_build();
            }
            GuiUserEvent::WorkspaceReady(bundle) => {
                self.workspace_building = false;
                self.pending_workspace = Some(bundle);
                self.try_apply_workspace();
            }
            GuiUserEvent::LoadFailed(err) => {
                error!("Failed to load data: {err}");
                event_loop.exit();
            }
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let Some(window) = self.window.as_ref().cloned() else {
            return;
        };

        match event {
            WindowEvent::CloseRequested => {
                self.controller = None;
                event_loop.exit();
                return;
            }
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                self.scale_factor = scale_factor;
            }
            _ => {}
        }

        let Some(controller) = &mut self.controller else {
            return;
        };

        match event {
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                let size = window.inner_size();
                let logical = size.to_logical::<f64>(scale_factor);
                let logical_size =
                    LogicalSize::new(logical.width.round() as u32, logical.height.round() as u32);

                // Update both controllers
                if let Some(input) = &mut self.input_controller {
                    input.on_resize(logical_size);
                    let bounds = input.viewport_bounds();
                    controller.set_viewport_bounds(bounds);
                }
                controller.resize(logical_size);
                window.request_redraw();
            }
            WindowEvent::Resized(new_size) => {
                if new_size.width > 0 && new_size.height > 0 {
                    let scale = self.scale_factor;
                    let logical = new_size.to_logical::<f64>(scale);
                    let logical_size = LogicalSize::new(
                        logical.width.round() as u32,
                        logical.height.round() as u32,
                    );

                    // Update both controllers
                    if let Some(input) = &mut self.input_controller {
                        input.on_resize(logical_size);
                        let bounds = input.viewport_bounds();
                        controller.set_viewport_bounds(bounds);
                    }
                    controller.resize(logical_size);
                    window.request_redraw();
                }
            }
            WindowEvent::RedrawRequested => {
                if let Err(e) = controller.render() {
                    error!("Render error: {e}");
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                let scale = self.scale_factor as f32;
                let x = (position.x as f32) / scale;
                let y = (position.y as f32) / scale;

                // UI thread: Update input controller (handles drag internally)
                if let Some(input) = &mut self.input_controller {
                    input.on_cursor_move(LogicalPoint::new(x, y));

                    // Transfer viewport to render controller
                    let bounds = input.viewport_bounds();
                    controller.set_viewport_bounds(bounds);
                    window.request_redraw();
                }
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if let Some(input) = &mut self.input_controller {
                    // Convert winit::MouseButton to pdx_map::MouseButton
                    let mouse_button = match button {
                        winit::event::MouseButton::Left => pdx_map::MouseButton::Left,
                        winit::event::MouseButton::Right => pdx_map::MouseButton::Right,
                        winit::event::MouseButton::Middle => pdx_map::MouseButton::Middle,
                        _ => return, // Ignore other buttons
                    };

                    let pressed = state == ElementState::Pressed;
                    input.on_mouse_button(mouse_button, pressed);

                    // Transfer viewport if it changed
                    let bounds = input.viewport_bounds();
                    controller.set_viewport_bounds(bounds);
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                if let Some(input) = &mut self.input_controller {
                    let scroll_lines = match delta {
                        MouseScrollDelta::LineDelta(_, y) => y,
                        MouseScrollDelta::PixelDelta(pos) => pos.y as f32 / 120.0,
                    };

                    input.on_scroll(scroll_lines); // Clamps, converts to zoom, and applies internally

                    // Transfer viewport and update render state
                    let bounds = input.viewport_bounds();
                    controller.set_viewport_bounds(bounds);

                    // Render-specific: Update location borders based on zoom
                    let show_location_borders =
                        should_highlight_individual_locations(bounds.zoom_level);
                    controller
                        .renderer_mut()
                        .set_location_borders(show_location_borders);

                    window.request_redraw();
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {}
}

#[instrument(skip_all)]
fn init_renderer(
    window: &Window,
    gpu_ctx: GpuSurfaceContext,
    texture_data: &TextureData,
) -> (MapViewController, InteractionController) {
    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let west_texture = gpu_ctx.create_texture(&texture_data.west, tile_width, tile_height, "West");
    let east_texture = gpu_ctx.create_texture(&texture_data.east, tile_width, tile_height, "East");

    // Create surface pipeline
    let size = window.inner_size();
    let scale_factor = window.scale_factor();
    let logical_size = size.to_logical::<f64>(scale_factor);
    let logical = LogicalSize::new(
        logical_size.width.round() as u32,
        logical_size.height.round() as u32,
    );
    let physical = logical.to_physical(scale_factor as f32);

    let renderer = SurfaceMapRenderer::new(gpu_ctx, west_texture, east_texture, physical);
    let controller = MapViewController::new(renderer, logical, scale_factor as f32);

    // Create input controller with map dimensions
    let map_size = WorldSize::new(tile_width * 2, tile_height);
    let input_controller = InteractionController::new(logical, map_size);

    (controller, input_controller)
}

fn build_workspace(mut save: Eu5LoadedSave, game_data: GameData) -> Result<WorkspaceBundle> {
    let gamestate = save.take_gamestate();
    let gamestate = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(gamestate) };
    let mut workspace =
        Eu5Workspace::new(gamestate, game_data).context("Failed to initialize workspace")?;
    workspace.set_map_mode(MapMode::Political);

    Ok(WorkspaceBundle { save, workspace })
}

fn apply_workspace(
    controller: &mut MapViewController,
    input_controller: &mut InteractionController,
    workspace: &Eu5Workspace<'_>,
) {
    let save_date = workspace.gamestate().metadata().date.date_fmt().to_string();
    controller
        .renderer_mut()
        .add_layer(DateLayer::new(save_date, 4));
    controller
        .renderer_mut()
        .update_locations(workspace.location_arrays());

    if let Some((x, y)) = workspace.player_capital_coordinates() {
        let world = WorldPoint::new(x as f32, y as f32);
        input_controller.center_on(world);

        // Transfer viewport to render controller
        let bounds = input_controller.viewport_bounds();
        controller.set_viewport_bounds(bounds);
    }
}
