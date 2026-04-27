/// Data types for entity profiles (single-entity insight panel).
/// All types use owned data (String, Vec) for clean WASM boundary crossing.
/// Aggregation logic lives on Eu5Workspace; these are plain data containers.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum EntityKind {
    Country,
    Market,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ActiveProfileIdentity {
    Country {
        anchor_location_idx: u32,
        label: String,
    },
    Market {
        anchor_location_idx: u32,
        label: String,
    },
    Location {
        location_idx: u32,
        label: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EntityHeader {
    pub kind: EntityKind,
    pub name: String,
    pub tag: Option<String>,
    pub color_hex: String,
    pub anchor_location_idx: u32,
    pub headline: HeadlineStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryProfile {
    pub header: EntityHeader,
    pub overview: OverviewSection,
    pub economy: EconomySection,
    pub locations: LocationsSection,
    pub diplomacy: DiplomacySection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketProfile {
    pub header: EntityHeader,
    pub overview: OverviewSection,
    pub economy: EconomySection,
    pub locations: LocationsSection,
    pub member_countries: Vec<MarketMemberCountry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct HeadlineStats {
    pub location_count: u32,
    pub total_development: f64,
    pub total_population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct OverviewSection {
    pub avg_control: f64,
    pub avg_development: f64,
    pub total_rgo_level: f64,
    pub total_building_levels: f64,
    pub religion_breakdown: Vec<ReligionShare>,
    pub top_economic_indicators: Vec<EconomicIndicator>,
    pub top_locations_by_development: Vec<RankedLocation>,
    pub diplomatic_summary: Option<DiplomaticSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ReligionShare {
    pub religion: String,
    pub location_count: u32,
    pub color_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EconomicIndicator {
    pub label: String,
    pub value: f64,
    pub format: IndicatorFormat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum IndicatorFormat {
    Integer,
    Float1,
    Currency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct RankedLocation {
    pub location_idx: u32,
    pub name: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DiplomaticSummary {
    pub overlord: Option<EntityRef>,
    pub subject_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EconomySection {
    pub current_tax_base: Option<f64>,
    pub monthly_trade_value: Option<f64>,
    pub gold: Option<f64>,
    pub total_building_levels: f64,
    pub total_possible_tax: f64,
    pub market_membership: Vec<MarketMembership>,
    pub market_value: Option<f64>,
    pub top_goods: Vec<MarketGoodEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketMembership {
    pub market_center_name: String,
    pub location_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketMemberCountry {
    pub country: EntityRef,
    pub location_count: u32,
    pub population: u32,
    pub development: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketGoodEntry {
    pub good_name: String,
    pub price: f64,
    pub supply: f64,
    pub demand: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationsSection {
    pub locations: Vec<LocationRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationRow {
    pub location_idx: u32,
    pub name: String,
    pub development: f64,
    pub population: u32,
    pub control: f64,
    pub tax: f64,
    pub possible_tax: f64,
    pub owner: Option<EntityRef>,
    pub market: Option<EntityRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DiplomacySection {
    pub overlord: Option<EntityRef>,
    pub subjects: Vec<EntityRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EntityRef {
    pub kind: EntityKind,
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationProfile {
    pub header: LocationHeader,
    pub stats: LocationStats,
    pub buildings: Vec<BuildingEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationHeader {
    pub location_idx: u32,
    pub name: String,
    pub owner: Option<EntityRef>,
    pub market: Option<EntityRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationStats {
    pub development: f64,
    pub population: u32,
    pub control: f64,
    pub terrain: String,
    pub religion: Option<String>,
    pub raw_material: Option<String>,
    pub tax: f64,
    pub possible_tax: f64,
    pub rgo_level: f64,
    pub market_access: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingEntry {
    pub name: String,
    pub level: f64,
}
