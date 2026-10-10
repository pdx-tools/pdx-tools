use arena_serde::ArenaDeserialize;
#[cfg(not(feature = "sha256"))]
use blake3::Hasher;
use serde::Serialize;
#[cfg(feature = "sha256")]
use sha2::{Digest, Sha256 as Hasher};
use std::{cell::RefCell, io::Read, rc::Rc};
use wasm_bindgen::prelude::*;
mod lean_market;
mod projection;
use tsify::{Ts, Tsify};

#[path = "../../../src/wasm-eu5/src/snapshot.rs"]
mod snapshot;

struct State {
    callback: js_sys::Function,
    chunk_size: usize,
    chunk: Vec<u8>,
    position: usize,
    offset: u64,
    calls: u32,
    hash: Option<Hasher>,
}
#[derive(Clone)]
struct ChunkReader(Rc<RefCell<State>>);
impl Read for ChunkReader {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        if output.is_empty() {
            return Ok(0);
        }
        let mut state = self.0.borrow_mut();
        if state.position == state.chunk.len() {
            let value = state
                .callback
                .call2(
                    &JsValue::NULL,
                    &JsValue::from_f64(state.offset as f64),
                    &JsValue::from_f64(state.chunk_size as f64),
                )
                .map_err(|e| std::io::Error::other(format!("File chunk read failed: {e:?}")))?;
            if !value.is_instance_of::<js_sys::Uint8Array>() {
                return Err(std::io::Error::other(
                    "Chunk callback must return Uint8Array",
                ));
            }
            let bytes: js_sys::Uint8Array = value.unchecked_into();
            if bytes.length() as usize > state.chunk_size {
                return Err(std::io::Error::other("Chunk callback exceeded byte budget"));
            }
            state.chunk.resize(bytes.length() as usize, 0);
            bytes.copy_to(&mut state.chunk);
            state.position = 0;
            state.offset += state.chunk.len() as u64;
            state.calls += 1;
            if state.hash.is_some() {
                let State { hash, chunk, .. } = &mut *state;
                hash.as_mut().unwrap().update(chunk);
            }
        }
        let count = output.len().min(state.chunk.len() - state.position);
        output[..count].copy_from_slice(&state.chunk[state.position..state.position + count]);
        state.position += count;
        Ok(count)
    }
}
#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct StreamResult {
    snapshot: snapshot::SaveSnapshot,
    hash: Option<String>,
    bytes_read: u64,
    chunk_calls: u32,
}
/// Experimental forward-only text-save loader; no complete input Vec is retained.
#[wasm_bindgen]
pub fn stream_snapshot(
    callback: js_sys::Function,
    chunk_size: u32,
    hash_source: bool,
    selective: bool,
) -> Result<Ts<StreamResult>, JsError> {
    if !(64 * 1024..=16 * 1024 * 1024).contains(&chunk_size) {
        return Err(JsError::new("Chunk size must be 64 KiB to 16 MiB"));
    }
    let state = Rc::new(RefCell::new(State {
        callback,
        chunk_size: chunk_size as usize,
        chunk: Vec::new(),
        position: 0,
        offset: 0,
        calls: 0,
        hash: hash_source.then(Hasher::new),
    }));
    let mut reader = ChunkReader(state.clone());
    let snapshot = if selective {
        let file = eu5save::Eu5DebugFile::from_reader(reader.clone())
            .map_err(|e| JsError::new(&e.to_string()))?;
        let arena = bumpalo::Bump::with_capacity(1024 * 1024);
        let mut deser =
            jomini::TextDeserializer::from_utf8_reader(jomini::text::TokenReader::new(file));
        let game = projection::ProjectedGame::deserialize_in_arena(&mut deser, &arena)
            .map_err(|e| JsError::new(&e.to_string()))?;
        if game.metadata.playthrough_id.to_str().is_empty() {
            return Err(JsError::new("Save has no campaign ID"));
        }
        projection::extract(&game)
    } else {
        let loader = eu5app::Eu5DebugSaveLoader::open(reader.clone())
            .map_err(|e| JsError::new(&e.to_string()))?;
        let mut loaded = loader.parse().map_err(|e| JsError::new(&e.to_string()))?;
        let game = loaded.take_gamestate();
        snapshot::extract(&game)
    };
    // Include any trailing bytes in the raw-content checksum, not just parsed content.
    std::io::copy(&mut reader, &mut std::io::sink()).map_err(|e| JsError::new(&e.to_string()))?;
    let mut state = state.borrow_mut();
    let hash = state.hash.take().map(|h| {
        #[cfg(not(feature = "sha256"))]
        {
            h.finalize().to_hex().to_string()
        }
        #[cfg(feature = "sha256")]
        {
            format!("{:x}", h.finalize())
        }
    });
    StreamResult {
        snapshot,
        hash,
        bytes_read: state.offset,
        chunk_calls: state.calls,
    }
    .into_ts()
    .map_err(JsError::from)
}
