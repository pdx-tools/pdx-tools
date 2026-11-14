use crate::PhysicalSize;

/// An image assembled from vertical strips rendered one at a time.
#[derive(Debug)]
pub struct StitchedImage {
    size: PhysicalSize<u32>,
    data: Vec<u8>,
}

impl StitchedImage {
    pub fn new(size: PhysicalSize<u32>) -> Self {
        Self {
            size,
            data: vec![0u8; (size.area() * 4) as usize],
        }
    }

    /// Write a strip of RGBA rows over the image, with its left edge at `x`.
    /// The strip is as wide as its rows, and columns past the right edge of
    /// the image are dropped.
    pub fn write_strip<'a, I>(&mut self, x: u32, rows: I)
    where
        I: IntoIterator<Item = &'a [u8]>,
    {
        let full_row_bytes = (self.size.width * 4) as usize;
        let offset = (x * 4) as usize;

        let dest_rows = self.data.chunks_exact_mut(full_row_bytes);
        for (src_row, dest_row) in rows.into_iter().zip(dest_rows) {
            let dest = &mut dest_row[offset..];
            let len = src_row.len().min(dest.len());
            dest[..len].copy_from_slice(&src_row[..len]);
        }
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
    fn strips_fill_the_image_and_drop_columns_past_its_edge() {
        let mut img = StitchedImage::new(PhysicalSize::new(5, 2));

        // Two strips three pixels wide: x 0..3 and x 3..6, which runs one
        // pixel past the right edge
        let strip = |value: u8| [[value; 12], [value + 1; 12]];
        let left = strip(10);
        let right = strip(20);
        img.write_strip(0, left.iter().map(|row| &row[..]));
        img.write_strip(3, right.iter().map(|row| &row[..]));

        let result = img.into_inner();
        assert_eq!(get_pixel_rgba(&result, 5, 2, 0), [10; 4]);
        assert_eq!(get_pixel_rgba(&result, 5, 3, 0), [20; 4]);
        assert_eq!(get_pixel_rgba(&result, 5, 4, 0), [20; 4]);
        assert_eq!(get_pixel_rgba(&result, 5, 0, 1), [11; 4]);
        assert_eq!(get_pixel_rgba(&result, 5, 4, 1), [21; 4]);
    }
}
