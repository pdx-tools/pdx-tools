use crate::gradient::{self, GradientScale};

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

        gradient::interpolate_eu5_gradient(
            save_location.possible_tax,
            max_possible_tax,
            GradientScale::Linear,
        )
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
        gradient::interpolate_tax_gap(gap, max_abs_gap)
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
}
