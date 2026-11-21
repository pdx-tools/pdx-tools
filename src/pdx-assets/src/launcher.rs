use crate::FileProvider;
use anyhow::{Context, Result};
use serde::Deserialize;

/// Locations of the Paradox launcher settings, relative to the game
/// directory. Clausewitz games keep the file at the root; Jomini games
/// keep it in `launcher/`.
const LAUNCHER_SETTINGS_PATHS: [&str; 2] =
    ["launcher-settings.json", "launcher/launcher-settings.json"];

#[derive(Deserialize, Clone, Debug)]
struct LauncherSettings {
    #[serde(alias = "rawVersion")]
    raw_version: Option<String>,
    #[serde(rename = "gameId")]
    game_id: Option<String>,
}

fn read_settings<P: FileProvider + ?Sized>(provider: &P) -> Result<Option<LauncherSettings>> {
    let Some(path) = LAUNCHER_SETTINGS_PATHS
        .iter()
        .find(|path| provider.file_exists(path))
    else {
        return Ok(None);
    };

    let data = provider
        .read_file(path)
        .with_context(|| format!("unable to read {path}"))?;
    let settings: LauncherSettings =
        serde_json::from_slice(&data).with_context(|| format!("unable to parse {path}"))?;
    Ok(Some(settings))
}

/// Read the game version from the launcher settings, without a leading `v`
/// (for example `1.37.5.0`). Returns `None` when the game has no launcher
/// settings, which is the case for EU5.
pub fn raw_version<P: FileProvider + ?Sized>(provider: &P) -> Result<Option<String>> {
    let Some(settings) = read_settings(provider)? else {
        return Ok(None);
    };
    let raw_version = settings
        .raw_version
        .context("launcher-settings.json has no rawVersion")?;
    let version = raw_version.trim().trim_start_matches('v');
    Ok(Some(version.to_owned()))
}

/// Read the game ID from launcher settings when the file has one.
pub fn game_id<P: FileProvider + ?Sized>(provider: &P) -> Result<Option<String>> {
    Ok(read_settings(provider)?.and_then(|settings| settings.game_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DirectoryProvider;

    #[test]
    fn reads_root_and_launcher_directory_settings() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(
            root.path().join("launcher-settings.json"),
            br#"{"gameId": "eu4", "rawVersion": "v1.37.5.0"}"#,
        )
        .unwrap();
        let version = raw_version(&DirectoryProvider::new(root.path())).unwrap();
        assert_eq!(version.as_deref(), Some("1.37.5.0"));
        let game = game_id(&DirectoryProvider::new(root.path())).unwrap();
        assert_eq!(game.as_deref(), Some("eu4"));

        let nested = tempfile::tempdir().unwrap();
        std::fs::create_dir(nested.path().join("launcher")).unwrap();
        std::fs::write(
            nested.path().join("launcher/launcher-settings.json"),
            br#"{"gameId": "hoi4", "rawVersion": "1.19.0.6"}"#,
        )
        .unwrap();
        let version = raw_version(&DirectoryProvider::new(nested.path())).unwrap();
        assert_eq!(version.as_deref(), Some("1.19.0.6"));
        let game = game_id(&DirectoryProvider::new(nested.path())).unwrap();
        assert_eq!(game.as_deref(), Some("hoi4"));
    }

    #[test]
    fn missing_settings_is_not_an_error() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(
            raw_version(&DirectoryProvider::new(root.path())).unwrap(),
            None
        );
    }
}
