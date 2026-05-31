use crate::entity_profile::country::workspace::{
    ActiveProfileIdentity, CountryPopulationProfile, CountryProfile, CountryReligionSection,
    ReligionShare,
};
use crate::entity_profile::diplomacy::workspace::{DiplomacySection, SubjectRef};
use crate::entity_profile::location::workspace::{
    BuildingEntry, EntityHeader, LocationHeader, LocationPopRow, LocationProfile, LocationRow,
    LocationStats, LocationsSection,
};
use crate::entity_profile::market::workspace::{
    MarketGoodEntry, MarketGoodsSection, MarketMemberCountry, MarketProfile,
};
use crate::entity_profile::{
    CountryMetrics, CountryOverviewRanks, CountryOverviewSection, DiplomacySubjectType,
    EntityHeaderKindSource, EntityKind, HeadlineStats,
};
use crate::game_data::GameData;
use crate::hover::workspace::{
    DisplayData as HoverDisplayDataSource, HoverStat as HoverStatSource,
};
use crate::insights::buildings::workspace::*;
use crate::insights::control::workspace::*;
use crate::insights::development::workspace::{
    CountryDevSummary, DevTopLocation, DevelopmentInsightData,
};
use crate::insights::distribution::workspace::*;
use crate::insights::markets::workspace::{
    GoodMarketBalanceCell, MarketInsightData, MarketProductionLocationSummary,
    ProductionLocationSummary, ScopedGoodSummary, ScopedMarketSummary,
};
use crate::insights::population::workspace::*;
use crate::insights::religion::workspace::*;
use crate::insights::rgo::workspace::*;
use crate::insights::state_efficacy::workspace::*;
use crate::insights::tax::workspace::*;
use crate::insights::{
    BuildingLevelsScopeSummary, ControlBandSegment, ControlScopeSummary, DevelopmentScopeSummary,
    DistributionBucket, GoodBreakdownEntry, MarketScopeSummary, PopulationConcentrationPoint,
    PopulationRankSegment, PopulationScopeSummary, PopulationTypeProfileRow, PossibleTaxScope,
    RgoScopeSummary, StateEfficacyScopeSummary, TaxGapScope,
};
use crate::overlay::{OverlayBodyConfigSource, OverlayTableSource, TableCellSource};
use crate::presentation::{CountryRefSource, Eu5Presenter, MarketRefSource};
use crate::selection::{
    GroupId, GroupingTable, LocationData, SelectionAdapter, SelectionState, single_entity_scope,
};
use crate::{MapMode, models::Terrain, subject_color};
use eu5save::hash::{FnvHashSet, FxHashMap, FxHashSet};
use eu5save::models::{
    CountryId, CountryIdx, CountryIndexedVecOwned,
    DiplomacySubjectType as SaveDiplomacySubjectType, Gamestate, GoodName, LocationIdx,
    LocationIndexedVec, LocationRank, Market, PopulationType,
};
use pdx_map::{GpuColor, GpuLocationIdx, LocationArrays, LocationFlags};
use std::collections::HashMap;
use std::sync::OnceLock;

/// An EU5 workspace combines the saved game state with patch-specific game data,
/// and manages rendering state including map modes and GPU data structures.
pub struct Eu5Workspace<'bump> {
    gamestate: Gamestate<'bump>,
    game_data: Box<GameData>,

    // Session data (relationships and indices)
    overlord_of: CountryIndexedVecOwned<Option<CountryIdx>>,
    location_terrain: LocationIndexedVec<Terrain>,
    location_building_levels: OnceLock<LocationIndexedVec<f64>>,

    // Map app state (rendering)
    current_map_mode: MapMode,
    location_arrays: pdx_map::LocationArrays,
    gpu_indices: LocationIndexedVec<Option<GpuLocationIdx>>,

    // Filter / selection state
    selection_state: SelectionState,
    derived_entity_anchor: Option<eu5save::models::LocationIdx>,
    derived_entity_kind: Option<EntityKind>,
}

enum SelectionSetOperation {
    Add,
    Remove,
    Replace,
}

fn market_good_breakdown_entries<T: std::fmt::Display>(
    entries: &[(T, f64)],
) -> Vec<GoodBreakdownEntry> {
    let mut result: Vec<GoodBreakdownEntry> = entries
        .iter()
        .map(|(category, amount)| GoodBreakdownEntry {
            category: category.to_string(),
            amount: *amount,
        })
        .collect();
    result.sort_by(|a, b| {
        b.amount
            .total_cmp(&a.amount)
            .then_with(|| a.category.cmp(&b.category))
    });
    result
}

/// Computes a "nice" step size for histogram buckets so boundaries fall on
/// round numbers (1, 2, 5, 10, 20, ...) rather than arbitrary fractions.
fn nice_bucket_step(range: f64, target_buckets: usize) -> f64 {
    let raw_step = range / target_buckets.max(1) as f64;
    if raw_step <= 0.0 {
        return 1.0;
    }
    let magnitude = 10.0_f64.powf(raw_step.log10().floor());
    let norm = raw_step / magnitude;
    let nice_norm = if norm <= 1.0 {
        1.0
    } else if norm <= 2.0 {
        2.0
    } else if norm <= 5.0 {
        5.0
    } else {
        10.0
    };
    nice_norm * magnitude
}

mod entity_profile;
mod hover;
mod insights;
mod map_render;
mod overlay;
mod selection_ops;

impl<'bump> Eu5Workspace<'bump> {
    /// Create a new workspace from loaded save data and game data provider
    pub fn new(
        gamestate: Gamestate<'bump>,
        game_data: GameData,
    ) -> Result<Self, crate::game_data::GameDataError> {
        let game_data = Box::new(game_data);

        let mut overlord_of = gamestate.countries.create_index(None);
        for dep in gamestate.diplomacy_manager.dependencies() {
            let Some(second_idx) = gamestate.countries.get(dep.second) else {
                continue;
            };

            let Some(first_idx) = gamestate.countries.get(dep.first) else {
                continue;
            };
            overlord_of[second_idx] = Some(first_idx);
        }

        let game_location_map: FxHashMap<_, _> = game_data
            .locations
            .iter()
            .map(|loc| (loc.name.as_str(), loc))
            .collect();

        let mut location_terrain = gamestate.locations.create_index(Terrain::default());
        let mut gpu_indices = gamestate.locations.create_index(None);
        let mut max_color_id = 0u16;

        // Build join by looking up each save location in game data
        let locations_iter = gamestate
            .locations
            .iter()
            .zip(gamestate.metadata().compatibility.locations_iter());

        for (location, (id, name)) in locations_iter {
            assert_eq!(
                location.id(),
                id,
                "Location ID mismatch: {} vs {}",
                location.id().value(),
                id.value()
            );

            let Some(game_loc) = game_location_map.get(name) else {
                continue;
            };

            location_terrain[location.idx()] = game_loc.terrain;

            let Some(spatial_loc) = game_loc.color_id else {
                continue;
            };

            max_color_id = max_color_id.max(spatial_loc.value());
            gpu_indices[location.idx()] = Some(GpuLocationIdx::new(spatial_loc.value()));
        }

        let location_arrays = LocationArrays::allocate((max_color_id as usize) + 1);

        let mut workspace = Self {
            gamestate,
            game_data,
            overlord_of,
            location_terrain,
            location_building_levels: OnceLock::new(),
            current_map_mode: MapMode::Political,
            location_arrays,
            gpu_indices,
            selection_state: SelectionState::new(),
            derived_entity_anchor: None,
            derived_entity_kind: None,
        };

        workspace.build_location_arrays();
        workspace.recompute_derived_scope();

        Ok(workspace)
    }

    pub fn gamestate(&self) -> &Gamestate<'bump> {
        &self.gamestate
    }

    pub(crate) fn game_data(&self) -> &GameData {
        &self.game_data
    }

    /// Pair this unlocalized workspace with a [`Localization`] to produce a
    /// presentation-capable wrapper. Cheap; the wrapper just borrows both
    /// values and gates `presenter()` access through them.
    pub fn localized<'a>(
        &'a self,
        localization: &'a crate::game_data::Localization,
    ) -> LocalizedEu5Workspace<'a, 'bump> {
        LocalizedEu5Workspace {
            workspace: self,
            localization,
        }
    }

    fn map_mode_for_entity_kind(kind: EntityKind) -> MapMode {
        match kind {
            EntityKind::Country => MapMode::Political,
            EntityKind::Market => MapMode::Markets,
        }
    }

    fn entity_kind_for_map_mode(mode: MapMode) -> EntityKind {
        match mode {
            MapMode::Markets => EntityKind::Market,
            _ => EntityKind::Country,
        }
    }

    fn recompute_derived_scope(&mut self) {
        let kind = Self::entity_kind_for_map_mode(self.current_map_mode);
        self.recompute_derived_scope_for_kind(kind);
    }

    fn recompute_derived_scope_for_kind(&mut self, kind: EntityKind) {
        let mode = Self::map_mode_for_entity_kind(kind);
        let anchor = single_entity_scope(&self.selection_state, &*self, mode);
        let full_coverage = anchor
            .map(|a| self.selection_covers_full_entity(a, kind))
            .unwrap_or(false);
        self.derived_entity_anchor = if full_coverage { anchor } else { None };
        self.derived_entity_kind = self.derived_entity_anchor.map(|_| kind);
    }

    fn derived_scope_map_mode(&self) -> MapMode {
        self.derived_entity_kind
            .map(Self::map_mode_for_entity_kind)
            .unwrap_or(self.current_map_mode)
    }

    fn map_click_derived_anchor(&self) -> Option<eu5save::models::LocationIdx> {
        let current_kind = Self::entity_kind_for_map_mode(self.current_map_mode);
        if self.derived_entity_kind == Some(current_kind) {
            self.derived_entity_anchor
        } else {
            None
        }
    }

    pub fn derived_entity_anchor(&self) -> Option<eu5save::models::LocationIdx> {
        self.derived_entity_anchor
    }

    fn country_ref_from_country_idx(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> CountryRefSource {
        CountryRefSource { country_idx }
    }

    fn owner_country_ref_for_location(
        &self,
        loc: &eu5save::models::Location,
    ) -> Option<CountryRefSource> {
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        Some(self.country_ref_from_country_idx(country_idx))
    }

    fn market_ref_for_location(&self, loc: &eu5save::models::Location) -> Option<MarketRefSource> {
        Some(MarketRefSource {
            market_id: loc.market?,
        })
    }
}

impl LocationData for Eu5Workspace<'_> {
    fn iter_locations(
        &self,
    ) -> impl Iterator<Item = (eu5save::models::LocationIdx, crate::selection::LocationInfo)> + '_
    {
        self.gamestate.locations.iter().map(|entry| {
            let loc = entry.location();
            (
                entry.idx(),
                crate::selection::LocationInfo {
                    owner: loc.owner.real_id(),
                    market: loc.market,
                },
            )
        })
    }

    fn location_info(&self, idx: eu5save::models::LocationIdx) -> crate::selection::LocationInfo {
        let loc = self.gamestate.locations.index(idx).location();
        crate::selection::LocationInfo {
            owner: loc.owner.real_id(),
            market: loc.market,
        }
    }
}

/// Borrow-only wrapper around an unlocalized [`Eu5Workspace`] plus a
/// [`Localization`](crate::game_data::Localization). Presentation entry point
/// for tests and native callers that need localized output.
pub struct LocalizedEu5Workspace<'a, 'bump> {
    pub workspace: &'a Eu5Workspace<'bump>,
    pub localization: &'a crate::game_data::Localization,
}

impl<'a, 'bump> LocalizedEu5Workspace<'a, 'bump> {
    pub fn presenter(&self) -> Eu5Presenter<'a, 'bump> {
        Eu5Presenter::new(self.workspace, self.localization)
    }
}

impl<'a, 'bump> std::ops::Deref for LocalizedEu5Workspace<'a, 'bump> {
    type Target = Eu5Workspace<'bump>;

    fn deref(&self) -> &Self::Target {
        self.workspace
    }
}

impl std::fmt::Debug for Eu5Workspace<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Eu5Workspace")
            .field("gamestate", &self.gamestate)
            .field("current_map_mode", &self.current_map_mode)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_workspace_is_send() {
        fn assert_send<T: Send + Sync>() {}
        assert_send::<Eu5Workspace>();
    }

    #[test]
    fn nice_bucket_step_zero_range_returns_fallback() {
        assert_eq!(nice_bucket_step(0.0, 20), 1.0);
    }

    #[test]
    fn nice_bucket_step_negative_range_returns_fallback() {
        assert_eq!(nice_bucket_step(-5.0, 20), 1.0);
    }

    #[test]
    fn nice_bucket_step_integer_range_snaps_to_round() {
        // 100 / 20 = 5.0 → already nice
        assert_eq!(nice_bucket_step(100.0, 20), 5.0);
    }

    #[test]
    fn nice_bucket_step_fractional_range_uses_fractional_step() {
        // 1.0 / 20 = 0.05 → magnitude 0.01, norm 5.0 → nice 5 * 0.01
        assert_eq!(nice_bucket_step(1.0, 20), 0.05);
    }

    #[test]
    fn nice_bucket_step_single_bucket_target() {
        // 100 / 1 = 100 → magnitude 100, norm 1.0 → nice 1 * 100
        assert_eq!(nice_bucket_step(100.0, 1), 100.0);
    }

    #[test]
    fn nice_bucket_step_zero_target_uses_max_one() {
        // target clamped to 1 → same as single bucket case
        assert_eq!(nice_bucket_step(100.0, 0), 100.0);
    }
}
