use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;
use tauri::State;

use eu5app::Eu5SaveLoader;
use eu5save::{Eu5File, BasicTokenResolver};
use jomini::common::PdsDate;

#[derive(Clone)]
pub struct AppState {
    pub token_resolver: Arc<BasicTokenResolver>,
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
pub fn scan_save_directory(
    directory: String,
    state: State<AppState>,
) -> Result<ScanResult, String> {
    let dir_path = Path::new(&directory);

    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", directory));
    }

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

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

            match process_save_file(&path, &state.token_resolver) {
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
}

fn process_save_file(
    path: &Path,
    token_resolver: &Arc<BasicTokenResolver>,
) -> Result<SaveFileInfo, String> {
    // Get file metadata
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let file_size = metadata.len();
    let modified_time = metadata
        .modified()
        .map_err(|e| format!("Failed to get modified time: {}", e))?
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| format!("Invalid modified time: {}", e))?
        .as_secs() as i64;

    // Load save file to extract metadata
    let save_file = fs::File::open(path)
        .map_err(|e| format!("Failed to read save file: {}", e))?;

    let file = Eu5File::from_file(save_file)
        .map_err(|e| format!("Failed to parse save file envelope: {}", e))?;

    let loader = Eu5SaveLoader::open(file, token_resolver.as_ref())
        .map_err(|e| format!("Failed to load save metadata: {}", e))?;

    // Extract metadata
    let meta = loader.meta();
    let version = format!(
        "{}.{}.{}",
        meta.version.major,
        meta.version.minor,
        meta.version.patch
    );

    let date = format!("{}.{}.{}", meta.date.year(), meta.date.month(), meta.date.day());
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

#[tauri::command]
pub fn read_save_file(file_path: String) -> Result<Vec<u8>, String> {
    fs::read(&file_path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))
}
