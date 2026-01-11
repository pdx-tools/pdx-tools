use crate::{GpuLocationIdx, units::WorldPoint};
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
pub struct MapPickerSingle {
    west: Vec<u8>,
    east: Vec<u8>,
    world_width: u32, // Width of the world in pixels (no padding)
}

impl MapPickerSingle {
    pub fn new(west: Vec<u8>, east: Vec<u8>, world_width: u32) -> Self {
        assert_eq!(
            west.len(),
            east.len(),
            "west and east hemispheres must be the same length"
        );
        assert_eq!(
            west.len() % 2,
            0,
            "west and east hemispheres must have an even number of bytes"
        );
        assert!(world_width > 0, "world_width must be greater than 0");
        assert_eq!(
            west.len() % (world_width as usize),
            0,
            "west and east hemispheres must have a length that is a multiple of the world width"
        );

        MapPickerSingle {
            west,
            east,
            world_width,
        }
    }

    pub fn pick(&self, point: WorldPoint<f32>) -> GpuLocationIdx {
        let half_width = self.world_width / 2;
        assert_ne!(half_width, 0);

        let bytes_per_row = (half_width as usize).saturating_mul(2);

        let height = self.west.len() / bytes_per_row;
        let x = point.x.floor() as i32;
        let y = point.y.floor() as i32;
        let y = y.clamp(0, height as i32 - 1);
        let world_width = self.world_width as i32;

        let wrapped_x = ((x % world_width) + world_width) % world_width;
        let (data, col) = if wrapped_x < half_width as i32 {
            (&self.west, wrapped_x as usize)
        } else {
            (
                &self.east,
                (wrapped_x as usize).saturating_sub(half_width as usize),
            )
        };

        let offset = (y as usize).saturating_mul(bytes_per_row) + col.saturating_mul(2);
        let bytes = [data[offset], data[offset + 1]];
        GpuLocationIdx::new(u16::from_le_bytes(bytes))
    }

    /// Upgrades this picker to include pre-computed AABBs for spatial queries
    ///
    /// This consumes the picker and returns a `MapPicker` that can efficiently
    /// query all locations intersecting an axis-aligned bounding box.
    pub fn with_aabbs(self) -> MapPicker {
        MapPicker::from_picker(self)
    }
}

/// MapPicker with pre-computed AABBs for spatial queries
///
/// Contains the ability to query all locations that intersect with an
/// axis-aligned bounding box. AABBs are pre-computed during construction by
/// scanning all pixels in the texture data.
#[derive(Debug)]
pub struct MapPicker {
    picker: MapPickerSingle,
    aabbs: Vec<AABB>,
}

impl MapPicker {
    /// Constructs a MapPicker by pre-computing AABBs
    fn from_picker(picker: MapPickerSingle) -> Self {
        let half_width = picker.world_width / 2;
        let bytes_per_row = (half_width as usize) * 2;
        let height = picker.west.len() / bytes_per_row;

        let mut aabbs: Vec<AABB> = vec![AABB::empty(); u16::MAX as usize + 1];
        let mut max_location_idx = 0u16;

        for (x_offset, data) in [(0, &picker.west), (half_width, &picker.east)] {
            for row in 0..height {
                let y = row as u16;
                for col in 0..half_width as usize {
                    let x = (col as u32 + x_offset) as u16;
                    let offset = row * bytes_per_row + col * 2;
                    let loc_idx = u16::from_le_bytes([data[offset], data[offset + 1]]);

                    max_location_idx = max_location_idx.max(loc_idx);
                    aabbs[loc_idx as usize].expand_to(WorldPoint::new(x, y));
                }
            }
        }

        // Truncate to actual size
        aabbs.truncate(max_location_idx as usize + 1);

        Self { picker, aabbs }
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

    /// Pick a location at the given world coordinates
    pub fn pick(&self, point: WorldPoint<f32>) -> GpuLocationIdx {
        self.picker.pick(point)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pack_r16(values: &[u16]) -> Vec<u8> {
        let mut data = Vec::with_capacity(values.len() * 2);
        for value in values {
            data.extend_from_slice(&value.to_le_bytes());
        }
        data
    }

    #[test]
    pub fn test_map_picker_single_basic_west_east() {
        // 4x2 world split into 2x2 west/east halves.
        let west = pack_r16(&[10, 11, 12, 13]);
        let east = pack_r16(&[20, 21, 22, 23]);
        let map_picker = MapPickerSingle::new(west, east, 4);

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
    pub fn test_map_picker_single_wraps_x() {
        let west = pack_r16(&[1, 2]);
        let east = pack_r16(&[3, 4]);
        let map_picker = MapPickerSingle::new(west, east, 4);

        let left_wrap = WorldPoint::new(-1.0, 0.0);
        let right_wrap = WorldPoint::new(4.0, 0.0);

        assert_eq!(map_picker.pick(left_wrap), GpuLocationIdx::new(4));
        assert_eq!(map_picker.pick(right_wrap), GpuLocationIdx::new(1));
    }

    #[test]
    pub fn test_map_picker_single_out_of_bounds_y() {
        let west = pack_r16(&[1, 2]);
        let east = pack_r16(&[3, 4]);
        let map_picker = MapPickerSingle::new(west, east, 4);

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
    fn test_map_picker_construction() {
        // 4x2 world with dense location IDs: 0-7
        // Row 0: [0, 1, 4, 5]
        // Row 1: [2, 3, 6, 7]
        let west = pack_r16(&[0, 1, 2, 3]);
        let east = pack_r16(&[4, 5, 6, 7]);
        let picker = MapPickerSingle::new(west, east, 4);
        let map_picker = picker.with_aabbs();

        // Verify location count (8 unique location IDs: 0-7)
        assert_eq!(map_picker.location_count(), 8);

        // Check location 0 (single pixel at (0,0))
        let aabb = map_picker.get_aabb(GpuLocationIdx::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(0, 0));

        // Check location 1 (single pixel at (1,0))
        let aabb = map_picker.get_aabb(GpuLocationIdx::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(1, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 0));

        // Check location 4 (single pixel at (2,0))
        let aabb = map_picker.get_aabb(GpuLocationIdx::new(4));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(2, 0));
    }

    #[test]
    fn test_map_picker_query() {
        let west = pack_r16(&[0, 1, 2, 3]);
        let east = pack_r16(&[4, 5, 6, 7]);
        let picker = MapPickerSingle::new(west, east, 4);
        let map_picker = picker.with_aabbs();

        // Query for left half (x: 0-1, inclusive bounds)
        let query = AABB::new(WorldPoint::new(0, 0), WorldPoint::new(1, 1));
        let results: Vec<_> = map_picker.query(query).collect();

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
    fn test_map_picker_pick_forwarding() {
        let west = pack_r16(&[0, 1, 2, 3]);
        let east = pack_r16(&[4, 5, 6, 7]);
        let picker = MapPickerSingle::new(west, east, 4);
        let map_picker = picker.with_aabbs();

        // Verify pick still works
        let loc = map_picker.pick(WorldPoint::new(0.5, 0.5));
        assert_eq!(loc, GpuLocationIdx::new(0));

        let loc = map_picker.pick(WorldPoint::new(2.5, 0.5));
        assert_eq!(loc, GpuLocationIdx::new(4));
    }

    #[test]
    fn test_map_picker_multi_pixel_locations() {
        // Create a scenario where locations span multiple pixels
        // Location 0 occupies all west pixels (0,0), (1,0), (0,1), (1,1)
        // Location 1 occupies all east pixels (2,0), (3,0), (2,1), (3,1)
        let west = pack_r16(&[0, 0, 0, 0]);
        let east = pack_r16(&[1, 1, 1, 1]);
        let picker = MapPickerSingle::new(west, east, 4);
        let map_picker = picker.with_aabbs();

        // Location 0 should have AABB covering pixels (0,0) to (1,1)
        let aabb = map_picker.get_aabb(GpuLocationIdx::new(0));
        assert_eq!(aabb.min(), WorldPoint::new(0, 0));
        assert_eq!(aabb.max(), WorldPoint::new(1, 1));

        // Location 1 should have AABB covering pixels (2,0) to (3,1)
        let aabb = map_picker.get_aabb(GpuLocationIdx::new(1));
        assert_eq!(aabb.min(), WorldPoint::new(2, 0));
        assert_eq!(aabb.max(), WorldPoint::new(3, 1));
    }

    #[test]
    fn test_aabb_display() {
        let aabb = AABB::new(WorldPoint::new(10, 20), WorldPoint::new(100, 80));
        assert_eq!(format!("{}", aabb), "[(10,20)-(100,80)]");
    }
}
