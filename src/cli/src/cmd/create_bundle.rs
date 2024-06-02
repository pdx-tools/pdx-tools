use anyhow::Context;
use clap::Args;
use regex::RegexSet;
use serde::Deserialize;
use std::{fs, path::Path, path::PathBuf, process::ExitCode};
use walkdir::WalkDir;

#[derive(Args)]
pub struct CreateBundleArgs {
    #[arg()]
    from: PathBuf,

    #[arg()]
    to: PathBuf,
}

impl CreateBundleArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        tar_game(&self.from, &self.to)?;
        Ok(ExitCode::SUCCESS)
    }
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

pub fn tar_game_directory<P, Q>(
    game_dir: P,
    output_dir: Q,
    version: &str,
) -> anyhow::Result<PathBuf>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    #[allow(clippy::trivial_regex)]
    let regex = RegexSet::new([
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
    .context("unable to create bundle regex set")?;

    let output_name = format!("eu4-{}.tar.zst", version);
    let output_path = output_dir.as_ref();
    fs::create_dir_all(output_path).with_context(|| format!("{}", output_path.display()))?;
    let output_ball = output_path.join(output_name);
    let output_file =
        fs::File::create(&output_ball).with_context(|| format!("{}", output_ball.display()))?;

    let mut zstd_writer =
        zstd::Encoder::new(output_file, 0).context("unable to create zstd bundle encoder")?;

    // Long distance matching cuts down the size of the bundle by 15%
    zstd_writer.long_distance_matching(true)?;

    // Much faster compression
    zstd_writer.multithread(4)?;

    let mut tar_builder = tar::Builder::new(zstd_writer);

    for entry in WalkDir::new(game_dir.as_ref()) {
        let entry = entry?;
        let path = entry.path();

        let path_s = normalize_path(path);
        if regex.is_match(&path_s) {
            continue;
        }

        if path == game_dir.as_ref() {
            continue;
        }

        let relative = path.strip_prefix(game_dir.as_ref())?;
        tar_builder.append_path_with_name(path, relative)?;
    }

    tar_builder.into_inner()?.finish()?;
    Ok(output_ball)
}

pub fn tar_game<P, Q>(game_dir: P, output_dir: Q) -> anyhow::Result<PathBuf>
where
    P: AsRef<Path>,
    Q: AsRef<Path>,
{
    let game_path = game_dir.as_ref();
    let settings_path = game_path.join("launcher-settings.json");
    let settings_data =
        fs::read(&settings_path).with_context(|| format!("{}", settings_path.display()))?;
    let settings: LauncherSettings = serde_json::from_slice(&settings_data)
        .with_context(|| format!("{}", settings_path.display()))?;
    let major_minor: Vec<_> = settings.raw_version.split('.').take(2).collect();
    tar_game_directory(
        game_dir,
        output_dir,
        major_minor.join(".").trim_start_matches('v'),
    )
}
