//! Embed the EU5 asset bundles that exist in `assets/game/eu5`.
//!
//! The list of patches is discovered at build time, so a checkout without EU5
//! assets still compiles. It only produces an empty table, and EU5 screenshots
//! then report that they are unavailable at runtime.

use std::env;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

fn main() {
    if env::var_os("CARGO_FEATURE_EU5").is_none() {
        return;
    }

    let assets_dir = Path::new("../../assets/game/eu5");
    // Rerun when a version directory is added or removed.
    println!("cargo:rerun-if-changed={}", assets_dir.display());

    let mut versions = Vec::new();
    if let Ok(entries) = fs::read_dir(assets_dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let name = entry.file_name();
            let Some((major, minor)) = name.to_str().and_then(|name| {
                let (major, minor) = name.split_once('.')?;
                Some((major.parse::<u32>().ok()?, minor.parse::<u32>().ok()?))
            }) else {
                continue;
            };

            let dir = entry.path();
            let game = dir.join("game.zip");
            let map = dir.join("map.zip");
            if !game.exists() || !map.exists() {
                continue;
            }

            println!("cargo:rerun-if-changed={}", game.display());
            println!("cargo:rerun-if-changed={}", map.display());
            versions.push((major, minor));
        }
    }
    versions.sort_unstable();

    let out_path = Path::new(&env::var("OUT_DIR").unwrap()).join("eu5_assets.rs");
    let mut out = File::create(out_path).unwrap();
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let assets_dir = Path::new(&manifest_dir).join(assets_dir);

    writeln!(out, "const PATCH_ASSETS: &[PatchAssets] = &[").unwrap();
    for (major, minor) in &versions {
        let dir = assets_dir.join(format!("{major}.{minor}"));
        writeln!(
            out,
            "    PatchAssets {{ major: {major}, minor: {minor}, game: include_bytes!({:?}), map: include_bytes!({:?}) }},",
            dir.join("game.zip"),
            dir.join("map.zip"),
        )
        .unwrap();
    }
    writeln!(out, "];").unwrap();
}
