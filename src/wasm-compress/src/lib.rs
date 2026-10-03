//! Browser bindings for [`pdx_save_codec`].

use serde::{Serialize, Serializer};
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
