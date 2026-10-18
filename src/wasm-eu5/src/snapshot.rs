use eu5app::snapshot::{CountryMetric, MarketMetric, SnapshotTables};
use wasm_bindgen::prelude::*;

pub fn into_js(tables: &SnapshotTables) -> Result<JsValue, JsError> {
    let result = js_sys::Object::new();
    let set = |name: &str, value: JsValue| {
        js_sys::Reflect::set(&result, &JsValue::from_str(name), &value)
            .map_err(|error| JsError::new(&format!("Could not create snapshot tables: {error:?}")))
    };
    let names = |values: &mut dyn Iterator<Item = &str>| -> JsValue {
        values
            .map(JsValue::from_str)
            .collect::<js_sys::Array>()
            .into()
    };
    set(
        "strings",
        names(&mut tables.strings.iter().map(String::as_str)),
    )?;
    set(
        "countryMetrics",
        names(&mut CountryMetric::ALL.iter().map(|m| m.name())),
    )?;
    set(
        "marketMetrics",
        names(&mut MarketMetric::ALL.iter().map(|m| m.name())),
    )?;
    for (name, values) in [
        ("countryIds", &tables.country_ids),
        ("countryTags", &tables.country_tags),
        ("countryLocations", &tables.country_locations),
        ("breakdownOffsets", &tables.breakdown_offsets),
        ("breakdownKeys", &tables.breakdown_keys),
        ("countryMarketOffsets", &tables.country_market_offsets),
        ("countryMarkets", &tables.country_markets),
        ("marketCenters", &tables.market_centers),
        ("marketCenterNames", &tables.market_center_names),
        ("marketGoods", &tables.market_goods),
    ] {
        set(name, js_sys::Uint32Array::from(values.as_slice()).into())?;
    }
    set(
        "countryValues",
        js_sys::Float64Array::from(tables.country_values.as_slice()).into(),
    )?;
    for (name, values) in [
        ("breakdownValues", &tables.breakdown_values),
        ("marketValues", &tables.market_values),
    ] {
        set(name, js_sys::Float32Array::from(values.as_slice()).into())?;
    }
    Ok(result.into())
}
