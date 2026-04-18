/// Data types for multi-entity summary and aggregate views.
/// Mirrors the style of entity_profile.rs: owned data, tsify feature-gated,
/// camelCase serde.
use crate::entity_profile::{EntityRef, RankedLocation};
use serde::{Deserialize, Serialize};

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
