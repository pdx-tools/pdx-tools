use crate::FileProvider;
use anyhow::{Context, Result};
use serde::Deserialize;

pub fn extract_game_version<P: FileProvider>(provider: &P) -> Result<String> {
    let settings_data = provider
        .read_file("launcher-settings.json")
        .context("unable to read launcher-settings.json")?;
    let settings: LauncherSettings =
        serde_json::from_slice(&settings_data).context("unable to parse launcher-settings.json")?;
    let major_minor: Vec<_> = settings.raw_version.split('.').take(2).collect();
    let game_version = major_minor.join(".").trim_start_matches('v').to_string();
    Ok(game_version)
}

#[derive(Deserialize, Clone, Debug)]
pub struct LauncherSettings {
    #[serde(alias = "rawVersion")]
    raw_version: String,
}
