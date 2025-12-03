use crate::{Args, date_layer::DateLayer};
use eu5app::{
    Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
    should_highlight_individual_locations,
};
use eu5save::{BasicTokenResolver, Eu5File, models::Gamestate};
use pdx_map::{CanvasDimensions, MapViewController, SurfaceMapRenderer, WorldCoordinates};
use std::sync::Arc;
use tracing::{error, info, instrument};
use winit::{
    application::ApplicationHandler,
    event::{ElementState, MouseButton, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    window::{Window, WindowAttributes, WindowId},
};

pub fn run_gui(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    info!("Using save file: {}", args.save_file.display());
    let file = std::fs::File::open(&args.save_file)?;
    let file = Eu5File::from_file(file)?;

    info!("Using tokens file: {}", args.tokens.display());
    let file_data = std::fs::read(&args.tokens)?;
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;

    let parser = Eu5SaveLoader::open(file, resolver)?;

    let mut save = parser.parse()?;

    let mut game_bundle = Eu5GameInstall::open(&args.game_data)?;

    // Extract textures before workspace consumes the bundle
    let west_texture = game_bundle.load_west_texture(Vec::new())?;
    let east_texture = game_bundle.load_east_texture(Vec::new())?;

    let texture_data = TextureData {
        west: west_texture,
        east: east_texture,
    };

    // Now create workspace (game_bundle is moved, textures already extracted)
    let gamestate = save.take_gamestate();
    let gamestate = unsafe { std::mem::transmute::<_, Gamestate<'static>>(gamestate) };
    let mut map_app = Eu5Workspace::new(gamestate, game_bundle.into_game_data())?;
    map_app.set_map_mode(MapMode::Political);

    let event_loop = EventLoop::new()?;
    event_loop.set_control_flow(ControlFlow::Poll);

    let mut app = App {
        args,
        save,
        workspace: map_app,
        texture_data,
        window: None,
        controller: None,
        last_cursor_pos: None,
        last_world_under_cursor: None,
        is_dragging: false,
        scale_factor: 1.0,
    };

    event_loop.run_app(&mut app)?;

    Ok(())
}

/// Pre-extracted texture data to avoid re-opening game bundle
struct TextureData {
    west: Vec<u8>,
    east: Vec<u8>,
}

struct App {
    args: Args,
    save: Eu5LoadedSave,
    workspace: Eu5Workspace<'static>,
    texture_data: TextureData,
    window: Option<Arc<Window>>,
    controller: Option<MapViewController>,
    last_cursor_pos: Option<(f32, f32)>,
    last_world_under_cursor: Option<WorldCoordinates>,
    is_dragging: bool,
    scale_factor: f64,
}

impl ApplicationHandler for App {
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

        // Initialize GPU and renderer
        let controller = pollster::block_on(async {
            init_renderer(&window, &self.workspace, &self.texture_data).await
        })
        .expect("Failed to initialize GPU");

        // Request initial render
        window.request_redraw();

        self.window = Some(window);
        self.controller = Some(controller);
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        let Some(window) = &self.window else {
            return;
        };

        let Some(controller) = &mut self.controller else {
            return;
        };

        match event {
            WindowEvent::CloseRequested => {
                self.controller = None;
                event_loop.exit();
            }
            WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
                self.scale_factor = scale_factor;
                let size = window.inner_size();
                let logical = size.to_logical::<f64>(scale_factor);
                controller.resize(logical.width.round() as u32, logical.height.round() as u32);
                window.request_redraw();
            }
            WindowEvent::Resized(new_size) => {
                if new_size.width > 0 && new_size.height > 0 {
                    let scale = self.scale_factor;
                    let logical = new_size.to_logical::<f64>(scale);
                    controller.resize(logical.width.round() as u32, logical.height.round() as u32);
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
                let cursor_x = (position.x as f32) / scale;
                let cursor_y = (position.y as f32) / scale;
                let previous_world = self.last_world_under_cursor;

                if self.is_dragging
                    && let Some(world_coords) = previous_world
                {
                    controller.set_world_point_under_cursor(
                        world_coords.x,
                        world_coords.y,
                        cursor_x,
                        cursor_y,
                    );
                    window.request_redraw();
                }

                // Only update world-under-cursor when not dragging
                if !self.is_dragging {
                    self.last_world_under_cursor =
                        Some(controller.canvas_to_world(cursor_x, cursor_y));
                }
                self.last_cursor_pos = Some((cursor_x, cursor_y));
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if button == MouseButton::Left {
                    self.is_dragging = state == ElementState::Pressed;
                    if self.is_dragging {
                        let (cursor_x, cursor_y) = self.last_cursor_pos.unwrap_or_else(|| {
                            let size = window.inner_size();
                            let logical = size.to_logical::<f64>(self.scale_factor);
                            let center = (logical.width as f32 / 2.0, logical.height as f32 / 2.0);
                            self.last_cursor_pos = Some(center);
                            center
                        });

                        self.last_world_under_cursor =
                            Some(controller.canvas_to_world(cursor_x, cursor_y));
                    } else {
                        self.last_world_under_cursor = None;
                    }
                }
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let scroll_lines = match delta {
                    MouseScrollDelta::LineDelta(_, y) => y,
                    MouseScrollDelta::PixelDelta(pos) => pos.y as f32 / 120.0,
                };

                if scroll_lines.abs() > f32::EPSILON {
                    let clamped = scroll_lines.clamp(-6.0, 6.0);
                    let zoom_delta = 1.1_f32.powf(clamped);

                    let (cursor_x, cursor_y) = self.last_cursor_pos.unwrap_or_else(|| {
                        let size = window.inner_size();
                        let logical = size.to_logical::<f64>(self.scale_factor);
                        (logical.width as f32 / 2.0, logical.height as f32 / 2.0)
                    });

                    controller.zoom_at_point(cursor_x, cursor_y, zoom_delta);
                    let show_location_borders =
                        should_highlight_individual_locations(controller.get_zoom());
                    controller
                        .renderer_mut()
                        .set_location_borders(show_location_borders);

                    self.last_world_under_cursor =
                        Some(controller.canvas_to_world(cursor_x, cursor_y));
                    window.request_redraw();
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {}
}

#[instrument(skip_all)]
async fn init_renderer(
    window: &Arc<Window>,
    workspace: &Eu5Workspace<'_>,
    texture_data: &TextureData,
) -> Result<MapViewController, Box<dyn std::error::Error>> {
    let gpu_ctx = pdx_map::GpuSurfaceContext::new(window.clone()).await?;

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let west_texture = gpu_ctx.create_texture(&texture_data.west, tile_width, tile_height, "West");
    let east_texture = gpu_ctx.create_texture(&texture_data.east, tile_width, tile_height, "East");

    // Create surface pipeline
    let size = window.inner_size();
    let scale_factor = window.scale_factor();
    let logical_size = size.to_logical::<f64>(scale_factor);
    let display = CanvasDimensions {
        canvas_width: logical_size.width.round() as u32,
        canvas_height: logical_size.height.round() as u32,
        scale_factor: scale_factor as f32,
    };

    // Create renderer
    let mut renderer = SurfaceMapRenderer::new(gpu_ctx, west_texture, east_texture, display);

    let save_date = workspace.gamestate().metadata().date.date_fmt().to_string();
    renderer.add_layer(DateLayer::new(save_date, 4));

    let mut controller = MapViewController::new(renderer, tile_width, tile_height);

    if let Some((x, y)) = workspace.player_capital_coordinates() {
        controller.center_at_world(x as f32, y as f32);
    }

    // Upload location arrays
    controller
        .renderer_mut()
        .update_locations(workspace.location_arrays());

    Ok(controller)
}
