use imperator_save::{models::HeaderOwned, Encoding, FailedResolveStrategy, ImperatorDate};
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImperatorMetadata {
    date: ImperatorDate,
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
    pub fn metadata(&self) -> ImperatorMetadata {
        ImperatorMetadata {
            date: self.header.date,
            version: self.header.version.clone(),
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Standard)
    }
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let (header, encoding) = imperator_save::ImperatorExtractor::extract_header(data)
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))?;

    Ok(SaveFile(SaveFileImpl { header, encoding }))
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    let melter =
        imperator_save::Melter::new().with_on_failed_resolve(FailedResolveStrategy::Ignore);
    melter
        .melt(data)
        .map(|(x, _)| js_sys::Uint8Array::from(&x[..]))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
