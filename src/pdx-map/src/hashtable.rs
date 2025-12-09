use super::color::GpuColor;
use bytemuck::{Pod, Zeroable};

/// An application specific unique identifier for a location. It is not used for
/// rendering, but is critical to being able to associate game data with the
/// computed `GpuLocationIdx`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default, Pod, Zeroable)]
#[repr(transparent)]
pub struct LocationId(u32);

impl LocationId {
    #[inline]
    pub fn new(id: u32) -> Self {
        LocationId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

/// Bitfield flags for location state, such as whether a location is
/// highlighted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default, Pod, Zeroable)]
#[repr(transparent)]
pub struct LocationFlags(u32);

impl LocationFlags {
    pub const NO_LOCATION_BORDERS: Self = Self(1 << 0); // Bit 0: opt out of location border drawing
    pub const HIGHLIGHTED: Self = Self(1 << 1); // Bit 1: location is highlighted

    #[inline]
    pub const fn new() -> Self {
        Self(0)
    }

    #[inline]
    pub const fn empty() -> Self {
        Self(0)
    }

    #[inline]
    pub const fn from_bits(bits: u32) -> Self {
        Self(bits)
    }

    #[inline]
    pub const fn bits(self) -> u32 {
        self.0
    }

    #[inline]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    #[inline]
    pub fn set(&mut self, flags: Self) {
        self.0 |= flags.0;
    }

    #[inline]
    pub fn clear(&mut self, flags: Self) {
        self.0 &= !flags.0;
    }

    #[inline]
    pub fn toggle(&mut self, flags: Self) {
        self.0 ^= flags.0;
    }
}

const ARRAYS_IN_LOCATION_DATA: usize = 6; // Number of arrays in LocationData

/// Structure-of-arrays container that stores all location attributes in a
/// single contiguous allocation to ease serialization if the renderer and
/// application aren't in the same memory space (ie: web workers)
#[derive(Debug, Default, Clone)]
pub struct LocationData {
    data: Vec<u32>,
}

impl LocationData {
    pub fn allocate(table_size: usize) -> Self {
        Self {
            data: vec![0; table_size * ARRAYS_IN_LOCATION_DATA],
        }
    }

    fn sub_array<const N: usize>(&self) -> &[u32] {
        assert!(N < ARRAYS_IN_LOCATION_DATA);
        let chunk = self.chunk();

        // SAFETY: Bounds are guaranteed by assert and chunk calculation
        unsafe { self.data.get_unchecked(N * chunk..(N + 1) * chunk) }
    }

    fn chunk(&self) -> usize {
        self.data.len() / ARRAYS_IN_LOCATION_DATA
    }

    pub fn color_ids(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<0>())
    }

    pub fn primary_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<1>())
    }

    pub fn owner_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<2>())
    }

    pub fn secondary_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<3>())
    }

    pub fn state_flags(&self) -> &[LocationFlags] {
        bytemuck::cast_slice(self.sub_array::<4>())
    }

    pub fn location_ids(&self) -> &[LocationId] {
        bytemuck::cast_slice(self.sub_array::<5>())
    }

    pub fn primary_colors_mut(&mut self, index: GpuLocationIdx) -> &mut GpuColor {
        unsafe {
            self.as_mut()
                .primary_colors
                .get_unchecked_mut(index.0 as usize)
        }
    }

    pub fn secondary_color_mut(&mut self, index: GpuLocationIdx) -> &mut GpuColor {
        unsafe {
            self.as_mut()
                .secondary_colors
                .get_unchecked_mut(index.0 as usize)
        }
    }

    pub fn owner_color_mut(&mut self, index: GpuLocationIdx) -> &mut GpuColor {
        unsafe {
            self.as_mut()
                .owner_colors
                .get_unchecked_mut(index.0 as usize)
        }
    }

    pub fn flags_mut(&mut self, index: GpuLocationIdx) -> &mut LocationFlags {
        unsafe {
            self.as_mut()
                .state_flags
                .get_unchecked_mut(index.0 as usize)
        }
    }

    pub fn as_mut_data(&mut self) -> &mut [u32] {
        self.data.as_mut_slice()
    }

    fn as_mut(&mut self) -> LocationMutData<'_> {
        let chunk = self.chunk();
        let (color_ids, rest) = unsafe { self.data.split_at_mut_unchecked(chunk) };
        let (primary_colors, rest) = unsafe { rest.split_at_mut_unchecked(chunk) };
        let (owner_colors, rest) = unsafe { rest.split_at_mut_unchecked(chunk) };
        let (secondary_colors, rest) = unsafe { rest.split_at_mut_unchecked(chunk) };
        let (state_flags, location_ids) = unsafe { rest.split_at_mut_unchecked(chunk) };

        LocationMutData {
            color_ids: bytemuck::cast_slice_mut(color_ids),
            primary_colors: bytemuck::cast_slice_mut(primary_colors),
            owner_colors: bytemuck::cast_slice_mut(owner_colors),
            secondary_colors: bytemuck::cast_slice_mut(secondary_colors),
            state_flags: bytemuck::cast_slice_mut(state_flags),
            location_ids: bytemuck::cast_slice_mut(location_ids),
        }
    }
}

struct LocationMutData<'a> {
    color_ids: &'a mut [GpuColor],
    primary_colors: &'a mut [GpuColor],
    owner_colors: &'a mut [GpuColor],
    secondary_colors: &'a mut [GpuColor],
    state_flags: &'a mut [LocationFlags],
    location_ids: &'a mut [LocationId],
}

/// An index into the location arrays for a specific location. Allows one to
/// skip the hashing and linear probing, and instead use direct indexing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct GpuLocationIdx(u32);

impl GpuLocationIdx {
    pub fn new(idx: u32) -> Self {
        GpuLocationIdx(idx)
    }

    pub fn value(&self) -> u32 {
        self.0
    }
}

/// A GPU-optimized data structure using fixed-size and indexed arrays
#[derive(Debug, Default, Clone)]
pub struct LocationArrays {
    data: LocationData,
}

impl LocationArrays {
    /// Create new empty location arrays
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_data(data: Vec<u32>) -> Self {
        assert!(
            data.len().is_multiple_of(ARRAYS_IN_LOCATION_DATA),
            "Data length must be multiple of {ARRAYS_IN_LOCATION_DATA}",
        );
        Self {
            data: LocationData { data },
        }
    }

    /// Create location arrays from iterators (all must yield the same number of items)
    #[expect(clippy::should_implement_trait)]
    pub fn from_iter(color_data: impl ExactSizeIterator<Item = (LocationId, GpuColor)>) -> Self {
        let location_count = color_data.len();

        // 2x size for good hash performance
        let table_size = (location_count * 2).next_power_of_two().max(16);

        let mut data = LocationData::allocate(table_size);
        let d = data.as_mut();
        let color_ids = d.color_ids;
        let location_ids = d.location_ids;
        for (location_id, color) in color_data {
            let mut index = (color.fnv() as usize) % table_size;

            // Linear probing to find an empty slot
            while color_ids[index] != GpuColor::EMPTY {
                index = (index + 1) % table_size;
            }

            color_ids[index] = color;
            location_ids[index] = location_id;
        }

        Self { data }
    }

    /// Get the number of locations
    pub fn len(&self) -> usize {
        self.data.chunk()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.data.chunk() == 0
    }

    /// Get buffers for GPU upload
    pub fn buffers(&self) -> &LocationData {
        &self.data
    }

    pub fn iter_mut(&mut self) -> LocationArraysIterMut<'_> {
        LocationArraysIterMut::new(&mut self.data)
    }

    /// Copy primary colors to secondary colors (used for control/development modes to disable stripes)
    pub fn copy_primary_to_secondary(&mut self) {
        let d = self.data.as_mut();
        d.secondary_colors.copy_from_slice(d.primary_colors);
    }

    /// This returns a mutable slice of the raw u32 data for all arrays. The
    /// main use case for this is to be able to accept data sent across
    /// boundaries like web workers.
    pub fn as_mut_data(&mut self) -> &mut [u32] {
        self.data.as_mut_data()
    }

    /// This returns a slice of the raw u32 data for all arrays. The main use
    /// case for this is to be able to serialize this data across boundaries
    /// like web workers.
    pub fn as_data(&self) -> &[u32] {
        &self.data.data
    }

    /// Find location entry by color id. This is an O(1) operation on average as
    /// the target color is hashed. The returned entry can be used to directly
    /// lookup values related to the target color.
    pub fn find(&self, target_color: GpuColor) -> Option<GpuLocationIdx> {
        let table_size = self.data.chunk();
        if table_size == 0 {
            return None;
        }

        let mut index = (target_color.fnv() as usize) % table_size;
        let color_ids = self.data.color_ids();

        // Linear probing to find the matching color ID (same as GPU shader)
        for _ in 0..table_size {
            let stored_color = color_ids[index];

            if stored_color == target_color {
                // Found the location at this index
                return Some(GpuLocationIdx(index as u32));
            }

            if stored_color == GpuColor::EMPTY {
                // Hit empty slot, color not found
                return None;
            }

            index = (index + 1) % table_size;
        }

        // Color ID not found after checking entire table
        None
    }

    pub fn get_location_id(&self, idx: GpuLocationIdx) -> LocationId {
        self.buffers().location_ids()[idx.0 as usize]
    }

    pub fn get_mut(&mut self, idx: GpuLocationIdx) -> LocationState<'_> {
        LocationState {
            data: &mut self.data,
            index: idx,
        }
    }
}

pub struct LocationArraysIterMut<'a> {
    data: &'a mut LocationData,
    index: GpuLocationIdx,
}

impl<'a> LocationArraysIterMut<'a> {
    fn new(data: &'a mut LocationData) -> Self {
        Self {
            data,
            index: GpuLocationIdx::default(),
        }
    }

    pub fn next_location(&mut self) -> Option<LocationState<'_>> {
        loop {
            let id = self.data.color_ids().get(self.index.0 as usize)?;

            if *id == GpuColor::EMPTY {
                // Empty slot, skip
                self.index.0 += 1;
                continue;
            }

            let state = LocationState {
                data: self.data,
                index: self.index,
            };
            self.index.0 += 1;
            return Some(state);
        }
    }
}

pub struct LocationState<'a> {
    data: &'a mut LocationData,
    index: GpuLocationIdx,
}

impl<'a> LocationState<'a> {
    pub fn index(&self) -> GpuLocationIdx {
        self.index
    }

    pub fn location_id(&self) -> LocationId {
        unsafe {
            *self
                .data
                .location_ids()
                .get_unchecked(self.index.0 as usize)
        }
    }

    /// Get primary color
    pub fn primary_color(&self) -> GpuColor {
        unsafe {
            *self
                .data
                .primary_colors()
                .get_unchecked(self.index.0 as usize)
        }
    }

    /// Get owner color
    pub fn owner_color(&self) -> GpuColor {
        // SAFETY: Index is guaranteed to be in bounds
        unsafe {
            *self
                .data
                .owner_colors()
                .get_unchecked(self.index.0 as usize)
        }
    }

    /// Get secondary color
    pub fn secondary_color(&self) -> GpuColor {
        unsafe {
            *self
                .data
                .secondary_colors()
                .get_unchecked(self.index.0 as usize)
        }
    }

    /// Get state flags
    pub fn flags(&self) -> LocationFlags {
        unsafe { *self.data.state_flags().get_unchecked(self.index.0 as usize) }
    }

    /// Get mutable state flags
    pub fn flags_mut(&mut self) -> &mut LocationFlags {
        self.data.flags_mut(self.index)
    }

    /// Set primary color
    pub fn set_primary_color(&mut self, color: GpuColor) {
        *self.data.primary_colors_mut(self.index) = color;
    }

    pub fn set_owner_color(&mut self, color: GpuColor) {
        *self.data.owner_color_mut(self.index) = color;
    }

    pub fn set_secondary_color(&mut self, color: GpuColor) {
        *self.data.secondary_color_mut(self.index) = color;
    }

    /// Check if a specific flag is set
    pub fn has_flag(&self, flag: LocationFlags) -> bool {
        self.flags().contains(flag)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_colors() -> Vec<(LocationId, GpuColor)> {
        vec![
            (LocationId::new(1), GpuColor::from_rgb(255, 0, 0)),
            (LocationId::new(2), GpuColor::from_rgb(0, 255, 0)),
            (LocationId::new(3), GpuColor::from_rgb(0, 0, 255)),
        ]
    }

    #[test]
    fn test_new_creates_empty_arrays() {
        let arrays = LocationArrays::new();
        assert!(arrays.is_empty());
        assert_eq!(arrays.len(), 0);
    }

    #[test]
    fn test_from_data_creates_proper_hash_table() {
        let colors = create_test_colors();
        let arrays = LocationArrays::from_iter(colors.into_iter());

        // Should be power of 2 and at least 16
        assert!(arrays.len().is_power_of_two());
        assert!(arrays.len() >= 16);

        // Should be next_power_of_two(3 * 2).max(16) = max(8, 16) = 16
        assert_eq!(arrays.len(), 16);
    }

    #[test]
    fn test_from_data_hash_table_minimum_size() {
        let single_color = vec![(LocationId::new(1), GpuColor::from_rgb(255, 0, 0))];
        let arrays = LocationArrays::from_iter(single_color.into_iter());

        // Minimum size should be 16
        assert_eq!(arrays.len(), 16);
    }

    #[test]
    fn test_from_data_large_input() {
        let many_colors: Vec<_> = (1..=100)
            .map(|i| {
                (
                    LocationId::new(i),
                    GpuColor::from_rgb(i as u8, (i * 2) as u8, (i * 3) as u8),
                )
            })
            .collect();

        let arrays = LocationArrays::from_iter(many_colors.into_iter());

        // Should be next_power_of_two(100 * 2) = 256
        assert_eq!(arrays.len(), 256);
    }

    #[test]
    fn test_len_and_is_empty() {
        let empty = LocationArrays::new();
        assert!(empty.is_empty());
        assert_eq!(empty.len(), 0);

        let colors = create_test_colors();
        let filled = LocationArrays::from_iter(colors.into_iter());
        assert!(!filled.is_empty());
        assert_ne!(filled.len(), 0);
    }

    #[test]
    fn test_buffers_access() {
        let colors = create_test_colors();
        let arrays = LocationArrays::from_iter(colors.into_iter());
        let buffers = arrays.buffers();

        assert_eq!(buffers.color_ids().len(), arrays.len());
        assert_eq!(buffers.primary_colors().len(), arrays.len());
        assert_eq!(buffers.owner_colors().len(), arrays.len());
        assert_eq!(buffers.secondary_colors().len(), arrays.len());
        assert_eq!(buffers.state_flags().len(), arrays.len());
    }

    #[test]
    fn test_iter_mut_finds_all_locations() {
        let colors = create_test_colors();
        let expected_count = colors.len();
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        let mut count = 0;
        let mut iter = arrays.iter_mut();
        while let Some(_location) = iter.next_location() {
            count += 1;
        }

        assert_eq!(count, expected_count);
    }

    #[test]
    fn test_iter_mut_skips_empty_slots() {
        let colors = vec![(LocationId::new(1), GpuColor::from_rgb(255, 0, 0))];
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        let mut iter = arrays.iter_mut();
        let first = iter.next_location();
        assert!(first.is_some());

        // Should be no more valid locations
        let second = iter.next_location();
        assert!(second.is_none());
    }

    #[test]
    fn test_location_state_getters() {
        let colors = vec![(LocationId::new(42), GpuColor::from_rgb(128, 64, 32))];
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        let mut iter = arrays.iter_mut();
        let location = iter.next_location().unwrap();

        assert_eq!(location.location_id(), LocationId::new(42));
        assert_eq!(location.primary_color(), GpuColor::EMPTY);
        assert_eq!(location.owner_color(), GpuColor::EMPTY);
        assert_eq!(location.secondary_color(), GpuColor::EMPTY);
        assert_eq!(location.flags(), LocationFlags::empty());
    }

    #[test]
    fn test_location_state_color_setters() {
        let colors = vec![(LocationId::new(1), GpuColor::from_rgb(255, 0, 0))];
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        let mut iter = arrays.iter_mut();
        let mut location = iter.next_location().unwrap();

        let primary = GpuColor::from_rgb(100, 100, 100);
        let owner = GpuColor::from_rgb(200, 200, 200);
        let secondary = GpuColor::from_rgb(150, 150, 150);

        location.set_primary_color(primary);
        location.set_owner_color(owner);
        location.set_secondary_color(secondary);

        assert_eq!(location.primary_color(), primary);
        assert_eq!(location.owner_color(), owner);
        assert_eq!(location.secondary_color(), secondary);
    }

    #[test]
    fn test_location_state_flag_operations() {
        let colors = vec![(LocationId::new(1), GpuColor::from_rgb(255, 0, 0))];
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        let mut iter = arrays.iter_mut();
        let mut location = iter.next_location().unwrap();

        // Initially no flags should be set
        assert!(!location.has_flag(LocationFlags::NO_LOCATION_BORDERS));
        assert_eq!(location.flags(), LocationFlags::empty());

        // Set a flag
        location.flags_mut().set(LocationFlags::NO_LOCATION_BORDERS);
        assert!(location.has_flag(LocationFlags::NO_LOCATION_BORDERS));
        assert_eq!(location.flags(), LocationFlags::NO_LOCATION_BORDERS);

        // Set another flag
        let custom_flag = LocationFlags::from_bits(1 << 3);
        location.flags_mut().set(custom_flag);
        assert!(location.has_flag(LocationFlags::NO_LOCATION_BORDERS));
        assert!(location.has_flag(custom_flag));
        assert_eq!(
            location.flags().bits(),
            LocationFlags::NO_LOCATION_BORDERS.bits() | custom_flag.bits()
        );

        // Clear first flag
        location
            .flags_mut()
            .clear(LocationFlags::NO_LOCATION_BORDERS);
        assert!(!location.has_flag(LocationFlags::NO_LOCATION_BORDERS));
        assert!(location.has_flag(custom_flag));
        assert_eq!(location.flags(), custom_flag);

        // Clear remaining flag
        location.flags_mut().clear(custom_flag);
        assert!(!location.has_flag(custom_flag));
        assert_eq!(location.flags(), LocationFlags::empty());
    }

    #[test]
    fn test_copy_primary_to_secondary() {
        let colors = create_test_colors();
        let mut arrays = LocationArrays::from_iter(colors.into_iter());

        // Set some primary colors
        {
            let mut iter = arrays.iter_mut();
            let mut location = iter.next_location().unwrap();
            location.set_primary_color(GpuColor::from_rgb(111, 222, 123));
        }

        // Copy primary to secondary
        arrays.copy_primary_to_secondary();

        // Verify the copy worked
        let buffers = arrays.buffers();
        assert_eq!(buffers.primary_colors(), buffers.secondary_colors());
    }

    #[test]
    fn test_hash_collision_handling() {
        // Use colors with enough diversity to minimize hash collisions
        let test_colors = vec![
            (LocationId::new(100), GpuColor::from_rgb(255, 100, 50)),
            (LocationId::new(200), GpuColor::from_rgb(100, 255, 75)),
            (LocationId::new(300), GpuColor::from_rgb(75, 50, 255)),
            (LocationId::new(400), GpuColor::from_rgb(200, 150, 100)),
            (LocationId::new(500), GpuColor::from_rgb(50, 200, 150)),
        ];
        let expected_count = test_colors.len();

        let mut arrays = LocationArrays::from_iter(test_colors.into_iter());

        // All locations should be accessible despite potential collisions
        let mut found_locations = 0;
        let mut iter = arrays.iter_mut();
        while iter.next_location().is_some() {
            found_locations += 1;
        }

        assert_eq!(found_locations, expected_count);
    }

    #[test]
    fn test_empty_input_creates_minimum_size() {
        let empty_colors: Vec<(LocationId, GpuColor)> = Vec::new();
        let arrays = LocationArrays::from_iter(empty_colors.into_iter());

        // Even with empty input, should have minimum size
        assert_eq!(arrays.len(), 16);
    }

    #[test]
    fn test_find_location_by_color_id() {
        let test_colors = vec![
            (LocationId::new(100), GpuColor::from_rgb(255, 0, 0)), // Red
            (LocationId::new(200), GpuColor::from_rgb(0, 255, 0)), // Green
            (LocationId::new(300), GpuColor::from_rgb(0, 0, 255)), // Blue
        ];
        let arrays = LocationArrays::from_iter(test_colors.into_iter());

        // Test finding each color
        let red_key = GpuColor::from_rgb(255, 0, 0);
        let green_key = GpuColor::from_rgb(0, 255, 0);
        let blue_key = GpuColor::from_rgb(0, 0, 255);

        assert_eq!(
            arrays.find(red_key).map(|idx| arrays.get_location_id(idx)),
            Some(LocationId::new(100))
        );
        assert_eq!(
            arrays
                .find(green_key)
                .map(|idx| arrays.get_location_id(idx)),
            Some(LocationId::new(200))
        );
        assert_eq!(
            arrays.find(blue_key).map(|idx| arrays.get_location_id(idx)),
            Some(LocationId::new(300))
        );

        // Test color not in table
        let white_key = GpuColor::from_rgb(255, 255, 255);
        assert_eq!(arrays.find(white_key), None);
    }

    #[test]
    fn test_find_location_by_color_id_empty_table() {
        let arrays = LocationArrays::new();
        let red_key = GpuColor::from_rgb(255, 0, 0);
        assert_eq!(arrays.find(red_key), None);
    }
}
