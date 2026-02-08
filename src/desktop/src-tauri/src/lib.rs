mod commands;

use commands::{AppState, InputEvent, RenderPayload};
use eu5save::BasicTokenResolver;
use pdx_map::{
    GpuSurfaceContext, InteractionController, KeyboardKey, LocationArrays, LogicalPoint, LogicalSize,
    MapViewController, MouseButton, PhysicalSize as MapPhysicalSize, SurfaceMapRenderer, WorldPoint,
};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

#[derive(Default)]
struct RendererRuntimeState {
    controller: Option<MapViewController>,
    interaction_controller: Option<InteractionController>,
    last_interaction_tick: Option<Instant>,
}

impl RendererRuntimeState {
    fn apply_render_payload(
        &mut self,
        window: tauri::WebviewWindow,
        payload: RenderPayload,
    ) -> Result<(), String> {
        let gpu = tauri::async_runtime::block_on(GpuSurfaceContext::new(window.clone()))
            .map_err(|err| format!("Failed to create GPU surface context: {err}"))?;

        let hemisphere_size = eu5app::hemisphere_size().physical();
        let west_texture =
            gpu.create_texture(&payload.west_texture, hemisphere_size, "West Texture Input");
        let east_texture =
            gpu.create_texture(&payload.east_texture, hemisphere_size, "East Texture Input");

        let inner_size = window
            .inner_size()
            .map_err(|err| format!("Failed to read window size: {err}"))?;

        let scale_factor = window
            .scale_factor()
            .map_err(|err| format!("Failed to read window scale factor: {err}"))?;

        let physical_size = map_physical_size(inner_size);
        let logical_size = logical_size_from_physical(inner_size, scale_factor);

        let renderer = SurfaceMapRenderer::new(gpu, west_texture, east_texture, physical_size);
        let mut controller = MapViewController::new(renderer, logical_size, scale_factor as f32);
        let location_arrays = LocationArrays::from_data(payload.location_arrays);
        controller.renderer_mut().update_locations(&location_arrays);
        let mut interaction_controller =
            InteractionController::new(logical_size, eu5app::hemisphere_size().world());

        if let Some((x, y)) = payload.player_capital_world {
            interaction_controller.center_on(WorldPoint::new(x, y));
        }

        controller.set_viewport_bounds(interaction_controller.viewport_bounds());

        self.interaction_controller = Some(interaction_controller);
        self.last_interaction_tick = Some(Instant::now());
        self.controller = Some(controller);
        Ok(())
    }

    fn resize(&mut self, size: tauri::PhysicalSize<u32>, scale_factor: f64) {
        let Some(controller) = &mut self.controller else {
            return;
        };

        let logical_size = logical_size_from_physical(size, scale_factor);
        if let Some(interaction_controller) = &mut self.interaction_controller {
            interaction_controller.on_resize(logical_size);
            controller.set_viewport_bounds(interaction_controller.viewport_bounds());
        }
        controller.resize(logical_size);
    }

    fn apply_input_events(&mut self, events: Vec<InputEvent>) {
        if events.is_empty() {
            return;
        }

        let Some(controller) = &mut self.controller else {
            return;
        };
        let Some(interaction_controller) = &mut self.interaction_controller else {
            return;
        };

        for event in events {
            match event {
                InputEvent::CursorMoved { x, y } => {
                    interaction_controller.on_cursor_move(LogicalPoint::new(x, y));
                }
                InputEvent::MouseButton { button, pressed } => {
                    if let Some(button) = map_mouse_button(button) {
                        interaction_controller.on_mouse_button(button, pressed);
                    }
                }
                InputEvent::MouseWheel { lines } => {
                    interaction_controller.on_scroll(lines);
                }
                InputEvent::Key { code, pressed } => {
                    let key = KeyboardKey::from_web_code(&code);
                    if pressed {
                        interaction_controller.on_key_down(key);
                    } else {
                        interaction_controller.on_key_up(key);
                    }
                }
            }
        }

        controller.set_viewport_bounds(interaction_controller.viewport_bounds());
    }

    fn tick_interaction(&mut self) {
        let Some(controller) = &mut self.controller else {
            return;
        };
        let Some(interaction_controller) = &mut self.interaction_controller else {
            return;
        };

        let now = Instant::now();
        let last_tick = self.last_interaction_tick.unwrap_or(now);
        let delta = now.saturating_duration_since(last_tick);
        self.last_interaction_tick = Some(now);

        interaction_controller.tick(delta);
        controller.set_viewport_bounds(interaction_controller.viewport_bounds());
    }

    fn render(&mut self) {
        let Some(controller) = &mut self.controller else {
            return;
        };

        if let Err(err) = controller.render() {
            log::error!("Render failed: {err}");
        }
    }
}

fn map_mouse_button(button: u8) -> Option<MouseButton> {
    match button {
        0 => Some(MouseButton::Left),
        1 => Some(MouseButton::Middle),
        2 => Some(MouseButton::Right),
        _ => None,
    }
}

fn logical_size_from_physical(
    size: tauri::PhysicalSize<u32>,
    scale_factor: f64,
) -> LogicalSize<u32> {
    let width = ((size.width as f64) / scale_factor).round() as u32;
    let height = ((size.height as f64) / scale_factor).round() as u32;
    LogicalSize::new(width, height)
}

fn map_physical_size(size: tauri::PhysicalSize<u32>) -> MapPhysicalSize<u32> {
    MapPhysicalSize::new(size.width, size.height)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let token_data = include_bytes!("../../../../assets/tokens/eu5.txt");
    let token_resolver = BasicTokenResolver::from_text_lines(token_data.as_slice())
        .expect("Failed to load EU5 token resolver");

    let app_state = AppState {
        token_resolver: Arc::new(token_resolver),
        pending_render: Arc::new(Mutex::new(None)),
        pending_input_events: Arc::new(Mutex::new(Vec::new())),
    };

    let tauri_app = tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_default_save_directory,
            commands::detect_eu5_game_path,
            commands::scan_save_directory,
            commands::load_save_for_renderer,
            commands::interaction_cursor_moved,
            commands::interaction_mouse_button,
            commands::interaction_mouse_wheel,
            commands::interaction_key,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let app_handle_for_timer = tauri_app.handle().clone();
    std::thread::spawn(move || {
        let frame_duration = Duration::from_secs_f64(1.0 / 60.0);
        loop {
            std::thread::sleep(frame_duration);
            let _ = app_handle_for_timer.run_on_main_thread(|| {});
        }
    });

    let mut renderer_state = RendererRuntimeState::default();
    let target_frame_duration = Duration::from_secs_f64(1.0 / 60.0);
    let mut last_frame = Instant::now();

    tauri_app.run(move |app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Resized(size),
            ..
        } => {
            if label != "main" {
                return;
            }

            let Some(window) = app_handle.get_webview_window("main") else {
                return;
            };

            let Ok(scale_factor) = window.scale_factor() else {
                return;
            };

            renderer_state.resize(size, scale_factor);
        }
        RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } => {
            if label == "main" {
                renderer_state.controller = None;
                renderer_state.interaction_controller = None;
                renderer_state.last_interaction_tick = None;
            }
        }
        RunEvent::MainEventsCleared => {
            let elapsed = last_frame.elapsed();
            if elapsed < target_frame_duration {
                return;
            }
            last_frame = Instant::now();

            if let Some(window) = app_handle.get_webview_window("main") {
                let state = app_handle.state::<AppState>();
                if let Some(payload) = state.take_pending_render()
                    && let Err(err) = renderer_state.apply_render_payload(window, payload)
                {
                    log::error!("Failed to apply render payload: {err}");
                }
                let input_events = state.take_input_events();
                renderer_state.apply_input_events(input_events);
                renderer_state.tick_interaction();
            }

            renderer_state.render();
        }
        _ => {}
    });
}
