use crate::game_data::GameData;
use crate::{MapMode, OverlayBodyConfig, OverlayTable, TableCell, models::Terrain, subject_color};
use eu5save::hash::FxHashMap;
use eu5save::models::{
    CountryId, CountryIdx, CountryIndexedVecOwned, Gamestate, LocationIndexedVec, RawMaterialsName,
};
use pdx_map::{GpuColor, GpuLocationIdx, LocationArrays, LocationFlags, R16};
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
    location_coordinates: LocationIndexedVec<(u16, u16)>,
    location_building_levels: OnceLock<LocationIndexedVec<f64>>,

    // Map app state (rendering)
    current_map_mode: MapMode,
    location_arrays: pdx_map::LocationArrays,
    gpu_indices: LocationIndexedVec<Option<GpuLocationIdx>>,
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
        let mut location_coordinates = gamestate.locations.create_index((0, 0));
        let mut gpu_indices = gamestate.locations.create_index(None);

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

            let spatial_data = &game_data.texture_locations()[R16::from(spatial_loc)];
            location_coordinates[location.idx()] = (spatial_data.avg_x, spatial_data.avg_y);
            gpu_indices[location.idx()] = Some(GpuLocationIdx::new(spatial_loc.value()));
        }

        let location_arrays = LocationArrays::allocate(game_data.texture_locations().len());

        let mut workspace = Self {
            gamestate,
            game_data,
            overlord_of,
            location_terrain,
            location_coordinates,
            location_building_levels: OnceLock::new(),
            current_map_mode: MapMode::Political,
            location_arrays,
            gpu_indices,
        };

        workspace.build_location_arrays();

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

    pub fn max_development(&self) -> f64 {
        self.gamestate.location_max_development().0
    }

    pub fn max_rgo_level(&self) -> f64 {
        self.gamestate.location_max_rgo_level().0
    }

    pub fn max_population(&self) -> f64 {
        self.gamestate.location_max_population().0
    }

    pub fn max_building_levels(&self) -> f64 {
        let levels = self.get_location_building_levels();
        levels.iter().copied().fold(0.0_f64, f64::max)
    }

    pub fn max_possible_tax(&self) -> f64 {
        self.gamestate.location_max_possible_tax().0
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
            MapMode::Religion => self.apply_religion_colors(),
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
        let max_development = self.max_development();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let development_color = self.location_development_color(location_idx, max_development);
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
        let max_population = self.max_population();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let population_color = self.location_population_color(location_idx, max_population);
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
        let max_rgo_level = self.max_rgo_level();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let rgo_level_color = self.location_rgo_level_color(location_idx, max_rgo_level);
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
        let max_building_levels = self.max_building_levels();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let building_levels_color =
                self.location_building_levels_color(location_idx, max_building_levels);
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
        let max_possible_tax = self.max_possible_tax();

        // Collect color data first to avoid borrow conflicts
        let mut color_data = Vec::new();
        for idx in 0..self.gamestate.locations.len() {
            let location_idx = eu5save::models::LocationIdx::new(idx as u32);
            let possible_tax_color =
                self.location_possible_tax_color(location_idx, max_possible_tax);
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

    pub fn player_capital_coordinates(&self) -> Option<(u16, u16)> {
        let player_country = self.gamestate.played_countries.first()?.country;

        // Get the player's country data to access the capital field
        let country_idx = self.gamestate.countries.get(player_country)?;
        let capital_id = self
            .gamestate
            .countries
            .index(country_idx)
            .data()?
            .capital?;

        // Get the game data for the capital location to access coordinates
        let idx = self.gamestate.locations.get(capital_id)?;
        let location_coordinates = &self.location_coordinates[idx];
        Some(*location_coordinates)
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

    pub fn handle_location_hover(&mut self, location_idx: eu5save::models::LocationIdx, zoom: f32) {
        const HIGHLIGHT_ZOOM: f32 = 0.85;

        if zoom >= HIGHLIGHT_ZOOM {
            if !self.can_highlight_location(location_idx) {
                return;
            }

            let gpu_idx = self.gpu_indices[location_idx];
            let Some(gpu_index) = gpu_idx else {
                return;
            };
            let mut state = self.location_arrays.get_mut(gpu_index);
            state.flags_mut().set(LocationFlags::HIGHLIGHTED);
            return;
        }

        let location = self.gamestate.locations.index(location_idx).location();

        // For Markets map mode, highlight by market instead of owner
        if self.current_map_mode == MapMode::Markets {
            let Some(market_id) = location.market else {
                return;
            };

            let mut idxs = self.gamestate.locations.create_index(false);
            for entry in self.gamestate.locations.iter() {
                idxs[entry.idx()] = entry.location().market == Some(market_id);
            }

            let mut iter = self.location_arrays.iter_mut();
            while let Some(mut location) = iter.next_location() {
                let loc_idx = eu5save::models::LocationIdx::new(location.location_id().value());
                if !idxs[loc_idx] {
                    continue;
                }

                location.flags_mut().set(LocationFlags::HIGHLIGHTED);
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
            while let Some(mut location) = iter.next_location() {
                let loc_idx = eu5save::models::LocationIdx::new(location.location_id().value());
                if !idxs[loc_idx] {
                    continue;
                }

                location.flags_mut().set(LocationFlags::HIGHLIGHTED);
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
                // Get country info
                let country_idx = self.gamestate.countries.get(country_id)?;
                let country_entry = self.gamestate.countries.index(country_idx);
                let country_data = country_entry.data()?;

                let tag = country_entry.tag().to_str().to_string();
                let name = self
                    .localized_country_name(&country_data.country_name)
                    .to_string();

                let avg_efficacy = if aggregate.location_count > 0 {
                    aggregate.total_efficacy / (aggregate.location_count as f64)
                } else {
                    0.0
                };

                Some(CountryStateEfficacy {
                    tag,
                    name,
                    color: format!(
                        "#{:02x}{:02x}{:02x}",
                        country_data.color.0[0], country_data.color.0[1], country_data.color.0[2]
                    ),
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
}

/// State efficacy data for a single country
#[derive(Debug, Clone)]
pub struct CountryStateEfficacy {
    pub tag: String,
    pub name: String,
    pub color: String,
    pub total_efficacy: f64,
    pub location_count: u32,
    pub avg_efficacy: f64,
    pub total_population: u32,
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
}
