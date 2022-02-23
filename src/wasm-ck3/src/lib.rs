use ck3save::{models::HeaderOwned, Encoding, FailedResolveStrategy};
use serde::Serialize;
use wasm_bindgen::prelude::*;

mod tokens;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ck3Metadata {
    version: String,
    is_meltable: bool,
}

pub struct SaveFileImpl {
    header: HeaderOwned,
    encoding: Encoding,
}

#[wasm_bindgen]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> JsValue {
        JsValue::from_serde(&self.0.metadata()).unwrap()
    }
}

impl SaveFileImpl {
    pub fn metadata(&self) -> Ck3Metadata {
        Ck3Metadata {
            version: self.header.meta_data.version.clone(),
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Binary | Encoding::BinaryZip)
    }
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let (header, encoding) = ck3save::Ck3Extractor::builder()
        .extract_header_with_tokens_as(data, tokens::get_tokens())
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))?;

    Ok(SaveFile(SaveFileImpl { header, encoding }))
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    let melter = ck3save::Melter::new().with_on_failed_resolve(FailedResolveStrategy::Ignore);
    melter
        .melt_with_tokens(data, tokens::get_tokens())
        .map(|(x, _)| js_sys::Uint8Array::from(&x[..]))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
