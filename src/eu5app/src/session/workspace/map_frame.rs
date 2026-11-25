use super::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Land for the map to frame, in groups. A group is one country's land, so the
/// map can leave out the far colonies of each country without leaving out a
/// small country.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct LandGroups {
    #[cfg_attr(feature = "tsify", tsify(type = "number[][]"))]
    pub groups: Vec<Vec<crate::ColorIdx>>,
}

impl<'bump> Eu5Workspace<'bump> {
    /// The selected land that is on the map, by its owner on the timeline
    /// date. Land with no owner is one group.
    pub fn selected_land_groups(&self) -> LandGroups {
        let mut by_owner: BTreeMap<Option<u32>, Vec<crate::ColorIdx>> = BTreeMap::new();
        for &idx in self.selection_state.selected_locations() {
            let Some(color) = self.center_at(idx) else {
                continue;
            };
            let owner = self
                .owner_at_timeline_date(idx)
                .real_id()
                .map(|id| id.country_id().value());
            by_owner.entry(owner).or_default().push(color);
        }
        let groups = by_owner
            .into_values()
            .map(|mut group| {
                group.sort_unstable();
                group
            })
            .collect();
        LandGroups { groups }
    }
}
