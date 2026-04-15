use crate::MapMode;
use crate::map::should_highlight_individual_locations;
use eu5save::hash::FnvHashSet;
use eu5save::models::{LocationIdx, MarketId, RealCountryId};

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

/// Tracks the set of currently selected [`LocationIdx`] values.
///
/// All mutations are O(1) amortised; [`SelectionState::entity_summary`] is O(n)
/// over the selected set.
#[derive(Debug, Default)]
pub struct SelectionState {
    locations: FnvHashSet<LocationIdx>,
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a location to the selection. Idempotent.
    pub fn add(&mut self, idx: LocationIdx) {
        self.locations.insert(idx);
    }

    /// Remove a location from the selection. No-op if not present.
    pub fn remove(&mut self, idx: LocationIdx) {
        self.locations.remove(&idx);
    }

    /// Replace the entire selection with `locations`, discarding the previous set.
    pub fn replace(&mut self, locations: FnvHashSet<LocationIdx>) {
        self.locations = locations;
    }

    /// Clear the entire selection.
    pub fn clear(&mut self) {
        self.locations.clear();
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
}
