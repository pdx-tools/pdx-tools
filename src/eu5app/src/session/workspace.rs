use crate::entity_profile::{
    BuildingEntry, DiplomacySection, DiplomaticSummary, EconomicIndicator, EconomySection,
    EntityHeader, EntityKind, EntityRef, HeadlineStats, IndicatorFormat, LocationHeader,
    LocationProfile, LocationRow, LocationStats, LocationsSection, MarketGoodEntry,
    MarketMembership, OverviewSection, RankedLocation, ReligionShare,
};
use crate::game_data::GameData;
use crate::selection::{
    GroupId, GroupingTable, LocationData, SelectionAdapter, SelectionState, single_entity_scope,
};
use crate::selection_views::{
    CountryDevSummary, CountryPossibleTax, CountryTaxGap, DevTopLocation, DevelopmentInsightData,
    DistributionBucket, EntityBreakdownData, EntityBreakdownRow, HoverDisplayData, HoverStat,
    LocationDistribution, MarketInsightData, MarketScopeSummary, PopulationConcentrationPoint,
    PopulationInsightData, PopulationRankSegment, PopulationScopeSummary, PopulationTopLocation,
    PopulationTypeProfileRow, PossibleTaxInsightData, PossibleTaxScope, PossibleTaxTopLocation,
    ProductionLocationSummary, ScopeSummary, ScopedCountryPopulation, ScopedGoodSummary,
    ScopedMarketSummary, StateEfficacyTopLocation, TaxGapInsightData, TaxGapScope,
    TaxGapTopLocation,
};
use crate::{MapMode, OverlayBodyConfig, OverlayTable, TableCell, models::Terrain, subject_color};
use eu5save::hash::{FnvHashSet, FxHashMap};
use eu5save::models::{
    CountryId, CountryIdx, CountryIndexedVecOwned, Gamestate, LocationIdx, LocationIndexedVec,
    LocationRank, MarketId, PopulationType, RawMaterialsName,
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
            .locations()
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

    /// Get localized country name from a country tag.
    /// Returns the localized name if available, otherwise returns the tag itself.
    pub fn localized_country_name<'a>(
        &'a self,
        country_name: &'a eu5save::models::CountryName,
    ) -> &'a str {
        let tag = country_name.name().to_str();
        self.game_data.localized_country_name(tag).unwrap_or(tag)
    }

    pub fn gamestate(&self) -> &Gamestate<'bump> {
        &self.gamestate
    }

    /// Compute gradient domain bounds for a quantitative mode in a single pass.
    ///
    /// Returns `(global_max, filtered_max)`:
    fn gradient_domain(
        &self,
        extract: impl Fn(eu5save::models::LocationIdx, &eu5save::models::Location) -> f64,
    ) -> (f64, f64) {
        let has_selection = !self.selection_state.is_empty();
        let mut global_max = 0.0_f64;
        let mut filtered_max = 0.0_f64;
        for loc_entry in self.gamestate.locations.iter() {
            let idx = loc_entry.idx();
            let terrain = self.location_terrain(idx);
            if terrain.is_water() || !terrain.is_passable() {
                continue;
            }
            let loc = loc_entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            let value = extract(idx, loc);
            global_max = global_max.max(value);
            if !has_selection || self.selection_state.contains(idx) {
                filtered_max = filtered_max.max(value);
            }
        }
        (global_max, filtered_max)
    }

    fn gradient_range(
        &self,
        extract: impl Fn(eu5save::models::LocationIdx, &eu5save::models::Location) -> f64,
    ) -> (f64, f64) {
        self.gradient_range_with_filter(true, extract)
    }

    fn gradient_global_range(
        &self,
        extract: impl Fn(eu5save::models::LocationIdx, &eu5save::models::Location) -> f64,
    ) -> (f64, f64) {
        self.gradient_range_with_filter(false, extract)
    }

    fn gradient_range_with_filter(
        &self,
        filter_selection: bool,
        extract: impl Fn(eu5save::models::LocationIdx, &eu5save::models::Location) -> f64,
    ) -> (f64, f64) {
        let has_selection = !self.selection_state.is_empty();
        let mut min_value = f64::INFINITY;
        let mut max_value = f64::NEG_INFINITY;
        for loc_entry in self.gamestate.locations.iter() {
            let idx = loc_entry.idx();
            let terrain = self.location_terrain(idx);
            if terrain.is_water() || !terrain.is_passable() {
                continue;
            }
            if filter_selection && has_selection && !self.selection_state.contains(idx) {
                continue;
            }
            let loc = loc_entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            let value = extract(idx, loc);
            min_value = min_value.min(value);
            max_value = max_value.max(value);
        }

        if min_value.is_finite() && max_value.is_finite() {
            (min_value, max_value)
        } else {
            (0.0, 0.0)
        }
    }

    /// Effective max for the development gradient (filtered when selection active).
    pub fn max_development(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.development).1
    }

    /// Effective max for the RGO level gradient (filtered when selection active).
    pub fn max_rgo_level(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.rgo_level).1
    }

    /// Effective max for the population gradient (filtered when selection active).
    pub fn max_population(&self) -> f64 {
        self.gradient_domain(|_, loc| self.gamestate.location_population(loc))
            .1
    }

    /// Effective max for the building levels gradient (filtered when selection active).
    pub fn max_building_levels(&self) -> f64 {
        let levels = self.get_location_building_levels();
        self.gradient_domain(|idx, _| levels[idx]).1
    }

    /// Effective max for the possible tax gradient (filtered when selection active).
    pub fn max_possible_tax(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.possible_tax).1
    }

    pub fn tax_gap_range(&self) -> (f64, f64) {
        let (min, max) = self.gradient_range(|_, loc| loc.possible_tax - loc.tax);
        let max_abs = min.abs().max(max.abs());
        (min, max_abs)
    }

    /// Effective max for the state efficacy gradient (filtered when selection active).
    pub fn max_state_efficacy(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.control * loc.development)
            .1
    }

    /// Lazily computes and caches building levels for all locations.
    /// Returns a reference to the cached data.
    pub fn get_location_building_levels(&self) -> &LocationIndexedVec<f64> {
        self.location_building_levels
            .get_or_init(|| self.compute_location_building_levels())
    }

    /// Computes building levels for all locations in a single pass
    fn compute_location_building_levels(&self) -> LocationIndexedVec<f64> {
        let mut levels = self.gamestate.locations.create_index(0.0);

        // Single pass through all buildings
        for building in self.gamestate.building_manager.database.iter() {
            if let Some(loc_idx) = self.gamestate.locations.get(building.location) {
                let location = self.gamestate.locations.index(loc_idx).location();

                // Only count if building owner matches location owner
                if location.owner == building.owner {
                    levels[loc_idx] += building.level;
                }
            }
        }

        levels
    }

    pub fn location_name(&self, idx: eu5save::models::LocationIdx) -> &str {
        let index: usize = idx.value() as usize;
        self.gamestate
            .metadata
            .compatibility
            .locations
            .get(index)
            .map(|x| x.to_str())
            .unwrap_or("Unknown")
    }

    pub fn location_terrain(&self, idx: eu5save::models::LocationIdx) -> Terrain {
        self.location_terrain[idx]
    }

    pub fn location_political_color(&self, key: eu5save::models::LocationIdx) -> GpuColor {
        self.get_country_color_for_location(key, |loc| loc.owner.real_id())
    }

    pub fn location_control_color(&self, key: eu5save::models::LocationIdx) -> GpuColor {
        self.get_country_color_for_location(key, |loc| loc.controller.real_id())
    }

    pub fn location_development_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_dev: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        self.interpolate_brown_green(save_location.development, max_dev)
    }

    pub fn location_population_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_pop: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        let population = self.gamestate.location_population(save_location);
        self.interpolate_brown_green(population, max_pop)
    }

    pub fn location_control_value_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        self.interpolate_brown_green(save_location.control, 1.0)
    }

    pub fn location_market_color(&self, location_idx: eu5save::models::LocationIdx) -> GpuColor {
        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        let Some(market_id) = save_location.market else {
            let terrain = self.location_terrain(location_idx);
            if terrain.is_water() {
                return GpuColor::WATER;
            } else if !terrain.is_passable() {
                return GpuColor::IMPASSABLE;
            } else {
                return GpuColor::UNOWNED;
            }
        };

        let Some(market) = self.gamestate.market_manager.get(market_id) else {
            return GpuColor::DEBUG;
        };

        // Get the market center location's owner color
        let market_center_owner_color = self
            .gamestate
            .locations
            .get(market.center)
            .map(|center_idx| self.location_political_color(center_idx))
            .unwrap_or(GpuColor::UNOWNED);

        let market_color = GpuColor::from(market.color.0);

        // Blend market color (subject) with market center owner color (overlord) using HSV
        let owner_rgb = market_center_owner_color.rgb();
        let market_rgb = market_color.rgb();
        let blended_rgb = crate::subject_color::blend_color(market_rgb, owner_rgb);
        let blended_color = GpuColor::from_rgb(blended_rgb.0, blended_rgb.1, blended_rgb.2);

        // Apply market access: blend with dark red for low access
        let market_access = save_location.market_access.clamp(0.0, 1.0);
        let dark_red = GpuColor::from_rgb(20, 5, 5);

        // market_access = 1.0 -> market center owner+market blend
        // market_access = 0.0 -> dark red
        dark_red.blend(blended_color, market_access as f32)
    }

    pub fn location_rgo_level_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_rgo_level: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        // Simple brown-to-green interpolation
        // Brown at 0: RGB(101, 67, 33)
        // Green at max: RGB(34, 139, 34)
        let brown = GpuColor::from_rgb(101, 67, 33);
        let green = GpuColor::from_rgb(34, 139, 34);

        if max_rgo_level == 0.0 {
            return brown; // All brown if no RGO levels exist
        }

        let normalized = (save_location.rgo_level / max_rgo_level).clamp(0.0, 1.0);
        brown.blend(green, normalized as f32)
    }

    pub fn location_building_levels_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_building_levels: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        let levels = self.get_location_building_levels();
        let building_levels_sum = levels[location_idx];

        self.interpolate_brown_green(building_levels_sum, max_building_levels)
    }

    pub fn location_possible_tax_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_possible_tax: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        self.interpolate_brown_green(save_location.possible_tax, max_possible_tax)
    }

    pub fn location_tax_gap_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_abs_gap: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        let gap = save_location.possible_tax - save_location.tax;
        self.interpolate_tax_gap(gap, max_abs_gap)
    }

    pub fn location_state_efficacy_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_efficacy: f64,
    ) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        if save_location.owner.is_dummy() {
            return GpuColor::UNOWNED;
        }

        let efficacy = save_location.control * save_location.development;
        self.interpolate_brown_green(efficacy, max_efficacy)
    }

    pub(crate) fn get_country_color_for_location<F>(
        &self,
        location_idx: eu5save::models::LocationIdx,
        get_country: F,
    ) -> GpuColor
    where
        F: Fn(&eu5save::models::Location) -> Option<eu5save::models::RealCountryId>,
    {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();
        let Some(country_id) = get_country(save_location) else {
            return GpuColor::UNOWNED;
        };

        let Some(country_idx) = self.gamestate.countries.get(country_id) else {
            return GpuColor::UNOWNED;
        };

        let country_color = self
            .gamestate
            .countries
            .index(country_idx)
            .data()
            .map(|data| data.color);

        let Some(country_color) = country_color else {
            return GpuColor::UNOWNED;
        };

        let mut current_overlord = country_idx;
        let mut current_overlord_color = country_color;
        while let Some(dep) = self.overlord_of[current_overlord] {
            current_overlord = dep;

            let dep_color = self
                .gamestate
                .countries
                .index(current_overlord)
                .data()
                .map(|data| data.color);

            if let Some(dep_color) = dep_color {
                current_overlord_color = dep_color;
            }
        }

        if current_overlord != country_idx {
            // Subject country - blend
            let (r, g, b) = subject_color::blend_color(
                (country_color.0[0], country_color.0[1], country_color.0[2]),
                (
                    current_overlord_color.0[0],
                    current_overlord_color.0[1],
                    current_overlord_color.0[2],
                ),
            );
            GpuColor::from_rgb(r, g, b)
        } else {
            GpuColor::from(country_color.0)
        }
    }

    pub fn location_religion_color(&self, location_idx: eu5save::models::LocationIdx) -> GpuColor {
        let terrain = self.location_terrain(location_idx);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();

        let Some(religion_id) = save_location.religion else {
            return GpuColor::UNOWNED;
        };

        let Some(religion) = self.gamestate.religion_manager.lookup(religion_id) else {
            return GpuColor::DEBUG;
        };

        GpuColor::from(religion.color.0)
    }

    pub fn owner_religion_color(&self, location_idx: eu5save::models::LocationIdx) -> GpuColor {
        let save_location_entry = self.gamestate.locations.index(location_idx);
        let save_location = save_location_entry.location();
        let owner_id = save_location.owner;

        let Some(country_idx) = self.gamestate.countries.get(owner_id) else {
            return self.location_religion_color(location_idx);
        };

        let Some(country) = self.gamestate.countries.index(country_idx).data() else {
            return self.location_religion_color(location_idx);
        };

        let Some(owner_religion_id) = country.primary_religion else {
            return self.location_religion_color(location_idx);
        };

        let Some(owner_religion) = self.gamestate.religion_manager.lookup(owner_religion_id) else {
            return self.location_religion_color(location_idx);
        };

        GpuColor::from(owner_religion.color.0)
    }

    pub(crate) fn interpolate_brown_green(&self, value: f64, max_value: f64) -> GpuColor {
        if max_value == 0.0 {
            return GpuColor::from_rgb(20, 5, 5); // Dark red for no data
        }

        let normalized = (value / max_value).clamp(0.0, 1.0);

        // Three-color gradient:
        // Dark red at 0: RGB(20, 5, 5)
        // Brown at 0.5: RGB(101, 67, 33)
        // Green at 1: RGB(34, 139, 34)
        let dark_red = GpuColor::from_rgb(20, 5, 5);
        let brown = GpuColor::from_rgb(101, 67, 33);
        let green = GpuColor::from_rgb(34, 139, 34);

        if normalized <= 0.5 {
            // Blend from dark red to brown (0.0 to 0.5)
            let local_factor = normalized * 2.0; // Scale 0-0.5 to 0-1
            dark_red.blend(brown, local_factor as f32)
        } else {
            // Blend from brown to green (0.5 to 1.0)
            let local_factor = (normalized - 0.5) * 2.0; // Scale 0.5-1 to 0-1
            brown.blend(green, local_factor as f32)
        }
    }

    pub(crate) fn interpolate_tax_gap(&self, value: f64, max_abs_value: f64) -> GpuColor {
        let neutral = GpuColor::from_rgb(101, 67, 33);
        if max_abs_value == 0.0 {
            return neutral;
        }

        let overperforming = GpuColor::from_rgb(20, 5, 5);
        let untapped = GpuColor::from_rgb(34, 139, 34);
        let normalized = (value.abs() / max_abs_value).clamp(0.0, 1.0) as f32;

        if value < 0.0 {
            neutral.blend(overperforming, normalized)
        } else {
            neutral.blend(untapped, normalized)
        }
    }

    fn build_location_arrays(&mut self) {
        for location in self.gamestate.locations.iter() {
            let Some(gpu_index) = self.gpu_indices[location.idx()] else {
                tracing::debug!(id = ?location.id(), location_idx = ?location.idx(), "Skipping location not in texture");
                continue;
            };

            let terrain = self.location_terrain(location.idx());
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_location_id(pdx_map::LocationId::new(location.idx().value()));

            // Water locations get a specific color and no location borders
            if terrain.is_water() {
                gpu_location.set_primary_color(GpuColor::WATER);
                gpu_location.set_owner_color(GpuColor::WATER);
                gpu_location.set_secondary_color(GpuColor::WATER);
                gpu_location
                    .flags_mut()
                    .set(LocationFlags::NO_LOCATION_BORDERS);
                continue;
            }

            if !terrain.is_passable() {
                gpu_location.set_primary_color(GpuColor::IMPASSABLE);
                gpu_location.set_owner_color(GpuColor::IMPASSABLE);
                gpu_location.set_secondary_color(GpuColor::IMPASSABLE);
                continue;
            }

            let owner_color = self.location_political_color(location.idx());
            let control_color = self.location_control_color(location.idx());
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(owner_color);
            gpu_location.set_secondary_color(control_color);
            gpu_location.set_owner_color(owner_color);
        }
    }

    pub fn location_arrays(&self) -> &pdx_map::LocationArrays {
        &self.location_arrays
    }

    pub fn selection_state(&self) -> &SelectionState {
        &self.selection_state
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
        self.derived_entity_anchor = single_entity_scope(&self.selection_state, &*self, mode);
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

    /// Build a flat lookup table mapping GPU location index → group ID for
    /// the current map mode. Built once per mode switch; used by the map
    /// renderer for per-frame box-select preview highlighting.
    pub fn build_grouping_table(&self) -> GroupingTable {
        let len = self.location_arrays.len();
        let mut groups = vec![GroupId::NONE; len];

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            let Some(gpu_idx) = self.gpu_indices[entry.idx()] else {
                continue;
            };

            let group = match self.current_map_mode {
                MapMode::Markets => loc.market.map(GroupId::from_market),
                _ => loc.owner.real_id().map(GroupId::from_owner),
            };

            groups[gpu_idx.value() as usize] = group.unwrap_or(GroupId::NONE);
        }

        GroupingTable::new(groups)
    }

    /// Select the entity at `clicked_idx`, or focus a location when the current
    /// filter already resolves to that location's entity.
    pub fn select_entity(&mut self, clicked_idx: eu5save::models::LocationIdx) {
        let mode = self.current_map_mode;
        let derived_entity_anchor = self.map_click_derived_anchor();
        let outcome = SelectionAdapter::new(&*self).resolve_click(
            clicked_idx,
            mode,
            &self.selection_state,
            derived_entity_anchor,
        );

        let is_same_entity_click = outcome.focused_location.is_none()
            && !outcome.locations.is_empty()
            && self.selection_state.len() == outcome.locations.len()
            && derived_entity_anchor
                .is_some_and(|anchor| self.same_entity(anchor, clicked_idx, mode));

        if let Some(focus) = outcome.focused_location {
            if self.selection_state.focused_location() == Some(focus) {
                self.selection_state.clear_focus();
            } else {
                self.selection_state.set_focus(focus);
            }
        } else if is_same_entity_click {
            if self.selection_state.has_focus() {
                self.selection_state.clear_focus();
            }
        } else {
            self.selection_state.replace(outcome.locations);
        }
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    /// Add the entity at `clicked_idx` to the existing selection.
    pub fn add_entity(&mut self, clicked_idx: eu5save::models::LocationIdx) {
        let mode = self.current_map_mode;
        let derived_entity_anchor = self.map_click_derived_anchor();
        let outcome = SelectionAdapter::new(&*self).resolve_click(
            clicked_idx,
            mode,
            &self.selection_state,
            derived_entity_anchor,
        );
        if outcome.focused_location.is_some() {
            self.selection_state.set_focus(clicked_idx);
        } else {
            for idx in outcome.locations {
                self.selection_state.add(idx);
            }
        }
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    /// Remove the entity at `clicked_idx` from the selection.
    pub fn remove_entity(&mut self, clicked_idx: eu5save::models::LocationIdx) {
        let mode = self.current_map_mode;
        let kind = Self::entity_kind_for_map_mode(mode);
        let derived_entity_anchor = self.map_click_derived_anchor();
        let outcome = SelectionAdapter::new(&*self).resolve_click(
            clicked_idx,
            mode,
            &self.selection_state,
            derived_entity_anchor,
        );
        if outcome.focused_location.is_some() {
            self.selection_state.remove(clicked_idx);
        } else {
            self.remove_locations_from_scope_for_kind(&outcome.locations, kind);
        }
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    /// Replace the selection with the country owning `anchor_idx`.
    pub fn select_country_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<crate::ColorIdx> {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        if locs.is_empty() {
            return None;
        }
        self.selection_state.replace(locs);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        self.rebuild_colors();
        self.center_at(anchor_idx)
    }

    /// Add the country owning `anchor_idx` to the existing selection.
    pub fn add_country_at(&mut self, anchor_idx: eu5save::models::LocationIdx) {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        self.selection_state.add_all(&locs);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        self.rebuild_colors();
    }

    /// Remove the country owning `anchor_idx` from the selection.
    pub fn remove_country_at(&mut self, anchor_idx: eu5save::models::LocationIdx) {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        self.remove_locations_from_scope_for_kind(&locs, EntityKind::Country);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        self.rebuild_colors();
    }

    /// Replace the selection with the market containing `anchor_idx`.
    pub fn select_market_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<crate::ColorIdx> {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        if locs.is_empty() {
            return None;
        }
        self.selection_state.replace(locs);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        self.rebuild_colors();
        self.center_at(anchor_idx)
    }

    /// Add the market containing `anchor_idx` to the existing selection.
    pub fn add_market_at(&mut self, anchor_idx: eu5save::models::LocationIdx) {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        self.selection_state.add_all(&locs);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        self.rebuild_colors();
    }

    /// Remove the market containing `anchor_idx` from the selection.
    pub fn remove_market_at(&mut self, anchor_idx: eu5save::models::LocationIdx) {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        self.remove_locations_from_scope_for_kind(&locs, EntityKind::Market);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        self.rebuild_colors();
    }

    /// Apply a pre-resolved set of locations (produced by the map renderer's
    /// `commit_box_selection`) to the selection state.
    pub fn apply_resolved_box_selection(
        &mut self,
        resolved_locations: impl IntoIterator<Item = eu5save::models::LocationIdx>,
        add: bool,
    ) {
        let set: FnvHashSet<_> = resolved_locations.into_iter().collect();
        let operation = if add {
            SelectionSetOperation::Add
        } else {
            SelectionSetOperation::Remove
        };
        self.apply_selection_set(set, operation);
    }

    pub fn replace_selection_with_locations(
        &mut self,
        resolved_locations: impl IntoIterator<Item = eu5save::models::LocationIdx>,
    ) {
        let set: FnvHashSet<_> = resolved_locations.into_iter().collect();
        self.apply_selection_set(set, SelectionSetOperation::Replace);
    }

    fn apply_selection_set(
        &mut self,
        locations: FnvHashSet<eu5save::models::LocationIdx>,
        operation: SelectionSetOperation,
    ) {
        match operation {
            SelectionSetOperation::Add => self.selection_state.add_all(&locations),
            SelectionSetOperation::Remove => {
                let kind = Self::entity_kind_for_map_mode(self.current_map_mode);
                self.remove_locations_from_scope_for_kind(&locations, kind);
            }
            SelectionSetOperation::Replace => self.selection_state.replace(locations),
        }
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    fn remove_locations_from_scope_for_kind(
        &mut self,
        locations: &FnvHashSet<eu5save::models::LocationIdx>,
        kind: EntityKind,
    ) {
        if self.selection_state.is_empty() && !locations.is_empty() {
            let mode = Self::map_mode_for_entity_kind(kind);
            let global_locations = SelectionAdapter::new(&*self).resolve_all_in_entity_mode(mode);
            self.selection_state
                .remove_all_from_scope_or_global(locations, global_locations);
        } else {
            self.selection_state.remove_all(locations);
        }
    }

    pub fn clear_selection(&mut self) {
        self.selection_state.clear();
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    pub fn clear_focus(&mut self) {
        self.selection_state.clear_focus();
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    pub fn clear_focus_or_selection(&mut self) {
        if self.selection_state.has_focus() {
            self.selection_state.clear_focus();
        } else {
            self.selection_state.clear();
        }
        self.recompute_derived_scope();
        self.rebuild_colors();
    }

    /// Set focus to `location`, replacing the filter with its entity first if
    /// the current filter does not already resolve to that entity.
    pub fn set_focused_location(
        &mut self,
        location: eu5save::models::LocationIdx,
    ) -> Option<crate::ColorIdx> {
        let scope_mode = self.derived_scope_map_mode();
        let already_scoped_here = self
            .derived_entity_anchor
            .map(|anchor| self.same_entity(location, anchor, scope_mode))
            .unwrap_or(false);

        if !already_scoped_here {
            let entity_locs = SelectionAdapter::new(&*self)
                .resolve_in_entity_mode(location, self.current_map_mode);
            if entity_locs.is_empty() {
                return None;
            }
            self.selection_state.replace(entity_locs);
            self.recompute_derived_scope();
        }

        self.selection_state.set_focus(location);
        self.recompute_derived_scope();
        self.rebuild_colors();
        self.center_at(location)
    }

    pub fn focused_location_display_name(&self) -> Option<String> {
        self.selection_state
            .focused_location()
            .map(|idx| self.location_name(idx).to_string())
    }

    /// Display name for the currently derived single-entity scope.
    pub fn scope_display_name(&self) -> Option<String> {
        let anchor = self.derived_entity_anchor?;
        let loc = self.gamestate.locations.index(anchor).location();
        match self.derived_entity_kind? {
            EntityKind::Market => {
                let market_id = loc.market?;
                let market = self.gamestate.market_manager.get(market_id)?;
                let center_idx = self.gamestate.locations.get(market.center)?;
                Some(format!("{} Market", self.location_name(center_idx)))
            }
            EntityKind::Country => {
                let owner_id = loc.owner.real_id()?;
                let country_id = owner_id.country_id();
                let country_idx = self.gamestate.countries.get(country_id)?;
                let entry = self.gamestate.countries.index(country_idx);
                Some(
                    entry
                        .data()
                        .map(|data| self.localized_country_name(&data.country_name).to_string())
                        .unwrap_or_else(|| format!("Country {}", country_id.value())),
                )
            }
        }
    }

    /// Select all locations owned by human-controlled countries and their subjects.
    pub fn select_players(&mut self) {
        let player_idxs: FnvHashSet<CountryIdx> = self
            .gamestate
            .played_countries
            .iter()
            .filter_map(|p| self.gamestate.countries.get(p.country))
            .collect();

        if player_idxs.is_empty() {
            return;
        }

        let player_and_subjects: FnvHashSet<CountryIdx> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                self.is_player_or_subject(entry.idx(), &player_idxs)
                    .then_some(entry.idx())
            })
            .collect();

        let locations: FnvHashSet<eu5save::models::LocationIdx> = self
            .gamestate
            .locations
            .iter()
            .filter_map(|entry| {
                let owner_id = entry.location().owner.real_id()?;
                let owner_idx = self.gamestate.countries.get(owner_id.country_id())?;
                player_and_subjects
                    .contains(&owner_idx)
                    .then_some(entry.idx())
            })
            .collect();

        self.selection_state
            .replace_with_preset(locations, crate::selection::SelectionPreset::Players);
        self.recompute_derived_scope();
    }

    fn is_player_or_subject(
        &self,
        mut current: CountryIdx,
        player_idxs: &FnvHashSet<CountryIdx>,
    ) -> bool {
        loop {
            if player_idxs.contains(&current) {
                return true;
            }
            match self.overlord_of[current] {
                Some(overlord) => current = overlord,
                None => return false,
            }
        }
    }

    /// Rebuild all GPU location colors for the current mode and selection.
    /// Call this after any mutation that affects the selection or rendered values.
    pub fn rebuild_colors(&mut self) {
        self.set_map_mode(self.current_map_mode);
    }

    pub fn set_map_mode(&mut self, mode: MapMode) {
        self.current_map_mode = mode;

        // Apply colors based on mode
        match mode {
            MapMode::Political => self.apply_political_colors(),
            MapMode::Control => self.apply_control_colors(),
            MapMode::Development => self.apply_development_colors(),
            MapMode::Population => self.apply_population_colors(),
            MapMode::Markets => self.apply_markets_colors(),
            MapMode::RgoLevel => self.apply_rgo_level_colors(),
            MapMode::BuildingLevels => self.apply_building_levels_colors(),
            MapMode::PossibleTax => self.apply_possible_tax_colors(),
            MapMode::TaxGap => self.apply_tax_gap_colors(),
            MapMode::Religion => self.apply_religion_colors(),
            MapMode::StateEfficacy => self.apply_state_efficacy_colors(),
        }

        self.apply_selection_dimming();
        self.apply_focused_flag();
    }

    fn apply_selection_dimming(&mut self) {
        if self.selection_state.is_empty() {
            return;
        }

        const DIM: f32 = 0.3;
        for idx in 0..self.gamestate.locations.len() {
            let loc = eu5save::models::LocationIdx::new(idx as u32);
            let terrain = self.location_terrain(loc);
            if terrain.is_water() || !terrain.is_passable() {
                continue;
            }
            if self.selection_state.contains(loc) {
                continue;
            }
            let Some(gpu_idx) = self.gpu_indices[loc] else {
                continue;
            };
            let mut s = self.location_arrays.get_mut(gpu_idx);
            s.set_primary_color(s.primary_color().dim(DIM));
            s.set_secondary_color(s.secondary_color().dim(DIM));
        }
    }

    fn apply_focused_flag(&mut self) {
        // Clear all focused flags
        let mut iter = self.location_arrays.iter_mut();
        while let Some(mut loc) = iter.next_location() {
            loc.flags_mut().clear(LocationFlags::FOCUSED);
        }
        // Set focused flag for the focused location
        if let Some(fl) = self.selection_state.focused_location()
            && let Some(gpu_idx) = self.gpu_indices[fl]
        {
            let mut state = self.location_arrays.get_mut(gpu_idx);
            state.flags_mut().set(LocationFlags::FOCUSED);
        }
    }

    fn apply_political_colors(&mut self) {
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };

            let primary = self.location_political_color(location_idx);
            let controller = self.location_control_color(location_idx);
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(primary);
            gpu_location.set_secondary_color(controller);
        }
    }

    fn apply_control_colors(&mut self) {
        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let control_color = self.location_control_value_color(location_idx);
            color_data.push((idx, control_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Control mode: copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_development_colors(&mut self) {
        let (global_max, filtered_max) = self.gradient_domain(|_, loc| loc.development);

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let development_color = self.location_development_color(location_idx, max);
            color_data.push((idx, development_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_population_colors(&mut self) {
        let (global_max, filtered_max) =
            self.gradient_domain(|_, loc| self.gamestate.location_population(loc));

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let population_color = self.location_population_color(location_idx, max);
            color_data.push((idx, population_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_markets_colors(&mut self) {
        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let market_color = self.location_market_color(location_idx);
            color_data.push((idx, market_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_rgo_level_colors(&mut self) {
        let (global_max, filtered_max) = self.gradient_domain(|_, loc| loc.rgo_level);

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let rgo_level_color = self.location_rgo_level_color(location_idx, max);
            color_data.push((idx, rgo_level_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_building_levels_colors(&mut self) {
        let levels = self.get_location_building_levels();
        let (global_max, filtered_max) = self.gradient_domain(|idx, _| levels[idx]);

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let building_levels_color = self.location_building_levels_color(location_idx, max);
            color_data.push((idx, building_levels_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_possible_tax_colors(&mut self) {
        let (global_max, filtered_max) = self.gradient_domain(|_, loc| loc.possible_tax);

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let possible_tax_color = self.location_possible_tax_color(location_idx, max);
            color_data.push((idx, possible_tax_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_tax_gap_colors(&mut self) {
        let (global_min, global_max) =
            self.gradient_global_range(|_, loc| loc.possible_tax - loc.tax);
        let global_max_abs = global_min.abs().max(global_max.abs());
        let (filtered_min, filtered_max) = if self.selection_state.is_empty() {
            (global_min, global_max)
        } else {
            self.gradient_range(|_, loc| loc.possible_tax - loc.tax)
        };
        let filtered_max_abs = filtered_min.abs().max(filtered_max.abs());

        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max_abs
            } else {
                global_max_abs
            };
            color_data.push((idx, self.location_tax_gap_color(location_idx, max)));
        }

        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_state_efficacy_colors(&mut self) {
        let (global_max, filtered_max) =
            self.gradient_domain(|_, loc| loc.control * loc.development);

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let efficacy_color = self.location_state_efficacy_color(location_idx, max);
            color_data.push((idx, efficacy_color));
        }

        // Apply colors
        for (idx, color) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(color);
        }

        // Copy primary colors to secondary to disable stripes
        self.location_arrays.copy_primary_to_secondary();
    }

    fn apply_religion_colors(&mut self) {
        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let religion_color = self.location_religion_color(location_idx);
            let owner_religion_color = self.owner_religion_color(location_idx);
            color_data.push((idx, religion_color, owner_religion_color));
        }

        // Apply colors
        for (idx, primary, secondary) in color_data {
            let gpu_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[gpu_idx] else {
                continue;
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(primary);
            gpu_location.set_secondary_color(secondary);
        }
    }

    pub fn get_map_mode(&self) -> MapMode {
        self.current_map_mode
    }

    pub fn hover_data(&self, location_idx: LocationIdx) -> HoverDisplayData {
        let mode = self.get_map_mode();
        let location = self.gamestate().locations.index(location_idx).location();

        if location.owner.is_dummy() {
            return HoverDisplayData::Clear;
        }

        let should_show_location = self
            .derived_entity_anchor()
            .map(|anchor| self.same_entity(anchor, location_idx, mode))
            .unwrap_or(false);

        if should_show_location {
            HoverDisplayData::Location {
                location_id: location_idx.value(),
                location_name: self.location_name(location_idx).to_string(),
                stat: self.location_stat(mode, location_idx, location),
            }
        } else if mode == MapMode::Markets {
            self.market_hover(location_idx, location)
                .unwrap_or(HoverDisplayData::Clear)
        } else {
            self.country_hover(location_idx, location, mode)
                .unwrap_or(HoverDisplayData::Clear)
        }
    }

    fn location_stat(
        &self,
        mode: MapMode,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> HoverStat {
        match mode {
            MapMode::Political => HoverStat::None,
            MapMode::Control => HoverStat::Control {
                value: location.control,
            },
            MapMode::Development => HoverStat::Development {
                value: location.development,
            },
            MapMode::Population => HoverStat::Population {
                value: self.gamestate().location_population(location) as u32,
            },
            MapMode::Markets => HoverStat::Markets {
                access: location.market_access,
            },
            MapMode::RgoLevel => HoverStat::RgoLevel {
                value: location.rgo_level,
            },
            MapMode::BuildingLevels => HoverStat::BuildingLevels {
                value: self.get_location_building_levels()[location_idx],
            },
            MapMode::PossibleTax => HoverStat::PossibleTax {
                value: location.possible_tax,
            },
            MapMode::TaxGap => HoverStat::TaxGap {
                value: location.possible_tax - location.tax,
            },
            MapMode::Religion => location
                .religion
                .and_then(|rid| self.gamestate().religion_manager.lookup(rid))
                .map(|religion| HoverStat::Religion {
                    name: religion.name.to_str().to_string(),
                })
                .unwrap_or(HoverStat::None),
            MapMode::StateEfficacy => HoverStat::StateEfficacy {
                value: location.control * location.development,
            },
        }
    }

    fn country_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
        mode: MapMode,
    ) -> Option<HoverDisplayData> {
        let owner_id = location.owner;
        let country = self.gamestate().countries.get_entry(owner_id)?;
        let country_tag = country.tag().to_str().to_string();
        let country_name = country
            .data()
            .map(|data| self.localized_country_name(&data.country_name))
            .map(|name| name.to_string())
            .unwrap_or_else(|| format!("C{}", owner_id.value()));

        Some(HoverDisplayData::Country {
            location_id: location_idx.value(),
            country_tag: country_tag.clone(),
            country_name: format!("{country_name} ({country_tag})"),
            stat: self.country_stat(mode, owner_id),
        })
    }

    fn market_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> Option<HoverDisplayData> {
        let market_id = location.market?;
        let market = self.gamestate().market_manager.get(market_id)?;
        let center_idx = self.gamestate().locations.get(market.center)?;

        Some(HoverDisplayData::Market {
            location_id: location_idx.value(),
            market_center_name: self.location_name(center_idx).to_string(),
            market_value: market.market_value(),
        })
    }

    fn country_stat(&self, mode: MapMode, owner_id: CountryId) -> HoverStat {
        match mode {
            MapMode::Political => HoverStat::None,
            MapMode::Control => {
                let mut control_sum = 0.0;
                let mut count = 0_u32;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        control_sum += location.control;
                        count += 1;
                    }
                }

                if count == 0 {
                    HoverStat::None
                } else {
                    HoverStat::Control {
                        value: control_sum / count as f64,
                    }
                }
            }
            MapMode::Development => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.development;
                    }
                }

                HoverStat::Development { value: total }
            }
            MapMode::Population => {
                let mut total = 0_u32;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += self.gamestate().location_population(location) as u32;
                    }
                }

                HoverStat::Population { value: total }
            }
            MapMode::Markets => HoverStat::None,
            MapMode::RgoLevel => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.rgo_level;
                    }
                }

                HoverStat::RgoLevel { value: total }
            }
            MapMode::BuildingLevels => {
                let building_levels = self.get_location_building_levels();
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    if entry.location().owner == owner_id {
                        total += building_levels[entry.idx()];
                    }
                }

                HoverStat::BuildingLevels { value: total }
            }
            MapMode::PossibleTax => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax;
                    }
                }

                HoverStat::PossibleTax { value: total }
            }
            MapMode::TaxGap => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax - location.tax;
                    }
                }

                HoverStat::TaxGap { value: total }
            }
            MapMode::Religion => self
                .gamestate()
                .countries
                .get_entry(owner_id)
                .and_then(|country| country.data())
                .and_then(|data| data.primary_religion)
                .and_then(|religion_id| self.gamestate().religion_manager.lookup(religion_id))
                .map(|religion| HoverStat::Religion {
                    name: religion.name.to_str().to_string(),
                })
                .unwrap_or(HoverStat::None),
            MapMode::StateEfficacy => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.control * location.development;
                    }
                }

                HoverStat::StateEfficacy { value: total }
            }
        }
    }

    /// Return the GPU color ID needed to center the map at this location.
    pub fn center_at(&self, location_idx: eu5save::models::LocationIdx) -> Option<crate::ColorIdx> {
        self.gpu_indices[location_idx].map(|gpu_idx| crate::ColorIdx::new(gpu_idx.value()))
    }

    /// Get the color ID of the player's capital location for map centering.
    /// Returns None if no player country, no capital, or capital has no map presence.
    pub fn player_capital_color_id(&self) -> Option<crate::ColorIdx> {
        let player_country = self.gamestate.played_countries.first()?.country;
        let country_idx = self.gamestate.countries.get(player_country)?;
        let capital_id = self
            .gamestate
            .countries
            .index(country_idx)
            .data()?
            .capital?;

        // Look up capital in gpu_indices (already mapped during initialization)
        let capital_idx = self.gamestate.locations.get(capital_id)?;
        let gpu_idx = self.gpu_indices[capital_idx]?;

        Some(crate::ColorIdx::new(gpu_idx.value()))
    }

    /// Check if a location can be highlighted based on its terrain (not water and not impassable)
    pub fn can_highlight_location(&self, location_idx: eu5save::models::LocationIdx) -> bool {
        let terrain = self.location_terrain(location_idx);

        // Can highlight if terrain is not water and not impassable
        !terrain.is_water() && terrain.is_passable()
    }

    pub fn clear_highlights(&mut self) {
        let mut iter = self.location_arrays.iter_mut();
        while let Some(mut location) = iter.next_location() {
            location.flags_mut().clear(LocationFlags::HIGHLIGHTED);
        }
    }

    pub fn handle_location_hover(&mut self, location_idx: eu5save::models::LocationIdx) {
        let scope_mode = self.derived_scope_map_mode();

        if tracing::enabled!(tracing::Level::WARN) {
            let entity_anchor = single_entity_scope(&self.selection_state, &*self, scope_mode);
            if self.derived_entity_anchor != entity_anchor {
                tracing::warn!(
                    "derived_entity_anchor mismatch: expected {:?}, got {:?}",
                    entity_anchor,
                    self.derived_entity_anchor
                );
            }
        }

        if let Some(anchor) = self.derived_entity_anchor
            && self.same_entity(location_idx, anchor, scope_mode)
        {
            if !self.can_highlight_location(location_idx) {
                return;
            }
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                return;
            };
            let mut state = self.location_arrays.get_mut(gpu_index);
            state.flags_mut().set(LocationFlags::HIGHLIGHTED);
            return;
        }

        self.highlight_entity(location_idx);
    }

    fn highlight_entity(&mut self, location_idx: eu5save::models::LocationIdx) {
        let location = self.gamestate.locations.index(location_idx).location();

        if self.current_map_mode == MapMode::Markets {
            let Some(market_id) = location.market else {
                return;
            };

            let mut idxs = self.gamestate.locations.create_index(false);
            for entry in self.gamestate.locations.iter() {
                idxs[entry.idx()] = entry.location().market == Some(market_id);
            }

            let mut iter = self.location_arrays.iter_mut();
            while let Some(mut loc) = iter.next_location() {
                let loc_idx = eu5save::models::LocationIdx::new(loc.location_id().value());
                if idxs[loc_idx] {
                    loc.flags_mut().set(LocationFlags::HIGHLIGHTED);
                }
            }
        } else {
            let owner = location.owner.real_id();
            let mut idxs = self.gamestate.locations.create_index(false);

            if let Some(owner) = owner {
                for entry in self.gamestate.locations.iter() {
                    idxs[entry.idx()] =
                        entry.location().owner.real_id().is_some_and(|x| x == owner);
                }
            }

            let mut iter = self.location_arrays.iter_mut();
            while let Some(mut loc) = iter.next_location() {
                let loc_idx = eu5save::models::LocationIdx::new(loc.location_id().value());
                if idxs[loc_idx] {
                    loc.flags_mut().set(LocationFlags::HIGHLIGHTED);
                }
            }
        }
    }

    /// Get screenshot overlay data for the current map mode
    pub fn get_overlay_data(&self) -> crate::OverlayBodyConfig {
        self.get_overlay_data_for_map_mode(self.current_map_mode)
    }

    // ===== Overlay Data Generation Methods =====

    pub fn get_overlay_data_for_map_mode(&self, map_mode: MapMode) -> OverlayBodyConfig {
        match map_mode {
            MapMode::Political => self.generate_political_overlay_data(),
            MapMode::RgoLevel => self.generate_rgo_level_overlay_data(),
            MapMode::BuildingLevels => self.generate_building_levels_overlay_data(),
            MapMode::Markets => self.generate_markets_overlay_data(),
            _ => self.generate_empty_overlay_data(),
        }
    }

    fn find_root_overlord(
        &self,
        country_idx: CountryIdx,
        cache: &mut CountryIndexedVecOwned<Option<CountryIdx>>,
    ) -> CountryIdx {
        if let Some(root) = cache[country_idx] {
            return root;
        }

        let mut path = Vec::new();
        let mut current = country_idx;

        loop {
            if let Some(root) = cache[current] {
                for idx in path {
                    cache[idx] = Some(root);
                }
                return root;
            }

            path.push(current);

            match self.overlord_of[current] {
                Some(parent) => {
                    current = parent;
                }
                None => {
                    for idx in path {
                        cache[idx] = Some(current);
                    }
                    cache[current] = Some(current);
                    return current;
                }
            }
        }
    }

    fn generate_political_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        let mut direct_counts = self.gamestate.countries.create_index(0u32);
        let mut realm_counts = self.gamestate.countries.create_index(0u32);
        let mut root_cache = self.gamestate.countries.create_index(None);

        let mut has_any_owner = false;

        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();
            let owner_id = location.owner;
            let Some(owner_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };

            direct_counts[owner_idx] = direct_counts[owner_idx].saturating_add(1);

            let root_idx = self.find_root_overlord(owner_idx, &mut root_cache);
            realm_counts[root_idx] = realm_counts[root_idx].saturating_add(1);

            has_any_owner = true;
        }

        if !has_any_owner {
            return self.generate_empty_overlay_data();
        }

        struct CountryOwnershipSummary {
            id: CountryId,
            label: String,
            direct: u32,
            realm_total: u32,
        }

        let mut summaries: Vec<CountryOwnershipSummary> = Vec::new();

        for entry in self.gamestate.countries.iter() {
            let idx = entry.idx();
            let direct = direct_counts[idx];
            let realm_total = realm_counts[idx];

            if direct == 0 && realm_total == 0 {
                continue;
            }

            let tag = entry.tag().to_str();
            let display_name = entry
                .data()
                .map(|data| self.localized_country_name(&data.country_name))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(tag);

            summaries.push(CountryOwnershipSummary {
                id: entry.id(),
                label: display_name.to_string(),
                direct,
                realm_total,
            });
        }

        let mut direct_rows: Vec<_> = summaries
            .iter()
            .filter(|summary| summary.direct > 0)
            .collect();

        direct_rows.sort_by(|a, b| {
            b.direct
                .cmp(&a.direct)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let left_table_rows: Vec<Vec<TableCell>> = direct_rows
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label.clone()),
                    TableCell::Integer(summary.direct as i64),
                ]
            })
            .collect();

        let mut realm_rows: Vec<_> = summaries
            .iter()
            .filter(|summary| summary.realm_total > 0)
            .collect();

        realm_rows.sort_by(|a, b| {
            b.realm_total
                .cmp(&a.realm_total)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let right_table_rows: Vec<Vec<TableCell>> = realm_rows
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label.clone()),
                    TableCell::Integer(summary.realm_total as i64),
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Top Location Owners".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Country".to_string(),
                    "Locations".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Top Realms (Subjects included)".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Country".to_string(),
                    "Locations".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }

    fn generate_empty_overlay_data(&self) -> OverlayBodyConfig {
        OverlayBodyConfig {
            left_table: OverlayTable {
                title: None,
                headers: vec!["".to_string(), "".to_string()],
                rows: vec![
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                ],
            },
            right_table: OverlayTable {
                title: None,
                headers: vec!["".to_string(), "".to_string()],
                rows: vec![
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                ],
            },
            max_rows: None,
        }
    }

    fn generate_rgo_level_overlay_data(&self) -> OverlayBodyConfig {
        #[derive(Debug)]
        struct ResourceSummary {
            total_levels: f64,
            location_count: u32,
        }

        #[derive(Debug, Clone, PartialEq)]
        struct LocationRgoData<'a> {
            name: &'a str,
            id: u32,
            owner_id: CountryId,
            resource_name: RawMaterialsName<'a>,
            rgo_level: f64,
        }

        impl<'a> Eq for LocationRgoData<'a> {}

        impl<'a> PartialOrd for LocationRgoData<'a> {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl<'a> Ord for LocationRgoData<'a> {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.rgo_level
                    .total_cmp(&other.rgo_level)
                    .then_with(|| self.id.cmp(&other.id)) // Tie-breaker for deterministic ordering
            }
        }

        // Separate collections: one for resource summaries, one for top locations
        let mut resource_summaries: HashMap<RawMaterialsName, ResourceSummary> = HashMap::new();
        let mut top_locations: std::collections::BinaryHeap<std::cmp::Reverse<LocationRgoData>> =
            std::collections::BinaryHeap::new();

        // Iterate through all locations using the locations database
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();
            let owner = location.owner;

            let Some(raw_material) = location.raw_material else {
                continue; // Skip if no raw material
            };

            // Skip if no RGO level
            if location.rgo_level <= 0.0 {
                continue;
            }

            let location_id = location_entry.id();
            let location_name = self.location_name(location_entry.idx());

            // Update resource summary
            let summary = resource_summaries
                .entry(raw_material)
                .or_insert(ResourceSummary {
                    total_levels: 0.0,
                    location_count: 0,
                });
            summary.total_levels += location.rgo_level;
            summary.location_count += 1;

            // Maintain top 10 locations using min-heap
            let location_data = LocationRgoData {
                name: location_name,
                id: location_id.value(),
                owner_id: owner,
                resource_name: raw_material,
                rgo_level: location.rgo_level,
            };

            if top_locations.len() < 10 {
                top_locations.push(std::cmp::Reverse(location_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_locations.peek()
                && location_data.rgo_level > smallest.rgo_level
            {
                top_locations.pop();
                top_locations.push(std::cmp::Reverse(location_data));
            }
        }

        // Generate left table: top resources by average level
        let mut resource_summary = resource_summaries
            .iter()
            .map(|(resource, summary)| {
                let avg = summary.total_levels / (summary.location_count as f64);
                (resource, avg, summary.location_count, summary.total_levels)
            })
            .collect::<Vec<_>>();

        resource_summary.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        resource_summary.truncate(10);

        let left_table_rows: Vec<Vec<TableCell>> = resource_summary
            .into_iter()
            .enumerate()
            .map(|(i, (resource, avg, count, total))| {
                vec![
                    TableCell::Text(format!("{}. {}", i + 1, resource)),
                    TableCell::Float {
                        value: avg,
                        decimals: 1,
                    },
                    TableCell::Integer(count as i64),
                    TableCell::Float {
                        value: total,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        // Generate right table: top locations by RGO level
        // Extract locations from heap and sort in descending order
        let top_locations_vec: Vec<_> = top_locations
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(location)| location)
            .collect();

        let right_table_rows: Vec<Vec<TableCell>> = top_locations_vec
            .into_iter()
            .map(|location_data| {
                let owner = self
                    .gamestate
                    .countries
                    .get(location_data.owner_id)
                    .and_then(|idx| self.gamestate.countries.index(idx).data())
                    .map(|x| self.localized_country_name(&x.country_name))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("C{}", location_data.owner_id.value()));

                vec![
                    TableCell::Text(location_data.name.to_string()),
                    TableCell::Text(owner),
                    TableCell::Text(location_data.resource_name.to_string()),
                    TableCell::Integer(location_data.id as i64),
                    TableCell::Float {
                        value: location_data.rgo_level,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Highest Average RGO Levels".to_string()),
                headers: vec![
                    "Resource".to_string(),
                    "Avg".to_string(),
                    "Loc".to_string(),
                    "Total".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Highest RGO Levels by Location".to_string()),
                headers: vec![
                    "Location".to_string(),
                    "Tag".to_string(),
                    "Resource".to_string(),
                    "ID".to_string(),
                    "Level".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(10),
        }
    }

    fn generate_building_levels_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        #[derive(Debug, Clone, PartialEq)]
        struct LocationBuildingData {
            id: u32,
            owner_id: CountryId,
            building_levels_sum: f64,
        }

        impl Eq for LocationBuildingData {}

        impl PartialOrd for LocationBuildingData {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl Ord for LocationBuildingData {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.building_levels_sum
                    .total_cmp(&other.building_levels_sum)
                    .then_with(|| self.id.cmp(&other.id))
            }
        }

        let building_levels = self.get_location_building_levels();

        // Track country-level stats: total building levels and location count
        let mut country_total_levels = self.gamestate.countries.create_index(0.0_f64);
        let mut country_location_count = self.gamestate.countries.create_index(0_u32);

        // Track top locations using min-heap
        let mut top_locations: std::collections::BinaryHeap<
            std::cmp::Reverse<LocationBuildingData>,
        > = std::collections::BinaryHeap::new();

        // Iterate through all locations
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();

            let owner_id = location.owner;
            let Some(owner_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };

            let building_levels_sum = building_levels[location_entry.idx()];

            // Update country stats (include all locations, even those with 0 matching buildings)
            country_total_levels[owner_idx] += building_levels_sum;
            country_location_count[owner_idx] += 1;

            // Track top 10 locations
            let location_data = LocationBuildingData {
                id: location_entry.id().value(),
                owner_id,
                building_levels_sum,
            };

            if top_locations.len() < MAX_ROWS {
                top_locations.push(std::cmp::Reverse(location_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_locations.peek()
                && location_data.building_levels_sum > smallest.building_levels_sum
            {
                top_locations.pop();
                top_locations.push(std::cmp::Reverse(location_data));
            }
        }

        // Generate left table: top countries by average building levels
        struct CountrySummary {
            id: CountryId,
            label: String,
            avg_levels: f64,
        }

        let mut country_summaries: Vec<CountrySummary> = Vec::new();

        for entry in self.gamestate.countries.iter() {
            let idx = entry.idx();
            let location_count = country_location_count[idx];

            if location_count == 0 {
                continue;
            }

            let total_levels = country_total_levels[idx];
            let avg_levels = total_levels / (location_count as f64);

            let tag = entry.tag().to_str();
            let display_name = entry
                .data()
                .map(|data| self.localized_country_name(&data.country_name))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(tag);

            country_summaries.push(CountrySummary {
                id: entry.id(),
                label: display_name.to_string(),
                avg_levels,
            });
        }

        // Sort by average descending, with ID as tiebreaker
        country_summaries.sort_by(|a, b| {
            b.avg_levels
                .total_cmp(&a.avg_levels)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let left_table_rows: Vec<Vec<TableCell>> = country_summaries
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label),
                    TableCell::Float {
                        value: summary.avg_levels,
                        decimals: 1,
                    },
                ]
            })
            .collect();

        // Generate right table: top locations by building levels sum
        let top_locations_vec: Vec<_> = top_locations
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(location)| location)
            .collect();

        let right_table_rows: Vec<Vec<TableCell>> = top_locations_vec
            .into_iter()
            .enumerate()
            .map(|(idx, location_data)| {
                let owner = self
                    .gamestate
                    .countries
                    .get(location_data.owner_id)
                    .and_then(|idx| self.gamestate.countries.index(idx).data())
                    .map(|x| self.localized_country_name(&x.country_name))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("C{}", location_data.owner_id.value()));

                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Integer(location_data.id as i64),
                    TableCell::Text(owner),
                    TableCell::Float {
                        value: location_data.building_levels_sum,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Highest Average Building Levels".to_string()),
                headers: vec!["#".to_string(), "Country".to_string(), "Avg".to_string()],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Highest Building Levels by Location".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Location ID".to_string(),
                    "Country".to_string(),
                    "Total".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }

    fn generate_markets_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        #[derive(Debug, Clone, PartialEq)]
        struct MarketData {
            center_location_id: u32,
            center_location_name: String,
            market_value: f64,
        }

        impl Eq for MarketData {}

        impl PartialOrd for MarketData {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl Ord for MarketData {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.market_value
                    .total_cmp(&other.market_value)
                    .then_with(|| self.center_location_id.cmp(&other.center_location_id))
            }
        }

        // Track top 10 markets using min-heap
        let mut top_markets: std::collections::BinaryHeap<std::cmp::Reverse<MarketData>> =
            std::collections::BinaryHeap::new();

        // Iterate through all markets
        for market in self.gamestate.market_manager.database.iter() {
            let Some(center_idx) = self.gamestate.locations.get(market.center) else {
                continue;
            };

            let center_location_name = self.location_name(center_idx).to_string();
            let market_value = market.market_value();

            let market_data = MarketData {
                center_location_id: market.center.value(),
                center_location_name,
                market_value,
            };

            if top_markets.len() < MAX_ROWS {
                top_markets.push(std::cmp::Reverse(market_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_markets.peek()
                && market_data.market_value > smallest.market_value
            {
                top_markets.pop();
                top_markets.push(std::cmp::Reverse(market_data));
            }
        }

        // Generate table: top 10 markets by value
        let top_markets_vec: Vec<_> = top_markets
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(market)| market)
            .collect();

        let left_table_rows: Vec<Vec<TableCell>> = top_markets_vec
            .into_iter()
            .enumerate()
            .map(|(idx, market_data)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(market_data.center_location_name),
                    TableCell::Float {
                        value: market_data.market_value,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Top 10 Markets by Value".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Market Center".to_string(),
                    "Value".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: None,
                headers: vec![],
                rows: vec![],
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }

    /// Calculate state efficacy scores for all nations
    ///
    /// State efficacy measures territorial quality by combining location control and development.
    /// Formula: Location Efficacy = Control × Development
    /// National metrics: Total Efficacy (sum), Average Efficacy (mean), Location Count, Total Population
    pub fn calculate_state_efficacy(&self) -> Vec<CountryStateEfficacy> {
        #[derive(Default)]
        struct EfficacyAggregator {
            total_efficacy: f64,
            location_count: u32,
            total_population: u32,
        }

        let mut aggregates: FxHashMap<CountryId, EfficacyAggregator> = FxHashMap::default();

        // Single pass through all locations
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();

            // Skip unowned locations
            if location.owner.is_dummy() {
                continue;
            }

            // When a selection is active, only include selected locations
            if !self.selection_state.is_empty()
                && !self.selection_state.contains(location_entry.idx())
            {
                continue;
            }

            // Calculate location efficacy: control × development
            let location_efficacy = location.control * location.development;

            // Get population for this location
            let population = self.gamestate.location_population(location);

            // Aggregate by country
            let aggregate = aggregates.entry(location.owner).or_default();
            aggregate.total_efficacy += location_efficacy;
            aggregate.location_count += 1;
            aggregate.total_population += population as u32;
        }

        // Convert to result vector
        let mut results: Vec<CountryStateEfficacy> = aggregates
            .into_iter()
            .filter_map(|(country_id, aggregate)| {
                let country_idx = self.gamestate.countries.get(country_id)?;
                let entity_ref = self.entity_ref_from_country_idx(country_idx)?;

                let avg_efficacy = if aggregate.location_count > 0 {
                    aggregate.total_efficacy / (aggregate.location_count as f64)
                } else {
                    0.0
                };

                Some(CountryStateEfficacy {
                    anchor_location_idx: entity_ref.anchor_location_idx,
                    tag: entity_ref.tag,
                    name: entity_ref.name,
                    color: entity_ref.color_hex,
                    total_efficacy: aggregate.total_efficacy,
                    location_count: aggregate.location_count,
                    avg_efficacy,
                    total_population: aggregate.total_population,
                })
            })
            .collect();

        // Sort by total efficacy descending
        results.sort_by(|a, b| {
            b.total_efficacy
                .total_cmp(&a.total_efficacy)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        results
    }

    pub fn state_efficacy_location_distribution(&self) -> LocationDistribution {
        let mut metrics = self.state_efficacy_location_metrics();

        if metrics.is_empty() {
            return LocationDistribution {
                metric_label: "State Efficacy".to_string(),
                buckets: vec![],
                top_locations: vec![],
            };
        }

        let min_val = metrics
            .iter()
            .map(|(_, v, _, _, _)| *v)
            .fold(f64::INFINITY, f64::min);
        let max_val = metrics
            .iter()
            .map(|(_, v, _, _, _)| *v)
            .fold(f64::NEG_INFINITY, f64::max);

        const TARGET_BUCKETS: usize = 20;

        let buckets = if (max_val - min_val).abs() < f64::EPSILON {
            vec![DistributionBucket {
                lo: min_val,
                hi: max_val,
                count: metrics.len() as u32,
            }]
        } else {
            let step = nice_bucket_step(max_val - min_val, TARGET_BUCKETS);
            let start = (min_val / step).floor() * step;
            let end = (max_val / step).ceil() * step;
            let num_buckets = ((end - start) / step).ceil() as usize;
            let num_buckets = num_buckets.clamp(1, TARGET_BUCKETS * 2);
            let mut counts = vec![0u32; num_buckets];
            for (_, value, _, _, _) in &metrics {
                let b = ((*value - start) / step).floor() as usize;
                let b = b.min(num_buckets - 1);
                counts[b] += 1;
            }
            counts
                .into_iter()
                .enumerate()
                .map(|(i, count)| DistributionBucket {
                    lo: start + i as f64 * step,
                    hi: start + (i + 1) as f64 * step,
                    count,
                })
                .collect()
        };

        metrics.sort_by(|a, b| b.1.total_cmp(&a.1));
        let top_locations: Vec<RankedLocation> = metrics
            .iter()
            .take(10)
            .map(|(idx, value, _, _, _)| RankedLocation {
                location_idx: idx.value(),
                name: self.location_name(*idx).to_string(),
                value: *value,
            })
            .collect();

        LocationDistribution {
            metric_label: "State Efficacy".to_string(),
            buckets,
            top_locations,
        }
    }

    pub fn state_efficacy_top_locations(&self) -> Vec<StateEfficacyTopLocation> {
        let mut metrics = self.state_efficacy_location_metrics();
        metrics.sort_by(|a, b| b.1.total_cmp(&a.1));

        const TOP_LOCATIONS: usize = 50;
        metrics
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, state_efficacy, development, control, population)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(StateEfficacyTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    state_efficacy,
                    development,
                    control,
                    population,
                    owner,
                })
            })
            .collect()
    }

    fn state_efficacy_location_metrics(&self) -> Vec<(LocationIdx, f64, f64, f64, u32)> {
        let mut metrics = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            let development = loc.development;
            let control = loc.control;
            let population = self.gamestate.location_population(loc) as u32;
            metrics.push((
                entry.idx(),
                control * development,
                development,
                control,
                population,
            ));
        }
        metrics
    }

    // ── Entity Profile ────────────────────────────────────────────────────

    /// Returns the entity kind for the current single-entity scope.
    pub fn derived_entity_kind(&self) -> Option<EntityKind> {
        self.derived_entity_kind
    }

    /// Returns header data for the current single-entity scope.
    /// Returns None when the filter is empty or spans multiple entities.
    pub fn entity_header(&self) -> Option<EntityHeader> {
        let anchor = self.derived_entity_anchor?;
        let kind = self.derived_entity_kind()?;
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        let location_count = self.selection_state.len() as u32;
        for &idx in self.selection_state.selected_locations() {
            let loc = self.gamestate.locations.index(idx).location();
            total_development += loc.development;
            total_population += self.gamestate.location_population(loc) as u32;
        }
        let headline = HeadlineStats {
            location_count,
            total_development,
            total_population,
        };
        match kind {
            EntityKind::Country => self.country_header(anchor, headline),
            EntityKind::Market => self.market_header(anchor, headline),
        }
    }

    fn country_header(
        &self,
        anchor: eu5save::models::LocationIdx,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let entry = self.gamestate.countries.index(country_idx);
        let data = entry.data()?;
        let tag = entry.tag().to_str().to_string();
        let name = self.localized_country_name(&data.country_name).to_string();
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            data.color.0[0], data.color.0[1], data.color.0[2]
        );
        Some(EntityHeader {
            kind: EntityKind::Country,
            name,
            tag: Some(tag),
            color_hex,
            anchor_location_idx: anchor.value(),
            headline,
        })
    }

    fn market_header(
        &self,
        anchor: eu5save::models::LocationIdx,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;
        let center_idx = self.gamestate.locations.get(market.center)?;
        let name = format!("{} Market", self.location_name(center_idx));
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            market.color.0[0], market.color.0[1], market.color.0[2]
        );
        Some(EntityHeader {
            kind: EntityKind::Market,
            name,
            tag: None,
            color_hex,
            anchor_location_idx: anchor.value(),
            headline,
        })
    }

    fn entity_ref_from_country_idx(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<EntityRef> {
        let entry = self.gamestate.countries.index(country_idx);
        let data = entry.data()?;
        let owner = entry.id().real_id()?;
        let tag = entry.tag().to_str().to_string();
        let name = self.localized_country_name(&data.country_name).to_string();
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            data.color.0[0], data.color.0[1], data.color.0[2]
        );
        let anchor_location_idx = data
            .capital
            .and_then(|id| self.gamestate.locations.get(id))
            .or_else(|| {
                self.gamestate
                    .locations
                    .iter()
                    .find(|entry| entry.location().owner.real_id() == Some(owner))
                    .map(|entry| entry.idx())
            })
            .map(|idx| idx.value())
            .unwrap_or(0);
        Some(EntityRef {
            kind: EntityKind::Country,
            anchor_location_idx,
            tag,
            name,
            color_hex,
        })
    }

    fn market_ref_from_id(&self, market_id: eu5save::models::MarketId) -> Option<EntityRef> {
        let market = self.gamestate.market_manager.get(market_id)?;
        let center_idx = self.gamestate.locations.get(market.center)?;
        let name = format!("{} Market", self.location_name(center_idx));
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            market.color.0[0], market.color.0[1], market.color.0[2]
        );
        Some(EntityRef {
            kind: EntityKind::Market,
            anchor_location_idx: center_idx.value(),
            tag: String::new(),
            name,
            color_hex,
        })
    }

    fn market_ref_for_location(&self, loc: &eu5save::models::Location) -> Option<EntityRef> {
        self.market_ref_from_id(loc.market?)
    }

    fn market_center_name_for_location(&self, loc: &eu5save::models::Location) -> Option<String> {
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;
        let center_idx = self.gamestate.locations.get(market.center)?;
        Some(self.location_name(center_idx).to_string())
    }

    fn owner_ref_for_location(&self, loc: &eu5save::models::Location) -> Option<EntityRef> {
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        self.entity_ref_from_country_idx(country_idx)
    }

    /// Returns aggregated overview stats for the current single-entity scope.
    pub fn overview_section(&self) -> Option<OverviewSection> {
        let anchor = self.derived_entity_anchor?;
        let kind = self.derived_entity_kind()?;
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.build_overview_section(anchor, kind, &locations)
    }

    fn build_overview_section(
        &self,
        anchor: LocationIdx,
        kind: EntityKind,
        locations: &[LocationIdx],
    ) -> Option<OverviewSection> {
        if locations.is_empty() {
            return None;
        }
        let building_levels = self.get_location_building_levels();
        let mut total_control = 0.0_f64;
        let mut total_development = 0.0_f64;
        let mut total_rgo_level = 0.0_f64;
        let mut total_building_levels = 0.0_f64;
        let mut religion_counts: HashMap<String, (u32, String)> = HashMap::new();
        let mut top_locations_by_development: Vec<RankedLocation> = Vec::new();
        let count = locations.len() as f64;
        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_control += loc.control;
            total_development += loc.development;
            total_rgo_level += loc.rgo_level;
            total_building_levels += building_levels[idx];
            if let Some(rid) = loc.religion
                && let Some(rel) = self.gamestate.religion_manager.lookup(rid)
            {
                let color_hex = format!(
                    "#{:02x}{:02x}{:02x}",
                    rel.color.0[0], rel.color.0[1], rel.color.0[2]
                );
                religion_counts
                    .entry(rel.name.to_str().to_string())
                    .and_modify(|(count, _)| *count += 1)
                    .or_insert((1, color_hex));
            }

            top_locations_by_development.push(RankedLocation {
                location_idx: idx.value(),
                name: self.location_name(idx).to_string(),
                value: loc.development,
            });
        }

        let mut religion_rows: Vec<_> = religion_counts
            .into_iter()
            .map(|(religion, (location_count, color_hex))| ReligionShare {
                religion,
                location_count,
                color_hex,
            })
            .collect();
        religion_rows.sort_by(|a, b| {
            b.location_count
                .cmp(&a.location_count)
                .then_with(|| a.religion.cmp(&b.religion))
        });
        let religion_breakdown = if religion_rows.len() > 3 {
            let other_count = religion_rows
                .iter()
                .skip(3)
                .map(|row| row.location_count)
                .sum();
            religion_rows.truncate(3);
            religion_rows.push(ReligionShare {
                religion: "Other".to_string(),
                location_count: other_count,
                color_hex: "#64748b".to_string(),
            });
            religion_rows
        } else {
            religion_rows
        };

        top_locations_by_development.sort_by(|a, b| {
            b.value
                .total_cmp(&a.value)
                .then_with(|| a.name.cmp(&b.name))
        });
        top_locations_by_development.truncate(5);

        let top_economic_indicators = self.overview_economic_indicators(
            anchor,
            total_building_levels,
            locations
                .iter()
                .map(|&idx| self.gamestate.locations.index(idx).location().possible_tax)
                .sum(),
            kind,
        )?;

        let diplomatic_summary = self.overview_diplomatic_summary(anchor, kind);

        Some(OverviewSection {
            avg_control: if count > 0.0 {
                total_control / count
            } else {
                0.0
            },
            avg_development: if count > 0.0 {
                total_development / count
            } else {
                0.0
            },
            total_rgo_level,
            total_building_levels,
            religion_breakdown,
            top_economic_indicators,
            top_locations_by_development,
            diplomatic_summary,
        })
    }

    fn overview_economic_indicators(
        &self,
        anchor: eu5save::models::LocationIdx,
        total_building_levels: f64,
        total_possible_tax: f64,
        kind: EntityKind,
    ) -> Option<Vec<EconomicIndicator>> {
        match kind {
            EntityKind::Country => {
                let loc = self.gamestate.locations.index(anchor).location();
                let owner_id = loc.owner.real_id()?.country_id();
                let country_idx = self.gamestate.countries.get(owner_id)?;
                let data = self.gamestate.countries.index(country_idx).data()?;
                Some(vec![
                    EconomicIndicator {
                        label: "Tax base".to_string(),
                        value: data.current_tax_base,
                        format: IndicatorFormat::Float1,
                    },
                    EconomicIndicator {
                        label: "Monthly trade".to_string(),
                        value: data.monthly_trade_value,
                        format: IndicatorFormat::Currency,
                    },
                    EconomicIndicator {
                        label: "Gold".to_string(),
                        value: data.currency_data.gold,
                        format: IndicatorFormat::Currency,
                    },
                    EconomicIndicator {
                        label: "Total buildings".to_string(),
                        value: total_building_levels,
                        format: IndicatorFormat::Float1,
                    },
                    EconomicIndicator {
                        label: "Total possible tax".to_string(),
                        value: total_possible_tax,
                        format: IndicatorFormat::Float1,
                    },
                ])
            }
            EntityKind::Market => {
                let loc = self.gamestate.locations.index(anchor).location();
                let market_id = loc.market?;
                let market = self.gamestate.market_manager.get(market_id)?;
                let mut indicators = vec![EconomicIndicator {
                    label: "Market value".to_string(),
                    value: market.market_value(),
                    format: IndicatorFormat::Currency,
                }];
                let mut top_goods: Vec<_> = market.goods.iter().collect();
                top_goods.sort_by(|a, b| {
                    (b.price * b.total_taken).total_cmp(&(a.price * a.total_taken))
                });
                indicators.extend(top_goods.into_iter().take(3).map(|good| EconomicIndicator {
                    label: format!("Top good: {}", good.good.to_str()),
                    value: good.price * good.total_taken,
                    format: IndicatorFormat::Currency,
                }));
                indicators.push(EconomicIndicator {
                    label: "Total possible tax".to_string(),
                    value: total_possible_tax,
                    format: IndicatorFormat::Float1,
                });
                Some(indicators)
            }
        }
    }

    fn overview_diplomatic_summary(
        &self,
        anchor: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> Option<DiplomaticSummary> {
        if matches!(kind, EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let overlord =
            self.overlord_of[country_idx].and_then(|idx| self.entity_ref_from_country_idx(idx));
        let subject_count = self
            .gamestate
            .countries
            .iter()
            .filter(|entry| self.overlord_of[entry.idx()] == Some(country_idx))
            .count() as u32;
        Some(DiplomaticSummary {
            overlord,
            subject_count,
        })
    }

    /// Returns economy section for the current single-entity scope.
    pub fn economy_section(&self) -> Option<EconomySection> {
        let anchor = self.derived_entity_anchor?;
        let locations: Vec<eu5save::models::LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        match self.derived_entity_kind()? {
            EntityKind::Country => self.country_economy(anchor, &locations),
            EntityKind::Market => self.market_economy(anchor, &locations),
        }
    }

    fn country_economy(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<EconomySection> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let data = self.gamestate.countries.index(country_idx).data()?;

        let building_levels = self.get_location_building_levels();
        let mut total_building_levels = 0.0_f64;
        let mut total_possible_tax = 0.0_f64;
        let mut market_counts: FxHashMap<String, u32> = FxHashMap::default();

        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_building_levels += building_levels[idx];
            total_possible_tax += loc.possible_tax;
            if let Some(name) = self.market_center_name_for_location(loc) {
                *market_counts.entry(name).or_insert(0) += 1;
            }
        }

        let mut market_membership: Vec<MarketMembership> = market_counts
            .into_iter()
            .map(|(market_center_name, location_count)| MarketMembership {
                market_center_name,
                location_count,
            })
            .collect();
        market_membership.sort_by(|a, b| b.location_count.cmp(&a.location_count));

        Some(EconomySection {
            current_tax_base: Some(data.current_tax_base),
            monthly_trade_value: Some(data.monthly_trade_value),
            gold: Some(data.currency_data.gold),
            total_building_levels,
            total_possible_tax,
            market_membership,
            market_value: None,
            top_goods: vec![],
        })
    }

    fn market_economy(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<EconomySection> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;

        let building_levels = self.get_location_building_levels();
        let mut total_building_levels = 0.0_f64;
        let mut total_possible_tax = 0.0_f64;
        for &idx in locations {
            let l = self.gamestate.locations.index(idx).location();
            total_building_levels += building_levels[idx];
            total_possible_tax += l.possible_tax;
        }

        let mut top_goods: Vec<MarketGoodEntry> = market
            .goods
            .iter()
            .map(|g| MarketGoodEntry {
                good_name: g.good.to_str().to_string(),
                price: g.price,
                supply: g.supply,
                demand: g.demand,
            })
            .collect();
        top_goods.sort_by(|a, b| b.supply.total_cmp(&a.supply));
        top_goods.truncate(10);

        Some(EconomySection {
            current_tax_base: None,
            monthly_trade_value: None,
            gold: None,
            total_building_levels,
            total_possible_tax,
            market_membership: vec![],
            market_value: Some(market.market_value()),
            top_goods,
        })
    }

    /// Returns location rows for all selected locations, sorted by location index.
    pub fn locations_section(&self) -> Option<LocationsSection> {
        self.derived_entity_anchor?;
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.build_locations_section(&locations)
    }

    fn build_locations_section(&self, locations: &[LocationIdx]) -> Option<LocationsSection> {
        if locations.is_empty() {
            return None;
        }
        let mut rows: Vec<LocationRow> = locations
            .iter()
            .map(|&idx| {
                let loc = self.gamestate.locations.index(idx).location();
                let population = self.gamestate.location_population(loc) as u32;
                LocationRow {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    development: loc.development,
                    population,
                    control: loc.control,
                    tax: loc.tax,
                    possible_tax: loc.possible_tax,
                    owner: self.owner_ref_for_location(loc),
                    market: self.market_ref_for_location(loc),
                }
            })
            .collect();
        rows.sort_by_key(|row| row.location_idx);
        Some(LocationsSection { locations: rows })
    }

    /// Returns diplomacy data for the current country scope.
    /// Returns None for market entities (markets have no diplomacy).
    pub fn diplomacy_section(&self) -> Option<DiplomacySection> {
        let anchor = self.derived_entity_anchor?;
        if matches!(self.derived_entity_kind()?, EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let anchor_country_idx = self.gamestate.countries.get(owner_id)?;

        let overlord = self.overlord_of[anchor_country_idx]
            .and_then(|idx| self.entity_ref_from_country_idx(idx));

        let subjects: Vec<EntityRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    self.entity_ref_from_country_idx(entry.idx())
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection { overlord, subjects })
    }

    /// Returns a full data profile for a single location.
    /// Returns None for unowned / water tiles.
    pub fn location_profile_for(
        &self,
        idx: eu5save::models::LocationIdx,
    ) -> Option<LocationProfile> {
        let loc = self.gamestate.locations.index(idx).location();
        if loc.owner.is_dummy() {
            return None;
        }

        let name = self.location_name(idx).to_string();
        let population = self.gamestate.location_population(loc) as u32;

        let terrain = match self.location_terrain(idx) {
            Terrain::Other => "Land",
            Terrain::Water => "Water",
            Terrain::Impassable => "Impassable",
        }
        .to_string();

        let religion = loc.religion.and_then(|rid| {
            self.gamestate
                .religion_manager
                .lookup(rid)
                .map(|r| r.name.to_str().to_string())
        });

        let raw_material = loc.raw_material.map(|r| r.to_str().to_string());
        let owner = self.owner_ref_for_location(loc);
        let market = self.market_ref_for_location(loc);

        let location_id = self.gamestate.locations.index(idx).id();
        let buildings: Vec<BuildingEntry> = self
            .gamestate
            .building_manager
            .database
            .iter()
            .filter(|b| b.location == location_id && b.owner == loc.owner)
            .map(|b| BuildingEntry {
                name: b._type.to_str().to_string(),
                level: b.level,
            })
            .collect();

        Some(LocationProfile {
            header: LocationHeader {
                location_idx: idx.value(),
                name,
                owner,
                market,
            },
            stats: LocationStats {
                development: loc.development,
                population,
                control: loc.control,
                terrain,
                religion,
                raw_material,
                tax: loc.tax,
                possible_tax: loc.possible_tax,
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
            },
            buildings,
        })
    }

    // ── Multi-entity & Aggregate Views ────────────────────────────────────

    fn entity_kind_for_mode(&self) -> EntityKind {
        if self.current_map_mode == MapMode::Markets {
            EntityKind::Market
        } else {
            EntityKind::Country
        }
    }

    fn collect_entity_locations(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> Option<Vec<eu5save::models::LocationIdx>> {
        match kind {
            EntityKind::Country => {
                let loc = self.gamestate.locations.index(anchor_idx).location();
                let owner = loc.owner.real_id()?;
                let locations = self
                    .gamestate
                    .locations
                    .iter()
                    .filter(|entry| entry.location().owner.real_id() == Some(owner))
                    .map(|entry| entry.idx())
                    .collect();
                Some(locations)
            }
            EntityKind::Market => {
                let loc = self.gamestate.locations.index(anchor_idx).location();
                let market_id = loc.market?;
                let locations = self
                    .gamestate
                    .locations
                    .iter()
                    .filter(|entry| entry.location().market == Some(market_id))
                    .map(|entry| entry.idx())
                    .collect();
                Some(locations)
            }
        }
    }

    /// Returns per-entity breakdown data for the current selection.
    /// Groups by owner in most map modes; by market in Markets mode.
    /// When the selection is empty, falls back to all locations (world view).
    pub fn selection_entity_breakdown(&self) -> EntityBreakdownData {
        let use_markets = self.current_map_mode == MapMode::Markets;
        let building_levels = self.get_location_building_levels();

        #[derive(Default)]
        struct Agg {
            location_count: u32,
            total_development: f64,
            total_population: u32,
            total_possible_tax: f64,
            total_tax_gap: f64,
            total_control: f64,
            total_rgo_level: f64,
            total_building_levels: f64,
            total_efficacy: f64,
        }

        let mut country_aggs: FxHashMap<CountryId, Agg> = FxHashMap::default();
        let mut market_aggs: FxHashMap<MarketId, Agg> = FxHashMap::default();

        let mut add_location = |idx: LocationIdx| {
            let loc = self.gamestate.locations.index(idx).location();
            if loc.owner.is_dummy() {
                return;
            }
            let population = self.gamestate.location_population(loc) as u32;
            let bl = building_levels[idx];

            if use_markets {
                if let Some(market_id) = loc.market {
                    let agg = market_aggs.entry(market_id).or_default();
                    agg.location_count += 1;
                    agg.total_development += loc.development;
                    agg.total_population += population;
                    agg.total_possible_tax += loc.possible_tax;
                    agg.total_tax_gap += loc.possible_tax - loc.tax;
                    agg.total_control += loc.control;
                    agg.total_rgo_level += loc.rgo_level;
                    agg.total_building_levels += bl;
                    agg.total_efficacy += loc.control * loc.development;
                }
            } else {
                let agg = country_aggs.entry(loc.owner).or_default();
                agg.location_count += 1;
                agg.total_development += loc.development;
                agg.total_population += population;
                agg.total_possible_tax += loc.possible_tax;
                agg.total_tax_gap += loc.possible_tax - loc.tax;
                agg.total_control += loc.control;
                agg.total_rgo_level += loc.rgo_level;
                agg.total_building_levels += bl;
                agg.total_efficacy += loc.control * loc.development;
            }
        };

        if self.selection_state.is_empty() {
            for entry in self.gamestate.locations.iter() {
                add_location(entry.idx());
            }
        } else {
            for &idx in self.selection_state.selected_locations() {
                add_location(idx);
            }
        }

        let mode_metric_label: &str = match self.current_map_mode {
            MapMode::Control => "Avg Control",
            MapMode::Population => "Population",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::PossibleTax | MapMode::Markets => "Possible Tax",
            MapMode::TaxGap => "Tax Gap",
            MapMode::StateEfficacy => "State Efficacy",
            _ => "Development",
        };

        let compute_mode_metric = |agg: &Agg| -> f64 {
            match self.current_map_mode {
                MapMode::Control => {
                    if agg.location_count > 0 {
                        agg.total_control / agg.location_count as f64
                    } else {
                        0.0
                    }
                }
                MapMode::Population => agg.total_population as f64,
                MapMode::RgoLevel => agg.total_rgo_level,
                MapMode::BuildingLevels => agg.total_building_levels,
                MapMode::PossibleTax | MapMode::Markets => agg.total_possible_tax,
                MapMode::TaxGap => agg.total_tax_gap,
                MapMode::StateEfficacy => agg.total_efficacy,
                _ => agg.total_development,
            }
        };

        let mut rows: Vec<EntityBreakdownRow> = Vec::new();

        if use_markets {
            for (market_id, agg) in market_aggs {
                if let Some(entity_ref) = self.market_ref_from_id(market_id) {
                    let mode_metric = compute_mode_metric(&agg);
                    let avg_development = if agg.location_count > 0 {
                        agg.total_development / agg.location_count as f64
                    } else {
                        0.0
                    };
                    rows.push(EntityBreakdownRow {
                        entity_ref,
                        location_count: agg.location_count,
                        total_development: agg.total_development,
                        total_population: agg.total_population,
                        avg_development,
                        total_possible_tax: agg.total_possible_tax,
                        mode_metric,
                        mode_metric_label: mode_metric_label.to_string(),
                    });
                }
            }
        } else {
            for (country_id, agg) in country_aggs {
                if let Some(country_idx) = self.gamestate.countries.get(country_id)
                    && let Some(entity_ref) = self.entity_ref_from_country_idx(country_idx)
                {
                    let mode_metric = compute_mode_metric(&agg);
                    let avg_development = if agg.location_count > 0 {
                        agg.total_development / agg.location_count as f64
                    } else {
                        0.0
                    };
                    rows.push(EntityBreakdownRow {
                        entity_ref,
                        location_count: agg.location_count,
                        total_development: agg.total_development,
                        total_population: agg.total_population,
                        avg_development,
                        total_possible_tax: agg.total_possible_tax,
                        mode_metric,
                        mode_metric_label: mode_metric_label.to_string(),
                    });
                }
            }
        }

        rows.sort_by(|a, b| {
            b.mode_metric
                .total_cmp(&a.mode_metric)
                .then_with(|| a.entity_ref.name.cmp(&b.entity_ref.name))
        });

        EntityBreakdownData { rows }
    }

    /// Returns a histogram distribution of per-location metric values for the
    /// current map mode over the current selection (or all locations if empty).
    pub fn selection_location_distribution(&self) -> LocationDistribution {
        let building_levels = self.get_location_building_levels();

        let metric_label = match self.current_map_mode {
            MapMode::Control => "Control",
            MapMode::Population => "Population",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::PossibleTax | MapMode::Markets => "Possible Tax",
            MapMode::TaxGap => "Tax Gap",
            MapMode::StateEfficacy => "State Efficacy",
            _ => "Development",
        };

        let mut metrics: Vec<(LocationIdx, f64)> = Vec::new();
        let mut add_location = |idx: LocationIdx| {
            let loc = self.gamestate.locations.index(idx).location();
            if loc.owner.is_dummy() {
                return;
            }
            let value = match self.current_map_mode {
                MapMode::Control => loc.control,
                MapMode::Population => self.gamestate.location_population(loc),
                MapMode::RgoLevel => loc.rgo_level,
                MapMode::BuildingLevels => building_levels[idx],
                MapMode::PossibleTax | MapMode::Markets => loc.possible_tax,
                MapMode::TaxGap => loc.possible_tax - loc.tax,
                MapMode::StateEfficacy => loc.control * loc.development,
                _ => loc.development,
            };
            metrics.push((idx, value));
        };

        if self.selection_state.is_empty() {
            for entry in self.gamestate.locations.iter() {
                add_location(entry.idx());
            }
        } else {
            for &idx in self.selection_state.selected_locations() {
                add_location(idx);
            }
        }

        if metrics.is_empty() {
            return LocationDistribution {
                metric_label: metric_label.to_string(),
                buckets: vec![],
                top_locations: vec![],
            };
        }

        let min_val = metrics
            .iter()
            .map(|(_, v)| *v)
            .fold(f64::INFINITY, f64::min);
        let max_val = metrics
            .iter()
            .map(|(_, v)| *v)
            .fold(f64::NEG_INFINITY, f64::max);

        const TARGET_BUCKETS: usize = 20;

        let buckets = if (max_val - min_val).abs() < f64::EPSILON {
            vec![DistributionBucket {
                lo: min_val,
                hi: max_val,
                count: metrics.len() as u32,
            }]
        } else {
            let step = nice_bucket_step(max_val - min_val, TARGET_BUCKETS);
            let start = (min_val / step).floor() * step;
            let end = (max_val / step).ceil() * step;
            let num_buckets = ((end - start) / step).ceil() as usize;
            let num_buckets = num_buckets.clamp(1, TARGET_BUCKETS * 2);
            let mut counts = vec![0u32; num_buckets];
            for (_, v) in &metrics {
                let b = ((*v - start) / step).floor() as usize;
                let b = b.min(num_buckets - 1);
                counts[b] += 1;
            }
            counts
                .into_iter()
                .enumerate()
                .map(|(i, count)| DistributionBucket {
                    lo: start + i as f64 * step,
                    hi: start + (i + 1) as f64 * step,
                    count,
                })
                .collect()
        };

        let mut sorted_metrics = metrics;
        sorted_metrics.sort_by(|a, b| b.1.total_cmp(&a.1));
        let top_locations: Vec<RankedLocation> = sorted_metrics
            .iter()
            .take(10)
            .map(|(idx, value)| RankedLocation {
                location_idx: idx.value(),
                name: self.location_name(*idx).to_string(),
                value: *value,
            })
            .collect();

        LocationDistribution {
            metric_label: metric_label.to_string(),
            buckets,
            top_locations,
        }
    }

    /// Development insight: per-country aggregates + top locations by development,
    /// over the current selection (or all locations when empty).
    pub fn calculate_development_insight(&self) -> DevelopmentInsightData {
        #[derive(Default)]
        struct DevAgg {
            total_dev: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, DevAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, u32, f64)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let dev = loc.development;
            let pop = self.gamestate.location_population(loc) as u32;
            let ctrl = loc.control;
            all_locs.push((entry.idx(), dev, pop, ctrl));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_dev += dev;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryDevSummary> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some(CountryDevSummary {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    total_development: agg.total_dev,
                    avg_development: if agg.count > 0 {
                        agg.total_dev / agg.count as f64
                    } else {
                        0.0
                    },
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_development
                .total_cmp(&a.total_development)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        all_locs.sort_by(|a, b| b.1.total_cmp(&a.1));
        // Tuned for client-side pagination: raising this materially increases
        // both payload size and DataTable initial render cost.
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<DevTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, dev, pop, ctrl)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(DevTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    development: dev,
                    population: pop,
                    control: ctrl,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        DevelopmentInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    /// Possible-tax insight: per-country ceiling aggregates and top locations
    /// by possible tax, over the current selection (or all locations when empty).
    pub fn calculate_possible_tax_insight(&self) -> PossibleTaxInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_possible_tax: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, TaxAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, u32, f64, f64)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let ptax = loc.possible_tax;
            let pop = self.gamestate.location_population(loc) as u32;
            let ctrl = loc.control;
            let dev = loc.development;
            all_locs.push((entry.idx(), ptax, pop, ctrl, dev));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_possible_tax += ptax;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryPossibleTax> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some(CountryPossibleTax {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    total_possible_tax: agg.total_possible_tax,
                    avg_possible_tax: if agg.count > 0 {
                        agg.total_possible_tax / agg.count as f64
                    } else {
                        0.0
                    },
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_possible_tax
                .total_cmp(&a.total_possible_tax)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        all_locs.sort_by(|a, b| b.1.total_cmp(&a.1));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<PossibleTaxTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, ptax, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(PossibleTaxTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    possible_tax: ptax,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        PossibleTaxInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    pub fn calculate_tax_gap_insight(&self) -> TaxGapInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_tax: f64,
            total_possible_tax: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, TaxAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, f64, f64, u32, f64, f64)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let tax = loc.tax;
            let ptax = loc.possible_tax;
            let gap = ptax - tax;
            let pop = self.gamestate.location_population(loc) as u32;
            all_locs.push((
                entry.idx(),
                tax,
                ptax,
                gap,
                pop,
                loc.control,
                loc.development,
            ));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_tax += tax;
                agg.total_possible_tax += ptax;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryTaxGap> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                let tax_gap = agg.total_possible_tax - agg.total_tax;
                let realization_ratio = if agg.total_possible_tax > 0.0 {
                    agg.total_tax / agg.total_possible_tax
                } else {
                    0.0
                };
                Some(CountryTaxGap {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    current_tax_base: agg.total_tax,
                    total_possible_tax: agg.total_possible_tax,
                    tax_gap,
                    realization_ratio,
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.tax_gap
                .total_cmp(&a.tax_gap)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        all_locs.sort_by(|a, b| b.3.total_cmp(&a.3));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<TaxGapTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, tax, ptax, gap, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(TaxGapTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    tax,
                    possible_tax: ptax,
                    tax_gap: gap,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        TaxGapInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    /// Market insight: scoped per-good and per-market aggregates that describe
    /// where the selection's economy is constrained, plus a ranked list of top
    /// production-opportunity locations. Scoped markets are markets whose center
    /// location sits inside the current location filter (or every market if the
    /// selection is empty). Production-opportunity rows only include locations
    /// in the current scope.
    pub fn calculate_market_insight(&self) -> MarketInsightData {
        use eu5save::models::LocationId;

        let is_empty_selection = self.selection_state.is_empty();
        let in_scope = |idx: LocationIdx| is_empty_selection || self.selection_state.contains(idx);

        #[derive(Default)]
        struct GoodAgg {
            supply: f64,
            demand: f64,
            total_taken: f64,
            price_weighted_numer: f64,
            price_weighted_denom: f64,
            shortage: f64,
            surplus: f64,
            shortage_value: f64,
            surplus_value: f64,
            max_impact: f64,
            stockpile: f64,
            market_count: u32,
            producing_location_count: u32,
        }

        struct MarketAgg<'a> {
            center_idx: LocationIdx,
            name: String,
            color_hex: String,
            market_value: f64,
            shortage_pressure: f64,
            surplus_pressure: f64,
            total_taken: f64,
            good_count: u32,
            member_locations: Vec<(LocationIdx, &'a eu5save::models::Location<'a>)>,
        }

        let mut good_aggs: FxHashMap<RawMaterialsName, GoodAgg> = FxHashMap::default();
        let mut market_aggs: Vec<MarketAgg> = Vec::new();
        let mut good_price_by_market: FxHashMap<(u32, RawMaterialsName), (f64, f64, f64)> =
            FxHashMap::default();
        let mut good_market_cells: Vec<crate::selection_views::GoodMarketBalanceCell> = Vec::new();

        let mut total_market_value = 0.0f64;
        let mut total_shortage_value = 0.0f64;
        let mut total_surplus_value = 0.0f64;

        let lookup_center_idx = |center: LocationId| self.gamestate.locations.get(center);

        for market in self.gamestate.market_manager.database.iter() {
            let Some(center_idx) = lookup_center_idx(market.center) else {
                continue;
            };
            if !in_scope(center_idx) {
                continue;
            }

            let mut market_value = 0.0f64;
            let mut shortage_pressure = 0.0f64;
            let mut surplus_pressure = 0.0f64;
            let mut total_taken = 0.0f64;

            for good in market.goods {
                let shortage = (good.demand - good.supply).max(0.0);
                let surplus = (good.supply - good.demand).max(0.0);
                let shortage_value = shortage * good.price;
                let surplus_value = surplus * good.price;
                let good_value = good.price * good.total_taken;

                market_value += good_value;
                shortage_pressure += shortage_value;
                surplus_pressure += surplus_value;
                total_taken += good.total_taken;

                let agg = good_aggs.entry(good.good).or_default();
                agg.supply += good.supply;
                agg.demand += good.demand;
                agg.total_taken += good.total_taken;
                agg.price_weighted_numer += good.price * good.total_taken;
                agg.price_weighted_denom += good.total_taken;
                agg.shortage += shortage;
                agg.surplus += surplus;
                agg.shortage_value += shortage_value;
                agg.surplus_value += surplus_value;
                if good.impact > agg.max_impact {
                    agg.max_impact = good.impact;
                }
                agg.stockpile += good.stockpile;
                agg.market_count += 1;

                good_price_by_market.insert(
                    (center_idx.value(), good.good),
                    (good.price, shortage_value, good.demand),
                );

                let balance_ratio = if good.demand > 0.0 {
                    good.supply / good.demand
                } else {
                    0.0
                };
                let imbalance_value = (good.supply - good.demand) * good.price;
                good_market_cells.push(crate::selection_views::GoodMarketBalanceCell {
                    good: good.good.to_string(),
                    market_anchor_location_idx: center_idx.value(),
                    supply: good.supply,
                    demand: good.demand,
                    price: good.price,
                    total_taken: good.total_taken,
                    balance_ratio,
                    imbalance_value,
                });
            }

            total_market_value += market_value;
            total_shortage_value += shortage_pressure;
            total_surplus_value += surplus_pressure;

            let color_hex = format!(
                "#{:02x}{:02x}{:02x}",
                market.color.0[0], market.color.0[1], market.color.0[2]
            );
            let name = format!("{} Market", self.location_name(center_idx));

            market_aggs.push(MarketAgg {
                center_idx,
                name,
                color_hex,
                market_value,
                shortage_pressure,
                surplus_pressure,
                total_taken,
                good_count: market.goods.len() as u32,
                member_locations: Vec::new(),
            });
        }

        let market_center_idx_set: FxHashMap<u32, usize> = market_aggs
            .iter()
            .enumerate()
            .map(|(i, m)| (m.center_idx.value(), i))
            .collect();

        let mut scoped_location_count = 0u32;
        let mut market_access_sum = 0.0f64;
        let mut market_access_count = 0u32;
        let mut production_candidates: Vec<(LocationIdx, &eu5save::models::Location)> = Vec::new();
        let mut producing_location_counts: FxHashMap<RawMaterialsName, u32> = FxHashMap::default();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !in_scope(idx) {
                continue;
            }
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            scoped_location_count += 1;
            market_access_sum += loc.market_access;
            market_access_count += 1;

            if let Some(market_id) = loc.market
                && let Some(market) = self.gamestate.market_manager.get(market_id)
                && let Some(center_idx) = lookup_center_idx(market.center)
                && let Some(&market_i) = market_center_idx_set.get(&center_idx.value())
            {
                market_aggs[market_i].member_locations.push((idx, loc));
            }

            if let Some(rm) = loc.raw_material {
                *producing_location_counts.entry(rm).or_insert(0) += 1;
                production_candidates.push((idx, loc));
            }
        }

        for (name, count) in &producing_location_counts {
            if let Some(agg) = good_aggs.get_mut(name) {
                agg.producing_location_count = *count;
            }
        }

        let mut goods: Vec<ScopedGoodSummary> = good_aggs
            .into_iter()
            .map(|(name, agg)| {
                let weighted_price = if agg.price_weighted_denom > 0.0 {
                    agg.price_weighted_numer / agg.price_weighted_denom
                } else {
                    0.0
                };
                let balance_ratio = if agg.demand > 0.0 {
                    agg.supply / agg.demand
                } else {
                    0.0
                };
                ScopedGoodSummary {
                    name: name.to_string(),
                    supply: agg.supply,
                    demand: agg.demand,
                    total_taken: agg.total_taken,
                    weighted_price,
                    shortage: agg.shortage,
                    surplus: agg.surplus,
                    shortage_value: agg.shortage_value,
                    surplus_value: agg.surplus_value,
                    balance_ratio,
                    impact: agg.max_impact,
                    stockpile: agg.stockpile,
                    market_count: agg.market_count,
                    producing_location_count: agg.producing_location_count,
                }
            })
            .collect();
        goods.sort_by(|a, b| {
            let a_imbalance = a.shortage_value.max(a.surplus_value);
            let b_imbalance = b.shortage_value.max(b.surplus_value);
            b_imbalance
                .total_cmp(&a_imbalance)
                .then_with(|| a.name.cmp(&b.name))
        });

        let markets: Vec<ScopedMarketSummary> = {
            let mut rows: Vec<ScopedMarketSummary> = market_aggs
                .into_iter()
                .map(|agg| {
                    let mut access_sum = 0.0f64;
                    let mut access_count = 0u32;
                    let mut country_ids: FnvHashSet<CountryId> = FnvHashSet::default();
                    for (_, loc) in &agg.member_locations {
                        access_sum += loc.market_access;
                        access_count += 1;
                        if let Some(id) = loc.owner.real_id().map(|r| r.country_id()) {
                            country_ids.insert(id);
                        }
                    }
                    ScopedMarketSummary {
                        anchor_location_idx: agg.center_idx.value(),
                        center_name: agg.name,
                        color_hex: agg.color_hex,
                        market_value: agg.market_value,
                        shortage_pressure: agg.shortage_pressure,
                        surplus_pressure: agg.surplus_pressure,
                        total_taken: agg.total_taken,
                        scoped_location_count: agg.member_locations.len() as u32,
                        member_country_count: country_ids.len() as u32,
                        avg_market_access: if access_count > 0 {
                            access_sum / access_count as f64
                        } else {
                            0.0
                        },
                        good_count: agg.good_count,
                    }
                })
                .collect();
            rows.sort_by(|a, b| {
                b.market_value
                    .total_cmp(&a.market_value)
                    .then_with(|| a.center_name.cmp(&b.center_name))
            });
            rows
        };

        let mut production_rows: Vec<ProductionLocationSummary> = Vec::new();
        for (idx, loc) in production_candidates {
            let Some(owner) = self.owner_ref_for_location(loc) else {
                continue;
            };
            let Some(raw_material) = loc.raw_material else {
                continue;
            };
            let (market_center_name, center_location_idx_opt) = if let Some(market_id) = loc.market
                && let Some(market) = self.gamestate.market_manager.get(market_id)
                && let Some(center_idx) = lookup_center_idx(market.center)
            {
                (
                    Some(self.location_name(center_idx).to_string()),
                    Some(center_idx.value()),
                )
            } else {
                (None, None)
            };

            let (price, shortage_value) = center_location_idx_opt
                .and_then(|cidx| {
                    good_price_by_market
                        .get(&(cidx, raw_material))
                        .map(|(p, sv, _)| (*p, *sv))
                })
                .unwrap_or((0.0, 0.0));

            let opportunity = loc.rgo_level.max(0.0) * loc.market_access.max(0.0) * shortage_value;

            production_rows.push(ProductionLocationSummary {
                location_idx: idx.value(),
                name: self.location_name(idx).to_string(),
                owner,
                market_center_name,
                raw_material: Some(raw_material.to_string()),
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
                development: loc.development,
                population: self.gamestate.location_population(loc) as u32,
                good_price: price,
                good_shortage_value: shortage_value,
                production_opportunity: opportunity,
            });
        }
        production_rows.sort_by(|a, b| {
            b.production_opportunity
                .total_cmp(&a.production_opportunity)
                .then_with(|| b.rgo_level.total_cmp(&a.rgo_level))
        });
        const TOP_PRODUCTION: usize = 50;
        production_rows.truncate(TOP_PRODUCTION);

        let scope = MarketScopeSummary {
            location_count: scoped_location_count,
            market_count: markets.len() as u32,
            good_count: goods.len() as u32,
            market_value: total_market_value,
            shortage_value: total_shortage_value,
            surplus_value: total_surplus_value,
            avg_market_access: if market_access_count > 0 {
                market_access_sum / market_access_count as f64
            } else {
                0.0
            },
            is_empty: is_empty_selection,
        };

        MarketInsightData {
            scope,
            goods,
            markets,
            good_market_cells,
            top_production_locations: production_rows,
        }
    }

    /// Population insight: scoped country population, concentration curve, and
    /// top populated locations for the current selection or whole save.
    pub fn calculate_population_insight(&self) -> PopulationInsightData {
        #[derive(Default)]
        struct RankAgg {
            population: u32,
            location_count: u32,
        }

        #[derive(Default)]
        struct CountryPopAgg {
            population: u32,
            location_count: u32,
            ranks: [RankAgg; 4],
        }

        let is_empty = self.selection_state.is_empty();
        let mut scoped_locations: Vec<(LocationIdx, CountryId, u32, Option<usize>)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !is_empty && !self.selection_state.contains(idx) {
                continue;
            }

            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) else {
                continue;
            };
            let population = self.gamestate.location_population(loc) as u32;
            let rank_idx = match &loc.rank {
                LocationRank::RuralSettlement => Some(0),
                LocationRank::Town => Some(1),
                LocationRank::City => Some(2),
                LocationRank::Metropolis => Some(3),
                LocationRank::Other => None,
            };
            scoped_locations.push((idx, owner_id, population, rank_idx));
        }

        let location_count = scoped_locations.len() as u32;
        let total_population: u32 = scoped_locations.iter().map(|(_, _, pop, _)| *pop).sum();

        let mut populations: Vec<u32> =
            scoped_locations.iter().map(|(_, _, pop, _)| *pop).collect();
        populations.sort_unstable();

        let median_location_population = if populations.is_empty() {
            0
        } else {
            populations[populations.len() / 2]
        };

        let mut country_aggs: FxHashMap<CountryId, CountryPopAgg> = FxHashMap::default();
        let mut rank_totals = [
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
        ];
        let mut sorted_locations = scoped_locations.clone();
        sorted_locations.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.value().cmp(&b.0.value())));

        for &(_, owner_id, population, rank_idx) in &scoped_locations {
            let agg = country_aggs.entry(owner_id).or_default();
            agg.population += population;
            agg.location_count += 1;
            if let Some(rank_idx) = rank_idx {
                agg.ranks[rank_idx].population += population;
                agg.ranks[rank_idx].location_count += 1;
                rank_totals[rank_idx].population += population;
                rank_totals[rank_idx].location_count += 1;
            }
        }

        let mut countries: Vec<ScopedCountryPopulation> = country_aggs
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                let ranks = agg
                    .ranks
                    .into_iter()
                    .enumerate()
                    .map(|(idx, rank)| PopulationRankSegment {
                        rank: idx as u8,
                        population: rank.population,
                        location_count: rank.location_count,
                    })
                    .collect();
                Some(ScopedCountryPopulation {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    total_population: agg.population,
                    location_count: agg.location_count,
                    ranks,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_population
                .cmp(&a.total_population)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        let mut cumulative_population = 0u32;
        let concentration: Vec<PopulationConcentrationPoint> = sorted_locations
            .iter()
            .enumerate()
            .map(|(idx, (_, _, population, _))| {
                cumulative_population += *population;
                PopulationConcentrationPoint {
                    location_rank: idx as u32 + 1,
                    location_count,
                    population: *population,
                    cumulative_population,
                    population_share: if total_population > 0 {
                        cumulative_population as f64 / total_population as f64
                    } else {
                        0.0
                    },
                }
            })
            .collect();

        let top_locations: Vec<PopulationTopLocation> = sorted_locations
            .into_iter()
            .filter(|(_, _, _, rank_idx)| rank_idx.is_some())
            .take(50)
            .filter_map(|(idx, _, population, rank_idx)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(PopulationTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    owner,
                    population,
                    rank: rank_idx? as u8,
                })
            })
            .collect();
        let rank_totals = rank_totals
            .into_iter()
            .enumerate()
            .map(|(idx, rank)| PopulationRankSegment {
                rank: idx as u8,
                population: rank.population,
                location_count: rank.location_count,
            })
            .collect();

        #[derive(Default)]
        struct TypeAgg {
            population: f64,
            satisfaction_num: f64,
            literacy_num: f64,
            pop_count: u32,
        }

        fn pop_type_id(kind: PopulationType) -> Option<usize> {
            match kind {
                PopulationType::Peasants => Some(0),
                PopulationType::Laborers => Some(1),
                PopulationType::Burghers => Some(2),
                PopulationType::Nobles => Some(3),
                PopulationType::Clergy => Some(4),
                PopulationType::Soldiers => Some(5),
                PopulationType::Slaves => Some(6),
                PopulationType::Tribesmen => Some(7),
                PopulationType::Other => None,
            }
        }

        let mut baseline_agg: [TypeAgg; 8] = Default::default();
        let mut scoped_agg: [TypeAgg; 8] = Default::default();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            let loc = entry.location();
            if loc.owner.real_id().is_none() {
                continue;
            }
            let in_scope = is_empty || self.selection_state.contains(idx);
            for &pop_id in loc.population.pops {
                let Some(pop) = self.gamestate.population.database.lookup(pop_id) else {
                    continue;
                };
                let Some(type_idx) = pop_type_id(pop.kind) else {
                    continue;
                };
                baseline_agg[type_idx].population += pop.size;
                baseline_agg[type_idx].satisfaction_num += pop.satisfaction * pop.size;
                baseline_agg[type_idx].literacy_num += pop.literacy * pop.size;
                baseline_agg[type_idx].pop_count += 1;
                if in_scope {
                    scoped_agg[type_idx].population += pop.size;
                    scoped_agg[type_idx].satisfaction_num += pop.satisfaction * pop.size;
                    scoped_agg[type_idx].literacy_num += pop.literacy * pop.size;
                    scoped_agg[type_idx].pop_count += 1;
                }
            }
        }

        let baseline_total: f64 = baseline_agg.iter().map(|a| a.population).sum();
        let scoped_total: f64 = scoped_agg.iter().map(|a| a.population).sum();

        let type_profile: Vec<PopulationTypeProfileRow> = (0u8..8)
            .map(|i| {
                let b = &baseline_agg[i as usize];
                let s = &scoped_agg[i as usize];
                let baseline_share = if baseline_total > 0.0 {
                    b.population / baseline_total
                } else {
                    0.0
                };
                let share = if scoped_total > 0.0 {
                    s.population / scoped_total
                } else {
                    0.0
                };
                PopulationTypeProfileRow {
                    population_type: i,
                    population: s.population,
                    share,
                    baseline_population: b.population,
                    baseline_share,
                    share_delta: share - baseline_share,
                    avg_satisfaction: if s.population > 0.0 {
                        s.satisfaction_num / s.population
                    } else {
                        0.0
                    },
                    avg_literacy: if s.population > 0.0 {
                        s.literacy_num / s.population
                    } else {
                        0.0
                    },
                    pop_count: s.pop_count,
                }
            })
            .collect();

        PopulationInsightData {
            scope: PopulationScopeSummary {
                location_count,
                country_count: countries.len() as u32,
                total_population,
                median_location_population,
                is_empty,
            },
            rank_totals,
            countries,
            concentration,
            top_locations,
            type_profile,
        }
    }

    /// Totals for the active scope: selected entities when the filter is non-empty,
    /// or all entities in the world when the filter is empty.
    pub fn get_scope_summary(&self) -> ScopeSummary {
        if !self.selection_state.is_empty() {
            let mut entity_ids: FnvHashSet<CountryId> = FnvHashSet::default();
            let mut total_population = 0u32;
            for &idx in self.selection_state.selected_locations() {
                let loc = self.gamestate.locations.index(idx).location();
                if loc.owner.is_dummy() {
                    continue;
                }
                total_population += self.gamestate.location_population(loc) as u32;
                if let Some(id) = loc.owner.real_id().map(|r| r.country_id()) {
                    entity_ids.insert(id);
                }
            }
            return ScopeSummary {
                entity_count: entity_ids.len() as u32,
                location_count: self.selection_state.len() as u32,
                total_population,
                is_empty: false,
            };
        }

        let mut entity_ids: FnvHashSet<CountryId> = FnvHashSet::default();
        let mut location_count = 0u32;
        let mut total_population = 0u32;
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            location_count += 1;
            total_population += self.gamestate.location_population(loc) as u32;
            if let Some(id) = loc.owner.real_id().map(|r| r.country_id()) {
                entity_ids.insert(id);
            }
        }
        ScopeSummary {
            entity_count: entity_ids.len() as u32,
            location_count,
            total_population,
            is_empty: true,
        }
    }

    pub fn get_possible_tax_scope(&self) -> PossibleTaxScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_possible_tax = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_possible_tax += loc.possible_tax;
            location_count += 1;
        }

        PossibleTaxScope {
            location_count,
            total_possible_tax,
            avg_possible_tax: if location_count > 0 {
                total_possible_tax / location_count as f64
            } else {
                0.0
            },
            is_empty,
        }
    }

    pub fn get_tax_gap_scope(&self) -> TaxGapScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_tax = 0.0f64;
        let mut total_possible_tax = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_tax += loc.tax;
            total_possible_tax += loc.possible_tax;
            location_count += 1;
        }

        let tax_gap = total_possible_tax - total_tax;

        TaxGapScope {
            location_count,
            tax_gap,
            realization_ratio: if total_possible_tax > 0.0 {
                total_tax / total_possible_tax
            } else {
                0.0
            },
            is_empty,
        }
    }

    /// Header for a specific entity resolved from `anchor_idx`, over that
    /// entity's full territory in the gamestate (ignores current selection).
    pub fn entity_header_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<EntityHeader> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        let location_count = locations.len() as u32;
        for &idx in &locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_development += loc.development;
            total_population += self.gamestate.location_population(loc) as u32;
        }
        let headline = HeadlineStats {
            location_count,
            total_development,
            total_population,
        };
        match kind {
            EntityKind::Country => self.country_header(anchor_idx, headline),
            EntityKind::Market => self.market_header(anchor_idx, headline),
        }
    }

    /// Overview section for a specific entity's full territory.
    pub fn overview_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<OverviewSection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        self.build_overview_section(anchor_idx, kind, &locations)
    }

    /// Economy section for a specific entity's full territory.
    pub fn economy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<EconomySection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        match kind {
            EntityKind::Country => self.country_economy(anchor_idx, &locations),
            EntityKind::Market => self.market_economy(anchor_idx, &locations),
        }
    }

    /// Locations section for a specific entity's full territory.
    pub fn locations_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<LocationsSection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        self.build_locations_section(&locations)
    }

    /// Diplomacy section for a specific country entity (by anchor location).
    /// Returns None for market entities or if the anchor doesn't resolve to a country.
    pub fn diplomacy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<DiplomacySection> {
        if matches!(self.entity_kind_for_mode(), EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor_idx).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let anchor_country_idx = self.gamestate.countries.get(owner_id)?;

        let overlord = self.overlord_of[anchor_country_idx]
            .and_then(|idx| self.entity_ref_from_country_idx(idx));

        let subjects: Vec<EntityRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    self.entity_ref_from_country_idx(entry.idx())
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection { overlord, subjects })
    }
}

/// State efficacy data for a single country
#[derive(Debug, Clone)]
pub struct CountryStateEfficacy {
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color: String,
    pub total_efficacy: f64,
    pub location_count: u32,
    pub avg_efficacy: f64,
    pub total_population: u32,
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
