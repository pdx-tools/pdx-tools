use ck3save::{models::HeaderOwned, Ck3Error, Ck3File, Encoding, FailedResolveStrategy};
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
    header: HeaderOwned,
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
            version: self.header.meta_data.version.clone(),
            is_meltable: self.is_meltable(),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Binary | Encoding::BinaryZip)
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Ck3Error> {
    let file = Ck3File::from_slice(data)?;
    let mut zip_sink = Vec::new();
    let meta = file.parse(&mut zip_sink)?;
    let header = meta.deserializer(tokens::get_tokens()).deserialize()?;
    Ok(SaveFile(SaveFileImpl {
        header,
        encoding: file.encoding(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, Ck3Error> {
    let file = Ck3File::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    file.melter()
        .on_failed_resolve(FailedResolveStrategy::Ignore)
        .melt(&mut out, tokens::get_tokens())?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
