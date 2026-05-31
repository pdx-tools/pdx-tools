use crate::entity_profile::{CountryRef, MarketRef};
use crate::presentation::{Localized, UiLocationIdx, present_dto};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct DevelopmentScopeSummary {
    pub location_count: u32,
    pub country_count: u32,
    pub total_development: f64,
    pub avg_development: f64,
    pub total_population: u32,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct StateEfficacyScopeSummary {
    pub location_count: u32,
    pub country_count: u32,
    pub total_efficacy: f64,
    pub avg_efficacy: f64,
    pub total_population: u32,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct WealthScope {
    pub location_count: u32,
    pub total_wealth: f64,
    pub avg_wealth: f64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct UnrealizedTaxBaseScope {
    pub location_count: u32,
    pub unrealized_tax_base: f64,
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
pub struct GoodBreakdownEntry {
    pub category: String,
    pub amount: f64,
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
pub struct ControlScopeSummary {
    pub location_count: u32,
    pub country_count: u32,
    pub total_development: f64,
    pub effective_development: f64,
    pub lost_development: f64,
    pub weighted_avg_control: f64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct ControlBandSegment {
    pub band: String,
    pub lost_development: f64,
    pub development: f64,
    pub location_count: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct RgoScopeSummary {
    pub location_count: u32,
    pub total_rgo_level: f64,
    pub avg_rgo_level: f64,
    pub is_empty: bool,
}

pub mod distribution {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub RankedLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            value: f64,
        }

        pub LocationDistribution {
            metric_label: String,
            buckets: Vec<DistributionBucket>,
            top_locations: Vec<workspace::RankedLocation> => Vec<presentation::RankedLocation>,
        }
    }
}

pub mod development {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub CountryDevSummary {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_development: f64,
            avg_development: f64,
            location_count: u32,
            total_population: u32,
        }

        pub DevTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            development: f64,
            population: u32,
            control: f64,
            owner: crate::presentation::CountryRefSource => CountryRef,
        }

        pub DevelopmentInsightData {
            scope: DevelopmentScopeSummary,
            countries: Vec<workspace::CountryDevSummary> => Vec<presentation::CountryDevSummary>,
            top_locations: Vec<workspace::DevTopLocation> => Vec<presentation::DevTopLocation>,
            distribution: distribution::workspace::LocationDistribution => distribution::presentation::LocationDistribution,
        }
    }
}

pub mod state_efficacy {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub CountryStateEfficacy {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_efficacy: f64,
            location_count: u32,
            avg_efficacy: f64,
            total_population: u32,
        }

        pub StateEfficacyTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            state_efficacy: f64,
            development: f64,
            control: f64,
            population: u32,
            owner: crate::presentation::CountryRefSource => CountryRef,
        }

        pub StateEfficacyInsightData {
            scope: StateEfficacyScopeSummary,
            countries: Vec<workspace::CountryStateEfficacy> => Vec<presentation::CountryStateEfficacy>,
            top_locations: Vec<workspace::StateEfficacyTopLocation> => Vec<presentation::StateEfficacyTopLocation>,
            distribution: distribution::workspace::LocationDistribution => distribution::presentation::LocationDistribution,
        }
    }
}

pub mod tax {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub CountryWealth {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_wealth: f64,
            avg_wealth: f64,
            location_count: u32,
            total_population: u32,
        }

        pub WealthTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            wealth: f64,
            development: f64,
            control: f64,
            population: u32,
            owner: crate::presentation::CountryRefSource => CountryRef,
        }

        pub WealthInsightData {
            countries: Vec<workspace::CountryWealth> => Vec<presentation::CountryWealth>,
            top_locations: Vec<workspace::WealthTopLocation> => Vec<presentation::WealthTopLocation>,
            distribution: distribution::workspace::LocationDistribution => distribution::presentation::LocationDistribution,
        }

        pub CountryUnrealizedTaxBase {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_tax_base: f64,
            total_wealth: f64,
            unrealized_tax_base: f64,
            realization_ratio: f64,
            location_count: u32,
            total_population: u32,
        }

        pub UnrealizedTaxBaseTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            tax_base: f64,
            wealth: f64,
            unrealized_tax_base: f64,
            development: f64,
            control: f64,
            population: u32,
            owner: crate::presentation::CountryRefSource => CountryRef,
        }

        pub UnrealizedTaxBaseInsightData {
            countries: Vec<workspace::CountryUnrealizedTaxBase> => Vec<presentation::CountryUnrealizedTaxBase>,
            top_locations: Vec<workspace::UnrealizedTaxBaseTopLocation> => Vec<presentation::UnrealizedTaxBaseTopLocation>,
            distribution: distribution::workspace::LocationDistribution => distribution::presentation::LocationDistribution,
        }
    }
}

pub mod markets {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub ScopedGoodSummary<'a> {
            good: crate::presentation::GoodRefSource<'a> => crate::presentation::GoodRef,
            supply: f64,
            demand: f64,
            total_taken: f64,
            weighted_price: f64,
            shortage: f64,
            surplus: f64,
            shortage_value: f64,
            surplus_value: f64,
            balance_ratio: f64,
            impact: f64,
            stockpile: f64,
            possible: f64,
            allowed_export_amount: f64,
            priority: f64,
            history: Vec<f64>,
            supplied_breakdown: Vec<GoodBreakdownEntry>,
            demanded_breakdown: Vec<GoodBreakdownEntry>,
            taken_breakdown: Vec<GoodBreakdownEntry>,
            market_count: u32,
            producing_location_count: u32,
            default_market_price: Option<f64>,
        }

        pub ScopedMarketSummary {
            market: crate::presentation::MarketRefSource => MarketRef,
            market_value: f64,
            shortage_pressure: f64,
            surplus_pressure: f64,
            total_taken: f64,
            scoped_location_count: u32,
            member_country_count: u32,
            avg_market_access: f64,
            good_count: u32,
        }

        pub ProductionLocationSummary<'a> {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            market: Option<crate::presentation::MarketRefSource> => Option<MarketRef>,
            raw_material: Option<eu5save::models::GoodName<'a>> => Option<Localized<String>>,
            rgo_level: f64,
            market_access: f64,
            development: f64,
            population: u32,
            good_price: f64,
            good_shortage_value: f64,
            production_opportunity: f64,
        }

        pub MarketProductionLocationSummary<'a> {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            raw_material: Option<eu5save::models::GoodName<'a>> => Option<Localized<String>>,
            rgo_level: f64,
            market_access: f64,
            development: f64,
            population: u32,
        }

        pub GoodMarketBalanceCell<'a> {
            market: crate::presentation::MarketRefSource => MarketRef,
            good: eu5save::models::GoodName<'a> => Localized<String>,
            supply: f64,
            demand: f64,
            price: f64,
            total_taken: f64,
            balance_ratio: f64,
            imbalance_value: f64,
        }

        pub MarketInsightData<'a> {
            scope: MarketScopeSummary,
            goods: Vec<workspace::ScopedGoodSummary<'a>> => Vec<presentation::ScopedGoodSummary>,
            markets: Vec<workspace::ScopedMarketSummary> => Vec<presentation::ScopedMarketSummary>,
            good_market_cells: Vec<workspace::GoodMarketBalanceCell<'a>> => Vec<presentation::GoodMarketBalanceCell>,
            top_production_locations: Vec<workspace::ProductionLocationSummary<'a>> => Vec<presentation::ProductionLocationSummary>,
        }
    }
}

pub mod population {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub ScopedCountryPopulation {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_population: u32,
            location_count: u32,
            ranks: Vec<PopulationRankSegment>,
            historical_population: Vec<f64>,
            great_power_rank: i32,
        }

        pub PopulationTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            population: u32,
            rank: u8,
        }

        pub PopulationInsightData {
            scope: PopulationScopeSummary,
            rank_totals: Vec<PopulationRankSegment>,
            countries: Vec<workspace::ScopedCountryPopulation> => Vec<presentation::ScopedCountryPopulation>,
            concentration: Vec<PopulationConcentrationPoint>,
            top_locations: Vec<workspace::PopulationTopLocation> => Vec<presentation::PopulationTopLocation>,
            type_profile: Vec<PopulationTypeProfileRow>,
        }
    }
}

pub mod buildings {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub BuildingTypeSummary<'a> {
            building: crate::presentation::BuildingKeyRef<'a> => Localized<String>,
            levels: f64,
            foreign_levels: f64,
            employed: f64,
            building_count: u32,
            location_count: u32,
            foreign_owner_count: u32,
        }

        pub BuildingTypeForeignOwnerCell<'a> {
            building: crate::presentation::BuildingKeyRef<'a> => Localized<String>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            levels: f64,
            employed: f64,
            building_count: u32,
        }

        pub BuildingLevelsTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            levels: f64,
        }

        pub ForeignBuildingLocationRow<'a> {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            location_owner: crate::presentation::CountryRefSource => CountryRef,
            foreign_owner: crate::presentation::CountryRefSource => CountryRef,
            building: crate::presentation::BuildingKeyRef<'a> => Localized<String>,
            foreign_levels: f64,
            location_total_levels: f64,
        }

        pub BuildingLevelsInsightData<'a> {
            scope: BuildingLevelsScopeSummary,
            types: Vec<workspace::BuildingTypeSummary<'a>> => Vec<presentation::BuildingTypeSummary>,
            foreign_owner_cells: Vec<workspace::BuildingTypeForeignOwnerCell<'a>> => Vec<presentation::BuildingTypeForeignOwnerCell>,
            foreign_location_rows: Vec<workspace::ForeignBuildingLocationRow<'a>> => Vec<presentation::ForeignBuildingLocationRow>,
            top_locations: Vec<workspace::BuildingLevelsTopLocation> => Vec<presentation::BuildingLevelsTopLocation>,
        }
    }
}

pub mod religion {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub PopulationReligionShare {
            religion: eu5save::models::ReligionId => Localized<String>,
            color_hex: String,
            population: u32,
        }

        pub StateReligionRow {
            religion: eu5save::models::ReligionId => Localized<String>,
            color_hex: String,
            country_count: u32,
            total_ruled_population: u32,
            state_religion_population: u32,
            other_faith_population: u32,
            state_religion_coverage: f64,
            top_population_religions: Vec<workspace::PopulationReligionShare> => Vec<presentation::PopulationReligionShare>,
        }

        pub ReligionRow {
            religion: eu5save::models::ReligionId => Localized<String>,
            color_hex: String,
            state_country_count: u32,
            total_ruled_population: u32,
            state_religion_population: u32,
            other_faith_population: u32,
            state_religion_coverage: f64,
            follower_population: u32,
            followers_outside_same_faith_states: u32,
        }

        pub ReligionInsightData {
            state_religions: Vec<workspace::StateReligionRow> => Vec<presentation::StateReligionRow>,
            religions: Vec<workspace::ReligionRow> => Vec<presentation::ReligionRow>,
        }
    }
}

pub mod control {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub CountryControlBarSummary {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_development: f64,
            effective_development: f64,
            lost_development: f64,
            weighted_avg_control: f64,
            location_count: u32,
            bands: Vec<ControlBandSegment>,
        }

        pub CountryControlPoint {
            country: crate::presentation::CountryRefSource => CountryRef,
            total_development: f64,
            lost_development: f64,
            weighted_avg_control: f64,
            location_count: u32,
        }

        pub ControlTopLocation {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            control: f64,
            development: f64,
            lost_development: f64,
            population: u32,
        }

        pub ControlInsightData {
            scope: ControlScopeSummary,
            bar_countries: Vec<workspace::CountryControlBarSummary> => Vec<presentation::CountryControlBarSummary>,
            scatter_countries: Vec<workspace::CountryControlPoint> => Vec<presentation::CountryControlPoint>,
            top_locations: Vec<workspace::ControlTopLocation> => Vec<presentation::ControlTopLocation>,
        }

        pub PoliticalWorldRow {
            ordinal_rank: u32,
            country: crate::presentation::CountryRefSource => CountryRef,
            total_state_efficacy: f64,
            active_state_capacity: f64,
            total_population: u32,
            tax_trade_income: f64,
        }

        pub PoliticalWorldScoreboard {
            rows: Vec<workspace::PoliticalWorldRow> => Vec<presentation::PoliticalWorldRow>,
        }
    }
}

pub mod rgo {
    use super::*;

    present_dto! {
        pub(crate) mod workspace;
        pub mod presentation;

        pub RgoMaterialSummary<'a> {
            raw_material: crate::presentation::GoodRefSource<'a> => crate::presentation::GoodRef,
            total_rgo_level: f64,
            avg_rgo_level: f64,
            median_rgo_level: f64,
            location_count: u32,
            scoped_share: f64,
            global_share: f64,
        }

        pub RgoMaterialProfileDelta<'a> {
            raw_material: eu5save::models::GoodName<'a> => Localized<String>,
            scoped_share: f64,
            global_share: f64,
            share_delta: f64,
            total_rgo_level: f64,
            location_count: u32,
        }

        pub RgoTopLocation<'a> {
            location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
            owner: crate::presentation::CountryRefSource => CountryRef,
            raw_material: eu5save::models::GoodName<'a> => Localized<String>,
            rgo_level: f64,
        }

        pub RgoInsightData<'a> {
            scope: RgoScopeSummary,
            materials: Vec<workspace::RgoMaterialSummary<'a>> => Vec<presentation::RgoMaterialSummary>,
            profile_deltas: Vec<workspace::RgoMaterialProfileDelta<'a>> => Vec<presentation::RgoMaterialProfileDelta>,
            top_locations: Vec<workspace::RgoTopLocation<'a>> => Vec<presentation::RgoTopLocation>,
        }
    }
}
