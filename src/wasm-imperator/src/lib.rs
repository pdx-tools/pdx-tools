use imperator_save::{
    models::{Metadata, Save},
    DeserializeImperator, FailedResolveStrategy, ImperatorDate, ImperatorError, ImperatorFile,
    ImperatorMelt, MeltOptions, SaveHeader,
};
use serde::Serialize;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

mod tokens;
pub use tokens::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImperatorMetadata {
    date: ImperatorDate,
    version: String,
    is_meltable: bool,
}

#[derive(Debug)]
pub struct SaveFileImpl {
    header: Metadata,
    encoding: SaveHeader,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveFile(SaveFileImpl);

pub fn to_json_value<T: serde::ser::Serialize + ?Sized>(value: &T) -> JsValue {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer).unwrap()
}

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> JsValue {
        to_json_value(&self.0.metadata())
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
        self.encoding.kind().is_binary()
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, ImperatorError> {
    let file = ImperatorFile::from_slice(data)?;
    let save: Save = (&file).deserialize(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        header: save.meta,
        encoding: file.header().clone(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsError> {
    let s = _parse_save(data)?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, ImperatorError> {
    let file = ImperatorFile::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    (&file).melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(JsError::from)
}
