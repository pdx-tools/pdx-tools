use crate::{GpuLocationIdx, R16, units::WorldPoint};
use std::fmt::{self, Display};

/// Axis-aligned bounding box using u16 world coordinates
///
/// This is for a pixel grid is considered inclusive of its range.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AABB {
    min: WorldPoint<u16>,
    max: WorldPoint<u16>,
}

impl AABB {
    pub fn empty() -> Self {
        Self {
            min: WorldPoint::new(u16::MAX, u16::MAX),
            max: WorldPoint::new(0, 0),
        }
    }

    /// Creates a new AABB from min and max points
    pub fn new(min: WorldPoint<u16>, max: WorldPoint<u16>) -> Self {
        Self { min, max }
    }

    /// Expands this AABB to include the given point
    pub fn expand_to(&mut self, point: WorldPoint<u16>) {
        self.min.x = self.min.x.min(point.x);
        self.min.y = self.min.y.min(point.y);
        self.max.x = self.max.x.max(point.x);
        self.max.y = self.max.y.max(point.y);
    }

    /// Returns the minimum point of this AABB
    #[inline]
    pub fn min(&self) -> WorldPoint<u16> {
        self.min
    }

    /// Returns the maximum point of this AABB
    #[inline]
    pub fn max(&self) -> WorldPoint<u16> {
        self.max
    }

    /// Tests if this AABB intersects another AABB
    ///
    /// Uses bitwise operations instead of boolean operators to avoid branch instructions
    #[inline]
    pub fn intersects(&self, other: &Self) -> bool {
        (self.min.x <= other.max.x)
            & (self.max.x >= other.min.x)
            & (self.min.y <= other.max.y)
            & (self.max.y >= other.min.y)
    }
}

impl Display for AABB {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}-{}]", self.min, self.max)
    }
}

#[derive(Debug)]
pub struct MapData {
    west: Box<[R16]>,
    east: Box<[R16]>,
    world_width: u32, // Width of the world in elements
}

impl MapData {
    pub fn new(west: impl Into<Box<[R16]>>, east: impl Into<Box<[R16]>>, half_width: u32) -> Self {
        let west = west.into();
        let east = east.into();

        assert_eq!(
            west.len(),
            east.len(),
            "west and east hemispheres must be the same length"
        );
        assert!(half_width > 0, "half_width must be greater than 0");
        assert_eq!(
            west.len() % (half_width as usize),
            0,
            "west and east hemispheres must have a length that is a multiple of half_width"
        );

        MapData {
            west,
            east,
            world_width: half_width,
        }
    }

    /// Get the half-width (width of each hemisphere)
    pub fn half_width(&self) -> u32 {
        self.world_width
    }

    /// Get the height of the map
    pub fn height(&self) -> u32 {
        (self.west.len() / self.world_width as usize) as u32
    }

    /// Get west hemisphere data
    pub fn west_data(&self) -> &[R16] {
        &self.west
    }

    /// Get east hemisphere data
    pub fn east_data(&self) -> &[R16] {
        &self.east
    }

    /// Build pre-computed AABBs for all locations
    pub fn build_aabb_index(&self) -> AabbIndex {
        AabbIndex::from_map_data(self)
    }

    /// Returns the R16 location index at the given world coordinates
    ///
    /// # Arguments
    ///
    /// * `point` - World coordinates (x, y) where x wraps horizontally and y is clamped to valid range
    ///
    /// # Returns
    ///
    /// The R16 location index at the specified point
    pub fn at(&self, point: WorldPoint<f32>) -> R16 {
        let half_width = self.world_width;
        assert_ne!(half_width, 0);

        let height = self.west.len() / (half_width as usize);
        let x = point.x.floor() as i32;
        let y = point.y.floor() as i32;
        let y = y.clamp(0, height as i32 - 1);
        let world_width = (half_width * 2) as i32;

        let wrapped_x = ((x % world_width) + world_width) % world_width;
        let (data, col) = if wrapped_x < half_width as i32 {
            (&self.west, wrapped_x as usize)
        } else {
            (&self.east, (wrapped_x - half_width as i32) as usize)
        };

        let offset = (y as usize) * (half_width as usize) + col;
        data[offset]
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocationAdjacencyList {
    neighbors: Vec<u16>,
    offsets: Vec<u32>,
    lengths: Vec<u16>,
}

impl LocationAdjacencyList {
    pub fn new(neighbors: Vec<u16>, offsets: Vec<u32>, lengths: Vec<u16>) -> Self {
        debug_assert_eq!(offsets.len(), lengths.len());
        Self {
            neighbors,
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

    pub fn neighbors_of(&self, idx: R16) -> &[u16] {
        self.neighbors_of_index(idx.value())
    }

    pub fn neighbors_of_index(&self, idx: u16) -> &[u16] {
        let idx = idx as usize;
        if idx >= self.offsets.len() {
            return &[];
        }

        let offset = self.offsets[idx] as usize;
        let len = self.lengths[idx] as usize;
        &self.neighbors[offset..offset + len]
    }
}

/// Build a flat adjacency list from map data.
///
/// Adjacency is computed using a 4-neighbor grid scan over the full world
/// width (`half_width * 2`) and height. Horizontal wraparound is enabled;
/// vertical wrap is not.
pub fn build_location_adjacencies(map: &MapData) -> LocationAdjacencyList {
    let tile_width = map.half_width();
    let tile_height = map.height();
    let world_width = tile_width * 2;
    let mut adjacency: Vec<Vec<u16>> = Vec::new();
    let mut max_index = 0u16;

    for y in 0..tile_height {
        for x in 0..world_width {
            let current = r16_at_map(map, x, y);
            if current > max_index {
                max_index = current;
            }
            let right_x = if x + 1 == world_width { 0 } else { x + 1 };
            let right = r16_at_map(map, right_x, y);
            if right > max_index {
                max_index = right;
            }
            if current != right {
                add_neighbor(&mut adjacency, current, right);
                add_neighbor(&mut adjacency, right, current);
            }

            if y + 1 < tile_height {
                let down = r16_at_map(map, x, y + 1);
                if down > max_index {
                    max_index = down;
                }
                if current != down {
                    add_neighbor(&mut adjacency, current, down);
                    add_neighbor(&mut adjacency, down, current);
                }
            }
        }
    }

    if adjacency.len() <= max_index as usize {
        adjacency.resize_with(max_index as usize + 1, Vec::new);
    }

    for neighbors in adjacency.iter_mut() {
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
            "Neighbor list length exceeds u16::MAX"
        );
        offsets.push(offset);
        lengths.push(len as u16);
        flat_neighbors.extend(neighbors);
        offset += len as u32;
    }

    LocationAdjacencyList::new(flat_neighbors, offsets, lengths)
}

fn r16_at_map(map: &MapData, x: u32, y: u32) -> u16 {
    let half_width = map.half_width();
    let (texture, local_x) = if x < half_width {
        (map.west_data(), x)
    } else {
        (map.east_data(), x - half_width)
    };

    let idx = (y * half_width + local_x) as usize;
    texture[idx].value()
}

fn add_neighbor(adjacency: &mut Vec<Vec<u16>>, from: u16, to: u16) {
    let idx = from as usize;
    if idx >= adjacency.len() {
        adjacency.resize_with(idx + 1, Vec::new);
    }

    let neighbors = &mut adjacency[idx];
    if !neighbors.contains(&to) {
        neighbors.push(to);
    }
}

#[derive(Debug)]
pub struct MapPicker {
    data: MapData,
}

impl MapPicker {
    pub fn new(west: impl Into<Box<[R16]>>, east: impl Into<Box<[R16]>>, world_width: u32) -> Self {
        assert_eq!(world_width % 2, 0, "world_width must be even");
        let half_width = world_width / 2;

        MapPicker {
            data: MapData::new(west, east, half_width),
        }
    }

    pub fn pick(&self, point: WorldPoint<f32>) -> GpuLocationIdx {
        let r16 = self.data.at(point);
        GpuLocationIdx::new(r16.value())
    }

    /// Build pre-computed AABBs for spatial queries
    pub fn build_aabb_index(&self) -> AabbIndex {
        self.data.build_aabb_index()
    }
}

/// Index of pre-computed AABBs for spatial queries
///
/// Contains the ability to query all locations that intersect with an
/// axis-aligned bounding box. AABBs are pre-computed during construction by
/// scanning all pixels in the texture data.
#[derive(Debug)]
pub struct AabbIndex {
    aabbs: Vec<AABB>,
}

impl AabbIndex {
    fn from_map_data(map: &MapData) -> Self {
        let half_width = map.half_width() as usize;

        let mut min_x = vec![u16::MAX; u16::MAX as usize + 1];
        let mut min_y = vec![u16::MAX; u16::MAX as usize + 1];
        let mut max_x = vec![0u16; u16::MAX as usize + 1];
        let mut max_y = vec![0u16; u16::MAX as usize + 1];
        let mut max_location = R16::new(0);

        // This function is optimized via a Run-length scan per row. Instead of
        // going to memory for every pixel, we just keep track of the most
        // recent value for each row. This resulted in a 5x speedup going from
        // 20ms to create the index for the EU4 map to 4ms.
        let mut update_run = |loc: R16, start_x: u16, end_x: u16, y: u16| {
            let idx = loc.value() as usize;
            min_x[idx] = min_x[idx].min(start_x);
            max_x[idx] = max_x[idx].max(end_x);
            min_y[idx] = min_y[idx].min(y);
            max_y[idx] = max_y[idx].max(y);
            max_location = max_location.max(loc);
        };

        // Process west hemisphere - chunks_exact splits data into rows
        for (row, chunk) in map.west_data().chunks_exact(half_width).enumerate() {
            let y = row as u16;
            if chunk.is_empty() {
                continue;
            }

            let mut run_id = chunk[0];
            let mut run_start = 0u16;
            for (col, r16) in chunk.iter().enumerate().skip(1) {
                if *r16 != run_id {
                    let end_x = (col - 1) as u16;
                    update_run(run_id, run_start, end_x, y);
                    run_id = *r16;
                    run_start = col as u16;
                }
            }

            let end_x = (half_width - 1) as u16;
            update_run(run_id, run_start, end_x, y);
        }

        // Process east hemisphere - add x_offset to column
        for (row, chunk) in map.east_data().chunks_exact(half_width).enumerate() {
            let y = row as u16;
            if chunk.is_empty() {
                continue;
            }

            let x_offset = half_width as u16;
            let mut run_id = chunk[0];
            let mut run_start = x_offset;
            for (col, r16) in chunk.iter().enumerate().skip(1) {
                if *r16 != run_id {
                    let end_x = x_offset + (col as u16) - 1;
                    update_run(run_id, run_start, end_x, y);
                    run_id = *r16;
                    run_start = x_offset + col as u16;
                }
            }

            let end_x = x_offset + (half_width as u16) - 1;
            update_run(run_id, run_start, end_x, y);
        }

        let aabbs = (0..=max_location.value() as usize)
            .map(|idx| {
                AABB::new(
                    WorldPoint::new(min_x[idx], min_y[idx]),
                    WorldPoint::new(max_x[idx], max_y[idx]),
                )
            })
            .collect();

        Self { aabbs }
    }

    /// Query all locations that intersect with the given AABB
    ///
    /// Returns an iterator over `GpuLocationIdx` values for locations whose
    /// bounding boxes intersect with the query AABB.
    pub fn query(&self, query_aabb: AABB) -> impl Iterator<Item = GpuLocationIdx> + '_ {
        self.aabbs
            .iter()
            .enumerate()
            .filter_map(move |(idx, aabb)| {
                if aabb.intersects(&query_aabb) {
                    Some(GpuLocationIdx::new(idx as u16))
                } else {
                    None
                }
            })
    }

    /// Get the AABB for a specific location
    ///
    /// # Panics
    ///
    /// Panics if the location index is out of bounds
    pub fn get_aabb(&self, loc: GpuLocationIdx) -> AABB {
        self.aabbs[loc.value() as usize]
    }

    /// Returns the number of locations with AABBs
    pub fn location_count(&self) -> usize {
        self.aabbs.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn test_map_picker_basic_west_east() {
        // 4x2 world split into 2x2 west/east halves.
        let west = vec![R16::new(10), R16::new(11), R16::new(12), R16::new(13)];
        let east = vec![R16::new(20), R16::new(21), R16::new(22), R16::new(23)];
        let map_picker = MapPicker::new(west, east, 4);

        let cases = [
            (0.0, 0.0, 10),
            (1.0, 0.0, 11),
            (2.0, 0.0, 20),
            (3.0, 0.0, 21),
            (0.0, 1.0, 12),
            (3.0, 1.0, 23),
        ];

        for (x, y, expected) in cases {
            let world_coords = WorldPoint::new(x, y);
            let location_idx = map_picker.pick(world_coords);
            assert_eq!(location_idx, GpuLocationIdx::new(expected));
        }
    }

    #[test]
    pub fn test_map_picker_wraps_x() {
        let west = vec![R16::new(1), R16::new(2)];
        let east = vec![R16::new(3), R16::new(4)];
        let map_picker = MapPicker::new(west, east, 4);

        let left_wrap = WorldPoint::new(-1.0, 0.0);
        let right_wrap = WorldPoint::new(4.0, 0.0);

        assert_eq!(map_picker.pick(left_wrap), GpuLocationIdx::new(4));
        assert_eq!(map_picker.pick(right_wrap), GpuLocationIdx::new(1));
    }

    #[test]
    pub fn test_map_picker_out_of_bounds_y() {
        let west = vec![R16::new(1), R16::new(2)];
        let east = vec![R16::new(3), R16::new(4)];
        let map_picker = MapPicker::new(west, east, 4);

        let world_coords = WorldPoint::new(0.0, 1.0);
        assert_eq!(map_picker.pick(world_coords), GpuLocationIdx::new(1));
    }

    #[test]
    fn test_aabb_size() {
        use std::mem::size_of;
        // Verify AABB is exactly 8 bytes
        assert_eq!(size_of::<AABB>(), 8);
        // Without NonZeroU16 niche optimization, Option<AABB> will be larger
        assert_eq!(size_of::<WorldPoint<u16>>(), 4);
    }

    #[test]
    fn test_aabb_new() {
        let aabb = AABB::new(WorldPoint::new(10, 20), WorldPoint::new(30, 40));
        assert_eq!(aabb.min(), WorldPoint::new(10, 20));
        assert_eq!(aabb.max(), WorldPoint::new(30, 40));
    }

    #[test]
    fn test_aabb_expand() {
        let mut aabb = AABB::new(WorldPoint::new(10, 10), WorldPoint::new(11, 11));

        // Expand to include a point to the right
        aabb.expand_to(WorldPoint::new(30, 15));
        assert_eq!(aabb.min(), WorldPoint::new(10, 10));
        assert_eq!(aabb.max(), WorldPoint::new(30, 15));

        // Expand to include a point to the left
        aabb.expand_to(WorldPoint::new(5, 5));
        assert_eq!(aabb.min(), WorldPoint::new(5, 5));
        assert_eq!(aabb.max(), WorldPoint::new(30, 15));
    }

    #[test]
    fn test_aabb_intersects() {
        let aabb1 = AABB::new(WorldPoint::new(10, 10), WorldPoint::new(20, 20));
        let aabb2 = AABB::new(WorldPoint::new(15, 15), WorldPoint::new(25, 25));
        let aabb3 = AABB::new(WorldPoint::new(30, 30), WorldPoint::new(40, 40));

        // Overlapping AABBs
        assert!(aabb1.intersects(&aabb2));
        assert!(aabb2.intersects(&aabb1));

        // Non-overlapping AABBs
        assert!(!aabb1.intersects(&aabb3));
        assert!(!aabb3.intersects(&aabb1));

        // Edge touching (should intersect with <= comparison)
        let aabb4 = AABB::new(WorldPoint::new(20, 20), WorldPoint::new(30, 30));
        assert!(aabb1.intersects(&aabb4));
    }

    #[test]
    fn test_aabb_index_construction() {
        // 4x2 world with dense location IDs: 0-7
        // Row 0: [0, 1, 4, 5]
        // Row 1: [2, 3, 6, 7]
        let west = vec![R16::new(0), R16::new(1), R16::new(2), R16::new(3)];
        let east = vec![R16::new(4), R16::new(5), R16::new(6), R16::new(7)];
        let map_data = MapData::new(west, east, 2);
        let aabb_index = map_data.build_aabb_index();

        // Verify location count (8 unique location IDs: 0-7)
        assert_eq!(aabb_index.location_count(), 8);

        // Check location 0 (single pixel at (0,0))
        let aabb = aabb_index.get_aabb(GpuLocationIdx::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(0, 0));

        // Check location 1 (single pixel at (1,0))
        let aabb = aabb_index.get_aabb(GpuLocationIdx::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(1, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 0));

        // Check location 4 (single pixel at (2,0))
        let aabb = aabb_index.get_aabb(GpuLocationIdx::new(4));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(2, 0));
    }

    #[test]
    fn test_aabb_index_query() {
        let west = vec![R16::new(0), R16::new(1), R16::new(2), R16::new(3)];
        let east = vec![R16::new(4), R16::new(5), R16::new(6), R16::new(7)];
        let map_data = MapData::new(west, east, 2);
        let aabb_index = map_data.build_aabb_index();

        // Query for left half (x: 0-1, inclusive bounds)
        let query = AABB::new(WorldPoint::new(0, 0), WorldPoint::new(1, 1));
        let results: Vec<_> = aabb_index.query(query).collect();

        // Should find locations in west hemisphere (IDs 0-3)
        assert!(results.contains(&GpuLocationIdx::new(0)));
        assert!(results.contains(&GpuLocationIdx::new(1)));
        assert!(results.contains(&GpuLocationIdx::new(2)));
        assert!(results.contains(&GpuLocationIdx::new(3)));

        // Should not find locations in east hemisphere (IDs 4-7, x >= 2)
        assert!(!results.contains(&GpuLocationIdx::new(4)));
        assert!(!results.contains(&GpuLocationIdx::new(5)));
    }

    #[test]
    fn test_map_picker_pick() {
        let west = vec![R16::new(0), R16::new(1), R16::new(2), R16::new(3)];
        let east = vec![R16::new(4), R16::new(5), R16::new(6), R16::new(7)];
        let map_picker = MapPicker::new(west, east, 4);

        // Verify pick still works
        let loc = map_picker.pick(WorldPoint::new(0.5, 0.5));
        assert_eq!(loc, GpuLocationIdx::new(0));

        let loc = map_picker.pick(WorldPoint::new(2.5, 0.5));
        assert_eq!(loc, GpuLocationIdx::new(4));
    }

    #[test]
    fn test_aabb_index_multi_pixel_locations() {
        // Create a scenario where locations span multiple pixels
        // Location 0 occupies all west pixels (0,0), (1,0), (0,1), (1,1)
        // Location 1 occupies all east pixels (2,0), (3,0), (2,1), (3,1)
        let west = vec![R16::new(0), R16::new(0), R16::new(0), R16::new(0)];
        let east = vec![R16::new(1), R16::new(1), R16::new(1), R16::new(1)];
        let map_data = MapData::new(west, east, 2);
        let aabb_index = map_data.build_aabb_index();

        // Location 0 should have AABB covering pixels (0,0) to (1,1)
        let aabb = aabb_index.get_aabb(GpuLocationIdx::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 1));

        // Location 1 should have AABB covering pixels (2,0) to (3,1)
        let aabb = aabb_index.get_aabb(GpuLocationIdx::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(3, 1));
    }

    #[test]
    fn test_aabb_display() {
        let aabb = AABB::new(WorldPoint::new(10, 20), WorldPoint::new(100, 80));
        assert_eq!(format!("{}", aabb), "[(10,20)-(100,80)]");
    }

    #[test]
    fn test_map_data_at_basic() {
        // 4x2 world split into 2x2 west/east halves.
        // Row 0: [10, 11, 20, 21]
        // Row 1: [12, 13, 22, 23]
        let west = vec![R16::new(10), R16::new(11), R16::new(12), R16::new(13)];
        let east = vec![R16::new(20), R16::new(21), R16::new(22), R16::new(23)];
        let map_data = MapData::new(west, east, 2);

        // Test west hemisphere
        assert_eq!(map_data.at(WorldPoint::new(0.0, 0.0)), R16::new(10));
        assert_eq!(map_data.at(WorldPoint::new(1.0, 0.0)), R16::new(11));
        assert_eq!(map_data.at(WorldPoint::new(0.0, 1.0)), R16::new(12));
        assert_eq!(map_data.at(WorldPoint::new(1.0, 1.0)), R16::new(13));

        // Test east hemisphere
        assert_eq!(map_data.at(WorldPoint::new(2.0, 0.0)), R16::new(20));
        assert_eq!(map_data.at(WorldPoint::new(3.0, 0.0)), R16::new(21));
        assert_eq!(map_data.at(WorldPoint::new(2.0, 1.0)), R16::new(22));
        assert_eq!(map_data.at(WorldPoint::new(3.0, 1.0)), R16::new(23));
    }

    #[test]
    fn test_map_data_at_wraps_x() {
        let west = vec![R16::new(1), R16::new(2)];
        let east = vec![R16::new(3), R16::new(4)];
        let map_data = MapData::new(west, east, 2);

        // Wrap left (negative x should wrap to east)
        assert_eq!(map_data.at(WorldPoint::new(-1.0, 0.0)), R16::new(4));

        // Wrap right (x >= world_width should wrap to west)
        assert_eq!(map_data.at(WorldPoint::new(4.0, 0.0)), R16::new(1));
        assert_eq!(map_data.at(WorldPoint::new(5.0, 0.0)), R16::new(2));
    }

    #[test]
    fn test_map_data_at_clamps_y() {
        // 4x1 world (single row)
        let west = vec![R16::new(1), R16::new(2)];
        let east = vec![R16::new(3), R16::new(4)];
        let map_data = MapData::new(west, east, 2);

        // Out of bounds y (negative) should clamp to 0
        assert_eq!(map_data.at(WorldPoint::new(0.0, -5.0)), R16::new(1));

        // Out of bounds y (too large) should clamp to last row
        assert_eq!(map_data.at(WorldPoint::new(0.0, 100.0)), R16::new(1));
    }

    fn build_r16_halves_from_grid(
        grid: &[u16],
        world_width: u32,
        tile_width: u32,
        height: u32,
    ) -> (Vec<R16>, Vec<R16>) {
        assert_eq!(world_width, tile_width * 2);
        assert_eq!(grid.len(), (world_width * height) as usize);

        let mut west = Vec::with_capacity((tile_width * height) as usize);
        let mut east = Vec::with_capacity((tile_width * height) as usize);

        for y in 0..height {
            for x in 0..tile_width {
                let idx = (y * world_width + x) as usize;
                west.push(R16::new(grid[idx]));
            }
            for x in tile_width..world_width {
                let idx = (y * world_width + x) as usize;
                east.push(R16::new(grid[idx]));
            }
        }

        (west, east)
    }

    #[test]
    fn test_build_location_adjacencies_wraparound() {
        let tile_width = 2u32;
        let height = 1u32;
        let world_width = tile_width * 2;
        let grid = vec![2u16, 0u16, 0u16, 1u16];
        let (west, east) = build_r16_halves_from_grid(&grid, world_width, tile_width, height);

        let map_data = MapData::new(west, east, tile_width);
        let adjacency = build_location_adjacencies(&map_data);

        assert_eq!(adjacency.len(), 3);
        assert_eq!(adjacency.neighbors_of_index(0), &[1, 2]);
        assert_eq!(adjacency.neighbors_of_index(1), &[0, 2]);
        assert_eq!(adjacency.neighbors_of_index(2), &[0, 1]);
    }

    #[test]
    fn test_build_location_adjacencies_single_color() {
        let tile_width = 2u32;
        let height = 2u32;
        let world_width = tile_width * 2;
        let grid = vec![5u16; (world_width * height) as usize];
        let (west, east) = build_r16_halves_from_grid(&grid, world_width, tile_width, height);

        let map_data = MapData::new(west, east, tile_width);
        let adjacency = build_location_adjacencies(&map_data);

        assert_eq!(adjacency.len(), 6);
        assert!(adjacency.neighbors_of_index(5).is_empty());
    }
}
