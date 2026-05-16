use wasm_bindgen::prelude::*;

/// Decodes a zstd-compressed byte stream.
#[wasm_bindgen]
pub fn decode_zstd(data: &[u8]) -> Result<Vec<u8>, JsError> {
    pdx_zstd::decode_all(data).map_err(|e| JsError::new(&e.to_string()))
}
