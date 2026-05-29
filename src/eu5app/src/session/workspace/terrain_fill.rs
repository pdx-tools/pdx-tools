use crate::models::Terrain;
use eu5save::models::{LocationIdx, LocationIndexedVec};
use pdx_map::{GpuColor, GpuLocationIdx, TopologyIndex};
use std::collections::VecDeque;

/// Compute per-location donor overrides for connected components of fillable
/// terrain (lakes + impassable) that are surrounded by a single uniform color
/// from `color_fn`. Sea locations are neither filled nor counted as boundary
/// donor colors.
///
/// Returns a per-location vec: `Some(donor)` for members of a surrounded
/// component (donor is a representative boundary `LocationIdx` whose color
/// should be adopted), `None` otherwise.
pub(crate) fn compute_surrounded_donors(
    topology: &TopologyIndex,
    gpu_indices: &LocationIndexedVec<Option<GpuLocationIdx>>,
    location_terrain: &LocationIndexedVec<Terrain>,
    color_id_to_location: &[Option<LocationIdx>],
    color_fn: impl Fn(LocationIdx) -> GpuColor,
) -> LocationIndexedVec<Option<LocationIdx>> {
    // Invariant: gpu_indices / location_terrain are sized to location_count,
    // which is `gamestate.locations.len()`.
    let mut donors = gpu_indices.map(|_| None);
    let mut visited = gpu_indices.map(|_| false);

    // Reused across components to avoid per-component allocations. `queue` always
    // drains to empty via `pop_front`; `members` is cleared explicitly because a
    // conflicted component skips the `drain(..)` below.
    let mut members: Vec<LocationIdx> = Vec::new();
    let mut queue: VecDeque<LocationIdx> = VecDeque::new();

    for (raw_idx, _start) in gpu_indices.iter().enumerate() {
        let start = LocationIdx::new(raw_idx as u32);

                if !location_terrain[start].is_surround_fillable() {
            continue;
        }

        members.clear();
        // `uniform_color` and `chosen_donor` are set together: the donor is the
        // first boundary location whose color defines the component's color.
        let mut uniform_color: Option<GpuColor> = None;
        let mut chosen_donor: Option<LocationIdx> = None;
        let mut conflict = false;

        visited[start] = true;
        queue.push_back(start);

        while let Some(loc) = queue.pop_front() {
            members.push(loc);

            let Some(gpu_idx) = gpu_indices[loc] else {
                continue;
            };

            for nb in topology.neighbors_of_index(gpu_idx.value()) {
                let color_id = nb.value() as usize;
                let Some(nb_loc) = color_id_to_location.get(color_id).and_then(|opt| *opt) else {
                    // R16 with no corresponding LocationIdx — treat as an
                    // ambiguous boundary; do not paint.
                    conflict = true;
                    continue;
                };

                let nb_terrain = location_terrain[nb_loc];
                if nb_terrain.is_surround_fillable() {
                    // Always keep expanding the flood fill, even after a
                    // conflict, so every connected member is marked visited and
                    // never restarted as its own component below.
                    if !visited[nb_loc] {
                        visited[nb_loc] = true;
                        queue.push_back(nb_loc);
                    }
                } else if nb_terrain.is_sea() || conflict {
                    // Sea contributes no color; once conflicted, the boundary
                    // color no longer matters, so skip the `color_fn` work.
                    continue;
                } else {
                    let c = color_fn(nb_loc);
                    // Ambiguous boundary colors do not contribute to uniformity.
                    if c == GpuColor::WATER || c == GpuColor::IMPASSABLE || c == GpuColor::UNOWNED {
                        continue;
                    }
                    match uniform_color {
                        None => {
                            uniform_color = Some(c);
                            chosen_donor = Some(nb_loc);
                        }
                        Some(prev) if prev == c => {}
                        _ => conflict = true,
                    }
                }
            }
        }

        let Some(donor) = chosen_donor.filter(|_| !conflict) else {
            continue;
        };

        for m in members.drain(..) {
            donors[m] = Some(donor);
        }

    }

    donors
}

#[cfg(test)]
mod tests {
    use super::*;
    use pdx_map::{Hemisphere, HemisphereLength, R16, World};

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
    //   - `colors[i]`   is the GpuColor for non-special LocationIdx(i)
    // The R16 color-id is taken to equal i for simplicity.
    fn build(
        terrains: &[Terrain],
        colors: &[GpuColor],
        grid: &[u16],
        width: u32,
        height: u32,
    ) -> LocationIndexedVec<Option<LocationIdx>> {
        let world = world_from_grid(grid, width, height);
        let topology = world.build_topology_index();
        let n = terrains.len();

        let gpu_indices = LocationIndexedVec::from_vec(
            (0..n)
                .map(|i| Some(GpuLocationIdx::new(i as u16)))
                .collect(),
        );
        let location_terrain = LocationIndexedVec::from_vec(terrains.to_vec());
        let color_map: Vec<Option<LocationIdx>> =
            (0..n).map(|i| Some(LocationIdx::new(i as u32))).collect();

        compute_surrounded_donors(
            &topology,
            &gpu_indices,
            &location_terrain,
            &color_map,
            |loc| colors[loc.value() as usize],
        )
    }

    const A: GpuColor = GpuColor::from_rgb(10, 0, 0);
    const B: GpuColor = GpuColor::from_rgb(0, 10, 0);

    #[test]
    fn lake_enclosed_by_one_country() {
        // 3x3 grid, center is water (idx 4), all others are A
        let grid = [
            0, 1, 2, 0, 1, 2, //
            3, 4, 5, 3, 4, 5, //
            6, 7, 8, 6, 7, 8,
        ];
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let colors = [A; 9];

        let donors = build(&terrains, &colors, &grid, 6, 3);
        let donor = donors[LocationIdx::new(4)].expect("lake should have donor");
        assert_eq!(colors[donor.value() as usize], A);
    }

    #[test]
    fn multi_cell_component_enclosed_by_one_country() {
        // idx 4 and idx 5 are adjacent lakes forming a single connected
        // component; every surrounding location belongs to country A. The BFS
        // must merge them and assign both the same donor.
        let grid = [
            0, 1, 2, 0, 1, 2, //
            3, 4, 5, 3, 4, 5, //
            6, 7, 8, 6, 7, 8,
        ];
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        terrains[5] = Terrain::Lake;
        let colors = [A; 9];

        let donors = build(&terrains, &colors, &grid, 6, 3);
        let d4 = donors[LocationIdx::new(4)].expect("cell 4 should have donor");
        let d5 = donors[LocationIdx::new(5)].expect("cell 5 should have donor");
        assert_eq!(d4, d5, "merged component shares one donor");
        assert_eq!(colors[d4.value() as usize], A);
    }

    #[test]
    fn lake_bordered_by_two_countries_no_override() {
        let grid = [
            0, 1, 2, 0, 1, 2, //
            3, 4, 5, 3, 4, 5, //
            6, 7, 8, 6, 7, 8,
        ];
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let mut colors = [A; 9];
        colors[1] = B;

        let donors = build(&terrains, &colors, &grid, 6, 3);
        assert!(donors[LocationIdx::new(4)].is_none());
    }

    #[test]
    fn lake_adjacent_to_unowned_no_override() {
        let grid = [
            0, 1, 2, 0, 1, 2, //
            3, 4, 5, 3, 4, 5, //
            6, 7, 8, 6, 7, 8,
        ];
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Lake;
        let mut colors = [A; 9];
        colors[1] = GpuColor::UNOWNED;

        let donors = build(&terrains, &colors, &grid, 6, 3);
        // Boundary with UNOWNED is ignored. Remaining boundaries are all A,
        // so the lake should still be surrounded.
        let donor = donors[LocationIdx::new(4)].expect("lake should have donor");
        assert_eq!(colors[donor.value() as usize], A);
    }

    #[test]
    fn impassable_touching_sea_and_one_country_fills() {
        let grid = [
            0, 1, 2, 0, 1, 2, //
            3, 4, 5, 3, 4, 5, //
            6, 7, 8, 6, 7, 8,
        ];
        let mut terrains = [Terrain::Other; 9];
        terrains[4] = Terrain::Impassable;
        terrains[5] = Terrain::Sea;
        let colors = [A; 9];

        let donors = build(&terrains, &colors, &grid, 6, 3);
        let donor = donors[LocationIdx::new(4)].expect("impassable should have donor");
        assert_eq!(colors[donor.value() as usize], A);
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
        let colors = [A, A];

        let donors = build(&terrains, &colors, &grid, 4, 3);
        assert!(donors[LocationIdx::new(0)].is_none());
        assert!(donors[LocationIdx::new(1)].is_none());
    }
}
