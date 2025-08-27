use anyhow::{Context, Result};
use std::path::PathBuf;

/// Auto-detect Steam installation path and EU4 directory
pub fn detect_steam_eu4_path() -> Result<PathBuf> {
    let steam_path =
        detect_steam_path().context("Failed to auto-detect Steam installation path")?;

    let eu4_path = steam_path.join("steamapps/common/Europa Universalis IV");
    anyhow::ensure!(
        eu4_path.exists(),
        "Europa Universalis IV not found in Steam library at expected path: {}",
        eu4_path.display()
    );

    println!("Detected EU4 installation at: {}", eu4_path.display());
    Ok(eu4_path)
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
