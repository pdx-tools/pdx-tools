mod commands;

use commands::{AppState, InteractionSnapshot, RenderPayload};
use eu5save::BasicTokenResolver;
use pdx_map::{
    GpuSurfaceContext, InteractionController, KeyboardKey, LogicalPoint, LogicalSize,
    MapViewController, MouseButton, PhysicalSize as MapPhysicalSize, SurfaceMapRenderer,
    WorldPoint,
};
use std::collections::HashSet;
use std::sync::Once;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};
use tracing::level_filters::LevelFilter;
use tracing_subscriber::{EnvFilter, fmt, fmt::format::FmtSpan, prelude::*};

#[derive(Default)]
struct AppliedInputState {
    last_cursor: Option<(f32, f32)>,
    mouse_buttons: [bool; 3],
    pressed_keys: HashSet<String>,
}

#[derive(Default)]
struct RendererRuntimeState {
    controller: Option<MapViewController>,
    interaction_controller: Option<InteractionController>,
    last_interaction_tick: Option<Instant>,
    last_physical_size: Option<tauri::PhysicalSize<u32>>,
    last_scale_factor: Option<f64>,
    applied_input_state: AppliedInputState,
}

impl RendererRuntimeState {
    fn sync_window_metrics(&mut self, window: &tauri::WebviewWindow) {
        let Ok(size) = window.inner_size() else {
            return;
        };
        let Ok(scale_factor) = window.scale_factor() else {
            return;
        };

        if self.last_physical_size != Some(size) || self.last_scale_factor != Some(scale_factor) {
            self.resize(size, scale_factor);
        }
    }

    fn apply_render_payload(
        &mut self,
        window: tauri::WebviewWindow,
        payload: RenderPayload,
    ) -> Result<(), String> {
        // Drop old controller first to release the GPU surface
        // This prevents "Native window is in use" errors when reloading
        self.controller = None;

        let gpu = tauri::async_runtime::block_on(GpuSurfaceContext::new(window.clone()))
            .map_err(|err| format!("Failed to create GPU surface context: {err}"))?;

        let hemisphere_size = payload.world.west().size().physical();
        let west_texture = gpu.create_texture(
            payload.world.west().as_slice(),
            hemisphere_size,
            "West Texture Input",
        );
        let east_texture = gpu.create_texture(
            payload.world.east().as_slice(),
            hemisphere_size,
            "East Texture Input",
        );

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
        controller
            .renderer_mut()
            .update_locations(payload.workspace.location_arrays());
        let mut interaction_controller =
            InteractionController::new(logical_size, eu5app::hemisphere_size().world());

        if let Some((x, y)) = payload.player_capital_world {
            interaction_controller.center_on(WorldPoint::new(x, y));
        }

        controller.set_viewport_bounds(interaction_controller.viewport_bounds());

        self.interaction_controller = Some(interaction_controller);
        self.last_interaction_tick = Some(Instant::now());
        self.last_physical_size = Some(inner_size);
        self.last_scale_factor = Some(scale_factor);
        self.applied_input_state = AppliedInputState::default();
        self.controller = Some(controller);
        Ok(())
    }

    fn resize(&mut self, size: tauri::PhysicalSize<u32>, scale_factor: f64) {
        self.last_physical_size = Some(size);
        self.last_scale_factor = Some(scale_factor);

        if size.width == 0 || size.height == 0 {
            return;
        }

        let Some(controller) = &mut self.controller else {
            return;
        };

        let logical_size = logical_size_from_physical(size, scale_factor);
        if let Some(interaction_controller) = &mut self.interaction_controller {
            interaction_controller.on_resize(logical_size);
            controller.set_viewport_bounds(interaction_controller.viewport_bounds());
        }
        controller.resize_with_scale_factor(logical_size, scale_factor as f32);
    }

    fn apply_input_snapshot(&mut self, snapshot: InteractionSnapshot) {
        let Some(controller) = &mut self.controller else {
            return;
        };
        let Some(interaction_controller) = &mut self.interaction_controller else {
            return;
        };

        if let Some((x, y)) = snapshot.cursor
            && self.applied_input_state.last_cursor != Some((x, y))
        {
            interaction_controller.on_cursor_move(LogicalPoint::new(x, y));
            self.applied_input_state.last_cursor = Some((x, y));
        }

        for (index, &pressed) in snapshot.mouse_buttons.iter().enumerate() {
            if self.applied_input_state.mouse_buttons[index] == pressed {
                continue;
            }

            if let Some(button) = map_mouse_button(index as u8) {
                interaction_controller.on_mouse_button(button, pressed);
            }

            self.applied_input_state.mouse_buttons[index] = pressed;
        }

        if snapshot.wheel_lines.abs() > f32::EPSILON {
            interaction_controller.on_scroll(snapshot.wheel_lines);
        }

        let keys_to_release: Vec<_> = self
            .applied_input_state
            .pressed_keys
            .difference(&snapshot.pressed_keys)
            .cloned()
            .collect();
        for code in keys_to_release {
            interaction_controller.on_key_up(KeyboardKey::from_web_code(&code));
        }

        let keys_to_press: Vec<_> = snapshot
            .pressed_keys
            .difference(&self.applied_input_state.pressed_keys)
            .cloned()
            .collect();
        for code in keys_to_press {
            interaction_controller.on_key_down(KeyboardKey::from_web_code(&code));
        }

        self.applied_input_state.pressed_keys = snapshot.pressed_keys;
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
        let render_result = match self.controller.as_mut() {
            Some(controller) => controller.render(),
            None => return,
        };

        if let Err(err) = render_result {
            if err.is_surface_reconfigurable() {
                match (self.last_physical_size, self.last_scale_factor) {
                    (Some(size), Some(scale_factor)) if size.width > 0 && size.height > 0 => {
                        log::warn!(
                            "Recoverable surface error during render ({err}); reconfiguring surface"
                        );
                        self.resize(size, scale_factor);
                    }
                    _ => {
                        log::warn!(
                            "Recoverable surface error during render ({err}), but no valid size is available for reconfigure"
                        );
                    }
                }
                return;
            }
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

fn init_tracing() {
    static INIT: Once = Once::new();

    INIT.call_once(|| {
        let env_filter = EnvFilter::builder()
            .with_default_directive(LevelFilter::INFO.into())
            .from_env_lossy();

        let subscriber = tracing_subscriber::registry().with(env_filter).with(
            fmt::layer()
                .with_target(true)
                .with_span_events(FmtSpan::CLOSE),
        );

        if let Err(err) = tracing::subscriber::set_global_default(subscriber) {
            eprintln!("failed to initialize tracing subscriber: {err}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    let token_data = include_bytes!("../../../../assets/tokens/eu5.txt");
    let token_resolver = BasicTokenResolver::from_text_lines(token_data.as_slice())
        .expect("Failed to load EU5 token resolver");

    let app_state = AppState::new(token_resolver);

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

            // Render immediately during resize to avoid flicker on Windows.
            // Windows enters a modal resize loop during drag that blocks
            // MainEventsCleared from firing, so we must render here.
            renderer_state.render();
            last_frame = Instant::now();
        }
        RunEvent::WindowEvent {
            label,
            event:
                tauri::WindowEvent::ScaleFactorChanged {
                    scale_factor,
                    new_inner_size,
                    ..
                },
            ..
        } => {
            if label != "main" {
                return;
            }

            renderer_state.resize(new_inner_size, scale_factor);
            renderer_state.render();
            last_frame = Instant::now();
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
                renderer_state.last_physical_size = None;
                renderer_state.last_scale_factor = None;
            }
        }
        RunEvent::MainEventsCleared => {
            let elapsed = last_frame.elapsed();
            if elapsed < target_frame_duration {
                return;
            }
            last_frame = Instant::now();

            if let Some(window) = app_handle.get_webview_window("main") {
                renderer_state.sync_window_metrics(&window);
                let state = app_handle.state::<AppState>();
                if let Some(payload) = state.take_pending_render()
                    && let Err(err) = renderer_state.apply_render_payload(window, payload)
                {
                    log::error!("Failed to apply render payload: {err}");
                }
                renderer_state.apply_input_snapshot(state.take_interaction_snapshot());
                renderer_state.tick_interaction();
            }

            renderer_state.render();
        }
        _ => {}
    });
}
