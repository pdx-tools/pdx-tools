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

const ARRAYS_IN_LOCATION_DATA: usize = 5; // Number of arrays in LocationData

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

    fn sub_array_mut<const N: usize>(&mut self) -> &mut [u32] {
        assert!(N < ARRAYS_IN_LOCATION_DATA);
        let chunk = self.chunk();

        // SAFETY: Bounds are guaranteed by assert and chunk calculation
        unsafe { self.data.get_unchecked_mut(N * chunk..(N + 1) * chunk) }
    }

    fn chunk(&self) -> usize {
        self.data.len() / ARRAYS_IN_LOCATION_DATA
    }

    pub fn primary_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<0>())
    }

    pub fn primary_colors_mut(&mut self) -> &mut [GpuColor] {
        bytemuck::cast_slice_mut(self.sub_array_mut::<0>())
    }

    pub fn owner_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<1>())
    }

    pub fn owner_colors_mut(&mut self) -> &mut [GpuColor] {
        bytemuck::cast_slice_mut(self.sub_array_mut::<1>())
    }

    pub fn secondary_colors(&self) -> &[GpuColor] {
        bytemuck::cast_slice(self.sub_array::<2>())
    }

    pub fn secondary_colors_mut(&mut self) -> &mut [GpuColor] {
        bytemuck::cast_slice_mut(self.sub_array_mut::<2>())
    }

    pub fn state_flags(&self) -> &[LocationFlags] {
        bytemuck::cast_slice(self.sub_array::<3>())
    }

    pub fn state_flags_mut(&mut self) -> &mut [LocationFlags] {
        bytemuck::cast_slice_mut(self.sub_array_mut::<3>())
    }

    pub fn location_ids(&self) -> &[LocationId] {
        bytemuck::cast_slice(self.sub_array::<4>())
    }

    fn location_ids_mut(&mut self) -> &mut [LocationId] {
        bytemuck::cast_slice_mut(self.sub_array_mut::<4>())
    }

    pub fn primary_color_mut(&mut self, index: GpuLocationIdx) -> &mut GpuColor {
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
        let (primary_colors, rest) = unsafe { self.data.split_at_mut_unchecked(chunk) };
        let (owner_colors, rest) = unsafe { rest.split_at_mut_unchecked(chunk) };
        let (secondary_colors, rest) = unsafe { rest.split_at_mut_unchecked(chunk) };
        let (state_flags, location_ids) = unsafe { rest.split_at_mut_unchecked(chunk) };

        LocationMutData {
            primary_colors: bytemuck::cast_slice_mut(primary_colors),
            owner_colors: bytemuck::cast_slice_mut(owner_colors),
            secondary_colors: bytemuck::cast_slice_mut(secondary_colors),
            state_flags: bytemuck::cast_slice_mut(state_flags),
            location_ids: bytemuck::cast_slice_mut(location_ids),
        }
    }
}

struct LocationMutData<'a> {
    primary_colors: &'a mut [GpuColor],
    owner_colors: &'a mut [GpuColor],
    secondary_colors: &'a mut [GpuColor],
    state_flags: &'a mut [LocationFlags],
    location_ids: &'a mut [LocationId],
}

/// An index into the location arrays for a specific location
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct GpuLocationIdx(u16);

impl GpuLocationIdx {
    pub fn new(idx: u16) -> Self {
        GpuLocationIdx(idx)
    }

    pub fn value(&self) -> u16 {
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

    /// Allocate location arrays with a specific size
    pub fn allocate(size: usize) -> Self {
        Self {
            data: LocationData::allocate(size),
        }
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

    /// Create location arrays
    pub fn from_locations(locations: &[LocationId]) -> Self {
        let mut result = Self::allocate(locations.len());
        result.set_locations(locations);
        result
    }

    pub fn set_locations(&mut self, locations: &[LocationId]) {
        assert!(
            locations.len() == self.len(),
            "Locations length must match existing array length"
        );
        self.data.location_ids_mut().copy_from_slice(locations);
    }

    pub fn set_primary_colors(&mut self, colors: &[GpuColor]) {
        assert!(
            colors.len() == self.len(),
            "Colors length must match existing array length"
        );
        self.data.primary_colors_mut().copy_from_slice(colors);
    }

    pub fn set_secondary_colors(&mut self, colors: &[GpuColor]) {
        assert!(
            colors.len() == self.len(),
            "Colors length must match existing array length"
        );
        self.data.secondary_colors_mut().copy_from_slice(colors);
    }

    pub fn set_owner_colors(&mut self, colors: &[GpuColor]) {
        assert!(
            colors.len() == self.len(),
            "Colors length must match existing array length"
        );
        self.data.owner_colors_mut().copy_from_slice(colors);
    }

    pub fn set_flags(&mut self, flags: &[LocationFlags]) {
        assert!(
            flags.len() == self.len(),
            "Flags length must match existing array length"
        );
        self.data.state_flags_mut().copy_from_slice(flags);
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
        let _ = self.data.location_ids().get(self.index.0 as usize)?;
        let state = LocationState {
            data: self.data,
            index: self.index,
        };
        self.index.0 += 1;
        Some(state)
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

    /// Set location ID
    pub fn set_location_id(&mut self, location_id: LocationId) {
        let d = self.data.as_mut();
        d.location_ids[self.index.0 as usize] = location_id;
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
        *self.data.primary_color_mut(self.index) = color;
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

    fn create_test_colors() -> Vec<LocationId> {
        vec![
            (LocationId::new(1)),
            (LocationId::new(2)),
            (LocationId::new(3)),
        ]
    }

    #[test]
    fn test_new_creates_empty_arrays() {
        let arrays = LocationArrays::new();
        assert!(arrays.is_empty());
        assert_eq!(arrays.len(), 0);
    }

    #[test]
    fn test_len_and_is_empty() {
        let empty = LocationArrays::new();
        assert!(empty.is_empty());
        assert_eq!(empty.len(), 0);

        let colors = create_test_colors();
        let filled = LocationArrays::from_locations(&colors);
        assert!(!filled.is_empty());
        assert_ne!(filled.len(), 0);
    }

    #[test]
    fn test_buffers_access() {
        let colors = create_test_colors();
        let arrays = LocationArrays::from_locations(&colors);
        let buffers = arrays.buffers();

        assert_eq!(buffers.primary_colors().len(), arrays.len());
        assert_eq!(buffers.owner_colors().len(), arrays.len());
        assert_eq!(buffers.secondary_colors().len(), arrays.len());
        assert_eq!(buffers.state_flags().len(), arrays.len());
    }

    #[test]
    fn test_iter_mut_finds_all_locations() {
        let colors = create_test_colors();
        let expected_count = colors.len();
        let mut arrays = LocationArrays::from_locations(&colors);

        let mut count = 0;
        let mut iter = arrays.iter_mut();
        while let Some(_location) = iter.next_location() {
            count += 1;
        }

        assert_eq!(count, expected_count);
    }

    #[test]
    fn test_location_state_getters() {
        let colors = vec![LocationId::new(42)];
        let mut arrays = LocationArrays::from_locations(&colors);

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
        let colors = vec![LocationId::new(1)];
        let mut arrays = LocationArrays::from_locations(&colors);

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
        let colors = vec![LocationId::new(1)];
        let mut arrays = LocationArrays::from_locations(&colors);

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
        let mut arrays = LocationArrays::from_locations(&colors);

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
            LocationId::new(100),
            LocationId::new(200),
            LocationId::new(300),
            LocationId::new(400),
            LocationId::new(500),
        ];
        let expected_count = test_colors.len();

        let mut arrays = LocationArrays::from_locations(&test_colors);

        // All locations should be accessible despite potential collisions
        let mut found_locations = 0;
        let mut iter = arrays.iter_mut();
        while iter.next_location().is_some() {
            found_locations += 1;
        }

        assert_eq!(found_locations, expected_count);
    }
}
