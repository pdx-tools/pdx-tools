use serde::{Deserialize, Serialize};
use vic3save::{
    FailedResolveStrategy, PdsDate, SaveHeader, SaveHeaderKind, Vic3Date, Vic3Error, Vic3File,
};
use wasm_bindgen::prelude::*;

mod tokens;
pub use tokens::*;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vic3Save {
    date: Vic3Date,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vic3Metadata {
    date: Vic3Date,
    is_meltable: bool,
}

pub struct SaveFileImpl {
    save: Vic3Save,
    header: SaveHeader,
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
    pub fn metadata(&self) -> Vic3Metadata {
        Vic3Metadata {
            date: Vic3Date::from_ymdh(
                self.save.date.year(),
                self.save.date.month(),
                self.save.date.day(),
                0,
            ),
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(
            self.header.kind(),
            SaveHeaderKind::Binary | SaveHeaderKind::SplitBinary | SaveHeaderKind::UnifiedBinary
        )
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let header = file.header();
    let mut zip_sink = Vec::new();
    let parsed = file.parse(&mut zip_sink)?;
    let save = parsed.deserializer().build(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        save,
        header: header.clone(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<vic3save::MeltedDocument, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let mut zip_sink = Vec::new();
    let parsed_file = file.parse(&mut zip_sink)?;
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
