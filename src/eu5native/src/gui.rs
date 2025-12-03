use crate::Args;
use eu5app::{
    Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{TextureProvider, game_install::Eu5GameInstall},
    should_highlight_individual_locations,
};
use eu5save::{BasicTokenResolver, Eu5File};
use pdx_map::{CanvasDimensions, MapViewController, SurfaceMapRenderer};
use std::sync::Arc;
use tracing::{error, info};
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

    let start = std::time::Instant::now();
    let save = parser.parse()?;
    info!("Parsed save file in {}ms", start.elapsed().as_millis());

    info!("Using game data: {}", args.game_data.display());
    let game_bundle = Eu5GameInstall::open(&args.game_data)?;

    let mut map_app = Eu5Workspace::new(save, game_bundle)?;
    map_app.set_map_mode(MapMode::Political)?;

    let event_loop = EventLoop::new()?;
    event_loop.set_control_flow(ControlFlow::Poll);

    let mut app = App {
        args,
        workspace: map_app,
        window: None,
        controller: None,
        last_cursor_pos: None,
        last_world_under_cursor: None,
        is_dragging: false,
    };

    event_loop.run_app(&mut app)?;

    Ok(())
}

struct App {
    args: Args,
    workspace: Eu5Workspace,
    window: Option<Arc<Window>>,
    controller: Option<MapViewController<SurfaceMapRenderer>>,
    last_cursor_pos: Option<(f32, f32)>,
    last_world_under_cursor: Option<(f32, f32)>,
    is_dragging: bool,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }

        let window_attrs = WindowAttributes::default()
            .with_title("PDX.Tools")
            .with_inner_size(winit::dpi::PhysicalSize::new(
                self.args.width,
                self.args.height,
            ));

        let window = Arc::new(
            event_loop
                .create_window(window_attrs)
                .expect("Failed to create window"),
        );

        // Initialize GPU and renderer
        let controller = pollster::block_on(async {
            init_renderer(window.clone(), &self.workspace, &self.args.game_data).await
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
            WindowEvent::Resized(new_size) => {
                if new_size.width > 0 && new_size.height > 0 {
                    controller.resize(new_size.width, new_size.height);
                    window.request_redraw();
                }
            }
            WindowEvent::RedrawRequested => {
                controller.render();
                if let Err(e) = controller.present() {
                    error!("Render error: {e}");
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                let cursor_x = position.x as f32;
                let cursor_y = position.y as f32;
                let previous_world = self.last_world_under_cursor;

                if self.is_dragging
                    && let Some((world_x, world_y)) = previous_world
                {
                    controller.set_world_point_under_cursor(world_x, world_y, cursor_x, cursor_y);
                    window.request_redraw();
                }

                self.last_world_under_cursor = Some(controller.canvas_to_world(cursor_x, cursor_y));
                self.last_cursor_pos = Some((cursor_x, cursor_y));
            }
            WindowEvent::MouseInput { state, button, .. } => {
                if button == MouseButton::Left {
                    self.is_dragging = state == ElementState::Pressed;
                    if self.is_dragging {
                        let (cursor_x, cursor_y) = self.last_cursor_pos.unwrap_or_else(|| {
                            let size = window.inner_size();
                            let center = (size.width as f32 / 2.0, size.height as f32 / 2.0);
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
                        (size.width as f32 / 2.0, size.height as f32 / 2.0)
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

async fn init_renderer(
    window: Arc<Window>,
    workspace: &Eu5Workspace,
    game_data_path: &std::path::Path,
) -> Result<MapViewController<SurfaceMapRenderer>, Box<dyn std::error::Error>> {
    let start = std::time::Instant::now();

    // Create GPU surface context from window
    // Clone the Arc before converting (cheap since it's just incrementing ref count)
    let gpu_ctx = pdx_map::GpuSurfaceContext::new(window.clone().into()).await?;
    info!(
        "Initialized GPU and pipelines in {}ms",
        start.elapsed().as_millis()
    );

    // Re-open game bundle to load textures
    // (workspace doesn't expose game_data publicly)
    let game_bundle = Eu5GameInstall::open(game_data_path)?;

    // Load textures
    let texture_size = eu5app::texture_buffer_size();
    let mut texture_data = vec![0u8; texture_size];

    let start = std::time::Instant::now();
    game_bundle.load_west_texture(&mut texture_data)?;
    info!("Read west texture in {}ms", start.elapsed().as_millis());

    let (tile_width, tile_height) = eu5app::tile_dimensions();
    let start = std::time::Instant::now();
    let west_texture = gpu_ctx.create_texture(&texture_data, tile_width, tile_height, "West");
    info!(
        "Uploaded west texture view in {}ms",
        start.elapsed().as_millis()
    );

    let start = std::time::Instant::now();
    game_bundle.load_east_texture(&mut texture_data)?;
    info!("Read east texture in {}ms", start.elapsed().as_millis());

    let start = std::time::Instant::now();
    let east_texture = gpu_ctx.create_texture(&texture_data, tile_width, tile_height, "East");
    info!(
        "Uploaded east texture view in {}ms",
        start.elapsed().as_millis()
    );

    // Create surface pipeline
    let size = window.inner_size();
    let display = CanvasDimensions {
        canvas_width: size.width,
        canvas_height: size.height,
        scale_factor: window.scale_factor() as f32,
    };
    let surface_pipeline = gpu_ctx.as_ref().display_surface(display);

    // Create renderer
    let renderer = SurfaceMapRenderer::new(
        gpu_ctx,
        west_texture,
        east_texture,
        surface_pipeline,
        display,
    );

    let mut controller = MapViewController::new(renderer, display, tile_width, tile_height);

    if let Some((x, y)) = workspace.player_capital_coordinates() {
        controller.center_at_world(x as f32, y as f32);
    }

    // Upload location arrays
    controller
        .renderer_mut()
        .set_location_arrays(workspace.location_arrays().clone());

    info!("GUI initialization complete");

    Ok(controller)
}
