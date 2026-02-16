use crate::R16;

use super::World;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TopologyIndex {
    neighbors: Vec<u16>,
    offsets: Vec<u32>,
    lengths: Vec<u16>,
}

impl TopologyIndex {
    /// Build a flat adjacency list from map data.
    ///
    /// Adjacency is computed using a 4-neighbor grid scan over the full world
    /// width (`half_width * 2`) and height. Horizontal wraparound is enabled;
    /// vertical wrap is not.
    pub fn from_world(world: &World) -> Self {
        let hemisphere_size = world.west().size();
        let world_size = world.size();
        let map_height = hemisphere_size.height;
        let map_width = world_size.width;
        let mut adjacency: Vec<Vec<u16>> = vec![Vec::new(); world.location_capacity()];

        for y in 0..map_height {
            for x in 0..map_width {
                let current = world.at_grid(x, y).value();

                let right_x = if x + 1 == map_width { 0 } else { x + 1 };
                let right = world.at_grid(right_x, y).value();
                if current != right {
                    add_neighbor(&mut adjacency, current, right);
                    add_neighbor(&mut adjacency, right, current);
                }

                if y + 1 < map_height {
                    let down = world.at_grid(x, y + 1).value();
                    if current != down {
                        add_neighbor(&mut adjacency, current, down);
                        add_neighbor(&mut adjacency, down, current);
                    }
                }
            }
        }

        for neighbors in &mut adjacency {
            neighbors.sort_unstable();
        }

        let mut offsets = Vec::with_capacity(adjacency.len());
        let mut lengths = Vec::with_capacity(adjacency.len());
        let mut flat_neighbors = Vec::new();
        let mut offset = 0u32;
        for neighbors in adjacency {
            let len = neighbors.len();
            assert!(
                len <= u16::MAX as usize,
                "neighbor list length exceeds u16::MAX"
            );
            offsets.push(offset);
            lengths.push(len as u16);
            flat_neighbors.extend(neighbors);
            offset += len as u32;
        }

        Self {
            neighbors: flat_neighbors,
            offsets,
            lengths,
        }
    }

    pub fn len(&self) -> usize {
        self.offsets.len()
    }

    pub fn is_empty(&self) -> bool {
        self.offsets.is_empty()
    }

    pub fn neighbors_of(&self, loc: R16) -> &[R16] {
        self.neighbors_of_index(loc.value())
    }

    pub fn neighbors_of_index(&self, idx: u16) -> &[R16] {
        let idx = idx as usize;
        if idx >= self.offsets.len() {
            return &[];
        }

        let offset = self.offsets[idx] as usize;
        let len = self.lengths[idx] as usize;
        bytemuck::cast_slice(&self.neighbors[offset..offset + len])
    }
}

fn add_neighbor(adjacency: &mut [Vec<u16>], from: u16, to: u16) {
    let idx = from as usize;

    // SAFETY: TopologyIndex::from_world pre-allocates adjacency using
    // World::location_capacity(), which guarantees every location index is
    // in bounds.
    let neighbors = unsafe { adjacency.get_unchecked_mut(idx) };
    if !neighbors.contains(&to) {
        neighbors.push(to);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Hemisphere, units::HemisphereLength};

    fn world_from_grid(grid: &[u16], world_width: u32, height: u32) -> World {
        assert_eq!(world_width % 2, 0, "world width must be even");
        assert_eq!(grid.len(), (world_width * height) as usize);

        let hemisphere_width = world_width / 2;
        let mut west = Vec::with_capacity((hemisphere_width * height) as usize);
        let mut east = Vec::with_capacity((hemisphere_width * height) as usize);

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

    fn to_values(neighbors: &[R16]) -> Vec<u16> {
        neighbors.iter().map(|loc| loc.value()).collect()
    }

    #[test]
    fn test_build_location_adjacencies_wraparound() {
        let grid = vec![2u16, 0u16, 0u16, 1u16];
        let world = world_from_grid(&grid, 4, 1);
        let topology = TopologyIndex::from_world(&world);

        assert_eq!(topology.len(), 3);
        assert_eq!(to_values(topology.neighbors_of_index(0)), vec![1, 2]);
        assert_eq!(to_values(topology.neighbors_of_index(1)), vec![0, 2]);
        assert_eq!(to_values(topology.neighbors_of_index(2)), vec![0, 1]);
    }

    #[test]
    fn test_build_location_adjacencies_single_color() {
        let grid = vec![5u16; 8];
        let world = world_from_grid(&grid, 4, 2);
        let topology = TopologyIndex::from_world(&world);

        assert_eq!(topology.len(), 6);
        assert!(topology.neighbors_of_index(5).is_empty());
    }
}
