use crate::{FileProvider, Game, parse_app_manifest};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::{collections::HashMap, path::Path};

#[derive(Debug, Deserialize)]
struct Catalog {
    games: HashMap<String, CatalogGame>,
}

#[derive(Debug, Deserialize)]
struct CatalogGame {
    releases: Vec<Release>,
}

#[derive(Debug, Deserialize)]
struct Release {
    game_version: String,
}

/// Convert a game version (for example `v1.37.5.0`) to the asset version
/// (`1.37`). The asset version is also an output directory name, thus reject
/// all values that are not numeric.
pub fn asset_version(version: &str) -> Result<String> {
    let parts: Vec<_> = version.trim().trim_start_matches('v').split('.').collect();
    anyhow::ensure!(
        parts.len() >= 2
            && parts
                .iter()
                .all(|x| !x.is_empty() && x.bytes().all(|c| c.is_ascii_digit())),
        "Invalid game version '{version}'. Use a numeric version such as 1.4 or 1.4.2"
    );
    Ok(format!("{}.{}", parts[0], parts[1]))
}

/// The newest asset version that `assets/catalog.json` lists for the game.
pub fn latest_catalog_version(game: Game) -> Result<String> {
    let catalog: Catalog = serde_json::from_str(include_str!("../../../assets/catalog.json"))?;
    let releases = &catalog
        .games
        .get(&game.to_string())
        .with_context(|| format!("{game} has no releases in the asset catalog"))?
        .releases;
    let mut versions = releases
        .iter()
        .map(|release| asset_version(&release.game_version))
        .collect::<Result<Vec<_>>>()?;
    versions.sort_by_key(|version| {
        version
            .split('.')
            .map(|x| x.parse::<u32>().unwrap_or(0))
            .collect::<Vec<_>>()
    });
    versions
        .pop()
        .with_context(|| format!("{game} has no releases in the asset catalog"))
}

/// Find the asset version of a game source. Use, in sequence, the launcher
/// settings, the declared version, the Steam beta branch, and a bundle file
/// name such as `eu5-1.3.zip`. Return `None` if the version is unknown.
pub fn detect_version<P: FileProvider + ?Sized>(
    provider: &P,
    source: &Path,
    game: Game,
    declared: Option<&str>,
) -> Result<Option<String>> {
    let declared = declared.map(asset_version).transpose()?;
    if let Some(version) = crate::launcher::raw_version(provider)? {
        let version = asset_version(&version)?;
        if let Some(declared) = declared {
            anyhow::ensure!(
                declared == version,
                "Declared game version {declared} does not match source version {version}"
            );
        }
        return Ok(Some(version));
    }
    if declared.is_some() {
        return Ok(declared);
    }

    if let Some(branch) = steam_branch(provider, source, game)
        && let Some(version) = branch.split('-').next()
        && let Ok(version) = asset_version(version)
    {
        return Ok(Some(version));
    }

    let file_version = source
        .is_file()
        .then(|| {
            source
                .file_stem()?
                .to_str()?
                .strip_prefix(&format!("{game}-"))
        })
        .flatten()
        .and_then(|version| asset_version(version).ok());
    Ok(file_version)
}

/// Read the Steam branch from the app manifest. The manifest is in the source
/// if fetch-game created it, otherwise it is in the Steam library that
/// contains the game directory. A missing or invalid manifest gives `None`.
fn steam_branch<P: FileProvider + ?Sized>(
    provider: &P,
    source: &Path,
    game: Game,
) -> Option<String> {
    let name = format!("appmanifest_{}.acf", game.steam_app_id());
    let manifest = provider
        .read_to_string(&format!("steamapps/{name}"))
        .ok()
        .or_else(|| {
            let steamapps = source.parent()?.parent()?;
            std::fs::read_to_string(steamapps.join(&name)).ok()
        })?;
    parse_app_manifest(&manifest).ok().map(|info| info.branch)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DirectoryProvider;

    #[test]
    fn unknown_source_has_no_version() {
        let dir = tempfile::tempdir().unwrap();
        let provider = DirectoryProvider::new(dir.path());
        let version = detect_version(&provider, dir.path(), Game::Eu5, None).unwrap();
        assert_eq!(version, None);
        let version = detect_version(&provider, dir.path(), Game::Eu5, Some("1.2.5")).unwrap();
        assert_eq!(version.as_deref(), Some("1.2"));
    }

    #[test]
    fn declared_version_and_launcher_version_must_agree() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("launcher-settings.json"),
            br#"{"rawVersion":"v1.37.5.0"}"#,
        )
        .unwrap();
        let provider = DirectoryProvider::new(dir.path());
        detect_version(&provider, dir.path(), Game::Eu4, Some("1.36")).unwrap_err();
        let version = detect_version(&provider, dir.path(), Game::Eu4, Some("1.37")).unwrap();
        assert_eq!(version.as_deref(), Some("1.37"));
    }

    #[test]
    fn reads_steam_branch_outside_the_game_directory() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("steamapps/common/Europa Universalis V");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(dir.path().join("steamapps/appmanifest_3450310.acf"),
            "\"AppState\"\n{\n\"appid\" \"3450310\"\n\"buildid\" \"123\"\n\"MountedConfig\"\n{\n\"BetaKey\" \"1.3.11\"\n}\n}").unwrap();
        let provider = DirectoryProvider::new(&source);
        let version = detect_version(&provider, &source, Game::Eu5, None).unwrap();
        assert_eq!(version.as_deref(), Some("1.3"));
    }

    #[test]
    fn reads_version_from_bundle_file_name() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("eu5-1.2.zip");
        std::fs::write(&archive, b"").unwrap();
        let provider = DirectoryProvider::new(dir.path());
        let version = detect_version(&provider, &archive, Game::Eu5, None).unwrap();
        assert_eq!(version.as_deref(), Some("1.2"));
    }

    #[test]
    fn catalog_has_a_latest_version_for_each_game() {
        for game in [Game::Eu4, Game::Eu5] {
            asset_version(&latest_catalog_version(game).unwrap()).unwrap();
        }
    }

    #[test]
    fn invalid_declarations_cannot_become_output_paths() {
        for version in ["1", "../1.4", "1.4/beta", "1..4", "1.4-beta"] {
            assert!(asset_version(version).is_err(), "{version}");
        }
    }
}
