use eu5app::map_projection::MapProjection;
use wasm_bindgen::prelude::*;

pub fn into_js(projection: &MapProjection) -> Result<JsValue, JsError> {
    let result = js_sys::Object::new();
    let set = |name: &str, value: JsValue| {
        js_sys::Reflect::set(&result, &JsValue::from_str(name), &value)
            .map_err(|error| JsError::new(&format!("Could not create map projection: {error:?}")))
    };
    set("layoutKey", projection.layout_key.clone().into())?;
    set(
        "locationIds",
        js_sys::Uint32Array::from(projection.location_ids.as_slice()).into(),
    )?;
    set(
        "fractions",
        js_sys::Uint16Array::from(projection.fractions.as_slice()).into(),
    )?;
    set(
        "metrics",
        js_sys::Float32Array::from(projection.metrics.as_slice()).into(),
    )?;
    for (name, values) in [
        ("owners", &projection.owners),
        ("controllers", &projection.controllers),
        ("religions", &projection.religions),
        ("markets", &projection.markets),
        ("countries", &projection.countries),
        ("religionColors", &projection.religion_colors),
        ("marketColors", &projection.market_colors),
    ] {
        set(name, js_sys::Uint32Array::from(values.as_slice()).into())?;
    }
    Ok(result.into())
}
