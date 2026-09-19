use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::{env, fs};

fn main() {
    // Rerun when a version directory is added or removed.
    println!("cargo:rerun-if-changed=../../assets/game/eu4");
    let entries = fs::read_dir("../../assets/game/eu4").unwrap();
    let entries = entries.filter_map(|x| x.ok());

    let mut versions = Vec::new();
    for entry in entries {
        let filename = entry.file_name();
        let Some((major, minor)) = filename.to_str().and_then(|filename| {
            let (major, minor) = filename.split_once('.')?;
            Some((major.parse::<i32>().ok()?, minor.parse::<i32>().ok()?))
        }) else {
            continue;
        };
        versions.push((major, minor));
    }

    versions.sort_unstable();

    let embedded_path = Path::new(&env::var("OUT_DIR").unwrap()).join("embedded_game.rs");
    let mut embedded_file = File::create(embedded_path).unwrap();

    let latest_minor = versions.last().map(|(_major, minor)| *minor).unwrap_or(29);

    let _ = writeln!(
        embedded_file,
        "pub const LATEST_MINOR: u16 = {};",
        latest_minor
    );

    let embed_game = env::var_os("CARGO_FEATURE_EMBEDDED").is_some();
    let embed_screenshot = env::var_os("CARGO_FEATURE_EMBEDDED_SCREENSHOT").is_some();
    if !embed_game && !embed_screenshot {
        return;
    }

    for (major, minor) in &versions {
        let version = format!("{}.{}", major, minor);
        let rust_friendly_version = version.replace('.', "");
        let versioned = Path::new(&env::var("OUT_DIR").unwrap()).join(rust_friendly_version);
        std::fs::create_dir_all(&versioned).unwrap();

        if embed_game {
            let p = Path::new("../../assets/game/eu4")
                .join(&version)
                .join("data-raw.bin");
            std::fs::copy(p, versioned.join("data.bin")).unwrap();
        }

        if embed_screenshot {
            for filename in [
                "color-index.bin",
                "provinces-1.r16.zst",
                "provinces-2.r16.zst",
            ] {
                let p = Path::new("../../assets/game/eu4")
                    .join(&version)
                    .join("map")
                    .join(filename);
                if p.exists() {
                    std::fs::copy(p, versioned.join(filename)).unwrap();
                } else {
                    File::create(versioned.join(filename)).unwrap();
                }
            }
        }
    }

    let _ = writeln!(embedded_file, r#"#[cfg(feature = "embedded")]"#);
    let _ = writeln!(
        embedded_file,
        "pub fn game_data(minor_version: u16) -> &'static [u8] {{"
    );

    if versions.is_empty() {
        let _ = writeln!(embedded_file, "let _ = minor_version; todo!()");
        let _ = writeln!(embedded_file, "}}");
    } else {
        let _ = writeln!(embedded_file, "match minor_version {{");

        for (i, (major, minor)) in versions.iter().enumerate() {
            let version = format!("{}.{}", major, minor);
            let rust_friendly_version = version.replace('.', "");

            if i == versions.len() - 1 {
                let _ = write!(embedded_file, "_");
            } else {
                let _ = write!(embedded_file, "{}", minor);
            }

            let _ = writeln!(
                embedded_file,
                r#" => &include_bytes!(concat!(env!("OUT_DIR"), "/{}/data.bin"))[..],"#,
                rust_friendly_version
            );
        }

        let _ = writeln!(embedded_file, "}}");
        let _ = writeln!(embedded_file, "}}");
    }

    let _ = writeln!(embedded_file, r#"#[cfg(feature = "embedded-screenshot")]"#);
    let _ = writeln!(
        embedded_file,
        "#[derive(Debug)]\npub struct ScreenshotAssets {{"
    );
    let _ = writeln!(embedded_file, "    pub color_index: &'static [u8],");
    let _ = writeln!(embedded_file, "    pub west_r16_zst: &'static [u8],");
    let _ = writeln!(embedded_file, "    pub east_r16_zst: &'static [u8],");
    let _ = writeln!(embedded_file, "}}");
    let _ = writeln!(embedded_file, r#"#[cfg(feature = "embedded-screenshot")]"#);
    let _ = writeln!(
        embedded_file,
        "pub fn screenshot_assets(minor_version: u16) -> ScreenshotAssets {{"
    );
    if versions.is_empty() {
        let _ = writeln!(
            embedded_file,
            "let _ = minor_version;\nScreenshotAssets {{\n    color_index: &[],\n    west_r16_zst: &[],\n    east_r16_zst: &[],\n}}"
        );
    } else {
        let _ = writeln!(embedded_file, "match minor_version {{");

        for (i, (major, minor)) in versions.iter().enumerate() {
            let version = format!("{}.{}", major, minor);
            let rust_friendly_version = version.replace('.', "");

            if i == versions.len() - 1 {
                let _ = write!(embedded_file, "_");
            } else {
                let _ = write!(embedded_file, "{}", minor);
            }

            let _ = writeln!(embedded_file, " => ScreenshotAssets {{");
            let _ = writeln!(
                embedded_file,
                r#"    color_index: &include_bytes!(concat!(env!("OUT_DIR"), "/{}/color-index.bin"))[..],"#,
                rust_friendly_version
            );
            let _ = writeln!(
                embedded_file,
                r#"    west_r16_zst: &include_bytes!(concat!(env!("OUT_DIR"), "/{}/provinces-1.r16.zst"))[..],"#,
                rust_friendly_version
            );
            let _ = writeln!(
                embedded_file,
                r#"    east_r16_zst: &include_bytes!(concat!(env!("OUT_DIR"), "/{}/provinces-2.r16.zst"))[..],"#,
                rust_friendly_version
            );
            let _ = writeln!(embedded_file, "}},");
        }

        let _ = writeln!(embedded_file, "}}");
    }
    let _ = writeln!(embedded_file, "}}");
}
