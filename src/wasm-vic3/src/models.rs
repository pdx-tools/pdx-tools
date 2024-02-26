#![allow(nonstandard_style)]
use jomini::common::Date;
use serde::Serialize;
use tsify::Tsify;
use vic3save::Vic3Date;

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Vic3Metadata {
    pub date: Vic3Date,
    pub is_meltable: bool,
    pub last_played_tag: String,
    pub available_tags: Vec<String>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Vic3GraphResponse {
    pub data: Vec<Vic3GraphData>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vic3GraphData {
    pub date: Date,
    pub gdp: f64,
    pub sol: f64,
    pub pop: f64,
    pub gdpc: f64,
    pub gdp_growth: f64,
    pub gdpc_growth: f64,
}
