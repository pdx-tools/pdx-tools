use hoi4save::{models::Hoi4Save, Encoding, FailedResolveStrategy, Hoi4Date, Hoi4Error, Hoi4File};
use serde::Serialize;
use wasm_bindgen::prelude::*;

mod tokens;

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

fn _parse_save(data: &[u8]) -> Result<SaveFile, Hoi4Error> {
    let file = Hoi4File::from_slice(data)?;
    let save = file.parse()?.deserializer().build(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        save,
        encoding: file.encoding(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<hoi4save::MeltedDocument, Hoi4Error> {
    let file = Hoi4File::from_slice(data)?;
    let parsed_file = file.parse()?;
    let binary = parsed_file.as_binary().unwrap();
    let out = binary
        .melter()
        .on_failed_resolve(FailedResolveStrategy::Ignore)
        .melt(tokens::get_tokens())?;
    Ok(out)
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.data()))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
