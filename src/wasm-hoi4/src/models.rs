#![allow(nonstandard_style)]

use hoi4save::{CountryTag, Hoi4Date};
use serde::Serialize;
use std::collections::HashMap;
use tsify::Tsify;

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Hoi4Metadata {
    pub date: Hoi4Date,
    pub is_meltable: bool,
    pub player: String,
    pub countries: Vec<CountryTag>,
}

#[derive(Tsify, Debug, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountryDetails {
    pub stability: f64,
    pub war_support: f64,
    pub variable_categories: HashMap<String, Vec<f64>>,
    pub variables: HashMap<String, f64>,
}
