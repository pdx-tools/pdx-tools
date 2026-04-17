use crate::MapMode;
use eu5save::hash::FnvHashSet;
use eu5save::models::{LocationIdx, MarketId, RealCountryId};
use pdx_map::GpuLocationIdx;

/// Result of [`SelectionAdapter::resolve_click`].
#[derive(Debug, Clone)]
pub struct ClickOutcome {
    /// The set of locations to apply to the selection state.
    pub locations: FnvHashSet<LocationIdx>,
    /// Set when the click is within the derived single-entity scope.
    pub focused_location: Option<LocationIdx>,
}

/// Per-location data used by [`SelectionAdapter`] to resolve clicks and by
/// [`SelectionState::entity_summary`] to aggregate selection statistics.
#[derive(Debug, Clone, Copy, Default)]
pub struct LocationInfo {
    pub owner: Option<RealCountryId>,
    pub market: Option<MarketId>,
}

/// Abstracts per-location data queries for [`SelectionAdapter`] and
/// [`SelectionState::entity_summary`]. Implemented by [`crate::Eu5Workspace`]
/// in production; a lightweight mock is used in tests.
pub trait LocationData {
    /// Iterate all locations
    fn iter_locations(&self) -> impl Iterator<Item = (LocationIdx, LocationInfo)> + '_;

    /// Look up a single location by index.
    ///
    /// Used for the clicked location itself — avoids a full scan to resolve the
    /// grouping key before iterating the rest.
    fn location_info(&self, idx: LocationIdx) -> LocationInfo;

    /// Return whether two locations belong to the same resolved entity under the given map mode.
    /// Locations without a resolved owner/market are ungroupable, so this returns false even if
    /// both locations lack one.
    fn same_entity(&self, a: LocationIdx, b: LocationIdx, mode: MapMode) -> bool {
        let info_a = self.location_info(a);
        let info_b = self.location_info(b);
        match mode {
            MapMode::Markets => match (info_a.market, info_b.market) {
                (Some(m1), Some(m2)) => m1 == m2,
                _ => false,
            },
            _ => match (info_a.owner, info_b.owner) {
                (Some(o1), Some(o2)) => o1 == o2,
                _ => false,
            },
        }
    }
}

impl<T: LocationData> LocationData for &T {
    fn iter_locations(&self) -> impl Iterator<Item = (LocationIdx, LocationInfo)> + '_ {
        T::iter_locations(*self)
    }

    fn location_info(&self, idx: LocationIdx) -> LocationInfo {
        T::location_info(*self, idx)
    }
}

/// Which preset (if any) was used to populate the current selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectionPreset {
    Players,
}

/// Tracks the set of currently selected [`LocationIdx`] values.
///
/// All mutations are O(1) amortised; [`SelectionState::entity_summary`] is O(n)
/// over the selected set.
///
/// `focused_location` is optional context inside the current filter. Whether the
/// filter is scoped to one entity is derived from `locations`, not stored here.
#[derive(Debug, Default)]
pub struct SelectionState {
    locations: FnvHashSet<LocationIdx>,
    preset: Option<SelectionPreset>,
    /// Single tile focused within the current scope.
    focused_location: Option<LocationIdx>,
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a location to the selection. Clears focus because the filter changed.
    pub fn add(&mut self, idx: LocationIdx) {
        self.locations.insert(idx);
        self.preset = None;
        self.focused_location = None;
    }

    /// Remove a location from the selection. Clears focus because the filter changed.
    pub fn remove(&mut self, idx: LocationIdx) {
        self.locations.remove(&idx);
        self.preset = None;
        self.focused_location = None;
    }

    /// Add all provided locations to the selection. Clears focus because the filter changed.
    pub fn add_all(&mut self, locations: &FnvHashSet<LocationIdx>) {
        self.locations.extend(locations.iter().copied());
        self.preset = None;
        self.focused_location = None;
    }

    /// Remove all provided locations from the selection. Clears focus because the filter changed.
    pub fn remove_all(&mut self, locations: &FnvHashSet<LocationIdx>) {
        self.locations.retain(|idx| !locations.contains(idx));
        self.preset = None;
        self.focused_location = None;
    }

    /// Replace the entire selection with `locations`, discarding focus.
    pub fn replace(&mut self, locations: FnvHashSet<LocationIdx>) {
        self.locations = locations;
        self.preset = None;
        self.focused_location = None;
    }

    /// Replace the entire selection with `locations` and record the active preset.
    /// Discards focus.
    pub fn replace_with_preset(
        &mut self,
        locations: FnvHashSet<LocationIdx>,
        preset: SelectionPreset,
    ) {
        self.locations = locations;
        self.preset = Some(preset);
        self.focused_location = None;
    }

    /// Clear the entire selection, focus, and any active preset.
    pub fn clear(&mut self) {
        self.locations.clear();
        self.preset = None;
        self.focused_location = None;
    }

    /// Add `idx` to the filter if needed and set it as the focused location.
    pub fn set_focus(&mut self, idx: LocationIdx) {
        if self.locations.insert(idx) {
            self.preset = None;
        }
        self.focused_location = Some(idx);
    }

    /// Clear the focused location only.
    pub fn clear_focus(&mut self) {
        self.focused_location = None;
    }

    /// Return the focused location, if any.
    pub fn focused_location(&self) -> Option<LocationIdx> {
        self.focused_location
    }

    pub fn has_focus(&self) -> bool {
        self.focused_location.is_some()
    }

    /// Return the active preset, if one was used to populate this selection.
    pub fn preset(&self) -> Option<SelectionPreset> {
        self.preset
    }

    pub fn contains(&self, idx: LocationIdx) -> bool {
        self.locations.contains(&idx)
    }

    pub fn is_empty(&self) -> bool {
        self.locations.is_empty()
    }

    pub fn len(&self) -> usize {
        self.locations.len()
    }

    pub fn selected_locations(&self) -> &FnvHashSet<LocationIdx> {
        &self.locations
    }

    /// Compute summary statistics for the current selection.
    ///
    /// Counts distinct non-dummy owning countries across all selected locations.
    /// `data` is queried but not stored.
    pub fn entity_summary(&self, data: impl LocationData) -> SelectionSummary {
        let location_count = self.locations.len();
        let mut owners: FnvHashSet<RealCountryId> = FnvHashSet::default();
        for &idx in &self.locations {
            if let Some(owner) = data.location_info(idx).owner {
                owners.insert(owner);
            }
        }
        SelectionSummary {
            entity_count: owners.len(),
            location_count,
        }
    }
}

/// If all locations in the filter belong to one entity under `map_mode`, return
/// a representative location for that entity. Empty and unowned filters are not
/// scoped.
pub fn single_entity_scope<D: LocationData>(
    selection: &SelectionState,
    data: &D,
    map_mode: MapMode,
) -> Option<LocationIdx> {
    let mut iter = selection.selected_locations().iter().copied();
    let anchor = iter.next()?;
    for other in iter {
        if !data.same_entity(anchor, other, map_mode) {
            return None;
        }
    }

    let info = data.location_info(anchor);
    match map_mode {
        MapMode::Markets => {
            info.market?;
        }
        _ => {
            info.owner?;
        }
    }
    Some(anchor)
}

/// Aggregate statistics for the current selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SelectionSummary {
    /// Number of distinct non-dummy owning countries in the selection.
    pub entity_count: usize,
    /// Total number of selected locations.
    pub location_count: usize,
}

/// Resolves a map click into a [`ClickOutcome`] based on selection state.
///
/// If the current filter resolves to one entity and the click is inside that
/// entity, the filter is preserved and the clicked tile becomes focus.
/// Otherwise, the click resolves to the clicked entity under the map mode.
///
/// An empty set is returned when the clicked location has no applicable
/// grouping entity (unowned, or no market in Markets mode).
pub struct SelectionAdapter<D: LocationData> {
    data: D,
}

impl<D: LocationData> SelectionAdapter<D> {
    pub fn new(data: D) -> Self {
        Self { data }
    }

    pub fn resolve_click(
        &self,
        clicked_idx: LocationIdx,
        mode: MapMode,
        selection: &SelectionState,
        derived_entity_anchor: Option<LocationIdx>,
    ) -> ClickOutcome {
        if let Some(anchor) = derived_entity_anchor
            && self.data.same_entity(anchor, clicked_idx, mode)
        {
            return ClickOutcome {
                locations: selection.selected_locations().clone(),
                focused_location: Some(clicked_idx),
            };
        }

        ClickOutcome {
            locations: self.resolve_in_entity_mode(clicked_idx, mode),
            focused_location: None,
        }
    }

    pub fn resolve_in_entity_mode(
        &self,
        clicked_idx: LocationIdx,
        mode: MapMode,
    ) -> FnvHashSet<LocationIdx> {
        match mode {
            MapMode::Markets => self.resolve_by_market(clicked_idx),
            _ => self.resolve_by_owner(clicked_idx),
        }
    }

    fn resolve_by_owner(&self, clicked_idx: LocationIdx) -> FnvHashSet<LocationIdx> {
        let Some(owner) = self.data.location_info(clicked_idx).owner else {
            return FnvHashSet::default();
        };
        self.data
            .iter_locations()
            .filter(|(_, info)| info.owner == Some(owner))
            .map(|(idx, _)| idx)
            .collect()
    }

    fn resolve_by_market(&self, clicked_idx: LocationIdx) -> FnvHashSet<LocationIdx> {
        let Some(market) = self.data.location_info(clicked_idx).market else {
            return FnvHashSet::default();
        };
        self.data
            .iter_locations()
            .filter(|(_, info)| info.market == Some(market))
            .map(|(idx, _)| idx)
            .collect()
    }
}

/// Opaque group identifier used in the grouping table.
///
/// Represents the entity a location belongs to under a given map mode:
/// the owner country in most modes, or the market in Markets mode.
///
/// The raw value is mode-specific and must not be compared across tables
/// built for different modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct GroupId(u32);

impl GroupId {
    /// Sentinel for locations with no resolvable group (unowned, no market).
    pub const NONE: Self = Self(u32::MAX);

    pub fn from_owner(id: RealCountryId) -> Self {
        Self(id.country_id().value())
    }

    pub fn from_market(id: MarketId) -> Self {
        Self(id.value())
    }

    /// Reconstitute from a raw u32 received across the WASM boundary.
    /// Preserves the sentinel: `u32::MAX` maps to `GroupId::NONE`.
    pub fn from_raw(raw: u32) -> Self {
        Self(raw)
    }

    pub fn is_none(self) -> bool {
        self == Self::NONE
    }

    pub fn raw(self) -> u32 {
        self.0
    }
}

/// Flat lookup table mapping GPU location index → group ID.
/// Built once per map mode switch; read on every box-select preview frame.
pub struct GroupingTable {
    groups: Vec<GroupId>,
}

impl GroupingTable {
    pub fn new(groups: Vec<GroupId>) -> Self {
        Self { groups }
    }

    pub fn empty() -> Self {
        Self { groups: Vec::new() }
    }

    pub fn get(&self, idx: GpuLocationIdx) -> GroupId {
        self.groups[idx.value() as usize]
    }

    pub fn iter(&self) -> impl Iterator<Item = (GpuLocationIdx, GroupId)> + '_ {
        self.groups
            .iter()
            .enumerate()
            .map(|(i, &g)| (GpuLocationIdx::new(i as u16), g))
    }

    pub fn len(&self) -> usize {
        self.groups.len()
    }

    pub fn is_empty(&self) -> bool {
        self.groups.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eu5save::models::{CountryId, LocationIdx, MarketId};

    struct MockLocations {
        locations: Vec<LocationInfo>,
    }

    impl LocationData for MockLocations {
        fn iter_locations(&self) -> impl Iterator<Item = (LocationIdx, LocationInfo)> + '_ {
            self.locations
                .iter()
                .enumerate()
                .map(|(i, &info)| (LocationIdx::new(i as u32), info))
        }

        fn location_info(&self, idx: LocationIdx) -> LocationInfo {
            self.locations[idx.value() as usize]
        }
    }

    fn real_country(id: u32) -> RealCountryId {
        CountryId::new(id).real_id().unwrap()
    }

    fn market(id: u32) -> MarketId {
        MarketId::new(id)
    }

    fn loc(i: u32) -> LocationIdx {
        LocationIdx::new(i)
    }

    fn info(owner: Option<RealCountryId>, market: Option<MarketId>) -> LocationInfo {
        LocationInfo { owner, market }
    }

    /// 5-location mock:
    /// idx 0: owner c1, market m1
    /// idx 1: owner c1, market m2
    /// idx 2: owner c2, market m1
    /// idx 3: unowned, no market
    /// idx 4: owner c1, no market
    fn make_mock() -> MockLocations {
        MockLocations {
            locations: vec![
                info(Some(real_country(1)), Some(market(1))),
                info(Some(real_country(1)), Some(market(2))),
                info(Some(real_country(2)), Some(market(1))),
                info(None, None),
                info(Some(real_country(1)), None),
            ],
        }
    }

    #[test]
    fn add_is_idempotent() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(0));
        assert_eq!(state.len(), 1);
    }

    #[test]
    fn clear_resets_to_empty() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.clear();
        assert!(state.is_empty());
        assert_eq!(state.len(), 0);
    }

    #[test]
    fn clear_also_clears_focus() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.set_focus(loc(0));
        state.clear();
        assert!(state.focused_location().is_none());
    }

    #[test]
    fn replace_removes_previous_and_adds_new() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        let mut new_set = FnvHashSet::default();
        new_set.insert(loc(2));
        new_set.insert(loc(3));
        state.replace(new_set);
        assert!(!state.contains(loc(0)));
        assert!(!state.contains(loc(1)));
        assert!(state.contains(loc(2)));
        assert!(state.contains(loc(3)));
        assert_eq!(state.len(), 2);
    }

    #[test]
    fn replace_clears_focus() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.set_focus(loc(0));
        state.replace(FnvHashSet::default());
        assert!(state.focused_location().is_none());
    }

    #[test]
    fn remove_all_removes_locations_and_clears_preset() {
        let mut state = SelectionState::new();
        let mut initial = FnvHashSet::default();
        initial.insert(loc(0));
        initial.insert(loc(1));
        initial.insert(loc(2));
        state.replace_with_preset(initial, SelectionPreset::Players);

        let mut to_remove = FnvHashSet::default();
        to_remove.insert(loc(1));
        to_remove.insert(loc(9));
        state.remove_all(&to_remove);

        assert!(state.contains(loc(0)));
        assert!(!state.contains(loc(1)));
        assert!(state.contains(loc(2)));
        assert_eq!(state.preset(), None);
    }

    #[test]
    fn add_clears_focus() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.set_focus(loc(0));
        state.add(loc(1));
        assert!(state.focused_location().is_none());
    }

    #[test]
    fn remove_clears_focus() {
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.set_focus(loc(0));
        state.remove(loc(0));
        assert!(state.focused_location().is_none());
    }

    #[test]
    fn contains_works_correctly() {
        let mut state = SelectionState::new();
        assert!(!state.contains(loc(5)));
        state.add(loc(5));
        assert!(state.contains(loc(5)));
        state.remove(loc(5));
        assert!(!state.contains(loc(5)));
    }

    #[test]
    fn is_empty_initially_and_false_after_add() {
        let mut state = SelectionState::new();
        assert!(state.is_empty());
        state.add(loc(0));
        assert!(!state.is_empty());
    }

    #[test]
    fn entity_summary_counts_distinct_non_dummy_owners() {
        let data = MockLocations {
            locations: vec![
                info(Some(real_country(1)), None),
                info(Some(real_country(1)), None),
                info(Some(real_country(2)), None),
                info(None, None),
            ],
        };
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.add(loc(2));
        state.add(loc(3));
        let summary = state.entity_summary(&data);
        assert_eq!(summary.entity_count, 2);
        assert_eq!(summary.location_count, 4);
    }

    #[test]
    fn entity_mode_political_returns_all_locations_with_same_owner() {
        let data = make_mock();
        let state = SelectionState::new();
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Political, &state, None);
        assert_eq!(result.locations.len(), 3); // c1 owns idx 0, 1, 4
        assert!(result.locations.contains(&loc(0)));
        assert!(result.locations.contains(&loc(1)));
        assert!(result.locations.contains(&loc(4)));
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn entity_mode_markets_returns_all_locations_with_same_market() {
        let data = make_mock();
        let state = SelectionState::new();
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Markets, &state, None);
        assert_eq!(result.locations.len(), 2); // m1 has idx 0 and 2
        assert!(result.locations.contains(&loc(0)));
        assert!(result.locations.contains(&loc(2)));
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn entity_mode_unowned_location_returns_empty_set() {
        let data = make_mock();
        let state = SelectionState::new();
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(3), MapMode::Political, &state, None);
        assert!(result.locations.is_empty());
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn entity_mode_no_market_returns_empty_set() {
        let data = make_mock();
        let state = SelectionState::new();
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(4), MapMode::Markets, &state, None);
        assert!(result.locations.is_empty());
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn entity_mode_development_resolves_by_owner_like_political() {
        let data = make_mock();
        let state = SelectionState::new();
        let political =
            SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Political, &state, None);
        let development =
            SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Development, &state, None);
        assert_eq!(political.locations, development.locations);
    }

    #[test]
    fn entity_mode_click_never_sets_focus() {
        let data = make_mock();
        let state = SelectionState::new();
        for i in 0..5 {
            let result = SelectionAdapter::new(&data).resolve_click(
                loc(i),
                MapMode::Political,
                &state,
                None,
            );
            assert!(
                result.focused_location.is_none(),
                "focused_location should be None in entity mode"
            );
        }
    }

    #[test]
    fn click_in_single_entity_filter_sets_focus_and_preserves_filter() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.add(loc(4));
        let result = SelectionAdapter::new(&data).resolve_click(
            loc(1),
            MapMode::Political,
            &state,
            Some(loc(0)),
        );
        assert_eq!(result.locations, *state.selected_locations());
        assert_eq!(result.focused_location, Some(loc(1)));
    }

    #[test]
    fn click_anchor_tile_itself_sets_focus() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.add(loc(4));
        let result = SelectionAdapter::new(&data).resolve_click(
            loc(0),
            MapMode::Political,
            &state,
            Some(loc(0)),
        );
        assert_eq!(result.locations, *state.selected_locations());
        assert_eq!(result.focused_location, Some(loc(0)));
    }

    #[test]
    fn click_on_different_entity_replaces_filter_and_clears_focus_via_outcome() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.add(loc(4));
        let result = SelectionAdapter::new(&data).resolve_click(
            loc(2),
            MapMode::Political,
            &state,
            Some(loc(0)),
        );
        assert_eq!(result.locations.len(), 1); // c2 only owns loc(2)
        assert!(result.locations.contains(&loc(2)));
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn click_in_empty_filter_resolves_to_entity() {
        let data = make_mock();
        let state = SelectionState::new();
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(2), MapMode::Political, &state, None);
        assert_eq!(result.locations.len(), 1);
        assert!(result.locations.contains(&loc(2)));
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn click_when_filter_has_multiple_entities_resolves_to_entity() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(2));
        let result =
            SelectionAdapter::new(&data).resolve_click(loc(1), MapMode::Political, &state, None);
        assert_eq!(result.locations.len(), 3);
        assert!(result.locations.contains(&loc(0)));
        assert!(result.locations.contains(&loc(1)));
        assert!(result.locations.contains(&loc(4)));
        assert!(result.focused_location.is_none());
    }

    #[test]
    fn same_entity_country_match() {
        let data = make_mock();
        assert!(data.same_entity(loc(0), loc(1), MapMode::Political));
        assert!(data.same_entity(loc(0), loc(4), MapMode::Political));
    }

    #[test]
    fn same_entity_country_mismatch() {
        let data = make_mock();
        assert!(!data.same_entity(loc(0), loc(2), MapMode::Political));
    }

    #[test]
    fn same_entity_market_match() {
        let data = make_mock();
        assert!(data.same_entity(loc(0), loc(2), MapMode::Markets));
    }

    #[test]
    fn same_entity_market_mismatch() {
        let data = make_mock();
        assert!(!data.same_entity(loc(0), loc(1), MapMode::Markets));
    }

    #[test]
    fn same_entity_unowned_is_not_same() {
        let data = make_mock();
        assert!(!data.same_entity(loc(0), loc(3), MapMode::Political));
        assert!(!data.same_entity(loc(3), loc(0), MapMode::Political));
    }

    #[test]
    fn single_entity_scope_returns_anchor_when_filter_is_one_country() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(1));
        state.add(loc(4));
        let anchor = single_entity_scope(&state, &data, MapMode::Political);
        assert!(anchor.is_some());
        assert!(state.contains(anchor.unwrap()));
    }

    #[test]
    fn single_entity_scope_returns_none_when_filter_spans_two_countries() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(2));
        assert_eq!(single_entity_scope(&state, &data, MapMode::Political), None);
    }

    #[test]
    fn single_entity_scope_returns_none_for_unowned_filter() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(3));
        assert_eq!(single_entity_scope(&state, &data, MapMode::Political), None);
    }

    #[test]
    fn single_entity_scope_respects_map_mode() {
        let data = make_mock();
        let mut state = SelectionState::new();
        state.add(loc(0));
        state.add(loc(2));
        assert_eq!(single_entity_scope(&state, &data, MapMode::Political), None);
        let anchor = single_entity_scope(&state, &data, MapMode::Markets);
        assert!(anchor.is_some());
        assert!(state.contains(anchor.unwrap()));
    }

    #[test]
    fn group_id_none_sentinel_is_none() {
        assert!(GroupId::NONE.is_none());
    }

    #[test]
    fn group_id_from_raw_max_is_none() {
        assert!(GroupId::from_raw(u32::MAX).is_none());
    }

    #[test]
    fn group_id_from_owner_is_not_none() {
        let gid = GroupId::from_owner(real_country(1));
        assert!(!gid.is_none());
    }

    #[test]
    fn group_id_from_market_is_not_none() {
        let gid = GroupId::from_market(market(2));
        assert!(!gid.is_none());
    }

    #[test]
    fn group_id_raw_round_trip() {
        let gid = GroupId::from_raw(42);
        assert_eq!(gid.raw(), 42);
        assert_eq!(GroupId::from_raw(gid.raw()), gid);
    }

    #[test]
    fn group_id_none_raw_is_u32_max() {
        assert_eq!(GroupId::NONE.raw(), u32::MAX);
    }

    #[test]
    fn grouping_table_empty_has_zero_len() {
        let t = GroupingTable::empty();
        assert!(t.is_empty());
        assert_eq!(t.len(), 0);
    }

    #[test]
    fn grouping_table_get_returns_stored_value() {
        let g0 = GroupId::NONE;
        let g1 = GroupId::from_raw(7);
        let t = GroupingTable::new(vec![g0, g1]);
        assert_eq!(t.get(GpuLocationIdx::new(0)), GroupId::NONE);
        assert_eq!(t.get(GpuLocationIdx::new(1)), GroupId::from_raw(7));
    }

    #[test]
    fn grouping_table_iter_yields_all_entries() {
        let groups = vec![GroupId::NONE, GroupId::from_raw(1), GroupId::from_raw(2)];
        let t = GroupingTable::new(groups.clone());
        let collected: Vec<(GpuLocationIdx, GroupId)> = t.iter().collect();
        assert_eq!(collected.len(), 3);
        for (i, &expected) in groups.iter().enumerate() {
            assert_eq!(collected[i].0, GpuLocationIdx::new(i as u16));
            assert_eq!(collected[i].1, expected);
        }
    }
}
