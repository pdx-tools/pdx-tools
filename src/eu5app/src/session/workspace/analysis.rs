use super::insights::InsightContext;
use super::*;
use crate::presentation::{LocalizationContext, Present};

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
    pub world: WorldSummary,
}
pub fn extract_overviews(
    game: &Gamestate<'_>,
    data: &GameData,
    localization: &crate::game_data::Localization,
) -> OverviewData {
    let selection = SelectionState::new();
    let ctx = LocalizationContext::new(localization, data, game);
    let building_levels = OnceLock::new();
    let mut analysis =
        InsightContext::new(game, &selection, MapMode::Political, data, &building_levels);
    let world = analysis.world_summary();
    analysis.current_map_mode = MapMode::Political;
    let political = analysis
        .calculate_political_world_scoreboard()
        .present(&ctx);
    analysis.current_map_mode = MapMode::Control;
    let control = analysis.calculate_control_insight().present(&ctx);
    analysis.current_map_mode = MapMode::Development;
    let development = analysis.calculate_development_insight().present(&ctx);
    analysis.current_map_mode = MapMode::Population;
    let population = analysis.calculate_population_insight().present(&ctx);
    analysis.current_map_mode = MapMode::Markets;
    let markets = analysis.calculate_market_insight().present(&ctx);
    analysis.current_map_mode = MapMode::RgoLevel;
    let rgo_level = analysis.calculate_rgo_insight().present(&ctx);
    analysis.current_map_mode = MapMode::BuildingLevels;
    let building_levels = analysis.calculate_building_levels_insight().present(&ctx);
    analysis.current_map_mode = MapMode::Wealth;
    let wealth = analysis.calculate_wealth_insight().present(&ctx);
    analysis.current_map_mode = MapMode::UnrealizedTaxBase;
    let unrealized_tax_base = analysis
        .calculate_unrealized_tax_base_insight()
        .present(&ctx);
    analysis.current_map_mode = MapMode::Religion;
    let religion = analysis.calculate_religion_insight().present(&ctx);
    analysis.current_map_mode = MapMode::StateEfficacy;
    let state_efficacy = analysis.calculate_state_efficacy_insight().present(&ctx);
    analysis.current_map_mode = MapMode::PopulationGrowth;
    let population_growth = analysis.calculate_population_growth_insight().present(&ctx);
    OverviewData {
        political,
        control,
        development,
        population,
        markets,
        rgo_level,
        building_levels,
        wealth,
        unrealized_tax_base,
        religion,
        state_efficacy,
        population_growth,
        world,
        wealth_scope: analysis.get_wealth_scope(),
        unrealized_tax_base_scope: analysis.get_unrealized_tax_base_scope(),
    }
}
