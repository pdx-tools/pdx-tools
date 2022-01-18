use hoi4save::{models::Hoi4Save, Encoding, FailedResolveStrategy, Hoi4Date};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hoi4Metadata {
    date: Hoi4Date,
    is_meltable: bool,
}

pub struct SaveFileImpl {
    save: Hoi4Save,
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
    pub fn metadata(&self) -> Hoi4Metadata {
        Hoi4Metadata {
            date: self.save.date,
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Binary)
    }
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let (save, encoding) = hoi4save::Hoi4Extractor::builder()
        .extract_save(data)
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))?;

    Ok(SaveFile(SaveFileImpl { save, encoding }))
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    let melter = hoi4save::Melter::new().with_on_failed_resolve(FailedResolveStrategy::Ignore);
    melter
        .melt(data)
        .map(|(x, _)| js_sys::Uint8Array::from(&x[..]))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
