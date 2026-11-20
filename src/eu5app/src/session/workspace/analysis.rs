use super::*;
use std::collections::BTreeMap;

/// Owned analytical results, independent of the parsed model and GPU workspace.
#[derive(Debug, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct OverviewData {
    pub political: crate::insights::control::presentation::PoliticalWorldScoreboard,
    pub control: crate::insights::control::presentation::ControlInsightData,
    pub development: crate::insights::development::presentation::DevelopmentInsightData,
    pub population: crate::insights::population::presentation::PopulationInsightData,
    pub markets: crate::insights::markets::presentation::MarketInsightData,
    pub rgo_level: crate::insights::rgo::presentation::RgoInsightData,
    pub building_levels: crate::insights::buildings::presentation::BuildingLevelsInsightData,
    pub wealth: crate::insights::tax::presentation::WealthInsightData,
    pub unrealized_tax_base: crate::insights::tax::presentation::UnrealizedTaxBaseInsightData,
    pub religion: crate::insights::religion::presentation::ReligionInsightData,
    pub state_efficacy: crate::insights::state_efficacy::presentation::StateEfficacyInsightData,
    pub population_growth:
        crate::insights::population_growth::presentation::PopulationGrowthInsightData,
    pub wealth_scope: WealthScope,
    pub unrealized_tax_base_scope: UnrealizedTaxBaseScope,
}
pub fn extract_analytics(
    workspace: &Eu5Workspace<'_>,
    localization: &crate::game_data::Localization,
    save: &crate::snapshot::SaveSnapshot,
) -> (BTreeMap<u32, String>, OverviewData) {
    let presenter = workspace.localized(localization).presenter();
    let names = save
        .countries
        .iter()
        .filter_map(|country| {
            let idx = workspace
                .gamestate()
                .countries
                .get(CountryId::new(country.country_id))?;
            Some((country.country_id, presenter.country_display_name(idx)))
        })
        .collect();
    let overviews = OverviewData {
        political: presenter.political_world_scoreboard(),
        control: presenter.calculate_control_insight(),
        development: presenter.calculate_development_insight(),
        population: presenter.calculate_population_insight(),
        markets: presenter.calculate_market_insight(),
        rgo_level: presenter.calculate_rgo_insight(),
        building_levels: presenter.calculate_building_levels_insight(),
        wealth: presenter.calculate_wealth_insight(),
        unrealized_tax_base: presenter.calculate_unrealized_tax_base_insight(),
        religion: presenter.calculate_religion_insight(),
        state_efficacy: presenter.calculate_state_efficacy_insight(),
        population_growth: presenter.calculate_population_growth_insight(),
        wealth_scope: workspace.get_wealth_scope(),
        unrealized_tax_base_scope: workspace.get_unrealized_tax_base_scope(),
    };
    (names, overviews)
}
