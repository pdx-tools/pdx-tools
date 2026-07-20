use bumpalo_serde::ArenaDeserialize;
use eu5save::{Eu5BinaryDeserialization, SaveResolver, models::Gamestate};
use wasm_bindgen::prelude::*;

mod tokens;
pub use tokens::set_tokens;

/// Retry EU5 gamestate deserialization with breadcrumb error tracking.
///
/// This intentionally lives in a separately loaded Wasm module instead of `wasm-eu5`.
///
/// - increased successful parse time by 31–37% (if always enabled)
/// - increased post-`wasm-bindgen` size from 2.08 MB to 3.22 MB (+55%); and
/// - increased a clean build from 49.5 s to 75.4 s (+52%).
///
/// Keeping diagnostics separate leaves the primary module at 2.08 MB and reduced the clean
/// joint build to 60.1 s. The web worker therefore loads this module only after the fast parser
/// fails.
#[wasm_bindgen]
pub fn diagnose_save(save: Vec<u8>) -> Result<(), JsError> {
    diagnose_save_impl(save)
        .map_err(|error| JsError::new(&format!("Failed to parse game state: {error}")))
}

fn diagnose_save_impl(save: Vec<u8>) -> Result<(), String> {
    let file = eu5save::Eu5File::from_slice(save)
        .map_err(|error| format!("Unable to parse save file: {error}"))?;
    let game_content = file
        .gamestate()
        .map_err(|error| format!("Unable to extract gamestate: {error}"))?;
    let resolver = SaveResolver::from_file(&file, tokens::get_tokens())
        .map_err(|error| format!("Unable to parse string lookup: {error}"))?;

    let arena = bumpalo::Bump::with_capacity(100 * 1024 * 1024);
    let mut path_buf = Vec::new();
    let track = bumpalo_serde::tracked::Track::new_with(&mut path_buf);

    let game = match game_content {
        eu5save::SaveContentKind::Text(mut content) => {
            let mut deserializer = content.deserializer();
            let tracked = bumpalo_serde::tracked::Deserializer::new(&mut deserializer, &track);
            Gamestate::deserialize_in_arena(tracked, &arena)
        }
        eu5save::SaveContentKind::Binary(mut content) => {
            let mut deserializer = content.deserializer(&resolver);
            let tracked = bumpalo_serde::tracked::Deserializer::new(&mut deserializer, &track);
            Gamestate::deserialize_in_arena(tracked, &arena)
        }
    };

    game.map(|_| ()).map_err(|error| {
        format!(
            "Unable to deserialize gamestate at {}: {error}",
            track.path()
        )
    })
}
