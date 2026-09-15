use crate::{Game, create_provider};
use anyhow::{Context, Result};
use clap::Args;
use std::path::PathBuf;
use std::process::ExitCode;

/// Print the Steam build and game version that a game archive or directory
/// contains
///
/// SteamCMD writes steamapps/appmanifest_<app id>.acf next to the game
/// files. The manifest records the build ID and the branch that was
/// downloaded. The game version comes from the launcher settings and is
/// null for games without them (EU5).
#[derive(Args, Debug)]
pub struct BuildInfoArgs {
    /// Game contained in the source (eu4, eu5, ck3, hoi4, imperator, or vic3)
    #[clap(long)]
    game: Game,

    /// Zip archive or directory produced by fetch-game
    #[clap(value_parser)]
    source: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct SteamBuildInfo {
    pub app_id: u32,
    pub build_id: u64,
    pub branch: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
struct BuildInfo {
    #[serde(flatten)]
    steam: SteamBuildInfo,
    game_version: Option<String>,
}

impl BuildInfoArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let provider = create_provider(&self.source)?;
        let app_id = self.game.steam_app_id();
        let manifest_path = format!("steamapps/appmanifest_{app_id}.acf");
        let manifest = provider
            .read_to_string(&manifest_path)
            .with_context(|| format!("No Steam manifest in {}", self.source.display()))?;

        let info = parse_app_manifest(&manifest)
            .with_context(|| format!("Invalid Steam manifest: {manifest_path}"))?;
        anyhow::ensure!(
            info.app_id == app_id,
            "Manifest is for app {}, expected {}",
            info.app_id,
            app_id
        );

        let game_version = crate::launcher::raw_version(&provider)?;
        let info = BuildInfo {
            steam: info,
            game_version,
        };
        println!("{}", serde_json::to_string(&info)?);
        Ok(ExitCode::SUCCESS)
    }
}

/// Extract the build from a Steam appmanifest (VDF text).
///
/// Only the top-level "appid" and "buildid" keys and the nested
/// UserConfig "BetaKey" are read, so a full VDF parser is not necessary.
pub fn parse_app_manifest(manifest: &str) -> Result<SteamBuildInfo> {
    let app_id = vdf_value(manifest, "appid")
        .context("appid missing")?
        .parse()
        .context("appid is not a number")?;
    let build_id = vdf_value(manifest, "buildid")
        .context("buildid missing")?
        .parse()
        .context("buildid is not a number")?;
    let branch = vdf_value(manifest, "BetaKey")
        .unwrap_or("public")
        .to_owned();

    Ok(SteamBuildInfo {
        app_id,
        build_id,
        branch,
    })
}

/// Find the string value of the first `"key" "value"` pair with the given key
fn vdf_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let quoted = format!("\"{key}\"");
    text.lines()
        .map(str::trim)
        .filter_map(|line| line.strip_prefix(&quoted))
        .map(str::trim_start)
        .find_map(|rest| rest.strip_prefix('"')?.split_once('"').map(|(x, _)| x))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MANIFEST: &str = r#"
"AppState"
{
	"appid"		"529340"
	"Universe"		"1"
	"name"		"Victoria 3"
	"StateFlags"		"4"
	"installdir"		"Victoria 3"
	"buildid"		"25081502"
	"UserConfig"
	{
		"BetaKey"		"1.14-openbeta"
	}
	"MountedConfig"
	{
		"BetaKey"		"1.14-openbeta"
	}
}
"#;

    #[test]
    fn parses_beta_manifest() {
        let info = parse_app_manifest(MANIFEST).unwrap();
        assert_eq!(
            info,
            SteamBuildInfo {
                app_id: 529_340,
                build_id: 25_081_502,
                branch: String::from("1.14-openbeta"),
            }
        );
    }

    #[test]
    fn defaults_to_public_branch() {
        let manifest =
            "\"AppState\"\n{\n\t\"appid\"\t\t\"236850\"\n\t\"buildid\"\t\t\"15918133\"\n}\n";
        let info = parse_app_manifest(manifest).unwrap();
        assert_eq!(info.branch, "public");
        assert_eq!(info.build_id, 15_918_133);
    }

    #[test]
    fn rejects_manifest_without_build() {
        let error = parse_app_manifest("\"AppState\"\n{\n\t\"appid\"\t\t\"1\"\n}\n").unwrap_err();
        assert!(error.to_string().contains("buildid"));
    }
}
