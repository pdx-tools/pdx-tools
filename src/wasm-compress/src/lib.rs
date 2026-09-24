//! Browser bindings for [`pdx_save_codec`].

use serde::Serialize;
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
        match f {
            Some(cb) => Ok(self.0.compress_with_progress(|progress| {
                let _ = cb.call1(&JsValue::null(), &JsValue::from_f64(progress));
            })?),
            None => Ok(self.0.compress()?),
        }
    }
}

#[derive(Tsify, Debug, Serialize)]
pub enum ContentType {
    #[serde(rename = "application/zip")]
    Zip,
    #[serde(rename = "application/zstd")]
    Zstd,
}

/// Undoes the compress function, so that the save file can be loaded into
/// the game. See [`pdx_save_codec::decompress`].
#[wasm_bindgen]
pub fn download_transformation(data: Vec<u8>) -> Result<Vec<u8>, JsError> {
    Ok(pdx_save_codec::decompress(data)?)
}
