use super::*;
use crate::analysis::InsightContext;

impl<'bump> Eu5Workspace<'bump> {
    fn analysis_context(&self) -> InsightContext<'_, 'bump> {
        InsightContext::new(
            &self.gamestate,
            &self.selection_state,
            self.current_map_mode,
            &self.game_data,
            &self.location_building_levels,
        )
    }
    pub(crate) fn calculate_political_world_scoreboard(&self) -> PoliticalWorldScoreboard {
        self.analysis_context()
            .calculate_political_world_scoreboard()
    }
    pub(crate) fn calculate_state_efficacy_insight(&self) -> StateEfficacyInsightData {
        self.analysis_context().calculate_state_efficacy_insight()
    }
    pub(crate) fn calculate_development_insight(&self) -> DevelopmentInsightData {
        self.analysis_context().calculate_development_insight()
    }
    pub(crate) fn calculate_wealth_insight(&self) -> WealthInsightData {
        self.analysis_context().calculate_wealth_insight()
    }
    pub(crate) fn calculate_unrealized_tax_base_insight(&self) -> UnrealizedTaxBaseInsightData {
        self.analysis_context()
            .calculate_unrealized_tax_base_insight()
    }
    pub(crate) fn calculate_market_insight(&self) -> MarketInsightData<'_> {
        self.analysis_context().calculate_market_insight()
    }
    pub(crate) fn calculate_population_insight(&self) -> PopulationInsightData {
        self.analysis_context().calculate_population_insight()
    }
    pub fn world_summary(&self) -> WorldSummary {
        self.analysis_context().world_summary()
    }
    pub(crate) fn calculate_population_growth_insight(&self) -> PopulationGrowthInsightData {
        self.analysis_context()
            .calculate_population_growth_insight()
    }
    pub(crate) fn calculate_religion_insight(&self) -> ReligionInsightData {
        self.analysis_context().calculate_religion_insight()
    }
    pub(crate) fn calculate_building_levels_insight(&self) -> BuildingLevelsInsightData<'_> {
        self.analysis_context().calculate_building_levels_insight()
    }
    pub fn get_wealth_scope(&self) -> WealthScope {
        self.analysis_context().get_wealth_scope()
    }
    pub fn get_unrealized_tax_base_scope(&self) -> UnrealizedTaxBaseScope {
        self.analysis_context().get_unrealized_tax_base_scope()
    }
    pub(crate) fn calculate_rgo_insight(&self) -> RgoInsightData<'_> {
        self.analysis_context().calculate_rgo_insight()
    }
    pub(crate) fn calculate_control_insight(&self) -> ControlInsightData {
        self.analysis_context().calculate_control_insight()
    }
}
