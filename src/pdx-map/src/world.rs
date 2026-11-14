mod hemisphere;
mod ingest;
mod spatial;
mod topology;

pub use hemisphere::Hemisphere;
pub use spatial::{Aabb, LocationBitset, SpatialIndex, SpatialIndexBuilder};
pub use topology::TopologyIndex;

use crate::{HemisphereLength, R16, R16Palette, WorldLength, WorldPoint, WorldSize};
use std::sync::OnceLock;

/// A world made up of two hemispheres: west and east.
///
/// The world is split into hemispheres to match how the renderer works. The EU5
/// map is too large to fit into a single texture (16384x8192), so it is split
/// into two 8192x8192 textures.
///
/// The CPU side reads the same layout. A consumer that only needs to know
/// which location is at a point, or where a location is, can build a
/// [`SpatialIndex`] and drop the world, as the index is much smaller.
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
        let pixel = pixel_under(point, self.size());
        let hemisphere_width = self.west.size().width;
        let (data, col) = if pixel.x < hemisphere_width {
            (self.west.as_slice(), pixel.x)
        } else {
            (self.east.as_slice(), pixel.x - hemisphere_width)
        };

        data[pixel.y as usize * hemisphere_width as usize + col as usize]
    }

    pub fn build_spatial_index(&self) -> SpatialIndex {
        SpatialIndex::from_world(self)
    }

    pub fn build_topology_index(&self) -> TopologyIndex {
        TopologyIndex::from_world(self)
    }

    /// Every row of the world.
    pub fn as_rows(&self) -> WorldRows<'_> {
        WorldRows::new(
            0,
            self.west.as_slice(),
            self.east.as_slice(),
            self.west.size().width_length(),
        )
    }
}

/// Whole rows of a world, starting at `first_row`: the same rows of the west
/// and the east hemisphere. A map that is read a band at a time hands these
/// out top to bottom.
#[derive(Debug, Clone, Copy)]
pub struct WorldRows<'a> {
    first_row: u32,
    west: &'a [R16],
    east: &'a [R16],
    width: HemisphereLength<u32>,
}

impl<'a> WorldRows<'a> {
    /// # Panics
    ///
    /// When `west` and `east` differ in length, or are not whole rows of a
    /// hemisphere `width` wide.
    pub fn new(
        first_row: u32,
        west: &'a [R16],
        east: &'a [R16],
        width: HemisphereLength<u32>,
    ) -> Self {
        assert_eq!(
            west.len(),
            east.len(),
            "west and east must hold the same rows"
        );
        assert!(
            width.value > 0 && west.len().is_multiple_of(width.value as usize),
            "rows must be whole rows {} wide",
            width.value
        );
        Self {
            first_row,
            west,
            east,
            width,
        }
    }

    /// The row of the world that these rows start at.
    pub fn first_row(&self) -> u32 {
        self.first_row
    }

    pub fn width(&self) -> HemisphereLength<u32> {
        self.width
    }

    /// The number of rows.
    pub fn height(&self) -> u32 {
        (self.west.len() / self.width.value as usize) as u32
    }

    pub fn west(&self) -> &'a [R16] {
        self.west
    }

    pub fn east(&self) -> &'a [R16] {
        self.east
    }

    /// Each row as its west and east half.
    pub fn rows(&self) -> impl Iterator<Item = (&'a [R16], &'a [R16])> + use<'a> {
        let width = self.width.value as usize;
        self.west
            .chunks_exact(width)
            .zip(self.east.chunks_exact(width))
    }

    /// These rows in bands of `rows` rows, top to bottom. The last band can
    /// be shorter.
    ///
    /// # Panics
    ///
    /// When `rows` is 0.
    pub fn bands(&self, rows: u32) -> impl Iterator<Item = WorldRows<'a>> + use<'a> {
        assert!(rows > 0, "a band needs at least one row");
        let width = self.width;
        let len = rows as usize * width.value as usize;
        let first_row = self.first_row;
        self.west
            .chunks(len)
            .zip(self.east.chunks(len))
            .zip((0..).map(move |band: u32| first_row + band * rows))
            .map(move |((west, east), first_row)| WorldRows::new(first_row, west, east, width))
    }
}

/// The pixel under `point` in a world of `size`: x wraps around the world
/// and y is clamped to it.
pub(crate) fn pixel_under(point: WorldPoint<f32>, size: WorldSize<u32>) -> WorldPoint<u32> {
    assert!(size.height > 0, "world height must be greater than 0");
    let x = (point.x.floor() as i32).rem_euclid(size.width as i32);
    let y = (point.y.floor() as i32).clamp(0, size.height as i32 - 1);
    WorldPoint::new(x as u32, y as u32)
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
}
