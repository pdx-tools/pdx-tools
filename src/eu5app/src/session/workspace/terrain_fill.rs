use crate::models::Terrain;
use eu5save::models::{LocationIdx, LocationIndexedVec};
use pdx_map::{GpuLocationIdx, R16, TopologyIndex};
use std::collections::VecDeque;
use std::ops::Range;

/// A connected group of fillable terrain (lakes and impassable land).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ComponentIdx(u32);

#[derive(Clone, Debug)]
struct Component {
    members: Range<usize>,
    boundary: Range<usize>,
}

/// The fillable terrain of the map, grouped into connected components.
///
/// A component and its boundary (the land that touches it) come from the
/// map topology alone, so they are computed once. Which color a component
/// adopts depends on who holds its boundary, which changes along the
/// timeline, so that is resolved separately with [`FillComponents::resolve`].
/// A resolve reads only the boundary of one component, which keeps a
/// timeline step cheap: it resolves only the components next to the
/// locations that changed hands.
///
/// Sea is neither filled nor part of a boundary. A component that touches a
/// map pixel with no save location is never fillable and is not stored.
pub(crate) struct FillComponents {
    components: Vec<Component>,
    members: Vec<LocationIdx>,
    boundary: Vec<LocationIdx>,
    /// The component of each map color id, set only for fillable members.
    /// Keyed by color id so that topology neighbors need no translation.
    component_of_color: Vec<Option<ComponentIdx>>,
    location_count: usize,
}

impl FillComponents {
    pub(crate) fn new(
        topology: &TopologyIndex,
        gpu_indices: &LocationIndexedVec<Option<GpuLocationIdx>>,
        location_terrain: &LocationIndexedVec<Terrain>,
    ) -> Self {
        let location_count = gpu_indices.len();
        let color_capacity = gpu_indices
            .iter()
            .flatten()
            .map(|g| g.value() as usize + 1)
            .max()
            .unwrap_or(0);

        let mut location_of_color = vec![None; color_capacity];
        for (raw_idx, gpu) in gpu_indices.iter().enumerate() {
            if let Some(gpu) = gpu {
                location_of_color[gpu.value() as usize] = Some(LocationIdx::new(raw_idx as u32));
            }
        }

        let mut result = Self {
            components: Vec::new(),
            members: Vec::new(),
            boundary: Vec::new(),
            component_of_color: vec![None; color_capacity],
            location_count,
        };

        let mut visited = LocationIndexedVec::filled(location_count, false);
        // The component that last added a location to its boundary, so that a
        // location that touches several members of one component is listed
        // once.
        let mut boundary_mark = LocationIndexedVec::filled(location_count, None);
        let mut queue: VecDeque<LocationIdx> = VecDeque::new();

        for raw_idx in 0..location_count {
            let start = LocationIdx::new(raw_idx as u32);
            if visited[start] || !location_terrain[start].is_surround_fillable() {
                continue;
            }

            let component = ComponentIdx(result.components.len() as u32);
            let members_start = result.members.len();
            let boundary_start = result.boundary.len();
            let mut fillable = true;

            visited[start] = true;
            queue.push_back(start);
            while let Some(loc) = queue.pop_front() {
                result.members.push(loc);
                let Some(gpu_idx) = gpu_indices[loc] else {
                    continue;
                };

                for nb in topology.neighbors_of_index(gpu_idx.value()) {
                    let Some(nb_loc) = location_of_color
                        .get(nb.value() as usize)
                        .copied()
                        .flatten()
                    else {
                        // A map pixel with no save location is an ambiguous
                        // boundary. Keep the flood fill going so that every
                        // member is visited and none restarts as its own
                        // component.
                        fillable = false;
                        continue;
                    };

                    let nb_terrain = location_terrain[nb_loc];
                    if nb_terrain.is_surround_fillable() {
                        if !visited[nb_loc] {
                            visited[nb_loc] = true;
                            queue.push_back(nb_loc);
                        }
                    } else if !nb_terrain.is_sea() && boundary_mark[nb_loc] != Some(component) {
                        boundary_mark[nb_loc] = Some(component);
                        result.boundary.push(nb_loc);
                    }
                }
            }

            if !fillable {
                result.members.truncate(members_start);
                result.boundary.truncate(boundary_start);
                continue;
            }

            for &member in &result.members[members_start..] {
                if let Some(gpu_idx) = gpu_indices[member] {
                    result.component_of_color[gpu_idx.value() as usize] = Some(component);
                }
            }
            result.components.push(Component {
                members: members_start..result.members.len(),
                boundary: boundary_start..result.boundary.len(),
            });
        }

        result
    }

    /// The component that a map color id belongs to, for fillable members.
    pub(crate) fn component_of_color(&self, color_id: R16) -> Option<ComponentIdx> {
        self.component_of_color
            .get(color_id.value() as usize)
            .copied()
            .flatten()
    }

    pub(crate) fn members(&self, component: ComponentIdx) -> &[LocationIdx] {
        &self.members[self.components[component.0 as usize].members.clone()]
    }

    fn boundary(&self, component: ComponentIdx) -> &[LocationIdx] {
        &self.boundary[self.components[component.0 as usize].boundary.clone()]
    }

    /// The boundary location whose color the component adopts, when every
    /// boundary location with a key shares the same one.
    ///
    /// `key_of` identifies what a boundary location shows, such as its owner
    /// or its religion. Keys, not colors, decide uniformity, so a country
    /// whose color equals a placeholder such as `GpuColor::UNOWNED` still
    /// counts, and two countries with one color stay apart. `None` is a
    /// location with nothing to show, which does not take part.
    pub(crate) fn resolve<K: PartialEq>(
        &self,
        component: ComponentIdx,
        key_of: impl Fn(LocationIdx) -> Option<K>,
    ) -> Option<LocationIdx> {
        let mut donor = None;
        let mut uniform = None;
        for &loc in self.boundary(component) {
            let Some(key) = key_of(loc) else {
                continue;
            };
            match &uniform {
                None => {
                    uniform = Some(key);
                    donor = Some(loc);
                }
                Some(prev) if *prev == key => {}
                Some(_) => return None,
            }
        }
        donor
    }

    /// Resolve every component into a per-location donor lookup.
    pub(crate) fn resolve_all<K: PartialEq>(
        &self,
        key_of: impl Fn(LocationIdx) -> Option<K>,
    ) -> LocationIndexedVec<Option<LocationIdx>> {
        let mut donors = LocationIndexedVec::filled(self.location_count, None);
        for raw in 0..self.components.len() {
            let component = ComponentIdx(raw as u32);
            let donor = self.resolve(component, &key_of);
            for &member in self.members(component) {
                donors[member] = donor;
            }
        }
        donors
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pdx_map::{Hemisphere, HemisphereLength, World};

    fn world_from_grid(grid: &[u16], world_width: u32, height: u32) -> World {
        let hemisphere_width = world_width / 2;
        let mut west = Vec::new();
        let mut east = Vec::new();
        for y in 0..height {
            for x in 0..hemisphere_width {
                west.push(R16::new(grid[(y * world_width + x) as usize]));
            }
            for x in hemisphere_width..world_width {
                east.push(R16::new(grid[(y * world_width + x) as usize]));
            }
        }
        World::builder(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width)),
        )
        .build()
    }

    // Helper to build the inputs the algorithm needs:
    //   - `terrains[i]` is the terrain for LocationIdx(i)
    // The R16 color-id is taken to equal i for simplicity.
    fn build(terrains: &[Terrain], grid: &[u16], width: u32, height: u32) -> FillComponents {
        let world = world_from_grid(grid, width, height);
        let topology = world.build_topology_index();
        let n = terrains.len();

        let mut gpu_indices = LocationIndexedVec::filled(n, None);
        for i in 0..n {
            gpu_indices[LocationIdx::new(i as u32)] = Some(GpuLocationIdx::new(i as u16));
        }
        let mut location_terrain = LocationIndexedVec::filled(n, Terrain::Other);
        for (i, terrain) in terrains.iter().copied().enumerate() {
            location_terrain[LocationIdx::new(i as u32)] = terrain;
        }

        FillComponents::new(&topology, &gpu_indices, &location_terrain)
    }

    // `owners[i]` is the owner key of LocationIdx(i); `None` is unowned.
    fn donors(
        components: &FillComponents,
        owners: &[Option<u8>],
    ) -> LocationIndexedVec<Option<LocationIdx>> {
        components.resolve_all(|loc| owners[loc.value() as usize])
    }

    const A: Option<u8> = Some(1);
    const B: Option<u8> = Some(2);

    const GRID_3X3: [u16; 18] = [
        0, 1, 2, 0, 1, 2, //
        3, 4, 5, 3, 4, 5, //
        6, 7, 8, 6, 7, 8,
    ];

    #[test]
    fn lake_enclosed_by_one_country() {
        // 3x3 grid, center is water (idx 4), all others are A
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let owners = [A; 9];

        let donors = donors(&build(&terrains, &GRID_3X3, 6, 3), &owners);
        let donor = donors[LocationIdx::new(4)].expect("lake should have donor");
        assert_eq!(owners[donor.value() as usize], A);
    }

    #[test]
    fn multi_cell_component_enclosed_by_one_country() {
        // idx 4 and idx 5 are adjacent lakes forming a single connected
        // component; every surrounding location belongs to country A. The BFS
        // must merge them and assign both the same donor.
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        terrains[5] = Terrain::Lake;
        let owners = [A; 9];

        let components = build(&terrains, &GRID_3X3, 6, 3);
        assert_eq!(
            components.component_of_color(R16::new(4)),
            components.component_of_color(R16::new(5)),
            "merged component shares one id"
        );
        let donors = donors(&components, &owners);
        let d4 = donors[LocationIdx::new(4)].expect("cell 4 should have donor");
        let d5 = donors[LocationIdx::new(5)].expect("cell 5 should have donor");
        assert_eq!(d4, d5, "merged component shares one donor");
        assert_eq!(owners[d4.value() as usize], A);
    }

    #[test]
    fn lake_bordered_by_two_countries_no_override() {
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let mut owners = [A; 9];
        owners[1] = B;

        let donors = donors(&build(&terrains, &GRID_3X3, 6, 3), &owners);
        assert!(donors[LocationIdx::new(4)].is_none());
    }

    #[test]
    fn lake_adjacent_to_unowned_no_override() {
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let mut owners = [A; 9];
        owners[1] = None;

        let donors = donors(&build(&terrains, &GRID_3X3, 6, 3), &owners);
        // An unowned boundary is ignored. Remaining boundaries are all A,
        // so the lake should still be surrounded.
        let donor = donors[LocationIdx::new(4)].expect("lake should have donor");
        assert_eq!(owners[donor.value() as usize], A);
    }

    #[test]
    fn controller_stripes_need_one_controller_around() {
        // A lake inside country A shows A's occupier stripes only when one
        // controller holds every shoreline location.
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let components = build(&terrains, &GRID_3X3, 6, 3);
        let component = components
            .component_of_color(R16::new(4))
            .expect("lake is a component");
        let owners = [A; 9];

        let mut controllers = [B; 9];
        let donor = components
            .resolve(component, |loc| {
                Some((
                    owners[loc.value() as usize]?,
                    controllers[loc.value() as usize],
                ))
            })
            .expect("one controller around");
        assert_eq!(controllers[donor.value() as usize], B);

        controllers[7] = A;
        assert!(
            components
                .resolve(component, |loc| Some((
                    owners[loc.value() as usize]?,
                    controllers[loc.value() as usize]
                )))
                .is_none()
        );
    }

    #[test]
    fn impassable_touching_sea_and_one_country_fills() {
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Impassable;
        terrains[5] = Terrain::Sea;
        let owners = [A; 9];

        let components = build(&terrains, &GRID_3X3, 6, 3);
        assert!(components.component_of_color(R16::new(5)).is_none());
        let donors = donors(&components, &owners);
        let donor = donors[LocationIdx::new(4)].expect("impassable should have donor");
        assert_eq!(owners[donor.value() as usize], A);
        assert!(donors[LocationIdx::new(5)].is_none());
    }

    #[test]
    fn component_with_only_sea_boundary_no_override() {
        let grid = [
            1, 1, 1, 1, //
            1, 0, 1, 0, //
            1, 1, 1, 1,
        ];
        let terrains = [Terrain::Lake, Terrain::Sea];
        let owners = [A, A];

        let donors = donors(&build(&terrains, &grid, 4, 3), &owners);
        assert!(donors[LocationIdx::new(0)].is_none());
        assert!(donors[LocationIdx::new(1)].is_none());
    }

    #[test]
    fn resolve_follows_owner_changes() {
        // The same components resolve differently once a shoreline location
        // changes hands, which is what a timeline step relies on.
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let components = build(&terrains, &GRID_3X3, 6, 3);
        let component = components
            .component_of_color(R16::new(4))
            .expect("lake is a component");

        let mut owners = [A; 9];
        assert!(
            components
                .resolve(component, |loc| owners[loc.value() as usize])
                .is_some()
        );
        owners[7] = B;
        assert!(
            components
                .resolve(component, |loc| owners[loc.value() as usize])
                .is_none()
        );
        owners = [B; 9];
        let donor = components
            .resolve(component, |loc| owners[loc.value() as usize])
            .expect("uniform again");
        assert_eq!(owners[donor.value() as usize], B);
    }
}
