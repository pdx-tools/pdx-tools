use std::{env, fs, path::PathBuf};
fn main() {
    let source = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../src/wasm-eu5/src/snapshot.rs");
    println!("cargo:rerun-if-changed={}", source.display());
    let source = fs::read_to_string(source).unwrap();
    let (types, body) = source
        .split_once("fn finite")
        .expect("Snapshot extractor layout changed");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("snapshot_types.rs"),
        types,
    )
    .unwrap();
    let source = format!("fn finite{body}");
    assert!(
        source.contains("&eu5save::models::Gamestate<'_>"),
        "Snapshot extraction signature changed"
    );
    let source = source.replace("&eu5save::models::Gamestate<'_>", "&ProjectedGame<'_>");
    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("snapshot_extract.rs"),
        source,
    )
    .unwrap();
}
