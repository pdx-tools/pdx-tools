use crate::Eu5Session;
use eu5save::models::LocationIndexedVec;
use pdx_map::{GpuLocationIdx, LocationFlags};
use serde::{Deserialize, Serialize};

/// Determine if the user is zoomed in close enough to show individual locations
pub const fn should_highlight_individual_locations(zoom: f32) -> bool {
    zoom >= 0.85
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MapMode {
    Political,
    Control,
    Development,
    Population,
    Markets,
    RgoLevel,
    BuildingLevels,
    PossibleTax,
    Religion,
}

impl MapMode {
    pub fn name(&self) -> &'static str {
        match self {
            MapMode::Political => "Political",
            MapMode::Control => "Control",
            MapMode::Development => "Development",
            MapMode::Population => "Population",
            MapMode::Markets => "Markets",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::PossibleTax => "Possible Tax",
            MapMode::Religion => "Religion",
        }
    }
}

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDimensions {
    /// Logical width in pixels
    pub canvas_width: u32,

    /// Logical height in pixels
    pub canvas_height: u32,

    /// Device Pixel Ratio
    pub scale_factor: f32,
}

impl CanvasDimensions {
    pub fn physical_width(&self) -> u32 {
        (self.canvas_width as f32 * self.scale_factor) as u32
    }

    pub fn physical_height(&self) -> u32 {
        (self.canvas_height as f32 * self.scale_factor) as u32
    }
}

pub struct Eu5MapApp<'bump> {
    session: Eu5Session<'bump>,
    current_map_mode: MapMode,
    location_arrays: pdx_map::LocationArrays,
    gpu_indices: LocationIndexedVec<GpuLocationIdx>,
}

impl<'bump> Eu5MapApp<'bump> {
    /// Create a new Eu5MapApp with any MapRenderer (generic version for headless renderers)
    pub fn new(session: Eu5Session<'bump>) -> Result<Self, Box<dyn std::error::Error>> {
        let mut location_arrays = session.get_location_arrays()?;

        let mut gpu_indices = session
            .gamestate
            .locations
            .create_index(GpuLocationIdx::new(0));
        let mut location_iter = location_arrays.iter_mut();
        while let Some(gpu_location) = location_iter.next_location() {
            let loc_idx = eu5save::models::LocationIdx::new(gpu_location.location_id().value());
            let gpu_idx = GpuLocationIdx::new(gpu_location.index().value());
            gpu_indices[loc_idx] = gpu_idx;
        }

        let app = Eu5MapApp {
            location_arrays,
            session,
            current_map_mode: MapMode::Political,
            gpu_indices,
        };

        Ok(app)
    }

    pub fn location_arrays(&self) -> &pdx_map::LocationArrays {
        &self.location_arrays
    }

    pub fn set_map_mode(&mut self, mode: MapMode) -> Result<(), Box<dyn std::error::Error>> {
        self.current_map_mode = mode;

        // Get mutable access to location arrays for updating colors
        let location_arrays = &mut self.location_arrays;
        let mut location_iter = location_arrays.iter_mut();

        match mode {
            MapMode::Political => {
                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());

                    let terrain = self.session.location_terrain(location_idx);

                    // Water and impassable terrain should not show controller stripes
                    if terrain.is_water() || !terrain.is_passable() {
                        location.set_primary_color(location.owner_color());
                        location.set_secondary_color(location.owner_color());
                    } else {
                        // Regular land: show owner as primary, controller as secondary
                        location.set_primary_color(location.owner_color());
                        location
                            .set_secondary_color(self.session.location_control_color(location_idx));
                    }
                }
            }
            MapMode::Control => {
                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());
                    let control_color = self.session.location_control_value_color(location_idx);
                    location.set_primary_color(control_color);
                }

                // Control mode: copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::Development => {
                let max_development = self.session.max_development();

                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());
                    let development_color = self
                        .session
                        .location_development_color(location_idx, max_development);
                    location.set_primary_color(development_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::Population => {
                let max_population = self.session.max_population();

                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());
                    let population_color = self
                        .session
                        .location_population_color(location_idx, max_population);
                    location.set_primary_color(population_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::Markets => {
                while let Some(mut location) = location_iter.next_location() {
                    let location_id =
                        eu5save::models::LocationIdx::new(location.location_id().value());
                    let market_color = self.session.location_market_color(location_id);
                    location.set_primary_color(market_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::RgoLevel => {
                let max_rgo_level = self.session.max_rgo_level();

                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());

                    let rgo_level_color = self
                        .session
                        .location_rgo_level_color(location_idx, max_rgo_level);
                    location.set_primary_color(rgo_level_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::BuildingLevels => {
                let max_building_levels = self.session.max_building_levels();

                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());

                    let building_levels_color = self
                        .session
                        .location_building_levels_color(location_idx, max_building_levels);
                    location.set_primary_color(building_levels_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::PossibleTax => {
                let max_possible_tax = self.session.max_possible_tax();

                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());

                    let possible_tax_color = self
                        .session
                        .location_possible_tax_color(location_idx, max_possible_tax);
                    location.set_primary_color(possible_tax_color);
                }

                // Copy primary colors to secondary to disable stripes
                location_arrays.copy_primary_to_secondary();
            }
            MapMode::Religion => {
                while let Some(mut location) = location_iter.next_location() {
                    let location_idx =
                        eu5save::models::LocationIdx::new(location.location_id().value());

                    let religion_color = self.session.location_religion_color(location_idx);
                    let owner_religion_color = self.session.owner_religion_color(location_idx);

                    location.set_primary_color(religion_color);
                    location.set_secondary_color(owner_religion_color);
                }
            }
        }

        Ok(())
    }

    pub fn get_map_mode(&self) -> MapMode {
        self.current_map_mode
    }

    pub fn session(&self) -> &Eu5Session<'bump> {
        &self.session
    }

    pub fn player_capital_coordinates(&self) -> Option<(u16, u16)> {
        self.session.get_player_capital_coordinates()
    }

    /// Check if a location can be highlighted based on its terrain (not water and not impassable)
    pub fn can_highlight_location(&self, location_idx: eu5save::models::LocationIdx) -> bool {
        let terrain = self.session.location_terrain(location_idx);

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
        if should_highlight_individual_locations(zoom) {
            if !self.can_highlight_location(location_idx) {
                return;
            }

            let gpu_idx = self.gpu_indices[location_idx];
            let mut state = self.location_arrays.get_mut(gpu_idx);
            state.flags_mut().set(LocationFlags::HIGHLIGHTED);
            return;
        }

        let location = self
            .session
            .gamestate
            .locations
            .index(location_idx)
            .location();

        // For Markets map mode, highlight by market instead of owner
        if self.current_map_mode == MapMode::Markets {
            let Some(market_id) = location.market else {
                return;
            };

            let mut idxs = self.session.gamestate.locations.create_index(false);
            for entry in self.session.gamestate.locations.iter() {
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
            let owner = location.owner;
            let mut idxs = self.session.gamestate.locations.create_index(false);
            for entry in self.session.gamestate.locations.iter() {
                idxs[entry.idx()] = entry.location().owner == owner;
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
        self.session
            .get_overlay_data_for_map_mode(self.current_map_mode)
    }
}
