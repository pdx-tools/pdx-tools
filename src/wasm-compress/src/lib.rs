//! Browser bindings for [`pdx_save_codec`], and a gamestate decoder that
//! runs beside the parser.

use serde::{Serialize, Serializer};
use std::io::Read;
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

/// Re-encodes the data into a smaller, faster format. See
/// [`pdx_save_codec::Compression`].
#[wasm_bindgen]
pub fn init_compression(data: Vec<u8>) -> Result<Compression, JsError> {
    Ok(Compression(pdx_save_codec::Compression::new(data)?))
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Compression(pdx_save_codec::Compression);

#[wasm_bindgen]
impl Compression {
    pub fn content_type(&self) -> Result<Ts<ContentType>, JsError> {
        let content_type = match self.0.content_type() {
            pdx_save_codec::ContentType::Zip => ContentType::Zip,
            pdx_save_codec::ContentType::Zstd => ContentType::Zstd,
        };
        Ok(content_type.into_ts()?)
    }

    /// Compress the data. `f` is called with the progress from 0 to 1.
    pub fn compress_cb(self, f: Option<js_sys::Function>) -> Result<Vec<u8>, JsError> {
        Ok(self.0.compress_with_progress(progress_fn(f))?)
    }
}

/// The MIME type values that TypeScript receives.
#[derive(Tsify, Debug)]
pub enum ContentType {
    #[serde(rename = "application/zip")]
    Zip,
    #[serde(rename = "application/zstd")]
    Zstd,
}

impl Serialize for ContentType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let content_type = match self {
            Self::Zip => pdx_save_codec::ContentType::Zip,
            Self::Zstd => pdx_save_codec::ContentType::Zstd,
        };
        serializer.serialize_str(content_type.mime())
    }
}

/// Restore the compression used before upload.
/// `f` is called with the progress from 0 to 1. See
/// [`pdx_save_codec::download`].
#[wasm_bindgen]
pub fn download_save(data: Vec<u8>, f: Option<js_sys::Function>) -> Result<Vec<u8>, JsError> {
    Ok(pdx_save_codec::download_with_progress(
        data,
        progress_fn(f),
    )?)
}

/// Turn an optional JavaScript callback into a progress function.
fn progress_fn(f: Option<js_sys::Function>) -> impl FnMut(f64) {
    move |progress| {
        if let Some(cb) = &f {
            let _ = cb.call1(&JsValue::null(), &JsValue::from_f64(progress));
        }
    }
}

#[wasm_bindgen(typescript_custom_section)]
const GAMESTATE_SINK: &str = r#"
/** Receives the decompressed gamestate in order. */
export interface GamestateSink {
  /** Copy `chunk` out before returning, as the next chunk overwrites it. */
  write(chunk: Uint8Array): void;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// Receives the decompressed gamestate in order.
    #[wasm_bindgen(typescript_type = "GamestateSink")]
    pub type GamestateSink;

    /// Copy `chunk` out before the call returns, because the chunk is a view
    /// of wasm memory that the next chunk overwrites.
    #[wasm_bindgen(method, catch)]
    fn write(this: &GamestateSink, chunk: &[u8]) -> Result<(), JsValue>;
}

/// Decompress the gamestate of a save with an envelope, such as an EU5
/// save, into `sink`. Another worker parses the chunks while this one
/// decompresses, which overlaps the two.
#[wasm_bindgen]
pub fn decompress_gamestate(save: web_sys::Blob, sink: &GamestateSink) -> Result<(), JsError> {
    // Read in windows, so the save is not held in memory.
    let reader = wasm_pdx_core::blob::BlobReader::streaming(save)?;
    let size = reader.size();
    let file = jomini::envelope::JominiFile::from_reader_at(reader, size)?;
    let mut gamestate = file.gamestate()?;
    // One chunk fills one slot of the ring that the worker writes to.
    const CHUNK_LEN: u64 = 1024 * 1024;
    let mut buf = Vec::with_capacity(CHUNK_LEN as usize);
    loop {
        buf.clear();
        (&mut gamestate).take(CHUNK_LEN).read_to_end(&mut buf)?;
        if buf.is_empty() {
            return Ok(());
        }
        sink.write(&buf)
            .map_err(|e| JsError::new(&format!("Failed to write gamestate: {e:?}")))?;
    }
}
