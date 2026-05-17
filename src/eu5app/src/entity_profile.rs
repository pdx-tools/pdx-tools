/// Data types for entity profiles (single-entity insight panel).
/// All types use owned data (String, Vec) for clean WASM boundary crossing.
/// Aggregation logic lives on Eu5Workspace; these are plain data containers.
use serde::{Deserialize, Serialize};

use crate::selection_views::{PopulationRankSegment, PopulationTypeProfileRow};

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
    Country { country_idx: u32, label: String },
    Market { market_id: u32, label: String },
    Location { location_idx: u32, label: String },
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
    pub overview: CountryOverviewSection,
    pub religion: CountryReligionSection,
    pub locations: LocationsSection,
    pub diplomacy: DiplomacySection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryPopulationProfile {
    pub type_profile: Vec<PopulationTypeProfileRow>,
    pub rank_totals: Vec<PopulationRankSegment>,
    pub sankey_rows: Vec<LocationPopRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketProfile {
    pub header: EntityHeader,
    pub market_value: f64,
    pub owner_country: Option<EntityRef>,
    pub location_market_access: Vec<f64>,
    pub location_market_attraction: Vec<f64>,
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
pub struct CountryOverviewSection {
    pub gold: f64,
    pub manpower: f64,
    pub stability: f64,
    pub prestige: f64,
    pub government_power: f64,
    pub income: f64,
    pub expense: f64,
    pub monthly_gold: Vec<f64>,
    pub recent_balance: Vec<f64>,
    pub historical_tax_base: Vec<f64>,
    pub historical_population: Vec<f64>,
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
pub struct ReligionShare {
    pub religion: String,
    pub location_count: u32,
    pub population: u32,
    pub color_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryReligionSection {
    pub religion_breakdown: Vec<ReligionShare>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketGoodsSection {
    pub market_value: f64,
    pub total_building_levels: f64,
    pub total_possible_tax: f64,
    pub top_goods: Vec<MarketGoodEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketMemberCountry {
    pub country: EntityRef,
    pub trade_advantage: f64,
    pub trade_capacity: f64,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "PascalCase")]
pub enum DiplomacySubjectType {
    Dominion,
    Fiefdom,
    Vassal,
    Tributary,
    #[serde(rename = "Hanseatic Member")]
    HanseaticMember,
    Samanta,
    Appanage,
    Tusi,
    March,
    #[serde(rename = "Maha Samanta")]
    MahaSamanta,
    #[serde(rename = "Colonial Nation")]
    ColonialNation,
    Conquistador,
    #[serde(rename = "Trade Company")]
    TradeCompany,
    #[serde(rename = "Subject")]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryMetrics {
    pub great_power_rank: i32,
    pub total_state_efficacy: f64,
    pub active_state_capacity: f64,
    pub total_population: u32,
    pub tax_trade_income: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct SubjectRef {
    pub entity: EntityRef,
    pub subject_type: DiplomacySubjectType,
    pub liberty_desire: f64,
    pub metrics: CountryMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DiplomacySection {
    pub overlord: Option<EntityRef>,
    pub overlord_subject_type: Option<DiplomacySubjectType>,
    pub overlord_metrics: Option<CountryMetrics>,
    pub subjects: Vec<SubjectRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryRef {
    pub country_idx: u32,
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color_hex: String,
    pub is_player: bool,
}

impl CountryRef {
    pub fn anchor_location_idx(&self) -> u32 {
        self.anchor_location_idx
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EntityRef {
    #[serde(rename_all = "camelCase")]
    Country(CountryRef),
    #[serde(rename_all = "camelCase")]
    Market {
        market_id: u32,
        anchor_location_idx: u32,
        name: String,
        color_hex: String,
    },
}

impl EntityRef {
    pub fn anchor_location_idx(&self) -> u32 {
        match self {
            EntityRef::Country(country) => country.anchor_location_idx,
            EntityRef::Market {
                anchor_location_idx,
                ..
            } => *anchor_location_idx,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            EntityRef::Country(country) => &country.name,
            EntityRef::Market { name, .. } => name,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationProfile {
    pub header: LocationHeader,
    pub stats: LocationStats,
    pub buildings: Vec<BuildingEntry>,
    pub population_profile: Vec<LocationPopRow>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationPopRow {
    pub kind: String,
    pub culture_name: String,
    pub culture_color_hex: String,
    pub religion_name: String,
    pub religion_color_hex: String,
    pub size: u32,
    pub satisfaction: f64,
    pub literacy: f64,
}
