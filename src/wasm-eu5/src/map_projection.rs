use eu5app::analysis::ProjectionColumns;
use eu5app::map_projection::MapProjectionData;
use wasm_bindgen::prelude::*;

pub fn into_js(projection: MapProjectionData<'_>) -> Result<JsValue, JsError> {
    let result = js_sys::Object::new();
    let set = |name: &str, value: JsValue| {
        js_sys::Reflect::set(&result, &JsValue::from_str(name), &value)
            .map_err(|error| JsError::new(&format!("Could not create map projection: {error:?}")))
    };
    set("layoutKey", projection.layout_key.into())?;
    set(
        "locationIds",
        js_sys::Uint32Array::from(projection.location_ids).into(),
    )?;
    set(
        "fractions",
        js_sys::Uint16Array::from(projection.fractions).into(),
    )?;
    set(
        "metrics",
        js_sys::Float32Array::from(projection.metrics).into(),
    )?;
    for (name, values) in [
        ("owners", projection.owners),
        ("controllers", projection.controllers),
        ("religions", projection.religions),
        ("markets", projection.markets),
        ("countries", projection.countries),
        ("religionColors", projection.religion_colors),
        ("marketColors", projection.market_colors),
    ] {
        set(name, js_sys::Uint32Array::from(values).into())?;
    }
    Ok(result.into())
}

fn field<T: JsCast>(object: &JsValue, name: &str) -> Result<T, JsError> {
    js_sys::Reflect::get(object, &JsValue::from_str(name))
        .ok()
        .and_then(|value| value.dyn_into::<T>().ok())
        .ok_or_else(|| JsError::new("Incomplete analytical map columns"))
}

/// Copy the map projection of a reader worker into its layout key, its
/// location IDs and its columns.
pub fn from_js(projection: &JsValue) -> Result<(String, Vec<u32>, ProjectionColumns), JsError> {
    let ids = |name| field::<js_sys::Uint32Array>(projection, name).map(|array| array.to_vec());
    let layout_key = field::<js_sys::JsString>(projection, "layoutKey")?.into();
    let columns = ProjectionColumns {
        fractions: field::<js_sys::Uint16Array>(projection, "fractions")?.to_vec(),
        metrics: field::<js_sys::Float32Array>(projection, "metrics")?.to_vec(),
        owners: ids("owners")?,
        controllers: ids("controllers")?,
        religions: ids("religions")?,
        markets: ids("markets")?,
        countries: ids("countries")?,
        religion_colors: ids("religionColors")?,
        market_colors: ids("marketColors")?,
    };
    Ok((layout_key, ids("locationIds")?, columns))
}
