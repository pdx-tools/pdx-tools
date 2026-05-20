use eu5app::{
    Srgb,
    insights::{GoodBreakdownEntry, markets::presentation::ScopedGoodSummary},
    presentation::GoodRef,
};
use tsify::Tsify;
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_test::*;

fn get_prop(value: &JsValue, key: &str) -> JsValue {
    js_sys::Reflect::get(value, &JsValue::from_str(key)).unwrap()
}

fn object_keys_len(value: &JsValue) -> u32 {
    let object = value.clone().unchecked_into::<js_sys::Object>();
    js_sys::Object::keys(&object).length()
}

fn scoped_good_summary() -> ScopedGoodSummary {
    ScopedGoodSummary {
        good: GoodRef {
            key: "wool".to_string(),
            name: "Wool".to_string(),
            color_hex: Srgb([0x8a, 0x99, 0x99]),
        },
        supply: 1.0,
        demand: 1.0,
        total_taken: 1.0,
        weighted_price: 2.0,
        shortage: 0.0,
        surplus: 0.0,
        shortage_value: 0.0,
        surplus_value: 0.0,
        balance_ratio: 1.0,
        impact: 0.0,
        stockpile: 0.0,
        possible: 0.0,
        allowed_export_amount: 0.0,
        priority: 0.0,
        history: vec![],
        supplied_breakdown: vec![GoodBreakdownEntry {
            category: "Production".to_string(),
            amount: 1.0,
        }],
        demanded_breakdown: vec![],
        taken_breakdown: vec![],
        market_count: 1,
        producing_location_count: 1,
        default_market_price: Some(2.0),
    }
}

#[wasm_bindgen_test]
fn good_ref_serializes() {
    let js_row = scoped_good_summary().into_js().unwrap();
    let js_good = get_prop(&js_row, "good");

    assert!(!js_good.is_instance_of::<js_sys::Map>());
    assert_eq!(get_prop(&js_good, "key"), "wool");
    assert_eq!(get_prop(&js_good, "name"), "Wool");
    assert_eq!(get_prop(&js_good, "colorHex"), "#8a9999");
    assert_eq!(object_keys_len(&js_good), 3);
    assert_eq!(
        js_sys::JSON::stringify(&js_good).unwrap(),
        r##"{"key":"wool","name":"Wool","colorHex":"#8a9999"}"##
    );
}
