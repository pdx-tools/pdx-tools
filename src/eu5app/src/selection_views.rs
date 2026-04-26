/// Data types for multi-entity summary and aggregate views.
/// Mirrors the style of entity_profile.rs: owned data, tsify feature-gated,
/// camelCase serde.
use crate::entity_profile::{EntityRef, RankedLocation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(tag = "mode", content = "value", rename_all = "camelCase")]
pub enum HoverStat {
    None,
    Control { value: f64 },
    Development { value: f64 },
    Population { value: u32 },
    Markets { access: f64 },
    RgoLevel { value: f64 },
    BuildingLevels { value: f64 },
    PossibleTax { value: f64 },
    TaxGap { value: f64 },
    Religion { name: String },
    StateEfficacy { value: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum HoverDisplayData {
    Clear,
    Location {
        location_id: u32,
        location_name: String,
        stat: HoverStat,
    },
    Country {
        location_id: u32,
        country_tag: String,
        country_name: String,
        stat: HoverStat,
    },
    Market {
        location_id: u32,
        market_center_name: String,
        market_value: f64,
    },
}

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
    pub total_possible_tax: f64,
    pub avg_possible_tax: f64,
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
    pub total_possible_tax: f64,
    pub avg_possible_tax: f64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryTaxGap {
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
pub struct TaxGapTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub tax: f64,
    pub possible_tax: f64,
    pub tax_gap: f64,
    pub development: f64,
    pub control: f64,
    pub population: u32,
    pub owner: EntityRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct TaxGapInsightData {
    pub countries: Vec<CountryTaxGap>,
    pub top_locations: Vec<TaxGapTopLocation>,
    pub distribution: LocationDistribution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct TaxGapScope {
    pub location_count: u32,
    pub tax_gap: f64,
    pub realization_ratio: f64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketScopeSummary {
    pub location_count: u32,
    pub market_count: u32,
    pub good_count: u32,
    pub market_value: f64,
    pub shortage_value: f64,
    pub surplus_value: f64,
    pub avg_market_access: f64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ScopedGoodSummary {
    pub name: String,
    pub supply: f64,
    pub demand: f64,
    pub total_taken: f64,
    pub weighted_price: f64,
    pub shortage: f64,
    pub surplus: f64,
    pub shortage_value: f64,
    pub surplus_value: f64,
    pub balance_ratio: f64,
    pub impact: f64,
    pub stockpile: f64,
    pub market_count: u32,
    pub producing_location_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ScopedMarketSummary {
    pub anchor_location_idx: u32,
    pub center_name: String,
    pub color_hex: String,
    pub market_value: f64,
    pub shortage_pressure: f64,
    pub surplus_pressure: f64,
    pub total_taken: f64,
    pub scoped_location_count: u32,
    pub member_country_count: u32,
    pub avg_market_access: f64,
    pub good_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ProductionLocationSummary {
    pub location_idx: u32,
    pub name: String,
    pub owner: EntityRef,
    pub market_center_name: Option<String>,
    pub raw_material: Option<String>,
    pub rgo_level: f64,
    pub market_access: f64,
    pub development: f64,
    pub population: u32,
    pub good_price: f64,
    pub good_shortage_value: f64,
    pub production_opportunity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct GoodMarketBalanceCell {
    pub good: String,
    pub market_anchor_location_idx: u32,
    pub supply: f64,
    pub demand: f64,
    pub price: f64,
    pub total_taken: f64,
    pub balance_ratio: f64,
    pub imbalance_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketInsightData {
    pub scope: MarketScopeSummary,
    pub goods: Vec<ScopedGoodSummary>,
    pub markets: Vec<ScopedMarketSummary>,
    pub good_market_cells: Vec<GoodMarketBalanceCell>,
    pub top_production_locations: Vec<ProductionLocationSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationScopeSummary {
    pub location_count: u32,
    pub country_count: u32,
    pub total_population: u32,
    pub median_location_population: u32,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationRankSegment {
    pub rank: u8,
    pub population: u32,
    pub location_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ScopedCountryPopulation {
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color_hex: String,
    pub total_population: u32,
    pub location_count: u32,
    pub ranks: Vec<PopulationRankSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationConcentrationPoint {
    pub location_rank: u32,
    pub location_count: u32,
    pub population: u32,
    pub cumulative_population: u32,
    pub population_share: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub owner: EntityRef,
    pub population: u32,
    pub rank: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationTypeProfileRow {
    pub population_type: u8,
    pub population: f64,
    pub share: f64,
    pub baseline_population: f64,
    pub baseline_share: f64,
    pub share_delta: f64,
    pub avg_satisfaction: f64,
    pub avg_literacy: f64,
    pub pop_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationInsightData {
    pub scope: PopulationScopeSummary,
    pub rank_totals: Vec<PopulationRankSegment>,
    pub countries: Vec<ScopedCountryPopulation>,
    pub concentration: Vec<PopulationConcentrationPoint>,
    pub top_locations: Vec<PopulationTopLocation>,
    pub type_profile: Vec<PopulationTypeProfileRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingLevelsScopeSummary {
    pub location_count: u32,
    pub total_levels: f64,
    pub foreign_levels: f64,
    pub foreign_location_count: u32,
    pub foreign_owner_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingTypeSummary {
    pub kind: String,
    pub levels: f64,
    pub foreign_levels: f64,
    pub employed: f64,
    pub building_count: u32,
    pub location_count: u32,
    pub foreign_owner_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingTypeForeignOwnerCell {
    pub kind: String,
    pub owner: EntityRef,
    pub levels: f64,
    pub employed: f64,
    pub building_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingLevelsTopLocation {
    pub location_idx: u32,
    pub name: String,
    pub owner: EntityRef,
    pub levels: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ForeignBuildingLocationRow {
    pub location_idx: u32,
    pub location_name: String,
    pub location_owner: EntityRef,
    pub foreign_owner: EntityRef,
    pub kind: String,
    pub foreign_levels: f64,
    pub location_total_levels: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingLevelsInsightData {
    pub scope: BuildingLevelsScopeSummary,
    pub types: Vec<BuildingTypeSummary>,
    pub foreign_owner_cells: Vec<BuildingTypeForeignOwnerCell>,
    pub foreign_location_rows: Vec<ForeignBuildingLocationRow>,
    pub top_locations: Vec<BuildingLevelsTopLocation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct PopulationReligionShare {
    pub religion: String,
    pub color_hex: String,
    pub population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct StateReligionRow {
    pub religion: String,
    pub color_hex: String,
    pub country_count: u32,
    pub total_ruled_population: u32,
    pub state_religion_population: u32,
    pub other_faith_population: u32,
    pub state_religion_coverage: f64,
    pub top_population_religions: Vec<PopulationReligionShare>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ReligionRow {
    pub religion: String,
    pub color_hex: String,
    pub state_country_count: u32,
    pub total_ruled_population: u32,
    pub state_religion_population: u32,
    pub other_faith_population: u32,
    pub state_religion_coverage: f64,
    pub follower_population: u32,
    pub followers_outside_same_faith_states: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ReligionInsightData {
    pub state_religions: Vec<StateReligionRow>,
    pub religions: Vec<ReligionRow>,
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
