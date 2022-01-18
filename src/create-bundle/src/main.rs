use regex::RegexSet;
use serde::Deserialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

fn main() {
    let args: Vec<_> = std::env::args().collect();
    tar_game(&args[1], &args[2]);
}

#[derive(Deserialize, Clone, Debug)]
pub struct LauncherSettings {
    #[serde(alias = "rawVersion")]
    raw_version: String,
}

#[cfg(target_os = "windows")]
fn normalize_path(path: &Path) -> String {
    path.to_str().unwrap().replace('\\', "/")
}

#[cfg(not(target_os = "windows"))]
fn normalize_path(path: &Path) -> String {
    path.to_str().unwrap().to_string()
}

pub fn tar_game_directory<P, Q>(game_dir: P, output_dir: Q, version: &str) -> PathBuf
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    #[allow(clippy::trivial_regex)]
    let regex = RegexSet::new(&[
        r"/music/",
        r"/tutorial/",
        r"/sound/",
        r"/soundtrack/",
        r"/dlc/",
        r"/launcher-installer-windows.msi",
        r"/gfx/models/",
        r"/gfx/loadingscreens/",
        r"/map/random/",
    ])
    .unwrap();

    let output_name = format!("eu4-{}.tar.zst", version);
    let output_path = output_dir.as_ref();
    let output_ball = output_path.join(output_name);
    let output_file = fs::File::create(&output_ball).unwrap();

    let mut zstd_writer = zstd::Encoder::new(output_file, 0).unwrap();

    // Long distance matching cuts down the size of the bundle by 15%
    zstd_writer.long_distance_matching(true).unwrap();

    // Much faster compression
    zstd_writer.multithread(4).unwrap();

    let mut tar_builder = tar::Builder::new(zstd_writer);

    for entry in WalkDir::new(game_dir.as_ref()) {
        let entry = entry.unwrap();
        let path = entry.path();

        let path_s = normalize_path(path);
        if regex.is_match(&path_s) {
            continue;
        }

        if path == game_dir.as_ref() {
            continue;
        }

        let relative = path.strip_prefix(game_dir.as_ref()).unwrap();
        tar_builder.append_path_with_name(path, relative).unwrap();
    }

    tar_builder.into_inner().unwrap().finish().unwrap();
    output_ball
}

pub fn tar_game<P, Q>(game_dir: P, output_dir: Q) -> PathBuf
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    let game_path = game_dir.as_ref();
    let settings_path = game_path.join("launcher-settings.json");
    let settings_data = fs::read(&settings_path).unwrap();
    let settings: LauncherSettings = serde_json::from_slice(&settings_data).unwrap();
    let major_minor: Vec<_> = settings.raw_version.split('.').take(2).collect();
    tar_game_directory(game_dir, output_dir, &major_minor.join("."))
}
