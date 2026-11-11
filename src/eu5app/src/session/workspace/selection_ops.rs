use super::*;
use crate::selection::{SelectionOp, SelectionPreset, SelectionSet, SelectionTarget};
use eu5save::models::{LocationId, LocationIdx, MarketId, RealCountryId};

impl<'bump> Eu5Workspace<'bump> {
    /// Build a flat lookup table mapping GPU location index → group ID for
    /// the current map mode. Built once per mode switch and per timeline
    /// step; used by the map renderer for per-frame box-select preview
    /// highlighting.
    pub fn build_grouping_table(&self) -> GroupingTable {
        let len = self.location_arrays.len();
        let mut groups = vec![GroupId::NONE; len];
        let values = self.live_values();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            let Some(gpu_idx) = self.gpu_indices[idx] else {
                continue;
            };

            // Filled terrain goes in the group of the land it takes its color
            // from, so an area over it shows the land that its selection shows.
            groups[gpu_idx.value() as usize] = GroupId::from_raw(super::map_painter::group(
                &values,
                self.current_map_mode,
                idx,
            ));
        }

        GroupingTable::new(groups)
    }

    /// Change the selection as a click at `clicked_idx` does. A click on the
    /// selected entity acts on the clicked location: a replace sets or clears
    /// its focus, an add focuses it, and a remove takes out only that location.
    pub fn click(&mut self, op: SelectionOp, clicked_idx: LocationIdx) -> MapChange {
        let mode = self.current_map_mode;
        let derived_entity_anchor = self.map_click_derived_anchor();
        let outcome = SelectionAdapter::new(&*self).resolve_click(
            clicked_idx,
            mode,
            &self.selection_state,
            derived_entity_anchor,
        );
        match op {
            SelectionOp::Replace => {
                let focused_location = outcome.focused_location.filter(|&f| self.can_focus(f));
                let is_same_entity_click = focused_location.is_none()
                    && !outcome.locations.is_empty()
                    && self.selection_state.len() == outcome.locations.len()
                    && derived_entity_anchor
                        .is_some_and(|anchor| self.same_entity(anchor, clicked_idx, mode));

                if let Some(focus) = focused_location {
                    if self.selection_state.focused_location() == Some(focus) {
                        self.selection_state.clear_focus();
                    } else {
                        self.selection_state.set_focus(focus);
                    }
                } else if is_same_entity_click {
                    self.selection_state.clear_focus();
                } else {
                    self.selection_state.replace(outcome.locations);
                }
            }
            SelectionOp::Add => {
                if outcome.focused_location.is_some_and(|f| self.can_focus(f)) {
                    self.selection_state.set_focus(clicked_idx);
                } else {
                    self.selection_state.add_all(outcome.locations);
                }
            }
            SelectionOp::Remove => {
                if outcome.focused_location.is_some() {
                    self.selection_state.remove(clicked_idx);
                } else {
                    let kind = Self::entity_kind_for_map_mode(mode);
                    self.remove_locations_from_scope_for_kind(&outcome.locations, kind);
                }
            }
        }
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    /// Filled terrain joins its country for a click, but it has no profile
    /// of its own, so a click inside the selected country does not focus it.
    fn can_focus(&self, idx: LocationIdx) -> bool {
        !self.owner_at_timeline_date(idx).is_dummy()
    }

    /// Change the selection by whole countries, whole markets or single
    /// locations. Countries stay followed when they have no land on the
    /// timeline date. A replace with countries or markets that have no land
    /// changes nothing, and a replace with no locations clears the selection.
    pub fn change_selection(&mut self, op: SelectionOp, set: SelectionSet) -> MapChange {
        let mut lineage = FnvHashSet::default();
        let (locations, kind): (FnvHashSet<LocationIdx>, _) = match &set {
            SelectionSet::Countries(countries) => {
                lineage = self.lineage_of(countries);
                (self.land_of_owners(&lineage), EntityKind::Country)
            }
            SelectionSet::Markets(markets) => (self.land_of_markets(markets), EntityKind::Market),
            // Filled terrain is never a member. It shows as selected with the
            // land around it.
            SelectionSet::Locations(locations) => (
                locations
                    .iter()
                    .copied()
                    .filter(|&idx| self.fill_donor(idx).is_none())
                    .collect(),
                Self::entity_kind_for_map_mode(self.current_map_mode),
            ),
        };

        match op {
            SelectionOp::Replace => {
                let is_locations = matches!(set, SelectionSet::Locations(_));
                if locations.is_empty() && !is_locations {
                    return self.no_map_change();
                }
                self.selection_state.replace(locations);
                self.selection_state.set_followed(lineage);
            }
            SelectionOp::Add => {
                self.selection_state.add_all(locations);
                self.selection_state.follow_all(lineage);
            }
            SelectionOp::Remove => {
                // Take out the land first. An unfollow can empty the selection,
                // and a removal from an empty selection starts from all land.
                self.remove_locations_from_scope_for_kind(&locations, kind);
                for &id in &lineage {
                    self.selection_state.unfollow(id);
                }
            }
        }
        self.recompute_derived_scope_for_kind(kind);
        self.rebuild_colors()
    }

    /// The selection as a target that a replace selects again: the Players
    /// preset, whole countries, whole markets, or else its locations. Each
    /// target is checked to give this exact land. The
    /// kind of the single-entity scope, or else of the map mode, is tried
    /// first. None for an empty selection.
    pub fn selection_target(&self) -> Option<SelectionTarget> {
        let selection = &self.selection_state;
        if selection.is_empty() {
            return None;
        }
        // A focused location can stay after a step, though no player owns it.
        let players_land = || self.players_land().map(|(_, land)| land);
        if selection.preset() == Some(SelectionPreset::Players)
            && players_land().is_some_and(|land| land == *selection.selected_locations())
        {
            return Some(SelectionTarget::Players);
        }
        let kind = self
            .derived_entity_kind()
            .unwrap_or_else(|| Self::entity_kind_for_map_mode(self.current_map_mode));
        let countries = || self.whole_countries().map(SelectionSet::Countries);
        let markets = || self.whole_markets().map(SelectionSet::Markets);
        let set = match kind {
            EntityKind::Country => countries().or_else(markets),
            EntityKind::Market => markets().or_else(countries),
        };
        let set = set.or_else(|| {
            let mut locations: Vec<_> = selection.selected_locations().iter().copied().collect();
            locations.sort_unstable_by_key(|idx| idx.value());
            (!locations.is_empty()).then_some(SelectionSet::Locations(locations))
        })?;
        Some(SelectionTarget::Set(set))
    }

    /// Each id that these countries have had.
    fn lineage_of(&self, countries: &[CountryIdx]) -> FnvHashSet<RealCountryId> {
        countries
            .iter()
            .flat_map(|&idx| self.lineage_ids(idx))
            .filter_map(|id| id.real_id())
            .collect()
    }

    /// The land of these owners on the timeline date.
    fn land_of_owners(&self, owners: &FnvHashSet<RealCountryId>) -> FnvHashSet<LocationIdx> {
        self.iter_locations()
            .filter_map(|(idx, info)| owners.contains(&info.owner?).then_some(idx))
            .collect()
    }

    fn land_of_markets(&self, markets: &[MarketId]) -> FnvHashSet<LocationIdx> {
        let markets: FnvHashSet<_> = markets.iter().copied().collect();
        self.iter_locations()
            .filter_map(|(idx, info)| markets.contains(&info.market?).then_some(idx))
            .collect()
    }

    /// The live countries that a replace selects this exact land with, and
    /// the followed countries with no land on the timeline date. None when no
    /// set of whole countries gives this land.
    fn whole_countries(&self) -> Option<Vec<CountryIdx>> {
        let selection = &self.selection_state;
        let in_save = |id: RealCountryId| {
            self.live_country_of(id.country_id())
                .filter(|&idx| self.gamestate.countries.index(idx).data().is_some())
        };
        let mut countries = FnvHashSet::default();
        for &idx in selection.selected_locations() {
            countries.insert(in_save(self.owner_at_timeline_date(idx).real_id()?)?);
        }
        countries.extend(selection.followed().iter().copied().filter_map(in_save));
        let mut countries: Vec<_> = countries.into_iter().collect();
        countries.sort_unstable_by_key(|idx| idx.value());
        let land = self.land_of_owners(&self.lineage_of(&countries));
        (!countries.is_empty() && land == *selection.selected_locations()).then_some(countries)
    }

    /// The markets that a replace selects this exact land with. None when no
    /// set of whole markets gives this land.
    fn whole_markets(&self) -> Option<Vec<MarketId>> {
        let selection = &self.selection_state;
        let mut markets = FnvHashSet::default();
        for &idx in selection.selected_locations() {
            markets.insert(self.location_info(idx).market?);
        }
        let mut markets: Vec<_> = markets.into_iter().collect();
        markets.sort_unstable_by_key(|id| id.value());
        let land = self.land_of_markets(&markets);
        (!markets.is_empty() && land == *selection.selected_locations()).then_some(markets)
    }

    /// The id of the location at the center of a market. It stays the same
    /// across saves, so a market carries by it.
    pub fn market_center_id(&self, market: MarketId) -> Option<LocationId> {
        self.gamestate.market_manager.get(market).map(|m| m.center)
    }

    /// The market whose center is the location with this id.
    pub fn market_at_center_id(&self, center: LocationId) -> Option<MarketId> {
        self.gamestate
            .market_manager
            .database
            .iter_with_id()
            .find(|(_, m)| m.center == center)
            .map(|(id, _)| id)
    }

    fn remove_locations_from_scope_for_kind(
        &mut self,
        locations: &FnvHashSet<LocationIdx>,
        kind: EntityKind,
    ) {
        if self.selection_state.is_empty() && !locations.is_empty() {
            let mode = Self::map_mode_for_entity_kind(kind);
            let global_locations = SelectionAdapter::new(&*self).resolve_all_in_entity_mode(mode);
            self.selection_state
                .remove_all_from_scope_or_global(locations, global_locations);
        } else {
            self.selection_state.remove_all(locations.iter().copied());
        }
    }

    pub fn clear_selection(&mut self) -> MapChange {
        self.selection_state.clear();
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    pub fn clear_focus(&mut self) -> MapChange {
        self.selection_state.clear_focus();
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    pub fn clear_focus_or_selection(&mut self) -> MapChange {
        if self.selection_state.has_focus() {
            self.selection_state.clear_focus();
        } else {
            self.selection_state.clear();
        }
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    /// Set focus to `location`, replacing the filter with its entity first if
    /// the current filter does not already resolve to that entity.
    pub fn set_focused_location(&mut self, location: LocationIdx) -> MapChange {
        let scope_mode = self.derived_scope_map_mode();
        let already_scoped_here = self
            .derived_entity_anchor()
            .map(|anchor| self.same_entity(location, anchor, scope_mode))
            .unwrap_or(false);

        if !already_scoped_here {
            let entity_locs = SelectionAdapter::new(&*self)
                .resolve_in_entity_mode(location, self.current_map_mode);
            if entity_locs.is_empty() {
                return self.no_map_change();
            }
            self.selection_state.replace(entity_locs);
            self.recompute_derived_scope();
        }

        self.selection_state.set_focus(location);
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    /// Focus `location` when it is in the selection. Otherwise nothing changes.
    /// A focus that a timeline step keeps can be on land with no owner.
    pub fn focus_in_selection(&mut self, location: LocationIdx) -> MapChange {
        if !self.selection_state.contains(location) {
            return self.no_map_change();
        }
        self.selection_state.set_focus(location);
        self.rebuild_colors()
    }

    /// Select all locations owned by human-controlled countries and their subjects.
    pub fn select_players(&mut self) -> MapChange {
        let Some((player_and_subjects, locations)) = self.players_land() else {
            return self.no_map_change();
        };
        self.selection_state
            .replace_with_preset(locations, crate::selection::SelectionPreset::Players);
        self.recompute_derived_scope();
        // Also follow players and subjects with no land on this date.
        let mut followed = self.selection_state.followed().clone();
        followed.extend(
            player_and_subjects
                .iter()
                .filter_map(|&idx| self.gamestate.countries.index(idx).id().real_id()),
        );
        self.selection_state.set_followed(followed);
        self.rebuild_colors()
    }

    /// The players and their subjects, and their land on the timeline date.
    /// None when the save has no players.
    fn players_land(&self) -> Option<(FnvHashSet<CountryIdx>, FnvHashSet<LocationIdx>)> {
        let player_idxs: FnvHashSet<CountryIdx> = self.players().map(|p| p.country).collect();
        if player_idxs.is_empty() {
            return None;
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
        let locations = self
            .iter_locations()
            .filter_map(|(idx, info)| {
                let owner_idx = self.gamestate.countries.get(info.owner?.country_id())?;
                player_and_subjects.contains(&owner_idx).then_some(idx)
            })
            .collect();
        Some((player_and_subjects, locations))
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

    /// Return the GPU color ID needed to center the map at this location.
    pub fn center_at(&self, location_idx: eu5save::models::LocationIdx) -> Option<crate::ColorIdx> {
        self.gpu_indices[location_idx].map(|gpu_idx| crate::ColorIdx::new(gpu_idx.value()))
    }

    /// Returns the `CountryIdx` of the best default country to display in the
    /// political map mode. When a multi-country selection is active, the
    /// candidate set is limited to countries inside that selection.
    /// Priority: first human-played country, then highest great-power rank.
    pub fn political_default_country_idx(&self) -> Option<eu5save::models::CountryIdx> {
        let mut candidates = Vec::new();
        let mut seen = FnvHashSet::default();

        if self.selection_state.is_empty() {
            for entry in self.gamestate.countries.iter() {
                if entry.data().is_some() && seen.insert(entry.idx()) {
                    candidates.push(entry.idx());
                }
            }
        } else {
            for &idx in self.selection_state.selected_locations() {
                let Some(country_id) = self.location_info(idx).owner.map(|id| id.country_id())
                else {
                    continue;
                };
                let Some(country_idx) = self.gamestate.countries.get(country_id) else {
                    continue;
                };
                if seen.insert(country_idx) {
                    candidates.push(country_idx);
                }
            }
        }

        self.players()
            .map(|p| p.country)
            .find(|idx| seen.contains(idx))
            .or_else(|| {
                candidates
                    .iter()
                    .filter_map(|&idx| {
                        let entry = self.gamestate.countries.index(idx);
                        let rank = entry.data()?.great_power_rank;
                        (rank > 0).then_some((rank, entry.tag(), idx))
                    })
                    .min_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)))
                    .map(|(_, _, idx)| idx)
            })
            .or_else(|| candidates.first().copied())
    }

    /// Check if a location can be highlighted based on its terrain (not water and not impassable)
    pub fn can_highlight_location(&self, location_idx: eu5save::models::LocationIdx) -> bool {
        let terrain = self.location_terrain(location_idx);

        if !terrain.is_water() && terrain.is_passable() {
            return true;
        }

        // Surrounded special-terrain participates in highlights as if it were
        // part of the donor's country.
        self.fill_donor(location_idx).is_some()
    }

    /// The owner for highlight purposes: a location's own owner, or for
    /// filled terrain, the owner of its donor.
    fn resolved_political_owner(
        &self,
        location_idx: eu5save::models::LocationIdx,
    ) -> Option<eu5save::models::RealCountryId> {
        self.owner_at_timeline_date(self.fill_source(location_idx))
            .real_id()
    }

    pub fn clear_highlights(&mut self) {
        let mut iter = self.location_arrays.iter_mut();
        while let Some(mut location) = iter.next_location() {
            location.flags_mut().clear(LocationFlags::HIGHLIGHTED);
        }
    }

    pub fn highlight_location(&mut self, location_idx: eu5save::models::LocationIdx) {
        if !self.can_highlight_location(location_idx) {
            return;
        }

        let Some(gpu_index) = self.gpu_indices[location_idx] else {
            return;
        };

        let mut state = self.location_arrays.get_mut(gpu_index);
        state.flags_mut().set(LocationFlags::HIGHLIGHTED);
    }

    pub fn highlight_country(&mut self, country_idx: eu5save::models::CountryIdx) {
        let Some(owner) = self.gamestate.countries.index(country_idx).id().real_id() else {
            return;
        };

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if self.resolved_political_owner(idx) != Some(owner) {
                continue;
            }

            let Some(gpu_index) = self.gpu_indices[idx] else {
                continue;
            };

            let mut state = self.location_arrays.get_mut(gpu_index);
            state.flags_mut().set(LocationFlags::HIGHLIGHTED);
        }
    }

    pub fn highlight_market(&mut self, market_id: eu5save::models::MarketId) {
        if self.gamestate.market_manager.get(market_id).is_none() {
            return;
        }

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if entry.location().market != Some(market_id) || !self.can_highlight_location(idx) {
                continue;
            }

            let Some(gpu_index) = self.gpu_indices[idx] else {
                continue;
            };

            let mut state = self.location_arrays.get_mut(gpu_index);
            state.flags_mut().set(LocationFlags::HIGHLIGHTED);
        }
    }

    pub fn handle_location_hover(&mut self, location_idx: eu5save::models::LocationIdx) {
        // On a past date, hover shows the whole country that held the land
        // then, also inside the selection.
        if !self.is_timeline_live() {
            self.highlight_owner_at_timeline_date(location_idx);
            return;
        }

        let scope_mode = self.derived_scope_map_mode();

        if tracing::enabled!(tracing::Level::WARN) {
            let entity_anchor = single_entity_scope(&self.selection_state, &*self, scope_mode);
            if self.derived_entity_anchor() != entity_anchor {
                tracing::warn!(
                    "derived_entity_anchor mismatch: expected {:?}, got {:?}",
                    entity_anchor,
                    self.derived_entity_anchor()
                );
            }
        }

        if let Some(anchor) = self.derived_entity_anchor()
            && self.same_entity(location_idx, anchor, scope_mode)
        {
            self.highlight_location(location_idx);
            return;
        }

        self.highlight_entity(location_idx);
    }

    fn highlight_owner_at_timeline_date(&mut self, location_idx: eu5save::models::LocationIdx) {
        let owner = self.owner_at_timeline_date(self.political_fill_source(location_idx));
        if owner.is_dummy() {
            return;
        }
        let mut idxs = self.gamestate.locations.create_index(false);
        for entry in self.gamestate.locations.iter() {
            idxs[entry.idx()] =
                self.owner_at_timeline_date(self.political_fill_source(entry.idx())) == owner;
        }
        self.highlight_locations_by_index(&idxs);
    }

    fn highlight_locations_by_index(&mut self, idxs: &eu5save::models::LocationIndexedVec<bool>) {
        let mut iter = self.location_arrays.iter_mut();
        while let Some(mut loc) = iter.next_location() {
            let loc_idx = eu5save::models::LocationIdx::new(loc.location_id().value());
            if idxs[loc_idx] {
                loc.flags_mut().set(LocationFlags::HIGHLIGHTED);
            }
        }
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

            self.highlight_locations_by_index(&idxs);
        } else {
            let owner = self.resolved_political_owner(location_idx);
            let mut idxs = self.gamestate.locations.create_index(false);

            if let Some(owner) = owner {
                for entry in self.gamestate.locations.iter() {
                    idxs[entry.idx()] = self.resolved_political_owner(entry.idx()) == Some(owner);
                }
            }

            self.highlight_locations_by_index(&idxs);
        }
    }
}
