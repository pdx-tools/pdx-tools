use anyhow::Context;
use packager::tarball::PackageOptions;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize, Clone, Debug)]
pub struct LauncherSettings {
    #[serde(alias = "rawVersion")]
    raw_version: String,
}

fn main() -> anyhow::Result<()> {
    let mut args = pico_args::Arguments::from_env();
    let generate_commons = args.contains("--common");
    let regen = args.contains("--regen");
    let input_game_dir: PathBuf = args.free_from_str().unwrap();

    let game_path = input_game_dir.as_path();
    let settings_path = game_path.join("launcher-settings.json");
    let settings_data =
        fs::read(&settings_path).context("unable to read game launcher settings")?;

    let settings: LauncherSettings =
        serde_json::from_slice(&settings_data).context("unable to parse game launcher settings")?;

    let versions: Vec<_> = settings.raw_version.split('.').collect();
    let game_version = format!("{}.{}", versions[0], versions[1]);

    let out_game_dir = Path::new(".")
        .join("assets")
        .join("game")
        .join("eu4")
        .join(&game_version);
    std::fs::create_dir_all(&out_game_dir)?;

    let options = PackageOptions {
        common: generate_commons,
        regen,
        path: PathBuf::new(), // todo: unused
    };

    packager::tarball::parse_game_dir(&input_game_dir, &out_game_dir, &game_version, &options)
}
