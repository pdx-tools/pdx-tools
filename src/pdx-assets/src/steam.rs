use crate::Game;
use anyhow::{Context, Result};
use std::path::PathBuf;

/// Find a game in the Steam libraries.
pub fn detect_steam_game_path(game: Game) -> Result<PathBuf> {
    let steam_path = detect_steam_path().context("Failed to find Steam")?;
    find_game(&library_paths(&steam_path)?, game).with_context(|| {
        format!("{game} was not found in the Steam libraries. Supply its source path")
    })
}

/// Find installed games that have an asset compiler.
pub fn detect_all_installed_games() -> Result<Vec<(Game, PathBuf)>> {
    let steam_path = detect_steam_path().context("Failed to find Steam")?;
    let libraries = library_paths(&steam_path)?;
    let games: Vec<_> = [Game::Eu4, Game::Eu5]
        .into_iter()
        .filter_map(|game| find_game(&libraries, game).map(|path| (game, path)))
        .collect();
    anyhow::ensure!(
        !games.is_empty(),
        "No EU4 or EU5 installation was found. Supply a game directory or an asset bundle"
    );
    Ok(games)
}

fn library_paths(steam_path: &std::path::Path) -> Result<Vec<PathBuf>> {
    let mut libraries = vec![steam_path.to_path_buf()];
    let folders = steam_path.join("steamapps/libraryfolders.vdf");
    if folders.is_file() {
        let data = std::fs::read_to_string(folders)?;
        let vdf = crate::cli::steam_builds::Vdf::parse(&data);
        if let Some(entries) = vdf
            .get("libraryfolders")
            .or_else(|| vdf.get("LibraryFolders"))
            .and_then(|x| x.entries())
        {
            for (index, entry) in entries {
                if index.parse::<u32>().is_err() {
                    continue;
                }
                if let Some(path) = entry
                    .get("path")
                    .and_then(|x| x.as_str())
                    .or_else(|| entry.as_str())
                {
                    let path = PathBuf::from(path);
                    if !libraries.contains(&path) {
                        libraries.push(path);
                    }
                }
            }
        }
    }
    Ok(libraries)
}

fn find_game(libraries: &[PathBuf], game: Game) -> Option<PathBuf> {
    libraries.iter().find_map(|library| {
        let manifest = library.join(format!("steamapps/appmanifest_{}.acf", game.steam_app_id()));
        let install_dir = std::fs::read_to_string(manifest)
            .ok()
            .and_then(|text| {
                crate::cli::build_info::vdf_value(&text, "installdir").map(str::to_owned)
            })
            .unwrap_or_else(|| game.steam_directory().to_owned());
        let path = library.join("steamapps/common").join(install_dir);
        // On macOS, the game executable is inside the app bundle.
        // Detect the game by its data files in this directory.
        let provider = crate::DirectoryProvider::new(&path);
        (game.is_installation(&provider) || Game::detect(&provider).ok() == Some(game))
            .then_some(path)
    })
}

/// Detect Steam installation path based on the current platform
fn detect_steam_path() -> Result<PathBuf> {
    match std::env::consts::OS {
        "windows" => detect_steam_path_windows(),
        "macos" => detect_steam_path_macos(),
        "linux" => detect_steam_path_linux(),
        os => anyhow::bail!(
            "Steam auto-detection is not supported on platform '{}'. Please specify the source path manually.",
            os
        ),
    }
}

fn detect_steam_path_windows() -> Result<PathBuf> {
    let output = std::process::Command::new("powershell")
        .arg("-Command")
        .arg("(Get-ItemProperty -Path \"HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam\").InstallPath")
        .output()
        .context("Failed to execute PowerShell command. Is PowerShell available?")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("PowerShell command failed: {}", stderr);
    }

    let install_path = String::from_utf8(output.stdout)
        .context("PowerShell output is not valid UTF-8")?
        .trim()
        .to_string();

    Ok(PathBuf::from(install_path))
}

fn detect_steam_path_macos() -> Result<PathBuf> {
    let steam_path = PathBuf::from(std::env::var("HOME").context("HOME is not set")?)
        .join("Library/Application Support/Steam");
    Ok(steam_path)
}

fn detect_steam_path_linux() -> Result<PathBuf> {
    let home = std::env::var("HOME").context("HOME environment variable not set")?;
    let local = PathBuf::from(&home).join(".local/share/Steam");
    if local.exists() {
        return Ok(local);
    }

    let steam_path = PathBuf::from(&home).join(".steam/steam");
    if steam_path.exists() {
        return Ok(steam_path);
    }

    anyhow::bail!("Could not find Steam installation");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_game_in_an_additional_library_using_its_manifest() {
        let root = tempfile::tempdir().unwrap();
        let extra = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(root.path().join("steamapps")).unwrap();
        let install = extra
            .path()
            .join("steamapps/common/Custom EU5 Directory/binaries");
        std::fs::create_dir_all(&install).unwrap();
        std::fs::write(install.join("eu5.exe"), b"").unwrap();
        std::fs::write(
            extra.path().join("steamapps/appmanifest_3450310.acf"),
            "\"AppState\"\n{\n\"installdir\" \"Custom EU5 Directory\"\n}",
        )
        .unwrap();
        let vdf = format!(
            "\"libraryfolders\"\n{{\n\"1\"\n{{\n\"path\" \"{}\"\n}}\n}}",
            extra.path().display()
        );
        std::fs::write(root.path().join("steamapps/libraryfolders.vdf"), vdf).unwrap();
        let libraries = library_paths(root.path()).unwrap();
        assert_eq!(
            libraries,
            vec![root.path().to_owned(), extra.path().to_owned()]
        );
        assert_eq!(
            find_game(&libraries, Game::Eu5).unwrap(),
            install.parent().unwrap()
        );
        assert!(find_game(&libraries, Game::Eu4).is_none());
    }
}
