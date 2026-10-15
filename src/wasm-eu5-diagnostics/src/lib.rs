use arena_serde::ArenaDeserialize;
use eu5save::{Eu5BinaryDeserialization, ReaderAt, SaveResolver, models::Gamestate};
use jomini::{TextDeserializer, text::TokenReader};
use wasm_bindgen::prelude::*;
use wasm_pdx_core::blob::BlobReader;

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
///
/// The save is read from a `Blob` as the parse needs it. Thus, the complete
/// save is not in wasm memory.
#[wasm_bindgen]
pub fn diagnose_save(save: web_sys::Blob) -> Result<(), JsError> {
    diagnose_save_impl(save)
        .map_err(|error| JsError::new(&format!("Failed to parse game state: {error}")))
}

fn diagnose_save_impl(save: web_sys::Blob) -> Result<(), String> {
    let save = BlobReader::streaming(save)
        .map_err(|error| format!("Unable to read save file: {error}"))?;
    let size = save.size();
    let mut magic = [0u8; 4];
    let magic = &mut magic[..size.min(4) as usize];
    save.read_exact_at(magic, 0)
        .map_err(|error| format!("Unable to read save file: {error}"))?;

    let arena = bumpalo::Bump::with_capacity(100 * 1024 * 1024);
    let mut path_buf = Vec::new();
    let track = arena_serde::tracked::Track::new_with(&mut path_buf);

    // An uploaded save is a Zstd stream of a text save. Read it through the
    // debug text reader, which decodes the stream as it parses.
    let game = if pdx_zstd::is_zstd_compressed(magic) {
        let decoder = pdx_zstd::Decoder::new(rawzip::RangeReader::new(save, 0..size))
            .map_err(|error| format!("Unable to decompress save file: {error}"))?;
        let file = eu5save::Eu5DebugFile::from_reader(decoder)
            .map_err(|error| format!("Unable to parse save file: {error}"))?;
        let mut deserializer = TextDeserializer::from_utf8_reader(TokenReader::new(file));
        let tracked = arena_serde::tracked::Deserializer::new(&mut deserializer, &track);
        Gamestate::deserialize_in_arena(tracked, &arena)
    } else {
        let file = eu5save::Eu5File::from_reader_at(save, size)
            .map_err(|error| format!("Unable to parse save file: {error}"))?;
        let game_content = file
            .gamestate()
            .map_err(|error| format!("Unable to extract gamestate: {error}"))?;
        let resolver = SaveResolver::from_file(&file, tokens::get_tokens())
            .map_err(|error| format!("Unable to parse string lookup: {error}"))?;

        match game_content {
            eu5save::SaveContentKind::Text(mut content) => {
                let mut deserializer = content.deserializer();
                let tracked = arena_serde::tracked::Deserializer::new(&mut deserializer, &track);
                Gamestate::deserialize_in_arena(tracked, &arena)
            }
            eu5save::SaveContentKind::Binary(mut content) => {
                let mut deserializer = content.deserializer(&resolver);
                let tracked = arena_serde::tracked::Deserializer::new(&mut deserializer, &track);
                Gamestate::deserialize_in_arena(tracked, &arena)
            }
        }
    };

    game.map(|_| ()).map_err(|error| {
        format!(
            "Unable to deserialize gamestate at {}: {error}",
            track.path()
        )
    })
}
