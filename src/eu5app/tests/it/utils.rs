// Test helper for EU5 save fixtures.
// Keep downloaded fixtures outside source directories.

use std::io::BufWriter;
use std::path::Path;
use std::sync::LazyLock;

use eu5app::game_data::Localization;
use eu5app::game_data::game_install::Eu5GameInstall;
use eu5app::{Eu5LoadedSave, Eu5SaveLoader, Eu5Workspace};
use eu5save::models::Gamestate;
use eu5save::{BasicTokenResolver, Eu5File};
use highway::HighwayHash;
use jomini::binary::TokenResolver;
use pdx_map::LocationArrays;

pub use super::fixtures::request_file;

pub fn require_test_assets() -> bool {
    std::env::var("PDX_REQUIRE_TEST_ASSETS").as_deref() == Ok("1")
}

static TOKENS: LazyLock<BasicTokenResolver> = LazyLock::new(|| {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("assets")
        .join("tokens")
        .join("eu5.txt");
    let file_data = std::fs::read(&path).unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice()).unwrap();
    if resolver.is_empty() {
        eprintln!("EU5 binary tokens not loaded");
    }
    resolver
});

/// The EU5 binary token resolver, empty when the token file is not present.
pub fn tokens() -> &'static BasicTokenResolver {
    &TOKENS
}

pub struct LoadedWorkspace {
    pub workspace: Eu5Workspace<'static>,
    pub localization: Localization,
    _loaded_save: Eu5LoadedSave,
}

pub fn build_workspace(save_name: &str) -> Option<LoadedWorkspace> {
    let file = request_file(save_name);
    let file = Eu5File::from_file(file).unwrap_or_else(|e| panic!("{save_name}: {e}"));
    let is_binary = file.header().kind().is_binary();
    let resolver = tokens();
    if is_binary && resolver.is_empty() {
        let message = format!("{save_name}: EU5 binary tokens not loaded");
        if require_test_assets() {
            panic!("{message}");
        }
        eprintln!("{message}");
        return None;
    }

    let loader = Eu5SaveLoader::open(file, resolver).unwrap_or_else(|e| panic!("{save_name}: {e}"));
    let version = loader.meta().version;

    let install = game_install(version)?;
    let (_textures, game_data, localization) = install.into_inner();

    let mut loaded_save = loader
        .parse_tracked()
        .unwrap_or_else(|e| panic!("{save_name}: {e}"));
    let gamestate = loaded_save.take_gamestate();
    // SAFETY: `gamestate` points into `loaded_save`'s arena. `LoadedWorkspace` owns both values
    // and declares `workspace` before `loaded_save`, so Rust drops the workspace before freeing
    // the arena.
    let gamestate = unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(gamestate) };
    let workspace =
        Eu5Workspace::new(gamestate, game_data).unwrap_or_else(|e| panic!("{save_name}: {e}"));

    Some(LoadedWorkspace {
        workspace,
        localization,
        _loaded_save: loaded_save,
    })
}

/// Match the asset requirements used by the existing workspace tests.
pub fn game_install(version: eu5save::models::GameVersion) -> Option<Eu5GameInstall> {
    let bundle_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("assets")
        .join("game-bundles")
        .join(format!("eu5-{}.{}.zip", version.major, version.minor));
    if !bundle_path.exists() {
        let message = format!(
            "missing {}; run mise run admin:assets:sync, or add the bundle with mise run admin:assets:publish",
            bundle_path.display()
        );
        if require_test_assets() {
            panic!("{message}");
        }
        eprintln!("{message}");
        return None;
    }

    Some(
        Eu5GameInstall::open(&bundle_path)
            .unwrap_or_else(|e| panic!("{}: {e}", bundle_path.display())),
    )
}

/// Summarize a map mode for a snapshot. A change in the snapshot shows the
/// number of colors and the most common colors. The
/// fingerprint makes sure that a change outside the summary also fails.
pub fn summarize_location_arrays(arrays: &LocationArrays) -> serde_json::Value {
    let buffers = arrays.buffers();
    let primary: &[u32] = bytemuck::cast_slice(buffers.primary_colors());
    let mut counts: std::collections::HashMap<u32, usize> = std::collections::HashMap::new();
    for color in primary {
        *counts.entry(*color).or_default() += 1;
    }

    let mut common: Vec<(u32, usize)> = counts.iter().map(|(c, n)| (*c, *n)).collect();
    common.sort_unstable_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let top: Vec<String> = common
        .iter()
        .take(3)
        .map(|(color, count)| format!("#{color:08x} x{count}"))
        .collect();

    let hash = hash_location_arrays(arrays);

    serde_json::json!({
        "colors": counts.len(),
        "top": top,
        "fingerprint": &hash[..18],
    })
}

/// Hash all four GPU color/flag buffers from `LocationArrays` into a single hex string.
pub fn hash_location_arrays(arrays: &LocationArrays) -> String {
    let hasher = highway::HighwayHasher::new(highway::Key::default());
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    let h = writer.get_mut();
    let buffers = arrays.buffers();
    h.append(bytemuck::cast_slice(buffers.primary_colors()));
    h.append(bytemuck::cast_slice(buffers.secondary_colors()));
    h.append(bytemuck::cast_slice(buffers.border_colors()));
    h.append(bytemuck::cast_slice(buffers.state_flags()));
    let result = writer.into_inner().unwrap().finalize256();
    format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        result[0], result[1], result[2], result[3]
    )
}
