use crate::{Args, date_layer::DateLayer};
use anyhow::{Context, Result};
use eu5app::{
    Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace, MapMode,
    game_data::{GameData, game_install::Eu5GameInstall},
    should_highlight_individual_locations,
};
use eu5save::{BasicTokenResolver, Eu5File, models::Gamestate};
use pdx_map::{
    Clock, GpuSurfaceContext, InteractionController, KeyboardKey, LogicalPoint, LogicalSize,
    MapViewController, SurfaceMapRenderer, WorldPoint, default_clock,
};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tokio::runtime::Runtime;
use tracing::{error, info, instrument};
use winit::{
    application::ApplicationHandler,
    event::{ElementState, MouseScrollDelta, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop, EventLoopProxy},
    keyboard::{KeyCode, PhysicalKey},
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

fn map_keycode(code: KeyCode) -> KeyboardKey {
    match code {
        KeyCode::Backquote => KeyboardKey::Backquote,
        KeyCode::Backslash => KeyboardKey::Backslash,
        KeyCode::BracketLeft => KeyboardKey::BracketLeft,
        KeyCode::BracketRight => KeyboardKey::BracketRight,
        KeyCode::Comma => KeyboardKey::Comma,
        KeyCode::Digit0 => KeyboardKey::Digit0,
        KeyCode::Digit1 => KeyboardKey::Digit1,
        KeyCode::Digit2 => KeyboardKey::Digit2,
        KeyCode::Digit3 => KeyboardKey::Digit3,
        KeyCode::Digit4 => KeyboardKey::Digit4,
        KeyCode::Digit5 => KeyboardKey::Digit5,
        KeyCode::Digit6 => KeyboardKey::Digit6,
        KeyCode::Digit7 => KeyboardKey::Digit7,
        KeyCode::Digit8 => KeyboardKey::Digit8,
        KeyCode::Digit9 => KeyboardKey::Digit9,
        KeyCode::Equal => KeyboardKey::Equal,
        KeyCode::IntlBackslash => KeyboardKey::IntlBackslash,
        KeyCode::IntlRo => KeyboardKey::IntlRo,
        KeyCode::IntlYen => KeyboardKey::IntlYen,
        KeyCode::KeyA => KeyboardKey::KeyA,
        KeyCode::KeyB => KeyboardKey::KeyB,
        KeyCode::KeyC => KeyboardKey::KeyC,
        KeyCode::KeyD => KeyboardKey::KeyD,
        KeyCode::KeyE => KeyboardKey::KeyE,
        KeyCode::KeyF => KeyboardKey::KeyF,
        KeyCode::KeyG => KeyboardKey::KeyG,
        KeyCode::KeyH => KeyboardKey::KeyH,
        KeyCode::KeyI => KeyboardKey::KeyI,
        KeyCode::KeyJ => KeyboardKey::KeyJ,
        KeyCode::KeyK => KeyboardKey::KeyK,
        KeyCode::KeyL => KeyboardKey::KeyL,
        KeyCode::KeyM => KeyboardKey::KeyM,
        KeyCode::KeyN => KeyboardKey::KeyN,
        KeyCode::KeyO => KeyboardKey::KeyO,
        KeyCode::KeyP => KeyboardKey::KeyP,
        KeyCode::KeyQ => KeyboardKey::KeyQ,
        KeyCode::KeyR => KeyboardKey::KeyR,
        KeyCode::KeyS => KeyboardKey::KeyS,
        KeyCode::KeyT => KeyboardKey::KeyT,
        KeyCode::KeyU => KeyboardKey::KeyU,
        KeyCode::KeyV => KeyboardKey::KeyV,
        KeyCode::KeyW => KeyboardKey::KeyW,
        KeyCode::KeyX => KeyboardKey::KeyX,
        KeyCode::KeyY => KeyboardKey::KeyY,
        KeyCode::KeyZ => KeyboardKey::KeyZ,
        KeyCode::Minus => KeyboardKey::Minus,
        KeyCode::Period => KeyboardKey::Period,
        KeyCode::Quote => KeyboardKey::Quote,
        KeyCode::Semicolon => KeyboardKey::Semicolon,
        KeyCode::Slash => KeyboardKey::Slash,
        KeyCode::AltLeft => KeyboardKey::AltLeft,
        KeyCode::AltRight => KeyboardKey::AltRight,
        KeyCode::Backspace => KeyboardKey::Backspace,
        KeyCode::CapsLock => KeyboardKey::CapsLock,
        KeyCode::ContextMenu => KeyboardKey::ContextMenu,
        KeyCode::ControlLeft => KeyboardKey::ControlLeft,
        KeyCode::ControlRight => KeyboardKey::ControlRight,
        KeyCode::Enter => KeyboardKey::Enter,
        KeyCode::SuperLeft => KeyboardKey::SuperLeft,
        KeyCode::SuperRight => KeyboardKey::SuperRight,
        KeyCode::ShiftLeft => KeyboardKey::ShiftLeft,
        KeyCode::ShiftRight => KeyboardKey::ShiftRight,
        KeyCode::Space => KeyboardKey::Space,
        KeyCode::Tab => KeyboardKey::Tab,
        KeyCode::Convert => KeyboardKey::Convert,
        KeyCode::KanaMode => KeyboardKey::KanaMode,
        KeyCode::Lang1 => KeyboardKey::Lang1,
        KeyCode::Lang2 => KeyboardKey::Lang2,
        KeyCode::Lang3 => KeyboardKey::Lang3,
        KeyCode::Lang4 => KeyboardKey::Lang4,
        KeyCode::Lang5 => KeyboardKey::Lang5,
        KeyCode::NonConvert => KeyboardKey::NonConvert,
        KeyCode::Delete => KeyboardKey::Delete,
        KeyCode::End => KeyboardKey::End,
        KeyCode::Help => KeyboardKey::Help,
        KeyCode::Home => KeyboardKey::Home,
        KeyCode::Insert => KeyboardKey::Insert,
        KeyCode::PageDown => KeyboardKey::PageDown,
        KeyCode::PageUp => KeyboardKey::PageUp,
        KeyCode::ArrowDown => KeyboardKey::ArrowDown,
        KeyCode::ArrowLeft => KeyboardKey::ArrowLeft,
        KeyCode::ArrowRight => KeyboardKey::ArrowRight,
        KeyCode::ArrowUp => KeyboardKey::ArrowUp,
        KeyCode::NumLock => KeyboardKey::NumLock,
        KeyCode::Numpad0 => KeyboardKey::Numpad0,
        KeyCode::Numpad1 => KeyboardKey::Numpad1,
        KeyCode::Numpad2 => KeyboardKey::Numpad2,
        KeyCode::Numpad3 => KeyboardKey::Numpad3,
        KeyCode::Numpad4 => KeyboardKey::Numpad4,
        KeyCode::Numpad5 => KeyboardKey::Numpad5,
        KeyCode::Numpad6 => KeyboardKey::Numpad6,
        KeyCode::Numpad7 => KeyboardKey::Numpad7,
        KeyCode::Numpad8 => KeyboardKey::Numpad8,
        KeyCode::Numpad9 => KeyboardKey::Numpad9,
        KeyCode::NumpadAdd => KeyboardKey::NumpadAdd,
        KeyCode::NumpadBackspace => KeyboardKey::NumpadBackspace,
        KeyCode::NumpadClear => KeyboardKey::NumpadClear,
        KeyCode::NumpadClearEntry => KeyboardKey::NumpadClearEntry,
        KeyCode::NumpadComma => KeyboardKey::NumpadComma,
        KeyCode::NumpadDecimal => KeyboardKey::NumpadDecimal,
        KeyCode::NumpadDivide => KeyboardKey::NumpadDivide,
        KeyCode::NumpadEnter => KeyboardKey::NumpadEnter,
        KeyCode::NumpadEqual => KeyboardKey::NumpadEqual,
        KeyCode::NumpadHash => KeyboardKey::NumpadHash,
        KeyCode::NumpadMemoryAdd => KeyboardKey::NumpadMemoryAdd,
        KeyCode::NumpadMemoryClear => KeyboardKey::NumpadMemoryClear,
        KeyCode::NumpadMemoryRecall => KeyboardKey::NumpadMemoryRecall,
        KeyCode::NumpadMemoryStore => KeyboardKey::NumpadMemoryStore,
        KeyCode::NumpadMemorySubtract => KeyboardKey::NumpadMemorySubtract,
        KeyCode::NumpadMultiply => KeyboardKey::NumpadMultiply,
        KeyCode::NumpadParenLeft => KeyboardKey::NumpadParenLeft,
        KeyCode::NumpadParenRight => KeyboardKey::NumpadParenRight,
        KeyCode::NumpadStar => KeyboardKey::NumpadStar,
        KeyCode::NumpadSubtract => KeyboardKey::NumpadSubtract,
        KeyCode::Escape => KeyboardKey::Escape,
        KeyCode::Fn => KeyboardKey::Fn,
        KeyCode::FnLock => KeyboardKey::FnLock,
        KeyCode::PrintScreen => KeyboardKey::PrintScreen,
        KeyCode::ScrollLock => KeyboardKey::ScrollLock,
        KeyCode::Pause => KeyboardKey::Pause,
        KeyCode::BrowserBack => KeyboardKey::BrowserBack,
        KeyCode::BrowserFavorites => KeyboardKey::BrowserFavorites,
        KeyCode::BrowserForward => KeyboardKey::BrowserForward,
        KeyCode::BrowserHome => KeyboardKey::BrowserHome,
        KeyCode::BrowserRefresh => KeyboardKey::BrowserRefresh,
        KeyCode::BrowserSearch => KeyboardKey::BrowserSearch,
        KeyCode::BrowserStop => KeyboardKey::BrowserStop,
        KeyCode::Eject => KeyboardKey::Eject,
        KeyCode::LaunchApp1 => KeyboardKey::LaunchApp1,
        KeyCode::LaunchApp2 => KeyboardKey::LaunchApp2,
        KeyCode::LaunchMail => KeyboardKey::LaunchMail,
        KeyCode::MediaPlayPause => KeyboardKey::MediaPlayPause,
        KeyCode::MediaSelect => KeyboardKey::MediaSelect,
        KeyCode::MediaStop => KeyboardKey::MediaStop,
        KeyCode::MediaTrackNext => KeyboardKey::MediaTrackNext,
        KeyCode::MediaTrackPrevious => KeyboardKey::MediaTrackPrevious,
        KeyCode::Power => KeyboardKey::Power,
        KeyCode::Sleep => KeyboardKey::Sleep,
        KeyCode::AudioVolumeDown => KeyboardKey::AudioVolumeDown,
        KeyCode::AudioVolumeMute => KeyboardKey::AudioVolumeMute,
        KeyCode::AudioVolumeUp => KeyboardKey::AudioVolumeUp,
        KeyCode::WakeUp => KeyboardKey::WakeUp,
        KeyCode::Meta => KeyboardKey::Meta,
        KeyCode::Hyper => KeyboardKey::Hyper,
        KeyCode::Turbo => KeyboardKey::Turbo,
        KeyCode::Abort => KeyboardKey::Abort,
        KeyCode::Resume => KeyboardKey::Resume,
        KeyCode::Suspend => KeyboardKey::Suspend,
        KeyCode::Again => KeyboardKey::Again,
        KeyCode::Copy => KeyboardKey::Copy,
        KeyCode::Cut => KeyboardKey::Cut,
        KeyCode::Find => KeyboardKey::Find,
        KeyCode::Open => KeyboardKey::Open,
        KeyCode::Paste => KeyboardKey::Paste,
        KeyCode::Props => KeyboardKey::Props,
        KeyCode::Select => KeyboardKey::Select,
        KeyCode::Undo => KeyboardKey::Undo,
        KeyCode::Hiragana => KeyboardKey::Hiragana,
        KeyCode::Katakana => KeyboardKey::Katakana,
        KeyCode::F1 => KeyboardKey::F1,
        KeyCode::F2 => KeyboardKey::F2,
        KeyCode::F3 => KeyboardKey::F3,
        KeyCode::F4 => KeyboardKey::F4,
        KeyCode::F5 => KeyboardKey::F5,
        KeyCode::F6 => KeyboardKey::F6,
        KeyCode::F7 => KeyboardKey::F7,
        KeyCode::F8 => KeyboardKey::F8,
        KeyCode::F9 => KeyboardKey::F9,
        KeyCode::F10 => KeyboardKey::F10,
        KeyCode::F11 => KeyboardKey::F11,
        KeyCode::F12 => KeyboardKey::F12,
        KeyCode::F13 => KeyboardKey::F13,
        KeyCode::F14 => KeyboardKey::F14,
        KeyCode::F15 => KeyboardKey::F15,
        KeyCode::F16 => KeyboardKey::F16,
        KeyCode::F17 => KeyboardKey::F17,
        KeyCode::F18 => KeyboardKey::F18,
        KeyCode::F19 => KeyboardKey::F19,
        KeyCode::F20 => KeyboardKey::F20,
        KeyCode::F21 => KeyboardKey::F21,
        KeyCode::F22 => KeyboardKey::F22,
        KeyCode::F23 => KeyboardKey::F23,
        KeyCode::F24 => KeyboardKey::F24,
        KeyCode::F25 => KeyboardKey::F25,
        KeyCode::F26 => KeyboardKey::F26,
        KeyCode::F27 => KeyboardKey::F27,
        KeyCode::F28 => KeyboardKey::F28,
        KeyCode::F29 => KeyboardKey::F29,
        KeyCode::F30 => KeyboardKey::F30,
        KeyCode::F31 => KeyboardKey::F31,
        KeyCode::F32 => KeyboardKey::F32,
        KeyCode::F33 => KeyboardKey::F33,
        KeyCode::F34 => KeyboardKey::F34,
        KeyCode::F35 => KeyboardKey::F35,
        _ => KeyboardKey::Unidentified,
    }
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
        clock: default_clock(),
        last_tick: None,
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
    let game_bundle = Eu5GameInstall::open(&game_data)
        .with_context(|| format!("Failed to load game data {}", game_data.display()))?;

    let world = game_bundle.world();
    let texture_data = TextureData { world };
    Ok((texture_data, game_bundle.into_game_data()))
}

struct TextureData {
    world: Arc<pdx_map::World<pdx_map::R16>>,
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
    clock: Box<dyn Clock>,
    last_tick: Option<Duration>,
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

        let Some(texture_data) = &self.texture_data else {
            return;
        };

        apply_workspace(
            controller,
            input_controller,
            &bundle.workspace,
            &texture_data.world,
        );
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
            .block_on(pdx_map::GpuSurfaceContext::new(Arc::clone(&window)))
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
                controller.resize(logical_size.to_physical(scale_factor as f32));
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
                    controller.resize(logical_size.to_physical(scale as f32));
                    window.request_redraw();
                }
            }
            WindowEvent::RedrawRequested => {
                if let Some(input) = &mut self.input_controller {
                    let now = self.clock.now();
                    let last_tick = self.last_tick.unwrap_or(now);
                    let delta = now.saturating_sub(last_tick);
                    self.last_tick = Some(now);

                    input.tick(delta);
                    let bounds = input.viewport_bounds();
                    controller.set_viewport_bounds(bounds);
                }

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
            WindowEvent::KeyboardInput { event, .. } => {
                if let Some(input) = &mut self.input_controller
                    && let PhysicalKey::Code(code) = event.physical_key
                {
                    let key = map_keycode(code);
                    let pressed = event.state == ElementState::Pressed;
                    if pressed {
                        input.on_key_down(key);
                    } else {
                        input.on_key_up(key);
                    }

                    if input.keyboard_active() {
                        window.request_redraw();
                    }
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

    fn about_to_wait(&mut self, _event_loop: &ActiveEventLoop) {
        if let (Some(window), Some(input)) = (self.window.as_ref(), self.input_controller.as_ref())
            && input.keyboard_active()
        {
            window.request_redraw();
        }
    }
}

#[instrument(skip_all)]
fn init_renderer(
    window: &Window,
    gpu_ctx: GpuSurfaceContext,
    texture_data: &TextureData,
) -> (MapViewController, InteractionController) {
    let hemisphere = eu5app::hemisphere_size();
    let texture_size = hemisphere.physical();

    let west_texture =
        gpu_ctx.create_texture(texture_data.world.west().as_slice(), texture_size, "West");
    let east_texture =
        gpu_ctx.create_texture(texture_data.world.east().as_slice(), texture_size, "East");

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
    let controller = MapViewController::new(renderer);

    // Create input controller with map dimensions
    let input_controller = InteractionController::new(logical, hemisphere.world());

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
    world: &pdx_map::World<pdx_map::R16>,
) {
    let save_date = workspace.gamestate().metadata().date.date_fmt().to_string();
    controller
        .renderer_mut()
        .add_layer(DateLayer::new(save_date, 4));
    controller
        .renderer_mut()
        .update_locations(workspace.location_arrays());

    if let Some(color_id) = workspace.player_capital_color_id() {
        let center = world.center_of(pdx_map::R16::new(color_id.value()));
        let center_world = WorldPoint::new(center.x as f32, center.y as f32);
        input_controller.center_on(center_world);

        // Transfer viewport to render controller
        let bounds = input_controller.viewport_bounds();
        controller.set_viewport_bounds(bounds);
    }
}
