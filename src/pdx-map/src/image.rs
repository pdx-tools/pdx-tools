use crate::PhysicalSize;

#[derive(Debug)]
pub struct StitchedImage {
    size: PhysicalSize<u32>,
    data: Vec<u8>,
}

impl StitchedImage {
    pub fn new(size: PhysicalSize<u32>) -> Self {
        assert!(
            size.width.is_multiple_of(2),
            "stitched image width must be even"
        );
        Self {
            size,
            data: vec![0u8; (size.area() * 4) as usize],
        }
    }

    fn write_half<'a, I>(&mut self, rows: I, x_offset: u32)
    where
        I: IntoIterator<Item = &'a [u8]>,
    {
        let half_width = self.size.width / 2;
        let row_bytes = (half_width * 4) as usize;
        let full_row_bytes = (self.size.width * 4) as usize;
        let offset = (x_offset * 4) as usize;

        let dest_rows = self.data.chunks_exact_mut(full_row_bytes);
        for (src_row, dest_row) in rows.into_iter().zip(dest_rows) {
            debug_assert_eq!(src_row.len(), row_bytes);
            dest_row[offset..offset + row_bytes].copy_from_slice(src_row);
        }
    }

    pub fn write_west<'a, I>(&mut self, rows: I)
    where
        I: IntoIterator<Item = &'a [u8]>,
    {
        self.write_half(rows, 0);
    }

    pub fn write_east<'a, I>(&mut self, rows: I)
    where
        I: IntoIterator<Item = &'a [u8]>,
    {
        self.write_half(rows, self.size.width / 2);
    }

    pub fn into_inner(self) -> Vec<u8> {
        self.data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get_pixel_rgba(data: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let idx = ((y * width + x) * 4) as usize;
        [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]
    }

    #[test]
    fn test_stitched_image_multiple_rows() {
        let mut img = StitchedImage::new(PhysicalSize::new(4, 3));

        let west_data = [
            255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0,
            255, 255,
        ];

        let east_data = [
            255, 255, 0, 255, 255, 255, 0, 255, 0, 255, 255, 255, 0, 255, 255, 255, 255, 0, 255,
            255, 255, 0, 255, 255,
        ];

        img.write_west(west_data.chunks_exact(8));
        img.write_east(east_data.chunks_exact(8));

        let result = img.into_inner();

        assert_eq!(get_pixel_rgba(&result, 4, 0, 0), [255, 0, 0, 255]);
        assert_eq!(get_pixel_rgba(&result, 4, 2, 0), [255, 255, 0, 255]);

        assert_eq!(get_pixel_rgba(&result, 4, 0, 1), [0, 255, 0, 255]);
        assert_eq!(get_pixel_rgba(&result, 4, 2, 1), [0, 255, 255, 255]);

        assert_eq!(get_pixel_rgba(&result, 4, 0, 2), [0, 0, 255, 255]);
        assert_eq!(get_pixel_rgba(&result, 4, 2, 2), [255, 0, 255, 255]);
    }
}
