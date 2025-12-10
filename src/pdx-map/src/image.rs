use std::{
    fmt::LowerHex,
    ops::{Index, IndexMut},
};

/// 24-bit RGB color
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct Rgb([u8; 3]);

impl Rgb {
    /// Create new Rgb from individual components
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self([r, g, b])
    }

    /// Get individual red component
    pub const fn r(&self) -> u8 {
        self.0[0]
    }

    /// Get individual green component
    pub const fn g(&self) -> u8 {
        self.0[1]
    }

    /// Get individual blue component
    pub const fn b(&self) -> u8 {
        self.0[2]
    }
}

impl From<[u8; 3]> for Rgb {
    fn from(value: [u8; 3]) -> Self {
        Rgb(value)
    }
}

/// 16-bit Red channel, used as an location index in Paradox map textures
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct R16(u16);

impl R16 {
    pub const fn new(value: u16) -> Self {
        R16(value)
    }

    /// Create an RGB value with R and G from R16, B=0
    pub const fn as_rgb(&self) -> Rgb {
        Rgb::new(((self.0 >> 8) & 0xFF) as u8, (self.0 & 0xFF) as u8, 0)
    }

    pub const fn value(&self) -> u16 {
        self.0
    }
}

impl From<[u8; 2]> for R16 {
    fn from(value: [u8; 2]) -> Self {
        R16(u16::from_le_bytes(value))
    }
}

impl LowerHex for Rgb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:02x}{:02x}{:02x}", self.r(), self.g(), self.b())
    }
}

pub type R16Palette = R16SecondaryMap<Rgb>;

#[derive(Debug, PartialEq, Eq, Clone)]
pub struct R16SecondaryMap<T> {
    data: Vec<T>,
}

impl<T> R16SecondaryMap<T> {
    pub fn new(data: Vec<T>) -> Self {
        Self { data }
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&T, R16)> + '_ {
        self.data
            .iter()
            .enumerate()
            .map(|(i, v)| (v, R16(i as u16)))
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut T> + '_ {
        self.data.iter_mut()
    }

    pub fn map<F, U>(&self, f: F) -> R16SecondaryMap<U>
    where
        F: Fn(&T, R16) -> U,
    {
        R16SecondaryMap {
            data: self.iter().map(|(v, r16)| f(v, r16)).collect(),
        }
    }

    pub fn as_slice(&self) -> &[T] {
        &self.data
    }
}

impl<T> Index<R16> for R16SecondaryMap<T> {
    type Output = T;

    fn index(&self, index: R16) -> &Self::Output {
        &self.data[index.0 as usize]
    }
}

impl<T> IndexMut<R16> for R16SecondaryMap<T> {
    fn index_mut(&mut self, index: R16) -> &mut Self::Output {
        &mut self.data[index.0 as usize]
    }
}

/// Takes in an Paradox color coded image in RGB format of a given width and
/// performs the following operations:
///
/// 1. Splits the image vertically into West and East halves.
/// 2. Converts each pixel's RGB value into a u16 index based on a generated
///    palette that can be interpretted as an R16 texture.
/// 3. Returns the two halves as separate byte arrays along with the color index
///    mapping.
///
/// In order to effectively split the image, the input width must be even.
///
/// Will panic if there are more than 65536 unique color coded locations /
/// provinces in the image.
pub fn split_rgb8_to_indexed_r16(img: &[u8], width: u32) -> (Vec<u8>, Vec<u8>, R16Palette) {
    split_rgb_to_indexed_r16::<3>(img, width)
}

/// See [`split_rgb_to_indexed_r16`] for details.
///
/// Alpha channel is ignored.
pub fn split_rgba8_to_indexed_r16(img: &[u8], width: u32) -> (Vec<u8>, Vec<u8>, R16Palette) {
    split_rgb_to_indexed_r16::<4>(img, width)
}

fn split_rgb_to_indexed_r16<const SRC_DEPTH: usize>(
    img: &[u8],
    width: u32,
) -> (Vec<u8>, Vec<u8>, R16Palette) {
    const DST_DEPTH: usize = 2; // R16

    assert_eq!(width % 2, 0, "Image width must be even to split West/East");

    let width = width as usize;
    let height = img.len() / (width * SRC_DEPTH);

    assert_eq!(
        height * width * SRC_DEPTH,
        img.len(),
        "Image data length must be a multiple of width * depth"
    );

    let half_width = width / 2;

    // Pre-allocate destination buffers
    let mut west_data = vec![0u8; half_width * height * DST_DEPTH];
    let mut east_data = vec![0u8; half_width * height * DST_DEPTH];

    // Use direct indexing LUT for fast color to index mapping
    // 2^24 = 16,777,216. At 2 bytes per entry, this is ~32MB of RAM.
    // We use u16::MAX (65535) as a sentinel for "color not found yet".
    let mut color_lut = vec![u16::MAX; 1 << 24];

    // Store unique colors in a Vec for fast appending. For EU5 there'll be
    // around 30,000 colors.
    let mut palette: Vec<Rgb> = Vec::with_capacity(30_000);

    // Cache for last looked-up color
    let mut last_color_cache: Option<(Rgb, u16)> = None;

    for y in 0..height {
        let row_start = y * width * SRC_DEPTH;
        let row_end = row_start + width * SRC_DEPTH;
        let row = &img[row_start..row_end];

        // Split row into West and East source pixels
        let (west_row, east_row) = row.split_at(half_width * SRC_DEPTH);

        // Calculate destination slices for this specific row using chunks
        // This avoids the manual index math inside the pixel loop
        let row_offset = y * half_width * DST_DEPTH;
        let row_len = half_width * DST_DEPTH;

        let west_dst = &mut west_data[row_offset..row_offset + row_len];
        let east_dst = &mut east_data[row_offset..row_offset + row_len];

        // Process both sides
        for (src_row, dst_row) in [(west_row, west_dst), (east_row, east_dst)] {
            let (rgb, _) = src_row.as_chunks::<SRC_DEPTH>();
            let (r16_dst, _) = dst_row.as_chunks_mut::<DST_DEPTH>();
            for (pixel, dst_chunk) in rgb.iter().zip(r16_dst.iter_mut()) {
                // Pack RGB bytes without endianness dependencies
                let key = (pixel[0] as u32) << 16 | (pixel[1] as u32) << 8 | pixel[2] as u32;
                let key_rgb = Rgb([pixel[0], pixel[1], pixel[2]]);

                // Fast-path: Spatial locality check
                if let Some((last_key, last_idx)) = last_color_cache
                    && last_key == key_rgb
                {
                    dst_chunk.copy_from_slice(&last_idx.to_le_bytes());
                    continue;
                }

                // LUT Lookup
                let mut idx = color_lut[key as usize];

                // Sentinel check: if u16::MAX, we haven't seen this color yet
                if idx == u16::MAX {
                    let len = palette.len();
                    assert!(
                        len < u16::MAX as usize,
                        "Palette exceeded 65534 colors (u16::MAX-1 reserved for sentinel)"
                    );

                    idx = len as u16;
                    palette.push(key_rgb);
                    color_lut[key as usize] = idx;
                }

                // Update cache and write to destination
                last_color_cache = Some((key_rgb, idx));
                dst_chunk.copy_from_slice(&idx.to_le_bytes());
            }
        }
    }

    (west_data, east_data, R16Palette::new(palette))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create RGB8 image with repeating color pattern
    fn create_rgb8_image(width: u32, height: u32, colors: &[(u8, u8, u8)]) -> Vec<u8> {
        let mut img = Vec::with_capacity((width * height * 3) as usize);
        for color_idx in 0..(width * height) {
            let (r, g, b) = colors[color_idx as usize % colors.len()];
            img.extend_from_slice(&[r, g, b]);
        }
        img
    }

    /// Create RGB8 image filled with single color
    fn create_solid_rgb8_image(width: u32, height: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
        create_rgb8_image(width, height, &[(r, g, b)])
    }

    /// Parse R16 byte array into Vec<u16> indices (little-endian)
    fn parse_r16_indices(r16_data: &[u8]) -> Vec<u16> {
        r16_data
            .chunks(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect()
    }

    /// Extract RGB color from RGB8 image at (x, y)
    fn get_pixel_color(img: &[u8], width: u32, x: u32, y: u32) -> (u8, u8, u8) {
        let idx = ((y * width + x) * 3) as usize;
        (img[idx], img[idx + 1], img[idx + 2])
    }

    #[test]
    fn test_vertical_split_boundary() {
        // Create solid-color halves: left=red, right=blue
        let width = 4u32;
        let height = 2u32;
        let mut img = Vec::new();
        for _ in 0..height {
            // West (2 pixels): red
            img.extend_from_slice(&[255, 0, 0, 255, 0, 0]);
            // East (2 pixels): blue
            img.extend_from_slice(&[0, 0, 255, 0, 0, 255]);
        }

        let (west_data, east_data, palette) = split_rgb_to_indexed_r16::<3>(&img, width);

        // Verify output sizes
        assert_eq!(west_data.len(), 2 * 2 * 2); // 2 pixels wide, 2 high, 2 bytes per
        assert_eq!(east_data.len(), 2 * 2 * 2);

        // Verify palette size
        assert_eq!(palette.iter().count(), 2);

        // Parse indices and verify correctness
        let west_indices = parse_r16_indices(&west_data);
        let east_indices = parse_r16_indices(&east_data);

        // All west pixels should have same index (red)
        assert!(west_indices.iter().all(|&idx| west_indices[0] == idx));
        // All east pixels should have same index (blue)
        assert!(east_indices.iter().all(|&idx| east_indices[0] == idx));
        // Indices should be different
        assert_ne!(west_indices[0], east_indices[0]);
    }

    #[test]
    fn test_rgba_split() {
        let width = 2u32;
        let data = [
            255, 0, 0, 255, // Red pixel (West)
            0, 0, 255, 255, // Blue pixel (East)
        ];

        let (west_data, east_data, palette) = split_rgb_to_indexed_r16::<4>(&data, width);

        assert_eq!(west_data, vec![0u8, 0u8]); // Red is index 0
        assert_eq!(east_data, vec![1u8, 0u8]); // Blue is index 1

        let expected_palette_colors = vec![Rgb::new(255, 0, 0), Rgb::new(0, 0, 255)];
        let expected_palette = R16Palette::new(expected_palette_colors);
        assert_eq!(palette, expected_palette);
    }

    #[test]
    fn test_single_pixel_image() {
        let width = 2u32;
        let height = 1u32;
        let img = create_rgb8_image(width, height, &[(255, 0, 0), (0, 0, 255)]);

        let (west_data, east_data, palette) = split_rgb_to_indexed_r16::<3>(&img, width);

        assert_eq!(west_data.len(), 2);
        assert_eq!(east_data.len(), 2);
        assert_eq!(palette.iter().count(), 2);

        let west_indices = parse_r16_indices(&west_data);
        let east_indices = parse_r16_indices(&east_data);
        assert_ne!(west_indices[0], east_indices[0]);
    }

    #[test]
    fn test_single_color_entire_image() {
        let width = 8u32;
        let height = 8u32;
        let img = create_solid_rgb8_image(width, height, 128, 128, 128);

        let (west_data, east_data, palette) = split_rgb_to_indexed_r16::<3>(&img, width);

        assert_eq!(west_data.len(), 4 * 8 * 2);
        assert_eq!(east_data.len(), 4 * 8 * 2);

        let palette_vec: Vec<_> = palette.iter().collect();
        assert_eq!(palette_vec.len(), 1);

        // All indices should be 0
        let west_indices = parse_r16_indices(&west_data);
        assert!(west_indices.iter().all(|&idx| idx == 0));
        let east_indices = parse_r16_indices(&east_data);
        assert!(east_indices.iter().all(|&idx| idx == 0));

        // Palette color should match input
        let palette_color = palette_vec.as_slice()[0].0.0;
        assert_eq!(palette_color, [128, 128, 128]);
    }

    #[test]
    #[should_panic(expected = "Image width must be even")]
    fn test_odd_width_panics() {
        let width = 5u32;
        let height = 2u32;
        let img = create_rgb8_image(width, height, &[(255, 0, 0)]);
        split_rgb_to_indexed_r16::<3>(&img, width);
    }

    #[test]
    fn test_index_to_color_roundtrip() {
        let width = 8u32;
        let height = 4u32;
        // Create pattern of known colors
        let colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)];
        let img = create_rgb8_image(width, height, &colors);

        let (west_data, _east_data, palette) = split_rgb_to_indexed_r16::<3>(&img, width);

        // Build palette lookup
        let palette_map: Vec<_> = palette.iter().map(|(r16, rgb)| (r16.0, rgb.0)).collect();

        // Verify all west pixels can be reconstructed
        let west_indices = parse_r16_indices(&west_data);
        for (i, &idx) in west_indices.iter().enumerate() {
            let original_pixel =
                get_pixel_color(&img, width, i as u32 % (width / 2), i as u32 / (width / 2));
            let reconstructed = palette_map[idx as usize].0;
            assert_eq!(
                original_pixel,
                (reconstructed[0], reconstructed[1], reconstructed[2])
            );
        }
    }

    #[test]
    fn test_maximum_colors_65534() {
        // Test at exactly the maximum allowed (65534)
        let width = 256u32;
        let height = 256u32;

        // Create image with 65534 unique colors
        let mut img = Vec::new();
        for i in 0..(width * height) {
            let color_idx = i % 65535;
            let r = ((color_idx >> 8) & 0xFF) as u8;
            let g = (color_idx & 0xFF) as u8;
            let b = 0;
            img.extend_from_slice(&[r, g, b]);
        }

        let (_west, _east, palette) = split_rgb_to_indexed_r16::<3>(&img, width);
        assert_eq!(palette.iter().count(), 65535);
    }

    #[test]
    #[should_panic(expected = "Palette exceeded 65534 colors")]
    fn test_exceeds_65534_colors_panics() {
        // Try to create image with >65534 unique colors (exceeds limit)
        let width = 256u32;
        let height = 256u32;

        let mut img = Vec::new();
        for i in 0..(width * height) {
            // Generate 65535 unique colors (exceeds max of 65534)
            // We use 65536 possible values to ensure we exceed 65534
            let color_idx = i % 65536;
            let r = ((color_idx >> 8) & 0xFF) as u8;
            let g = (color_idx & 0xFF) as u8;
            let b = 0;
            img.extend_from_slice(&[r, g, b]);
        }

        split_rgb_to_indexed_r16::<3>(&img, width);
    }
}
