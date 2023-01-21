use imperator_save::{
    models::MetadataOwned, Encoding, FailedResolveStrategy, ImperatorDate, ImperatorError,
    ImperatorFile,
};
use serde::Serialize;
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

pub struct SaveFileImpl {
    header: MetadataOwned,
    encoding: Encoding,
}

#[wasm_bindgen]
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
        matches!(self.encoding, Encoding::Binary | Encoding::BinaryZip)
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, ImperatorError> {
    let file = ImperatorFile::from_slice(data)?;
    let meta = file.meta().parse()?;
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

fn _melt(data: &[u8]) -> Result<imperator_save::MeltedDocument, ImperatorError> {
    let file = ImperatorFile::from_slice(data)?;
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
