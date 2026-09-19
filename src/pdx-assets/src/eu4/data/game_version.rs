use crate::FileProvider;
use anyhow::{Context, Result};

pub fn extract_game_version<P: FileProvider>(provider: &P) -> Result<String> {
    let raw_version =
        crate::launcher::raw_version(provider)?.context("unable to read launcher-settings.json")?;
    let major_minor: Vec<_> = raw_version.split('.').take(2).collect();
    Ok(major_minor.join("."))
}
