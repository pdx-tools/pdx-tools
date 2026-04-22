/// Data types for multi-entity summary and aggregate views.
/// Mirrors the style of entity_profile.rs: owned data, tsify feature-gated,
/// camelCase serde.
use crate::entity_profile::{EntityRef, RankedLocation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryDevSummary {
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color_hex: String,
    pub total_development: f64,
    pub avg_development: f64,
    pub location_count: u32,
    pub total_population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DevTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub development: f64,
    pub population: u32,
    pub control: f64,
    pub owner: EntityRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct StateEfficacyTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub state_efficacy: f64,
    pub development: f64,
    pub control: f64,
    pub population: u32,
    pub owner: EntityRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DevelopmentInsightData {
    pub countries: Vec<CountryDevSummary>,
    pub top_locations: Vec<DevTopLocation>,
    pub distribution: LocationDistribution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryPossibleTax {
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color_hex: String,
    pub current_tax_base: f64,
    pub total_possible_tax: f64,
    pub tax_gap: f64,
    pub realization_ratio: f64,
    pub location_count: u32,
    pub total_population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PossibleTaxTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub possible_tax: f64,
    pub development: f64,
    pub control: f64,
    pub population: u32,
    pub owner: EntityRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PossibleTaxInsightData {
    pub countries: Vec<CountryPossibleTax>,
    pub top_locations: Vec<PossibleTaxTopLocation>,
    pub distribution: LocationDistribution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PossibleTaxScope {
    pub location_count: u32,
    pub current_tax_base: f64,
    pub total_possible_tax: f64,
    pub is_empty: bool,
}

/// Aggregated totals for the current scope: the active selection when non-empty,
/// or the entire world when the filter is empty.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ScopeSummary {
    pub entity_count: u32,
    pub location_count: u32,
    pub total_population: u32,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EntityBreakdownRow {
    pub entity_ref: EntityRef,
    pub location_count: u32,
    pub total_development: f64,
    pub total_population: u32,
    pub avg_development: f64,
    pub total_possible_tax: f64,
    pub mode_metric: f64,
    pub mode_metric_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EntityBreakdownData {
    pub rows: Vec<EntityBreakdownRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationDistribution {
    pub metric_label: String,
    pub buckets: Vec<DistributionBucket>,
    pub top_locations: Vec<RankedLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DistributionBucket {
    pub lo: f64,
    pub hi: f64,
    pub count: u32,
}
