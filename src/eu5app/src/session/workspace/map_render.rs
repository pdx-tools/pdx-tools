use super::map_painter::{self, LocationMarket, LocationValues, MapLayout, PaintRequest};
use super::*;
use crate::gradient;
use crate::map_projection::{Fraction, Metric};
use eu5save::models::Color;

/// The values of the loaded save. Owners and their colors are those on the
/// timeline date.
pub(super) struct LiveValues<'a, 'bump> {
    workspace: &'a Eu5Workspace<'bump>,
    /// False reads the owners of the save and ignores the timeline.
    timeline: bool,
}

impl LiveValues<'_, '_> {
    fn location(&self, idx: LocationIdx) -> &eu5save::models::Location<'_> {
        self.workspace.gamestate.locations.index(idx).location()
    }

    fn owner_id(&self, idx: LocationIdx) -> CountryId {
        if self.timeline {
            self.workspace.owner_at_timeline_date(idx)
        } else {
            self.location(idx).owner
        }
    }
}

impl LocationValues for LiveValues<'_, '_> {
    fn location_count(&self) -> usize {
        self.workspace.gamestate.locations.len()
    }

    fn owner(&self, idx: LocationIdx) -> Option<u32> {
        self.owner_id(idx)
            .real_id()
            .map(|id| id.country_id().value())
    }

    fn controller(&self, idx: LocationIdx) -> Option<u32> {
        let controller = self.location(idx).controller.real_id();
        controller.map(|id| id.country_id().value())
    }

    fn religion(&self, idx: LocationIdx) -> Option<u32> {
        self.location(idx).religion.map(|id| id.value())
    }

    fn fraction(&self, idx: LocationIdx, fraction: Fraction) -> f64 {
        fraction.of(self.location(idx))
    }

    fn metric(&self, idx: LocationIdx, metric: Metric) -> f64 {
        let workspace = self.workspace;
        metric.of(&workspace.gamestate, self.location(idx), || {
            workspace.get_location_building_levels()[idx]
        })
    }

    fn owner_color(&self, idx: LocationIdx) -> GpuColor {
        let owner = self.owner_id(idx);
        if owner.is_dummy() {
            return GpuColor::UNOWNED;
        }
        self.workspace.country_color_at_timeline_date(owner)
    }

    fn controller_color(&self, idx: LocationIdx) -> GpuColor {
        let countries = &self.workspace.gamestate.countries;
        let Some(country_idx) = self
            .location(idx)
            .controller
            .real_id()
            .and_then(|id| countries.get(id))
        else {
            return GpuColor::UNOWNED;
        };
        let color_of = |idx| countries.index(idx).data().map(|data| data.color);
        let Some(color) = color_of(country_idx) else {
            return GpuColor::UNOWNED;
        };
        self.workspace
            .subject_blended_color(country_idx, color, color_of)
    }

    fn religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let religion = self.location(idx).religion?;
        let religion = self.workspace.gamestate.religion_manager.lookup(religion);
        Some(religion.map_or(GpuColor::DEBUG, |religion| GpuColor::from(religion.color.0)))
    }

    fn owner_religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let game = &self.workspace.gamestate;
        let country_idx = game.countries.get(self.location(idx).owner)?;
        let religion = game.countries.index(country_idx).data()?.primary_religion?;
        let religion = game.religion_manager.lookup(religion)?;
        Some(GpuColor::from(religion.color.0))
    }

    fn market(&self, idx: LocationIdx) -> LocationMarket {
        let game = &self.workspace.gamestate;
        let Some(market) = self.location(idx).market else {
            return LocationMarket::None;
        };
        let Some(market) = game.market_manager.get(market) else {
            return LocationMarket::Unknown;
        };
        LocationMarket::Member {
            color: GpuColor::from(market.color.0),
            center: game.locations.get(market.center),
        }
    }

    fn has_controllers(&self) -> bool {
        self.workspace.is_timeline_live()
    }

    fn owner_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>> {
        &self.workspace.fill_donors
    }

    fn religion_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>> {
        self.workspace.religion_fill_donors()
    }
}

impl<'bump> Eu5Workspace<'bump> {
    pub(super) fn live_values(&self) -> LiveValues<'_, 'bump> {
        LiveValues {
            workspace: self,
            timeline: true,
        }
    }

    pub(super) fn map_layout(&self) -> MapLayout<'_> {
        MapLayout {
            terrain: &self.location_terrain,
            fill: &self.fill_components,
        }
    }

    /// Lazily computes and caches building levels for all locations.
    /// Returns a reference to the cached data.
    pub fn get_location_building_levels(&self) -> &LocationIndexedVec<f64> {
        self.location_building_levels
            .get_or_init(|| crate::map_measurements::location_building_levels(&self.gamestate))
    }

    pub fn location_terrain(&self, idx: eu5save::models::LocationIdx) -> Terrain {
        self.location_terrain[idx]
    }

    /// The location that surrounded terrain takes its color from in the
    /// current map mode. `None` for land, for terrain that is not surrounded
    /// by one color, and in the modes that do not fill terrain.
    ///
    /// Every interaction with filled terrain (hover, highlight, selection,
    /// dimming) reads this, so it always agrees with what the map shows.
    pub(crate) fn fill_donor(
        &self,
        idx: eu5save::models::LocationIdx,
    ) -> Option<eu5save::models::LocationIdx> {
        match self.current_map_mode {
            MapMode::Political => self.fill_donors[idx],
            MapMode::Religion => self.religion_fill_donors()[idx],
            _ => None,
        }
    }

    /// The location whose color `idx` shows in the current map mode: its
    /// donor when it is filled terrain, otherwise itself.
    pub(crate) fn fill_source(
        &self,
        idx: eu5save::models::LocationIdx,
    ) -> eu5save::models::LocationIdx {
        self.fill_donor(idx).unwrap_or(idx)
    }

    /// The location whose owner color `idx` shows on the timeline date, in
    /// every map mode. The owner borders read this, so filled terrain merges
    /// with the country around it even in a mode that paints it as terrain.
    pub(crate) fn political_fill_source(
        &self,
        idx: eu5save::models::LocationIdx,
    ) -> eu5save::models::LocationIdx {
        self.fill_donors[idx].unwrap_or(idx)
    }

    /// The religion fill of surrounded terrain. Religion has no history, so
    /// the religion mode only shows the save date and the fill is computed
    /// once.
    fn religion_fill_donors(&self) -> &LocationIndexedVec<Option<eu5save::models::LocationIdx>> {
        self.religion_fill_donors.get_or_init(|| {
            let values = LiveValues {
                workspace: self,
                timeline: false,
            };
            map_painter::religion_fill(&self.fill_components, &values)
        })
    }

    /// The owner color on the timeline date. At the save date the timeline
    /// owners equal the current owners, so one path serves every date.
    pub fn location_political_color(&self, key: eu5save::models::LocationIdx) -> GpuColor {
        map_painter::political_color(&self.live_values(), &self.map_layout(), key)
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
        subject_color::subject_map_color(
            country_idx,
            country_color,
            self.gamestate.countries.len(),
            |idx| self.overlord_of[idx],
            color_of,
        )
    }

    pub(super) fn build_location_arrays(&mut self) {
        self.fill_donors = map_painter::owner_fill(&self.fill_components, &self.live_values());

        for location in self.gamestate.locations.iter() {
            let Some(gpu_index) = self.gpu_indices[location.idx()] else {
                tracing::debug!(id = ?location.id(), location_idx = ?location.idx(), "Skipping location not in texture");
                continue;
            };

            let terrain = self.location_terrain(location.idx());
            let owner_color =
                map_painter::border_color(&self.live_values(), &self.map_layout(), location.idx());
            let unowned = self.owner_at_timeline_date(location.idx()).is_dummy();

            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_location_id(pdx_map::LocationId::new(location.idx().value()));

            // Water locations get a specific color and no location borders.
            // A lake is flagged apart from the sea so that its shore is
            // drawn like the edge of impassable terrain, not as a coast.
            if terrain.is_water() {
                gpu_location.set_primary_color(GpuColor::WATER);
                gpu_location.set_border_color(GpuColor::WATER);
                gpu_location.set_secondary_color(GpuColor::WATER);
                gpu_location
                    .flags_mut()
                    .set(LocationFlags::NO_LOCATION_BORDERS);
                let water_flag = match terrain {
                    Terrain::Lake => LocationFlags::LAKE,
                    _ => LocationFlags::WATER,
                };
                gpu_location.flags_mut().set(water_flag);
                continue;
            }

            if !terrain.is_passable() {
                gpu_location.set_primary_color(GpuColor::IMPASSABLE);
                gpu_location.set_border_color(GpuColor::IMPASSABLE);
                gpu_location.set_secondary_color(GpuColor::IMPASSABLE);
                gpu_location.flags_mut().set(LocationFlags::IMPASSABLE);
                continue;
            }

            gpu_location.set_border_color(owner_color);
            set_unowned_flag(gpu_location.flags_mut(), unowned);
        }

        self.paint_live(MapMode::Political);
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
        let generation = self.selection_state.selection_generation();
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

        let gradient = self.paint_live(mode);

        self.current_map_legend = gradient;
        self.painted_selection_generation = self.selection_state.selection_generation();
        self.apply_interaction_flags();

        MapChange {
            dirty: MapDirty::ALL,
            legend: gradient,
        }
    }

    /// Repaint a few locations in the political mode on a past date. The
    /// list holds the locations that changed hands and the surrounded
    /// terrain next to them, whose fill and dimming can change with the
    /// owners around it.
    pub(super) fn repaint_locations(
        &mut self,
        locations: &[eu5save::models::LocationIdx],
    ) -> MapChange {
        let mut dirty = MapDirty::NONE;
        let has_selection = !self.selection_state.is_empty();
        for &location_idx in locations {
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };
            dirty = dirty | MapDirty::COLORS;
            let primary = self.location_political_color(self.political_fill_source(location_idx));
            let dimmed = Self::should_dim_location(
                self.location_terrain(location_idx),
                has_selection,
                self.is_selected_or_filled_by_selected(location_idx),
                primary,
            );
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_primary_color(primary);
            gpu_location.set_secondary_color(primary);
            if gpu_location.flags().contains(LocationFlags::DIMMED) != dimmed {
                dirty = dirty | MapDirty::FLAGS;
                if dimmed {
                    gpu_location.flags_mut().set(LocationFlags::DIMMED);
                } else {
                    gpu_location.flags_mut().clear(LocationFlags::DIMMED);
                }
            }
        }
        MapChange {
            dirty,
            legend: self.current_map_legend,
        }
    }

    /// Surrounded terrain follows the selection state of its donor so that
    /// it dims and brightens with the rest of the country.
    fn is_selected_or_filled_by_selected(&self, idx: eu5save::models::LocationIdx) -> bool {
        self.selection_state.contains(idx)
            || self
                .fill_donor(idx)
                .is_some_and(|donor| self.selection_state.contains(donor))
    }

    pub(super) fn apply_interaction_flags(&mut self) {
        let has_selection = !self.selection_state.is_empty();
        for location in self.gamestate.locations.iter() {
            let terrain = self.location_terrain(location.idx());
            let selected = self.is_selected_or_filled_by_selected(location.idx());
            let Some(gpu_idx) = self.gpu_indices[location.idx()] else {
                continue;
            };
            let mut s = self.location_arrays.get_mut(gpu_idx);

            let should_dim =
                Self::should_dim_location(terrain, has_selection, selected, s.primary_color());
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
        terrain: Terrain,
        has_selection: bool,
        selected: bool,
        primary_color: GpuColor,
    ) -> bool {
        has_selection && !selected && Self::terrain_allows_dimming(terrain, primary_color)
    }

    /// Special terrain dims only when a map mode painted it: the water of a
    /// market, or surrounded terrain filled with the color around it.
    fn terrain_allows_dimming(terrain: Terrain, primary_color: GpuColor) -> bool {
        terrain.is_passable()
            || (primary_color != GpuColor::WATER && primary_color != GpuColor::IMPASSABLE)
    }

    pub fn no_map_change(&self) -> MapChange {
        MapChange {
            dirty: MapDirty::NONE,
            legend: self.current_map_legend,
        }
    }

    /// Paint `mode` from the loaded save and return its legend.
    fn paint_live(&mut self, mode: MapMode) -> gradient::MapLegend {
        let request = PaintRequest {
            mode,
            selection: Some(&self.selection_state),
        };
        let painted = map_painter::paint(&self.live_values(), &self.map_layout(), &request);
        painted.write(&self.gpu_indices, &mut self.location_arrays);
        painted.legend
    }

    pub fn get_map_mode(&self) -> MapMode {
        self.current_map_mode
    }
}

/// Mark or unmark a location as land that no country owns. The renderer
/// draws no political border on unowned land.
pub(super) fn set_unowned_flag(flags: &mut LocationFlags, unowned: bool) {
    if unowned {
        flags.set(LocationFlags::UNOWNED);
    } else {
        flags.clear(LocationFlags::UNOWNED);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PAINTED: GpuColor = GpuColor::from_rgb(1, 2, 3);

    #[test]
    fn selection_dimming_allows_land() {
        assert!(Eu5Workspace::should_dim_location(
            Terrain::Other,
            true,
            false,
            PAINTED,
        ));
    }

    #[test]
    fn selection_dimming_excludes_unpainted_and_selected_locations() {
        assert!(!Eu5Workspace::should_dim_location(
            Terrain::Impassable,
            true,
            false,
            GpuColor::IMPASSABLE,
        ));
        assert!(!Eu5Workspace::should_dim_location(
            Terrain::Sea,
            true,
            false,
            GpuColor::WATER,
        ));
        assert!(!Eu5Workspace::should_dim_location(
            Terrain::Other,
            true,
            true,
            PAINTED,
        ));
    }

    #[test]
    fn painted_special_terrain_dims() {
        // Market water and filled lakes or impassable terrain dim with the
        // land around them.
        assert!(Eu5Workspace::should_dim_location(
            Terrain::Sea,
            true,
            false,
            PAINTED,
        ));
        assert!(Eu5Workspace::should_dim_location(
            Terrain::Lake,
            true,
            false,
            PAINTED,
        ));
        assert!(Eu5Workspace::should_dim_location(
            Terrain::Impassable,
            true,
            false,
            PAINTED,
        ));
    }
}
