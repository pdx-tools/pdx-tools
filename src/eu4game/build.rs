use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::{env, fs};

use regex::Regex;

fn main() {
    let entries = fs::read_dir("../../assets/game/eu4").unwrap();
    let re = Regex::new(r"(\d+)\.(\d+)").unwrap();
    let entries = entries.filter_map(|x| x.ok());

    let mut versions = Vec::new();
    for entry in entries {
        let filename = entry.file_name();
        let captures = re.captures(filename.to_str().unwrap());
        let captures = match captures {
            Some(x) => x,
            None => continue,
        };

        let major: i32 = captures.get(1).unwrap().as_str().parse().unwrap();
        let minor: i32 = captures.get(2).unwrap().as_str().parse().unwrap();
        versions.push((major, minor));
    }

    versions.sort_unstable();

    for (major, minor) in &versions {
        let version = format!("{}.{}", major, minor);
        let p = Path::new("../../assets/game/eu4")
            .join(&version)
            .join("data-raw.bin");
        println!("cargo:rerun-if-changed={}", p.display());
        let rust_friendly_version = version.replace('.', "");
        let versioned = Path::new(&env::var("OUT_DIR").unwrap()).join(rust_friendly_version);
        std::fs::create_dir_all(&versioned).unwrap();
        let out_path = versioned.join("data.bin");
        std::fs::copy(p, out_path).unwrap();
    }

    let embedded_path = Path::new(&env::var("OUT_DIR").unwrap()).join("embedded_game.rs");
    let mut embedded_file = File::create(embedded_path).unwrap();
    let _ = writeln!(embedded_file, "impl<'a> crate::game::Game<'a> {{");
    let _ = writeln!(embedded_file, r#"#[cfg(feature = "embedded")]"#);
    let _ = writeln!(
        embedded_file,
        "pub fn new(version: &eu4save::models::SavegameVersion) -> Self {{"
    );
    let _ = writeln!(embedded_file, "let data: &[u8] = match version.second {{");

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

    let _ = writeln!(embedded_file, "}};");
    let _ = writeln!(embedded_file, "Self::from_flatbuffer(data)");
    let _ = writeln!(embedded_file, "}}");
    let _ = writeln!(embedded_file, "}}");
}
