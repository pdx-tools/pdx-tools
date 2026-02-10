use super::World;
use crate::R16;

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct NodeEntry {
    pub offset: u32,
    pub len: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TopologyIndex {
    neighbors: Vec<R16>,
    meta: Vec<NodeEntry>,
}

impl TopologyIndex {
    /// Build a flat adjacency list from map data.
    pub fn from_world(world: &World) -> Self {
        const AVERAGE_NEIGHBORS: usize = 10;
        let mut edges = Vec::with_capacity(world.location_capacity() * AVERAGE_NEIGHBORS);
        let mut bitset = EdgeBitset::new(world.location_capacity());

        let rows = world.west().rows().zip(world.east().rows());
        let next_rows = world.west().rows().zip(world.east().rows()).skip(1);

        for ((w_row, e_row), (w_next, e_next)) in rows.zip(next_rows) {
            // Inner west
            for (pair, xv) in w_row.windows(2).zip(w_next.iter()) {
                bitset.add_edge(&mut edges, pair[0], pair[1]);
                bitset.add_edge(&mut edges, pair[0], *xv);
            }

            // Seam: West End to East Start
            bitset.add_edge(&mut edges, w_row[w_row.len() - 1], e_row[0]);

            // Inner east
            for (pair, xv) in e_row.windows(2).zip(e_next.iter()) {
                bitset.add_edge(&mut edges, pair[0], pair[1]);
                bitset.add_edge(&mut edges, pair[0], *xv);
            }

            // Wraparound: East End back to West Start
            bitset.add_edge(&mut edges, e_row[e_row.len() - 1], w_row[0]);
        }

        let last_west_row = world.west().rows().last().unwrap();
        let last_east_row = world.east().rows().last().unwrap();

        for pair in last_west_row.windows(2) {
            bitset.add_edge(&mut edges, pair[0], pair[1]);
        }

        // Seam: Last West Row to Last East Row
        bitset.add_edge(
            &mut edges,
            last_west_row[last_west_row.len() - 1],
            last_east_row[0],
        );

        for pair in last_east_row.windows(2) {
            bitset.add_edge(&mut edges, pair[0], pair[1]);
        }

        // Wraparound: Last East Row back to Start
        bitset.add_edge(
            &mut edges,
            last_east_row[last_east_row.len() - 1],
            last_west_row[0],
        );

        edges.sort_unstable();
        edges.dedup();

        let mut neighbors = Vec::with_capacity(edges.len());
        let mut meta = vec![NodeEntry { offset: 0, len: 0 }; world.location_capacity()];

        if !edges.is_empty() {
            let mut current_id = edges[0].0.value();
            let mut start_idx = 0;

            for (i, &(from, to)) in edges.iter().enumerate() {
                if from.value() != current_id {
                    // Record the previous ID's block
                    meta[current_id as usize] = NodeEntry {
                        offset: start_idx as u32,
                        len: (i - start_idx) as u16,
                    };
                    current_id = from.value();
                    start_idx = i;
                }
                neighbors.push(to);
            }

            // Don't forget the last one
            meta[current_id as usize] = NodeEntry {
                offset: start_idx as u32,
                len: (edges.len() - start_idx) as u16,
            };
        }

        Self { neighbors, meta }
    }

    pub fn len(&self) -> usize {
        self.meta.len()
    }

    pub fn is_empty(&self) -> bool {
        self.meta.is_empty()
    }

    pub fn neighbors_of(&self, loc: R16) -> &[R16] {
        self.neighbors_of_index(loc.value())
    }

    pub fn neighbors_of_index(&self, idx: u16) -> &[R16] {
        let idx = idx as usize;
        if idx >= self.meta.len() {
            return &[];
        }

        let meta = self.meta[idx];
        &self.neighbors[meta.offset as usize..(meta.offset + meta.len as u32) as usize]
    }
}

// A simple bitset to track unique edges
// 30,000 * 30,000 bits = ~112.5 MB
struct EdgeBitset {
    bits: Vec<u64>,
    stride: usize,
}

impl EdgeBitset {
    fn new(nodes: usize) -> Self {
        let stride = nodes.div_ceil(64);
        Self {
            bits: vec![0; nodes * stride],
            stride,
        }
    }

    #[inline]
    fn test_and_set(&mut self, from: u16, to: u16) -> bool {
        let from = from as usize;
        let to = to as usize;
        let idx = from * self.stride + (to / 64);
        let bit = 1 << (to % 64);
        let val = self.bits[idx];
        if (val & bit) != 0 {
            true // Already set
        } else {
            self.bits[idx] = val | bit;
            false // New edge
        }
    }

    #[inline(always)] // 10% throughput improvement by always inlining
    pub fn add_edge(&mut self, edges: &mut Vec<(R16, R16)>, a: R16, b: R16) {
        if a == b {
            return;
        }

        // Canonical order: only store the edge where u < v
        let (u, v) = if a < b { (a, b) } else { (b, a) };

        if !self.test_and_set(u.value(), v.value()) {
            edges.push((a, b));
            edges.push((b, a));
        }
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
