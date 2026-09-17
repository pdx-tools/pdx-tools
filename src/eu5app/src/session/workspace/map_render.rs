use crate::gradient::{self, GradientScale};
use crate::population::location_reproduction_rate;
use eu5save::models::Color;

use super::*;

impl<'bump> Eu5Workspace<'bump> {
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

    /// Like [`Self::gradient_domain`], but each bound is the value at
    /// `percentile` (0.0 to 1.0) instead of the max. Use this for a metric
    /// with a long tail of outliers, so that the outliers saturate at the top
    /// color instead of compressing everything else into the bottom colors.
    fn gradient_domain_percentile(
        &self,
        extract: impl Fn(eu5save::models::LocationIdx, &eu5save::models::Location) -> f64,
        percentile: f64,
    ) -> (f64, f64) {
        let has_selection = !self.selection_state.is_empty();
        let mut global = Vec::new();
        let mut filtered = Vec::new();
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
            global.push(value);
            if !has_selection || self.selection_state.contains(idx) {
                filtered.push(value);
            }
        }

        fn value_at(mut values: Vec<f64>, percentile: f64) -> f64 {
            if values.is_empty() {
                return 0.0;
            }
            values.sort_by(f64::total_cmp);
            let last = values.len() - 1;
            let pos = ((last as f64) * percentile.clamp(0.0, 1.0)).round() as usize;
            values[pos]
        }

        (value_at(global, percentile), value_at(filtered, percentile))
    }

    /// The reproduction gradient stops at this percentile. A pop of a few
    /// hundred people that records a single birth has an annual rate many
    /// times the median, and a handful of such locations must not flatten
    /// the rest of the map.
    const REPRODUCTION_PERCENTILE: f64 = 0.95;

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

    /// Effective max for the wealth gradient (filtered when selection active).
    pub fn max_wealth(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.possible_tax).1
    }

    /// Effective max for the state efficacy gradient (filtered when selection active).
    pub fn max_state_efficacy(&self) -> f64 {
        self.gradient_domain(|_, loc| loc.control * loc.development)
            .1
    }

    /// Gradient bounds for the reproduction mode, see [`Self::gradient_domain`].
    fn reproduction_domain(&self) -> (f64, f64) {
        self.gradient_domain_percentile(
            |_, loc| location_reproduction_rate(&self.gamestate, loc),
            Self::REPRODUCTION_PERCENTILE,
        )
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

    pub fn location_terrain(&self, idx: eu5save::models::LocationIdx) -> Terrain {
        self.location_terrain[idx]
    }

    /// The owner color on the timeline date. At the save date the timeline
    /// owners equal the current owners, so one path serves every date.
    pub fn location_political_color(&self, key: eu5save::models::LocationIdx) -> GpuColor {
        let terrain = self.location_terrain(key);
        if terrain.is_water() {
            return GpuColor::WATER;
        } else if !terrain.is_passable() {
            return GpuColor::IMPASSABLE;
        }

        let owner = self.owner_at_timeline_date(key);
        if owner.is_dummy() {
            return GpuColor::UNOWNED;
        }
        self.country_color_at_timeline_date(owner)
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

        gradient::interpolate_eu5_gradient(
            save_location.development,
            max_dev,
            GradientScale::Linear,
        )
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

        // location_population returns floor(size * 1000); divide back to thousands
        // so the log curve is meaningful (ln_1p operates on 0–max_k, not 0–max_k*1000)
        let population = self.gamestate.location_population(save_location) / 1000.0;
        gradient::interpolate_eu5_gradient(population, max_pop / 1000.0, GradientScale::Log)
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

        gradient::interpolate_eu5_gradient(save_location.control, 1.0, GradientScale::Linear)
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

        gradient::interpolate_eu5_gradient(
            save_location.rgo_level,
            max_rgo_level,
            GradientScale::Linear,
        )
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

        gradient::interpolate_eu5_gradient(
            building_levels_sum,
            max_building_levels,
            GradientScale::Linear,
        )
    }

    pub fn location_wealth_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_wealth: f64,
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

        gradient::interpolate_eu5_gradient(
            save_location.possible_tax,
            max_wealth,
            GradientScale::Linear,
        )
    }

    pub fn location_unrealized_tax_base_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_gap: f64,
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

        let gap = (save_location.possible_tax - save_location.tax).max(0.0);
        gradient::interpolate_eu5_gradient(gap, max_gap, GradientScale::Linear)
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
        gradient::interpolate_eu5_gradient(efficacy, max_efficacy, GradientScale::Linear)
    }

    pub fn location_reproduction_color(
        &self,
        location_idx: eu5save::models::LocationIdx,
        max_rate: f64,
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

        let rate = location_reproduction_rate(&self.gamestate, save_location);
        gradient::interpolate_eu5_gradient(rate, max_rate, GradientScale::Linear)
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

        self.subject_blended_color(country_idx, country_color, |idx| {
            self.gamestate
                .countries
                .index(idx)
                .data()
                .map(|data| data.color)
        })
    }

    /// The map color of a country: its own color, or when it is a subject,
    /// that color blended toward the top overlord's. `color_of` supplies the
    /// color of each overlord; an overlord without one is skipped over.
    pub(super) fn subject_blended_color(
        &self,
        country_idx: CountryIdx,
        country_color: Color,
        color_of: impl Fn(CountryIdx) -> Option<Color>,
    ) -> GpuColor {
        let mut current_overlord = country_idx;
        let mut current_overlord_color = country_color;
        while let Some(dep) = self.overlord_of[current_overlord] {
            current_overlord = dep;
            if let Some(dep_color) = color_of(dep) {
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

    pub(super) fn build_location_arrays(&mut self) {
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

    /// Bring the GPU location buffers up to date after a selection mutation.
    ///
    /// Domain colors are repainted only when the set of selected locations
    /// changed and the current mode derives its colors from that set. Any
    /// other mutation (focus, hover, a no-op) only refreshes the flags.
    pub fn rebuild_colors(&mut self) -> MapChange {
        let generation = self.selection_state.membership_generation();
        let membership_changed = generation != self.painted_selection_generation;
        if membership_changed && self.current_map_mode.selection_affects_domain() {
            self.set_map_mode(self.current_map_mode)
        } else {
            self.apply_interaction_flags();
            MapChange {
                dirty: MapDirty::FLAGS,
                legend: self.current_map_legend,
            }
        }
    }

    /// Switch the map mode. A mode without a history pulls the timeline back
    /// to the save date, so the map never shows current data under a past date.
    pub fn set_map_mode(&mut self, mode: MapMode) -> MapChange {
        if !self.is_timeline_live() && !Self::is_historical_map_mode(mode) {
            self.step_timeline_to(self.save_date());
        }
        self.apply_map_mode(mode)
    }

    pub(super) fn apply_map_mode(&mut self, mode: MapMode) -> MapChange {
        self.current_map_mode = mode;

        let gradient = match mode {
            MapMode::Political => self.apply_political_colors(),
            MapMode::Control => self.apply_control_colors(),
            MapMode::Development => self.apply_development_colors(),
            MapMode::Population => self.apply_population_colors(),
            MapMode::Markets => self.apply_markets_colors(),
            MapMode::RgoLevel => self.apply_rgo_level_colors(),
            MapMode::BuildingLevels => self.apply_building_levels_colors(),
            MapMode::Wealth => self.apply_wealth_colors(),
            MapMode::UnrealizedTaxBase => self.apply_unrealized_tax_base_colors(),
            MapMode::Religion => self.apply_religion_colors(),
            MapMode::StateEfficacy => self.apply_state_efficacy_colors(),
            MapMode::PopulationGrowth => self.apply_reproduction_colors(),
        };

        self.current_map_legend = gradient;
        self.painted_selection_generation = self.selection_state.membership_generation();
        self.apply_interaction_flags();

        MapChange {
            dirty: MapDirty::ALL,
            legend: gradient,
        }
    }

    /// Repaint a few locations in the political mode on a past date.
    pub(super) fn repaint_locations(
        &mut self,
        locations: &[eu5save::models::LocationIdx],
    ) -> MapChange {
        let mut dirty = MapDirty::NONE;
        for &location_idx in locations {
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };
            dirty = MapDirty::COLORS;
            let primary = self.location_political_color(location_idx);
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(primary);
            gpu_location.set_secondary_color(primary);
        }
        MapChange {
            dirty,
            legend: self.current_map_legend,
        }
    }

    fn apply_interaction_flags(&mut self) {
        let has_selection = !self.selection_state.is_empty();
        for location in self.gamestate.locations.iter() {
            let terrain = self.location_terrain(location.idx());
            let Some(gpu_idx) = self.gpu_indices[location.idx()] else {
                continue;
            };
            let mut s = self.location_arrays.get_mut(gpu_idx);

            let should_dim = Self::should_dim_location(
                self.current_map_mode,
                terrain,
                has_selection,
                self.selection_state.contains(location.idx()),
                s.primary_color(),
            );
            s.flags_mut().clear(LocationFlags::from_bits(
                LocationFlags::DIMMED.bits() | LocationFlags::FOCUSED.bits(),
            ));
            if should_dim {
                s.flags_mut().set(LocationFlags::DIMMED);
            }
        }

        // Set focused flag for the focused location
        if let Some(fl) = self.selection_state.focused_location()
            && let Some(gpu_idx) = self.gpu_indices[fl]
        {
            let mut state = self.location_arrays.get_mut(gpu_idx);
            state.flags_mut().set(LocationFlags::FOCUSED);
        }
    }

    fn should_dim_location(
        mode: MapMode,
        terrain: Terrain,
        has_selection: bool,
        selected: bool,
        primary_color: GpuColor,
    ) -> bool {
        has_selection && !selected && Self::mode_allows_dimming(mode, terrain, primary_color)
    }

    fn mode_allows_dimming(mode: MapMode, terrain: Terrain, primary_color: GpuColor) -> bool {
        if terrain.is_water() {
            return mode == MapMode::Markets && primary_color != GpuColor::WATER;
        }
        terrain.is_passable()
    }

    pub fn no_map_change(&self) -> MapChange {
        MapChange {
            dirty: MapDirty::NONE,
            legend: self.current_map_legend,
        }
    }

    fn apply_political_colors(&mut self) -> gradient::MapLegend {
        let live = self.is_timeline_live();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };

            let primary = self.location_political_color(location_idx);
            // Occupation has no history in the save, so a past date shows no
            // controller stripes.
            let controller = if live {
                self.location_control_color(location_idx)
            } else {
                primary
            };
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(primary);
            gpu_location.set_secondary_color(controller);
        }
        gradient::MapLegend::Qualitative
    }

    fn apply_control_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(GradientScale::Linear, 0.0, 1.0))
    }

    fn apply_development_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_population_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Log,
            0.0,
            filtered_max,
        ))
    }

    fn apply_markets_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Qualitative
    }

    fn apply_rgo_level_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_building_levels_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_wealth_colors(&mut self) -> gradient::MapLegend {
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
            let wealth_color = self.location_wealth_color(location_idx, max);
            color_data.push((idx, wealth_color));
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_unrealized_tax_base_colors(&mut self) -> gradient::MapLegend {
        let (global_max, filtered_max) =
            self.gradient_domain(|_, loc| (loc.possible_tax - loc.tax).max(0.0));

        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            color_data.push((
                idx,
                self.location_unrealized_tax_base_color(location_idx, max),
            ));
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_state_efficacy_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_reproduction_colors(&mut self) -> gradient::MapLegend {
        let (global_max, filtered_max) = self.reproduction_domain();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let max = if self.selection_state.contains(location_idx) {
                filtered_max
            } else {
                global_max
            };
            let reproduction_color = self.location_reproduction_color(location_idx, max);
            color_data.push((idx, reproduction_color));
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

        gradient::MapLegend::Quantitative(gradient::sequential(
            GradientScale::Linear,
            0.0,
            filtered_max,
        ))
    }

    fn apply_religion_colors(&mut self) -> gradient::MapLegend {
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

        gradient::MapLegend::Qualitative
    }

    pub fn get_map_mode(&self) -> MapMode {
        self.current_map_mode
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_dimming_allows_land() {
        assert!(Eu5Workspace::should_dim_location(
            MapMode::Political,
            Terrain::Other,
            true,
            false,
            GpuColor::from_rgb(1, 2, 3),
        ));
    }

    #[test]
    fn selection_dimming_excludes_impassable_and_selected_locations() {
        assert!(!Eu5Workspace::should_dim_location(
            MapMode::Political,
            Terrain::Impassable,
            true,
            false,
            GpuColor::from_rgb(1, 2, 3),
        ));
        assert!(!Eu5Workspace::should_dim_location(
            MapMode::Political,
            Terrain::Other,
            true,
            true,
            GpuColor::from_rgb(1, 2, 3),
        ));
    }

    #[test]
    fn market_mode_dims_market_assigned_water() {
        assert!(Eu5Workspace::should_dim_location(
            MapMode::Markets,
            Terrain::Water,
            true,
            false,
            GpuColor::from_rgb(1, 2, 3),
        ));
    }

    #[test]
    fn market_mode_keeps_unpainted_water_visible() {
        assert!(!Eu5Workspace::should_dim_location(
            MapMode::Markets,
            Terrain::Water,
            true,
            false,
            GpuColor::WATER,
        ));
    }
}
