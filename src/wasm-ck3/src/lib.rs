use ck3save::{models::Metadata, Ck3Error, Ck3File, Encoding, FailedResolveStrategy, MeltOptions};
use serde::Serialize;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

mod tokens;
pub use tokens::*;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ck3Metadata {
    version: String,
    is_meltable: bool,
}

pub struct SaveFileImpl {
    meta_data: Metadata,
    encoding: Encoding,
}

pub fn to_json_value<T: serde::ser::Serialize + ?Sized>(value: &T) -> JsValue {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer).unwrap()
}

#[wasm_bindgen]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> JsValue {
        to_json_value(&self.0.metadata())
    }
}

impl SaveFileImpl {
    pub fn metadata(&self) -> Ck3Metadata {
        Ck3Metadata {
            version: self.meta_data.version.clone(),
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Binary | Encoding::BinaryZip)
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Ck3Error> {
    let file = Ck3File::from_slice(data)?;
    let save = file.parse_save(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        meta_data: save.meta_data,
        encoding: file.encoding(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsError> {
    let s = _parse_save(data)?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, Ck3Error> {
    let file = Ck3File::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    file.melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(JsError::from)
}
