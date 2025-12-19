use crate::GpuLocationIdx;

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct WorldCoordinates {
    pub x: f32,
    pub y: f32,
}

impl WorldCoordinates {
    pub fn new(x: f32, y: f32) -> Self {
        WorldCoordinates { x, y }
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

    pub fn pick(&self, world_coords: WorldCoordinates) -> GpuLocationIdx {
        let half_width = self.world_width / 2;
        assert_ne!(half_width, 0);

        let bytes_per_row = (half_width as usize).saturating_mul(2);

        let height = self.west.len() / bytes_per_row;
        let x = world_coords.x.floor() as i32;
        let y = world_coords.y.floor() as i32;
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
            let world_coords = WorldCoordinates { x, y };
            let location_idx = map_picker.pick(world_coords);
            assert_eq!(location_idx, GpuLocationIdx::new(expected));
        }
    }

    #[test]
    pub fn test_map_picker_single_wraps_x() {
        let west = pack_r16(&[1, 2]);
        let east = pack_r16(&[3, 4]);
        let map_picker = MapPickerSingle::new(west, east, 4);

        let left_wrap = WorldCoordinates { x: -1.0, y: 0.0 };
        let right_wrap = WorldCoordinates { x: 4.0, y: 0.0 };

        assert_eq!(map_picker.pick(left_wrap), GpuLocationIdx::new(4));
        assert_eq!(map_picker.pick(right_wrap), GpuLocationIdx::new(1));
    }

    #[test]
    pub fn test_map_picker_single_out_of_bounds_y() {
        let west = pack_r16(&[1, 2]);
        let east = pack_r16(&[3, 4]);
        let map_picker = MapPickerSingle::new(west, east, 4);

        let world_coords = WorldCoordinates { x: 0.0, y: 1.0 };
        assert_eq!(map_picker.pick(world_coords), GpuLocationIdx::new(1));
    }
}
