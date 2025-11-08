use crate::Game;
use anyhow::{Context, Result};
use std::path::PathBuf;

/// Auto-detect Steam installation path and game directory for a specific game
pub fn detect_steam_game_path(game: Game) -> Result<PathBuf> {
    let steam_path =
        detect_steam_path().context("Failed to auto-detect Steam installation path")?;

    let game_dir = match game {
        Game::Eu4 => "Europa Universalis IV",
        Game::Eu5 => "Europa Universalis V",
    };

    let game_path = steam_path.join(format!("steamapps/common/{}", game_dir));
    anyhow::ensure!(
        game_path.exists(),
        "{} not found in Steam library at expected path: {}",
        game,
        game_path.display()
    );

    println!("Detected {} installation at: {}", game, game_path.display());
    Ok(game_path)
}

/// Auto-detect all installed Paradox games in Steam installation
pub fn detect_all_installed_games() -> Result<Vec<(Game, PathBuf)>> {
    let steam_path =
        detect_steam_path().context("Failed to auto-detect Steam installation path")?;

    let mut found_games = Vec::new();

    // Check for EU4
    let eu4_path = steam_path.join("steamapps/common/Europa Universalis IV");
    if eu4_path.exists() {
        found_games.push((Game::Eu4, eu4_path));
    }

    // Check for EU5
    let eu5_path = steam_path.join("steamapps/common/Europa Universalis V");
    if eu5_path.exists() {
        found_games.push((Game::Eu5, eu5_path));
    }

    anyhow::ensure!(
        !found_games.is_empty(),
        "No Paradox games found in Steam library at: {}",
        steam_path.display()
    );

    Ok(found_games)
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
    let steam_path = PathBuf::from("/Applications/Steam.app/Contents/MacOS");
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
