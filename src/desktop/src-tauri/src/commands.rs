use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::State;

use eu5app::{Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace, game_data::game_install::Eu5GameInstall};
use eu5save::{BasicTokenResolver, Eu5File, models::Gamestate};
use jomini::common::PdsDate;
use pdx_assets::{Game, steam::detect_steam_game_path};
use pdx_map::{R16, World};

#[derive(Clone)]
pub struct AppState {
    pub token_resolver: Arc<BasicTokenResolver>,
    pub pending_render: Arc<Mutex<Option<RenderPayload>>>,
    interaction_state: Arc<Mutex<InteractionState>>,
}

pub struct RenderPayload {
    pub world: Arc<World<R16>>,
    pub workspace: Eu5Workspace<'static>,
    pub player_capital_world: Option<(f32, f32)>,
    _loaded_save: Eu5LoadedSave,
}

#[derive(Debug, Clone, Default)]
pub struct InteractionSnapshot {
    pub cursor: Option<(f32, f32)>,
    pub mouse_buttons: [bool; 3],
    pub wheel_lines: f32,
    pub pressed_keys: HashSet<String>,
}

#[derive(Debug, Default)]
struct InteractionState {
    cursor: Option<(f32, f32)>,
    mouse_buttons: [bool; 3],
    wheel_lines: f32,
    pressed_keys: HashSet<String>,
}

impl AppState {
    pub fn new(token_resolver: BasicTokenResolver) -> Self {
        Self {
            token_resolver: Arc::new(token_resolver),
            pending_render: Arc::new(Mutex::new(None)),
            interaction_state: Arc::new(Mutex::new(InteractionState::default())),
        }
    }

    pub fn set_pending_render(&self, payload: RenderPayload) -> Result<(), String> {
        let mut guard = self
            .pending_render
            .lock()
            .map_err(|_| "Failed to lock pending render state".to_string())?;
        *guard = Some(payload);
        self.reset_interaction_state()?;
        Ok(())
    }

    pub fn take_pending_render(&self) -> Option<RenderPayload> {
        self.pending_render
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    }

    pub fn set_cursor(&self, x: f32, y: f32) -> Result<(), String> {
        let mut guard = self
            .interaction_state
            .lock()
            .map_err(|_| "Failed to lock interaction state".to_string())?;
        guard.cursor = Some((x, y));
        Ok(())
    }

    pub fn set_mouse_button(&self, button: u8, pressed: bool) -> Result<(), String> {
        let mut guard = self
            .interaction_state
            .lock()
            .map_err(|_| "Failed to lock interaction state".to_string())?;
        guard.mouse_buttons[button as usize] = pressed;
        Ok(())
    }

    pub fn add_mouse_wheel(&self, lines: f32) -> Result<(), String> {
        let mut guard = self
            .interaction_state
            .lock()
            .map_err(|_| "Failed to lock interaction state".to_string())?;
        guard.wheel_lines += lines;
        Ok(())
    }

    pub fn set_key(&self, code: String, pressed: bool) -> Result<(), String> {
        let mut guard = self
            .interaction_state
            .lock()
            .map_err(|_| "Failed to lock interaction state".to_string())?;
        if pressed {
            guard.pressed_keys.insert(code);
        } else {
            guard.pressed_keys.remove(&code);
        }
        Ok(())
    }

    pub fn take_interaction_snapshot(&self) -> InteractionSnapshot {
        self.interaction_state
            .lock()
            .map(|mut guard| {
                let wheel_lines = guard.wheel_lines;
                guard.wheel_lines = 0.0;
                InteractionSnapshot {
                    cursor: guard.cursor,
                    mouse_buttons: guard.mouse_buttons,
                    wheel_lines,
                    pressed_keys: guard.pressed_keys.clone(),
                }
            })
            .unwrap_or_default()
    }

    pub fn reset_interaction_state(&self) -> Result<(), String> {
        let mut guard = self
            .interaction_state
            .lock()
            .map_err(|_| "Failed to lock interaction state".to_string())?;
        *guard = InteractionState::default();
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFileInfo {
    pub file_path: String,
    pub version: String,
    pub date: String,
    pub playthrough_name: String,
    pub playthrough_id: String,
    pub file_size: u64,
    pub modified_time: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanError {
    pub file_path: String,
    pub error: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub saves: Vec<SaveFileInfo>,
    pub errors: Vec<ScanError>,
}

#[tauri::command]
pub fn get_default_save_directory() -> Result<String, String> {
    let base_path = if cfg!(target_os = "windows") {
        std::env::var("USERPROFILE")
            .map_err(|e| format!("Failed to get USERPROFILE: {}", e))
            .map(PathBuf::from)?
    } else {
        dirs::home_dir().ok_or_else(|| "Failed to get home directory".to_string())?
    };

    let save_dir = base_path
        .join("Documents")
        .join("Paradox Interactive")
        .join("Europa Universalis V")
        .join("save games");

    Ok(save_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn detect_eu5_game_path() -> Result<Option<String>, String> {
    Ok(detect_steam_game_path(Game::Eu5)
        .ok()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn interaction_cursor_moved(x: f32, y: f32, state: State<AppState>) -> Result<(), String> {
    state.set_cursor(x, y)
}

#[tauri::command]
pub fn interaction_mouse_button(
    button: u8,
    pressed: bool,
    state: State<AppState>,
) -> Result<(), String> {
    if button > 2 {
        return Ok(());
    }
    state.set_mouse_button(button, pressed)
}

#[tauri::command]
pub fn interaction_mouse_wheel(lines: f32, state: State<AppState>) -> Result<(), String> {
    state.add_mouse_wheel(lines)
}

#[tauri::command]
pub fn interaction_key(code: String, pressed: bool, state: State<AppState>) -> Result<(), String> {
    state.set_key(code, pressed)
}

#[tauri::command]
#[tracing::instrument(name = "desktop.saves.scan", skip(state), fields(directory = %directory))]
pub async fn scan_save_directory(
    directory: String,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    let token_resolver = state.token_resolver.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<ScanResult, String> {
        let dir_path = Path::new(&directory);

        if !dir_path.exists() {
            return Err(format!("Directory does not exist: {}", directory));
        }

        if !dir_path.is_dir() {
            return Err(format!("Path is not a directory: {}", directory));
        }

        let entries =
            fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut saves = Vec::new();
        let mut errors = Vec::new();

        // Collect all .eu5 files
        let eu5_files: Vec<_> = entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("eu5"))
                    .unwrap_or(false)
            })
            .collect();

        // Process files in parallel using rayon
        use rayon::prelude::*;

        let results: Vec<_> = eu5_files
            .par_iter()
            .map(|entry| {
                let path = entry.path();
                let file_path = path.to_string_lossy().to_string();

                match process_save_file(&path, &token_resolver) {
                    Ok(save_info) => Ok(save_info),
                    Err(e) => Err(ScanError {
                        file_path,
                        error: e,
                    }),
                }
            })
            .collect();

        // Separate successes and errors
        for result in results {
            match result {
                Ok(save_info) => saves.push(save_info),
                Err(error) => errors.push(error),
            }
        }

        // Sort by modified time (newest first)
        saves.sort_by(|a, b| b.modified_time.cmp(&a.modified_time));

        Ok(ScanResult { saves, errors })
    })
    .await
    .map_err(|e| format!("Failed to join scan task: {e}"))?
}

#[tauri::command]
#[tracing::instrument(
    name = "desktop.renderer.load-save",
    skip(state),
    fields(save_path = %save_path, game_path = ?game_path.as_deref())
)]
pub async fn load_save_for_renderer(
    save_path: String,
    game_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let save_path = PathBuf::from(&save_path);
    if !save_path.exists() {
        return Err(format!("Save file does not exist: {}", save_path.display()));
    }

    let resolved_game_path = resolve_game_path(game_path)?;
    let game_path = PathBuf::from(&resolved_game_path);
    let token_resolver = state.token_resolver.clone();
    let app_state = state.inner().clone();

    let save_path_for_task = save_path.clone();
    let token_resolver_for_task = token_resolver.clone();
    let save_task = tauri::async_runtime::spawn_blocking(move || {
        load_save_for_workspace(&save_path_for_task, &token_resolver_for_task)
    });

    let game_path_for_task = game_path.clone();
    let install_task =
        tauri::async_runtime::spawn_blocking(move || load_game_install(&game_path_for_task));

    let save_join = save_task.await;
    let install_join = install_task.await;

    let mut loaded_save =
        save_join.map_err(|e| format!("Failed to join save loading task: {e}"))??;
    let game_install =
        install_join.map_err(|e| format!("Failed to join game loading task: {e}"))??;

    let world = game_install.world();
    let game_data = game_install.into_game_data();

    let (workspace, player_capital_world) = {
        let gamestate = loaded_save.take_gamestate();
        // Workspace borrows parsed save data; keep save alive in RenderPayload.
        let gamestate =
            unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(gamestate) };
        let workspace = Eu5Workspace::new(gamestate, game_data)
            .map_err(|e| format!("Failed to join save and game data: {e}"))?;

        let player_capital_world = workspace.player_capital_color_id().map(|color_id| {
            let center = world.center_of(R16::new(color_id.value()));
            (center.x as f32, center.y as f32)
        });

        (workspace, player_capital_world)
    };

    app_state.set_pending_render(RenderPayload {
        world,
        workspace,
        player_capital_world,
        _loaded_save: loaded_save,
    })?;

    Ok(resolved_game_path)
}

fn process_save_file(
    path: &Path,
    token_resolver: &Arc<BasicTokenResolver>,
) -> Result<SaveFileInfo, String> {
    // Get file metadata
    let metadata =
        fs::metadata(path).map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let file_size = metadata.len();
    let modified_time = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| format!("Invalid modified time: {}", e))?
        .as_secs() as i64;

    // Load save file to extract metadata
    let save_file = fs::File::open(path).map_err(|e| format!("Failed to read save file: {}", e))?;

    let file = Eu5File::from_file(save_file)
        .map_err(|e| format!("Failed to parse save file envelope: {}", e))?;

    let loader = Eu5SaveLoader::open(file, token_resolver.as_ref())
        .map_err(|e| format!("Failed to load save metadata: {}", e))?;

    // Extract metadata
    let meta = loader.meta();
    let version = format!(
        "{}.{}.{}",
        meta.version.major, meta.version.minor, meta.version.patch
    );

    let date = format!(
        "{}.{}.{}",
        meta.date.year(),
        meta.date.month(),
        meta.date.day()
    );
    let playthrough_name = meta.playthrough_name.clone();
    // Generate a playthrough ID from the name and date for uniqueness
    let playthrough_id = format!("{}_{}", playthrough_name, date);

    Ok(SaveFileInfo {
        file_path: path.to_string_lossy().to_string(),
        version,
        date,
        playthrough_name,
        playthrough_id,
        file_size,
        modified_time,
    })
}

fn resolve_game_path(game_path: Option<String>) -> Result<String, String> {
    if let Some(path) = game_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
        return Ok(path.to_string());
    }

    detect_steam_game_path(Game::Eu5)
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| {
            format!(
                "Failed to auto-detect EU5 install path: {e}. Please provide a path to an optimized bundle or raw game install."
            )
        })
}

#[tracing::instrument(name = "desktop.eu5-save.load", skip_all, fields(save_path = %save_path.display()))]
fn load_save_for_workspace(
    save_path: &Path,
    token_resolver: &Arc<BasicTokenResolver>,
) -> Result<Eu5LoadedSave, String> {
    let save_file = fs::File::open(save_path)
        .map_err(|e| format!("Failed to read save file {}: {e}", save_path.display()))?;

    let file = Eu5File::from_file(save_file)
        .map_err(|e| format!("Failed to parse save file envelope: {e}"))?;

    let parser = Eu5SaveLoader::open(file, token_resolver.as_ref())
        .map_err(|e| format!("Failed to load save metadata: {e}"))?;

    parser
        .parse()
        .map_err(|e| format!("Failed to parse save gamestate: {e}"))
}

#[tracing::instrument(name = "desktop.eu5-game.load", skip_all, fields(game_path = %game_path.display()))]
fn load_game_install(game_path: &Path) -> Result<Eu5GameInstall, String> {
    Eu5GameInstall::open(game_path).map_err(|e| {
        format!(
            "Failed to process EU5 game installation {}: {e}",
            game_path.display()
        )
    })
}
