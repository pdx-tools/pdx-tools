use super::*;

impl<'bump> Eu5Workspace<'bump> {
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
    pub fn select_entity(
        &mut self,
        clicked_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
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
        self.rebuild_colors()
    }

    /// Add the entity at `clicked_idx` to the existing selection.
    pub fn add_entity(
        &mut self,
        clicked_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
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
        self.rebuild_colors()
    }

    /// Remove the entity at `clicked_idx` from the selection.
    pub fn remove_entity(
        &mut self,
        clicked_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
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
        self.rebuild_colors()
    }

    /// Replace the selection with the country owning `anchor_idx`.
    pub fn select_country_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> (Option<crate::ColorIdx>, crate::gradient::MapLegend) {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        if locs.is_empty() {
            return (None, crate::gradient::MapLegend::Qualitative);
        }
        self.selection_state.replace(locs);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        let gradient = self.rebuild_colors();
        (self.center_at(anchor_idx), gradient)
    }

    /// Add the country owning `anchor_idx` to the existing selection.
    pub fn add_country_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        self.selection_state.add_all(&locs);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        self.rebuild_colors()
    }

    /// Remove the country owning `anchor_idx` from the selection.
    pub fn remove_country_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
        let locs = SelectionAdapter::new(&*self).resolve_by_owner(anchor_idx);
        self.remove_locations_from_scope_for_kind(&locs, EntityKind::Country);
        self.recompute_derived_scope_for_kind(EntityKind::Country);
        self.rebuild_colors()
    }

    /// Replace the selection with the market containing `anchor_idx`.
    pub fn select_market_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> (Option<crate::ColorIdx>, crate::gradient::MapLegend) {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        if locs.is_empty() {
            return (None, crate::gradient::MapLegend::Qualitative);
        }
        self.selection_state.replace(locs);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        let gradient = self.rebuild_colors();
        (self.center_at(anchor_idx), gradient)
    }

    /// Add the market containing `anchor_idx` to the existing selection.
    pub fn add_market_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        self.selection_state.add_all(&locs);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        self.rebuild_colors()
    }

    /// Remove the market containing `anchor_idx` from the selection.
    pub fn remove_market_at(
        &mut self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> crate::gradient::MapLegend {
        let locs = SelectionAdapter::new(&*self).resolve_by_market(anchor_idx);
        self.remove_locations_from_scope_for_kind(&locs, EntityKind::Market);
        self.recompute_derived_scope_for_kind(EntityKind::Market);
        self.rebuild_colors()
    }

    /// Apply a pre-resolved set of locations (produced by the map renderer's
    /// `commit_box_selection`) to the selection state.
    pub fn apply_resolved_box_selection(
        &mut self,
        resolved_locations: impl IntoIterator<Item = eu5save::models::LocationIdx>,
        add: bool,
    ) -> crate::gradient::MapLegend {
        let set: FnvHashSet<_> = resolved_locations.into_iter().collect();
        let operation = if add {
            SelectionSetOperation::Add
        } else {
            SelectionSetOperation::Remove
        };
        self.apply_selection_set(set, operation)
    }

    pub fn replace_selection_with_locations(
        &mut self,
        resolved_locations: impl IntoIterator<Item = eu5save::models::LocationIdx>,
    ) -> crate::gradient::MapLegend {
        let set: FnvHashSet<_> = resolved_locations.into_iter().collect();
        self.apply_selection_set(set, SelectionSetOperation::Replace)
    }

    fn apply_selection_set(
        &mut self,
        locations: FnvHashSet<eu5save::models::LocationIdx>,
        operation: SelectionSetOperation,
    ) -> crate::gradient::MapLegend {
        match operation {
            SelectionSetOperation::Add => self.selection_state.add_all(&locations),
            SelectionSetOperation::Remove => {
                let kind = Self::entity_kind_for_map_mode(self.current_map_mode);
                self.remove_locations_from_scope_for_kind(&locations, kind);
            }
            SelectionSetOperation::Replace => self.selection_state.replace(locations),
        }
        self.recompute_derived_scope();
        self.rebuild_colors()
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

    pub fn clear_selection(&mut self) -> crate::gradient::MapLegend {
        self.selection_state.clear();
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    pub fn clear_focus(&mut self) -> crate::gradient::MapLegend {
        self.selection_state.clear_focus();
        self.recompute_derived_scope();
        self.rebuild_colors()
    }

    pub fn clear_focus_or_selection(&mut self) -> crate::gradient::MapLegend {
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
    pub fn set_focused_location(
        &mut self,
        location: eu5save::models::LocationIdx,
    ) -> (Option<crate::ColorIdx>, crate::gradient::MapLegend) {
        let scope_mode = self.derived_scope_map_mode();
        let already_scoped_here = self
            .derived_entity_anchor
            .map(|anchor| self.same_entity(location, anchor, scope_mode))
            .unwrap_or(false);

        if !already_scoped_here {
            let entity_locs = SelectionAdapter::new(&*self)
                .resolve_in_entity_mode(location, self.current_map_mode);
            if entity_locs.is_empty() {
                return (None, crate::gradient::MapLegend::Qualitative);
            }
            self.selection_state.replace(entity_locs);
            self.recompute_derived_scope();
        }

        self.selection_state.set_focus(location);
        self.recompute_derived_scope();
        let gradient = self.rebuild_colors();
        (self.center_at(location), gradient)
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

    /// Returns the anchor location index for the best default country to display
    /// in the political map mode. When a multi-country selection is active,
    /// the candidate set is limited to countries inside that selection.
    /// Priority: first human-played country, then highest great-power rank.
    pub fn political_default_country_anchor(&self) -> Option<u32> {
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
                let loc = self.gamestate.locations.index(idx).location();
                let Some(country_id) = loc.owner.real_id().map(|id| id.country_id()) else {
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

        let country_idx = self
            .gamestate
            .played_countries
            .iter()
            .filter_map(|p| self.gamestate.countries.get(p.country))
            .find(|idx| seen.contains(idx))
            .or_else(|| {
                candidates
                    .iter()
                    .filter_map(|&idx| {
                        let entry = self.gamestate.countries.index(idx);
                        let rank = entry.data()?.great_power_rank;
                        (rank > 0).then_some((rank, entry.tag().to_str(), idx))
                    })
                    .min_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)))
                    .map(|(_, _, idx)| idx)
            })
            .or_else(|| candidates.first().copied())?;

        let entity_ref = self.entity_ref_from_country_idx(country_idx)?;
        Some(entity_ref.anchor_location_idx)
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
}
