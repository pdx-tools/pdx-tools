use wasm_bindgen::JsValue;

pub(crate) fn to_json_value<T: serde::ser::Serialize + ?Sized>(value: &T) -> JsValue {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer).unwrap()
}
