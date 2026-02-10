mod hemisphere;
mod ingest;
mod spatial;
mod topology;

pub use hemisphere::Hemisphere;
pub use spatial::{Aabb, SpatialIndex};
pub use topology::TopologyIndex;

use crate::{R16, R16Palette, WorldLength, WorldPoint, WorldSize};
use std::sync::OnceLock;

/// A world made up of two hemispheres: west and east.
///
/// The world is split into hemispheres to match how the renderer works. The EU5
/// map is too large to fit into a single texture (16384x8192), so it is split
/// into two 8192x8192 textures.
///
/// And for the sake of not needing to transform 134 million pixels into a
/// different data layout, we can leverage the same data on the CPU side for
/// queries.
#[derive(Debug)]
pub struct World {
    west: Hemisphere<R16>,
    east: Hemisphere<R16>,
    max_location_index: OnceLock<R16>,
}

impl PartialEq for World {
    fn eq(&self, other: &Self) -> bool {
        self.west == other.west && self.east == other.east
    }
}

impl Eq for World {}

#[derive(Debug)]
pub struct WorldBuilder {
    west: Hemisphere<R16>,
    east: Hemisphere<R16>,
    supplied_max_location_index: Option<R16>,
}

impl World {
    pub fn builder(west: Hemisphere<R16>, east: Hemisphere<R16>) -> WorldBuilder {
        WorldBuilder {
            west,
            east,
            supplied_max_location_index: None,
        }
    }

    pub fn size(&self) -> WorldSize<u32> {
        let size = self.west.size();
        WorldSize::new(size.width * 2, size.height)
    }

    pub fn west(&self) -> &Hemisphere<R16> {
        &self.west
    }

    pub fn east(&self) -> &Hemisphere<R16> {
        &self.east
    }

    pub fn rows(&self) -> impl Iterator<Item = impl Iterator<Item = &R16> + '_> + '_ {
        self.west
            .rows()
            .zip(self.east.rows())
            .map(|(west_row, east_row)| west_row.iter().chain(east_row.iter()))
    }

    pub fn into_hemispheres(self) -> (Hemisphere<R16>, Hemisphere<R16>) {
        (self.west, self.east)
    }

    pub fn max_location_index(&self) -> R16 {
        *self
            .max_location_index
            .get_or_init(|| self.compute_max_location_index())
    }

    pub fn location_capacity(&self) -> usize {
        self.max_location_index().value() as usize + 1
    }

    fn compute_max_location_index(&self) -> R16 {
        self.west
            .as_slice()
            .iter()
            .chain(self.east.as_slice().iter())
            .copied()
            .max()
            .unwrap_or_else(|| R16::new(0))
    }
}

impl WorldBuilder {
    /// # Safety
    ///
    /// The caller must ensure `max` is exactly the highest location index
    /// present in either hemisphere. Supplying an incorrect value can result
    /// in undefined behavior in downstream code that relies on this invariant
    /// for indexing.
    pub unsafe fn with_max_location_index_unchecked(mut self, max: R16) -> Self {
        self.supplied_max_location_index = Some(max);
        self
    }

    pub fn build(self) -> World {
        assert_eq!(
            self.west.size(),
            self.east.size(),
            "west and east hemispheres must have the same size"
        );

        let world = World {
            west: self.west,
            east: self.east,
            max_location_index: OnceLock::new(),
        };

        if let Some(max) = self.supplied_max_location_index {
            let _ = world.max_location_index.set(max);
        }

        world
    }
}

impl World {
    pub fn from_rgb8(data: &[u8], width: WorldLength<u32>) -> (Self, R16Palette) {
        ingest::index_rgb8(data, width)
    }

    pub fn from_rgba8(data: &[u8], width: WorldLength<u32>) -> (Self, R16Palette) {
        ingest::index_rgba8(data, width)
    }

    /// Returns the R16 location index at the given world coordinates
    pub fn at(&self, point: WorldPoint<f32>) -> R16 {
        let hemisphere_size = self.west().size();
        let world_size = hemisphere_size.world();
        assert!(
            hemisphere_size.height > 0,
            "world height must be greater than 0"
        );

        let x = point.x.floor() as i32;
        let y = point.y.floor() as i32;
        let y = y.clamp(0, world_size.height as i32 - 1) as usize;
        let world_width = world_size.width as i32;
        let wrapped_x = x.rem_euclid(world_width);

        let hemisphere_width = hemisphere_size.width as i32;
        let (data, col) = if wrapped_x < hemisphere_width {
            (self.west.as_slice(), wrapped_x as usize)
        } else {
            (
                self.east.as_slice(),
                (wrapped_x - hemisphere_width) as usize,
            )
        };

        let offset = y * hemisphere_size.width as usize + col;
        data[offset]
    }

    /// Return the first pixel for the location in row-major order as an
    /// approximation for a location's center.
    ///
    /// The algorithm is a dumb scan that is written to be auto-vectorized (but
    /// fails to accomplish this goal). Since there may be 30k locations, each
    /// location is a small fraction of the total map. Based on location
    /// density, it will most likely be in the northern hemisphere so we weave
    /// the east and west hemisphere rows.
    ///
    /// In earlier architectures this function would rely on preprocessed
    /// location's center as part of the game data payload but philosophically
    /// it is nice to have the map textures be the single source of truth.
    ///
    /// We could do a linear scan over the entire image, but that's 134 million
    /// pixels to scan on Wasm for EU5, which takes upwards of 100ms. It does
    /// have the nice property of being input independent
    ///
    /// Alternatively, once we find one pixel of the location we could do a
    /// scan-fill to find all connected pixels for this location (faster than a
    /// DFS), and then exit. This will speed-up the algorithm to complete in
    /// 25ms on Wasm. I don't love the allocation and complication necessary to
    /// manage the bitset. It's still makes "center_of" a heuristic as
    /// disjointed regions won't be accounted for.
    ///
    /// In the end, this function takes around 15ms on wasm for EU5.
    pub fn center_of(&self, loc: R16) -> WorldPoint<u32> {
        fn process_row(row_data: &[R16], loc: R16) -> Option<usize> {
            const LANES: usize = 16;

            let (chunks, remainder) = row_data.as_chunks::<LANES>();

            for (chunk_idx, chunk) in chunks.iter().enumerate() {
                let has_match = chunk
                    .iter()
                    .map(|&tile| (tile == loc) as u16)
                    .fold(0, |acc, x| acc | x);

                if has_match == 0 {
                    continue;
                }

                let base_col = chunk_idx * LANES;
                if let Some(idx) = chunk.iter().position(|&tile| tile == loc) {
                    return Some(base_col + idx);
                }
            }

            let base_col = chunks.len() * LANES;
            if let Some(i) = remainder.iter().position(|&r16| r16 == loc) {
                return Some(base_col + i);
            }

            None
        }

        let hemisphere_width = self.west().size().width as usize;
        let data = self.west.rows().enumerate().zip(self.east.rows());

        for ((y, west_row), east_row) in data {
            if let Some(x) = process_row(west_row, loc) {
                return WorldPoint::new(x as u32, y as u32);
            }

            if let Some(x) = process_row(east_row, loc) {
                return WorldPoint::new((hemisphere_width + x) as u32, y as u32);
            }
        }

        WorldPoint::new(0, 0)
    }

    pub fn build_spatial_index(&self) -> SpatialIndex {
        SpatialIndex::from_world(self)
    }

    pub fn build_topology_index(&self) -> TopologyIndex {
        TopologyIndex::from_world(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::units::HemisphereLength;

    fn world_from_halves(west: Vec<u16>, east: Vec<u16>, hemisphere_width: u32) -> World {
        let west = west.into_iter().map(R16::new).collect::<Vec<_>>();
        let east = east.into_iter().map(R16::new).collect::<Vec<_>>();

        World::builder(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width)),
        )
        .build()
    }

    #[test]
    fn world_max_location_index_is_computed_lazily() {
        let world = world_from_halves(vec![10, 11], vec![1, 9], 2);
        assert_eq!(world.max_location_index(), R16::new(11));
        assert_eq!(world.location_capacity(), 12);
    }

    #[test]
    fn world_builder_can_seed_max_location_index() {
        let world = World::builder(
            Hemisphere::new(vec![R16::new(2), R16::new(4)], HemisphereLength::new(2)),
            Hemisphere::new(vec![R16::new(1), R16::new(3)], HemisphereLength::new(2)),
        );

        let world = unsafe { world.with_max_location_index_unchecked(R16::new(4)) }.build();
        assert_eq!(world.max_location_index(), R16::new(4));
    }

    #[test]
    fn world_at_wraps_and_clamps() {
        let world = world_from_halves(vec![10, 11, 12, 13], vec![20, 21, 22, 23], 2);

        assert_eq!(world.at(WorldPoint::new(0.0, 0.0)), R16::new(10));
        assert_eq!(world.at(WorldPoint::new(2.0, 0.0)), R16::new(20));
        assert_eq!(world.at(WorldPoint::new(-1.0, 0.0)), R16::new(21));
        assert_eq!(world.at(WorldPoint::new(4.0, 0.0)), R16::new(10));
        assert_eq!(world.at(WorldPoint::new(0.0, -100.0)), R16::new(10));
        assert_eq!(world.at(WorldPoint::new(0.0, 100.0)), R16::new(12));
    }

    #[test]
    fn world_center_of_returns_first_pixel() {
        let world = world_from_halves(vec![0, 1, 4, 5], vec![2, 3, 6, 7], 2);

        assert_eq!(world.center_of(R16::new(0)), WorldPoint::new(0, 0));
        assert_eq!(world.center_of(R16::new(7)), WorldPoint::new(3, 1));
    }

    #[test]
    fn test_map_picker_basic_west_east() {
        let world = world_from_halves(vec![10, 11, 12, 13], vec![20, 21, 22, 23], 2);

        let cases = [
            (0.0, 0.0, 10),
            (1.0, 0.0, 11),
            (2.0, 0.0, 20),
            (3.0, 0.0, 21),
            (0.0, 1.0, 12),
            (3.0, 1.0, 23),
        ];

        for (x, y, expected) in cases {
            assert_eq!(world.at(WorldPoint::new(x, y)), R16::new(expected));
        }
    }

    #[test]
    fn test_map_picker_wraps_x() {
        let world = world_from_halves(vec![1, 2], vec![3, 4], 2);

        assert_eq!(world.at(WorldPoint::new(-1.0, 0.0)), R16::new(4));
        assert_eq!(world.at(WorldPoint::new(4.0, 0.0)), R16::new(1));
    }

    #[test]
    fn test_map_picker_out_of_bounds_y() {
        let world = world_from_halves(vec![1, 2], vec![3, 4], 2);

        assert_eq!(world.at(WorldPoint::new(0.0, 1.0)), R16::new(1));
    }

    #[test]
    fn test_map_picker_pick() {
        let world = world_from_halves(vec![0, 1, 2, 3], vec![4, 5, 6, 7], 2);

        assert_eq!(world.at(WorldPoint::new(0.5, 0.5)), R16::new(0));
        assert_eq!(world.at(WorldPoint::new(2.5, 0.5)), R16::new(4));
    }

    #[test]
    fn test_map_data_at_basic() {
        let world = world_from_halves(vec![10, 11, 12, 13], vec![20, 21, 22, 23], 2);

        assert_eq!(world.at(WorldPoint::new(0.0, 0.0)), R16::new(10));
        assert_eq!(world.at(WorldPoint::new(1.0, 0.0)), R16::new(11));
        assert_eq!(world.at(WorldPoint::new(0.0, 1.0)), R16::new(12));
        assert_eq!(world.at(WorldPoint::new(1.0, 1.0)), R16::new(13));

        assert_eq!(world.at(WorldPoint::new(2.0, 0.0)), R16::new(20));
        assert_eq!(world.at(WorldPoint::new(3.0, 0.0)), R16::new(21));
        assert_eq!(world.at(WorldPoint::new(2.0, 1.0)), R16::new(22));
        assert_eq!(world.at(WorldPoint::new(3.0, 1.0)), R16::new(23));
    }

    #[test]
    fn test_map_data_at_wraps_x() {
        let world = world_from_halves(vec![1, 2], vec![3, 4], 2);

        assert_eq!(world.at(WorldPoint::new(-1.0, 0.0)), R16::new(4));
        assert_eq!(world.at(WorldPoint::new(4.0, 0.0)), R16::new(1));
        assert_eq!(world.at(WorldPoint::new(5.0, 0.0)), R16::new(2));
    }

    #[test]
    fn test_map_data_at_clamps_y() {
        let world = world_from_halves(vec![1, 2], vec![3, 4], 2);

        assert_eq!(world.at(WorldPoint::new(0.0, -5.0)), R16::new(1));
        assert_eq!(world.at(WorldPoint::new(0.0, 100.0)), R16::new(1));
    }

    #[test]
    fn test_center_of_single_pixel() {
        let world = world_from_halves(vec![0, 1, 4, 5], vec![2, 3, 6, 7], 2);

        assert_eq!(world.center_of(R16::new(0)), WorldPoint::new(0, 0));
        assert_eq!(world.center_of(R16::new(1)), WorldPoint::new(1, 0));
        assert_eq!(world.center_of(R16::new(2)), WorldPoint::new(2, 0));
        assert_eq!(world.center_of(R16::new(5)), WorldPoint::new(1, 1));
        assert_eq!(world.center_of(R16::new(7)), WorldPoint::new(3, 1));
    }

    #[test]
    fn test_center_of_multi_pixel_horizontal() {
        let world = world_from_halves(vec![0, 0], vec![1, 1], 2);

        assert_eq!(world.center_of(R16::new(0)), WorldPoint::new(0, 0));
        assert_eq!(world.center_of(R16::new(1)), WorldPoint::new(2, 0));
    }

    #[test]
    fn test_center_of_multi_pixel_vertical() {
        let world = world_from_halves(vec![0, 0], vec![1, 1], 1);

        assert_eq!(world.center_of(R16::new(0)), WorldPoint::new(0, 0));
        assert_eq!(world.center_of(R16::new(1)), WorldPoint::new(1, 0));
    }

    #[test]
    fn test_center_of_region() {
        let world = world_from_halves(
            vec![0, 0, 0, 5, 0, 5, 0, 0],
            vec![1, 1, 5, 1, 5, 1, 1, 1],
            2,
        );

        assert_eq!(world.center_of(R16::new(5)), WorldPoint::new(1, 1));
    }

    #[test]
    fn test_center_of_spanning_hemispheres() {
        let world = world_from_halves(vec![0, 1], vec![1, 0], 2);

        assert_eq!(world.center_of(R16::new(0)), WorldPoint::new(0, 0));
        assert_eq!(world.center_of(R16::new(1)), WorldPoint::new(1, 0));
    }

    #[test]
    fn test_center_of_large_region() {
        let world = world_from_halves(
            vec![9, 9, 9, 9, 9, 9, 9, 9],
            vec![0, 1, 2, 3, 4, 5, 6, 7],
            2,
        );

        assert_eq!(world.center_of(R16::new(9)), WorldPoint::new(0, 0));
    }
}
