#![allow(nonstandard_style)]

use hoi4save::{CountryTag, Hoi4Date};
use serde::Serialize;
use std::collections::HashMap;
use tsify::Tsify;

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hoi4Metadata {
    pub date: Hoi4Date,
    pub is_meltable: bool,
    pub player: Option<String>,
    pub countries: Vec<CountryTag>,
    /// The game version that wrote the save
    pub version: Option<String>,
    /// The version (major.minor) of the asset bundle that matches the save
    pub bundle_version: Option<String>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryDetails {
    pub stability: f64,
    pub war_support: f64,
    pub variable_categories: HashMap<String, Vec<f64>>,
    pub variables: HashMap<String, f64>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LandedCountries {
    pub countries: Vec<hoi4app::CountryDisplay>,
}
