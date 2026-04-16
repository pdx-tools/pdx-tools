use crate::MapMode;
use crate::map::should_highlight_individual_locations;
use eu5save::hash::FnvHashSet;
use eu5save::models::{LocationIdx, MarketId, RealCountryId};
use pdx_map::GpuLocationIdx;

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
#[derive(Debug, Default)]
pub struct SelectionState {
    locations: FnvHashSet<LocationIdx>,
    preset: Option<SelectionPreset>,
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a location to the selection. Idempotent.
    pub fn add(&mut self, idx: LocationIdx) {
        self.locations.insert(idx);
        self.preset = None;
    }

    /// Remove a location from the selection. No-op if not present.
    pub fn remove(&mut self, idx: LocationIdx) {
        self.locations.remove(&idx);
        self.preset = None;
    }

    /// Add all provided locations to the selection. Idempotent for already-selected locations.
    pub fn add_all(&mut self, locations: &FnvHashSet<LocationIdx>) {
        self.locations.extend(locations.iter().copied());
        self.preset = None;
    }

    /// Remove all provided locations from the selection. No-op for locations not present.
    pub fn remove_all(&mut self, locations: &FnvHashSet<LocationIdx>) {
        self.locations.retain(|idx| !locations.contains(idx));
        self.preset = None;
    }

    /// Replace the entire selection with `locations`, discarding the previous set.
    /// Clears any active preset.
    pub fn replace(&mut self, locations: FnvHashSet<LocationIdx>) {
        self.locations = locations;
        self.preset = None;
    }

    /// Replace the entire selection with `locations` and record the active preset.
    pub fn replace_with_preset(
        &mut self,
        locations: FnvHashSet<LocationIdx>,
        preset: SelectionPreset,
    ) {
        self.locations = locations;
        self.preset = Some(preset);
    }

    /// Clear the entire selection and any active preset.
    pub fn clear(&mut self) {
        self.locations.clear();
        self.preset = None;
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

/// Aggregate statistics for the current selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SelectionSummary {
    /// Number of distinct non-dummy owning countries in the selection.
    pub entity_count: usize,
    /// Total number of selected locations.
    pub location_count: usize,
}

/// Resolves a map click into a set of [`LocationIdx`] values to select.
///
/// Resolution strategy depends on [`MapMode`] and zoom level:
/// - `zoom >= 0.85`: single clicked location (empty if unowned).
/// - [`MapMode::Markets`]: all locations sharing the same market.
/// - All other modes: all locations sharing the same non-dummy owner.
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
        zoom: f32,
    ) -> FnvHashSet<LocationIdx> {
        if should_highlight_individual_locations(zoom) {
            return self.resolve_single(clicked_idx);
        }

        match mode {
            MapMode::Markets => self.resolve_by_market(clicked_idx),
            _ => self.resolve_by_owner(clicked_idx),
        }
    }

    fn resolve_single(&self, idx: LocationIdx) -> FnvHashSet<LocationIdx> {
        if self.data.location_info(idx).owner.is_some() {
            let mut set = FnvHashSet::default();
            set.insert(idx);
            set
        } else {
            FnvHashSet::default()
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
        // 4 selected locations: 2 from c1, 1 from c2, 1 unowned
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
    fn high_zoom_returns_single_location() {
        let data = make_mock();
        let result = SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Political, 0.85);
        assert_eq!(result.len(), 1);
        assert!(result.contains(&loc(0)));
    }

    #[test]
    fn political_mode_returns_all_locations_with_same_owner() {
        let data = make_mock();
        // c1 owns idx 0, 1, 4
        let result = SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Political, 0.5);
        assert_eq!(result.len(), 3);
        assert!(result.contains(&loc(0)));
        assert!(result.contains(&loc(1)));
        assert!(result.contains(&loc(4)));
    }

    #[test]
    fn markets_mode_returns_all_locations_with_same_market() {
        let data = make_mock();
        // m1 has idx 0 and 2
        let result = SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Markets, 0.5);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&loc(0)));
        assert!(result.contains(&loc(2)));
    }

    #[test]
    fn unowned_location_returns_empty_set() {
        let data = make_mock();
        let result = SelectionAdapter::new(&data).resolve_click(loc(3), MapMode::Political, 0.5);
        assert!(result.is_empty());
    }

    #[test]
    fn unowned_location_high_zoom_returns_empty_set() {
        let data = make_mock();
        let result = SelectionAdapter::new(&data).resolve_click(loc(3), MapMode::Political, 0.90);
        assert!(result.is_empty());
    }

    #[test]
    fn no_market_in_markets_mode_returns_empty_set() {
        let data = make_mock();
        // idx 4 has owner but no market
        let result = SelectionAdapter::new(&data).resolve_click(loc(4), MapMode::Markets, 0.5);
        assert!(result.is_empty());
    }

    #[test]
    fn development_mode_resolves_by_owner_like_political() {
        let data = make_mock();
        let political = SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Political, 0.5);
        let development =
            SelectionAdapter::new(&data).resolve_click(loc(0), MapMode::Development, 0.5);
        assert_eq!(political, development);
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
