use crate::{Hemisphere, R16, R16Palette, Rgb, World, units::WorldLength};

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
pub(crate) fn index_rgb8(img: &[u8], width: WorldLength<u32>) -> (World<R16>, R16Palette) {
    index_rgb::<3>(img, width)
}

/// See [`index_rgb8`] for details.
///
/// Alpha channel is ignored.
pub(crate) fn index_rgba8(img: &[u8], width: WorldLength<u32>) -> (World<R16>, R16Palette) {
    index_rgb::<4>(img, width)
}

fn index_rgb<const SRC_DEPTH: usize>(
    img: &[u8],
    width: WorldLength<u32>,
) -> (World<R16>, R16Palette) {
    let width_value = width.value as usize;
    assert!(width_value.is_multiple_of(2), "world width must be even");
    let height = img.len() / (width_value * SRC_DEPTH);

    assert_eq!(
        height * width_value * SRC_DEPTH,
        img.len(),
        "image data length must be a multiple of width * depth"
    );

    let hemisphere_width = width.hemisphere().value as usize;

    let mut west_data = vec![R16::new(0); hemisphere_width * height];
    let mut east_data = vec![R16::new(0); hemisphere_width * height];

    let mut color_lut = vec![u16::MAX; 1 << 24];
    let mut palette: Vec<Rgb> = Vec::with_capacity(30_000);
    let mut last_color_cache: Option<(Rgb, u16)> = None;

    for y in 0..height {
        let row_start = y * width_value * SRC_DEPTH;
        let row_end = row_start + width_value * SRC_DEPTH;
        let row = &img[row_start..row_end];

        let (west_row, east_row) = row.split_at(hemisphere_width * SRC_DEPTH);

        let row_offset = y * hemisphere_width;
        let row_len = hemisphere_width;

        let west_dst = &mut west_data[row_offset..row_offset + row_len];
        let east_dst = &mut east_data[row_offset..row_offset + row_len];

        for (src_row, dst_row) in [(west_row, west_dst), (east_row, east_dst)] {
            let (rgb, _) = src_row.as_chunks::<SRC_DEPTH>();
            for (pixel, dst_r16) in rgb.iter().zip(dst_row.iter_mut()) {
                let key = (pixel[0] as u32) << 16 | (pixel[1] as u32) << 8 | pixel[2] as u32;
                let key_rgb = Rgb::new(pixel[0], pixel[1], pixel[2]);

                if let Some((last_key, last_idx)) = last_color_cache
                    && last_key == key_rgb
                {
                    *dst_r16 = R16::new(last_idx);
                    continue;
                }

                let mut idx = color_lut[key as usize];

                if idx == u16::MAX {
                    let len = palette.len();
                    assert!(
                        len < u16::MAX as usize,
                        "palette exceeded 65534 colors (u16::MAX-1 reserved for sentinel)"
                    );

                    idx = len as u16;
                    palette.push(key_rgb);
                    color_lut[key as usize] = idx;
                }

                last_color_cache = Some((key_rgb, idx));
                *dst_r16 = R16::new(idx);
            }
        }
    }

    let hemisphere_width = width.hemisphere();
    let world = World::new(
        Hemisphere::new(west_data, hemisphere_width),
        Hemisphere::new(east_data, hemisphere_width),
    );

    (world, R16Palette::new(palette))
}

#[cfg(test)]
mod tests {
    use crate::units::HemisphereSize;

    use super::*;

    fn create_rgb8_image(width: u32, height: u32, colors: &[(u8, u8, u8)]) -> Vec<u8> {
        let mut img = Vec::with_capacity((width * height * 3) as usize);
        for color_idx in 0..(width * height) {
            let (r, g, b) = colors[color_idx as usize % colors.len()];
            img.extend_from_slice(&[r, g, b]);
        }
        img
    }

    fn create_solid_rgb8_image(width: u32, height: u32, r: u8, g: u8, b: u8) -> Vec<u8> {
        create_rgb8_image(width, height, &[(r, g, b)])
    }

    fn parse_r16_indices(r16_data: &[R16]) -> Vec<u16> {
        r16_data.iter().map(|r| r.value()).collect()
    }

    fn get_pixel_color(img: &[u8], width: u32, x: u32, y: u32) -> (u8, u8, u8) {
        let idx = ((y * width + x) * 3) as usize;
        (img[idx], img[idx + 1], img[idx + 2])
    }

    #[test]
    fn test_vertical_split_boundary() {
        let width = 4u32;
        let height = 2u32;
        let mut img = Vec::new();
        for _ in 0..height {
            img.extend_from_slice(&[255, 0, 0, 255, 0, 0]);
            img.extend_from_slice(&[0, 0, 255, 0, 0, 255]);
        }

        let (world, palette) = index_rgb::<3>(&img, WorldLength::new(width));

        assert_eq!(world.west().size(), HemisphereSize::new(2, 2));
        assert_eq!(palette.iter().count(), 2);

        let west_indices = parse_r16_indices(world.west().as_slice());
        let east_indices = parse_r16_indices(world.east().as_slice());

        assert!(west_indices.iter().all(|&idx| west_indices[0] == idx));
        assert!(east_indices.iter().all(|&idx| east_indices[0] == idx));
        assert_ne!(west_indices[0], east_indices[0]);
    }

    #[test]
    fn test_rgba_split() {
        let width = 2u32;
        let data = [
            255, 0, 0, 255, // Red pixel (West)
            0, 0, 255, 255, // Blue pixel (East)
        ];

        let (world, palette) = index_rgba8(&data, WorldLength::new(width));

        assert_eq!(world.west().as_slice(), [R16::new(0)]);
        assert_eq!(world.east().as_slice(), [R16::new(1)]);

        let expected_palette = R16Palette::new(vec![Rgb::new(255, 0, 0), Rgb::new(0, 0, 255)]);
        assert_eq!(palette, expected_palette);
    }

    #[test]
    fn test_single_pixel_image() {
        let width = 2u32;
        let height = 1u32;
        let img = create_rgb8_image(width, height, &[(255, 0, 0), (0, 0, 255)]);

        let (world, palette) = index_rgb::<3>(&img, WorldLength::new(width));

        assert_eq!(world.west().as_slice().len(), 1);
        assert_eq!(world.east().as_slice().len(), 1);
        assert_eq!(palette.iter().count(), 2);

        let west_indices = parse_r16_indices(world.west().as_slice());
        let east_indices = parse_r16_indices(world.east().as_slice());
        assert_ne!(west_indices[0], east_indices[0]);
    }

    #[test]
    fn test_single_color_entire_image() {
        let width = 8u32;
        let height = 8u32;
        let img = create_solid_rgb8_image(width, height, 128, 128, 128);

        let (world, palette) = index_rgb::<3>(&img, WorldLength::new(width));

        assert_eq!(world.west().as_slice().len(), 4 * 8);
        assert_eq!(world.east().as_slice().len(), 4 * 8);

        let palette_vec: Vec<_> = palette.iter().collect();
        assert_eq!(palette_vec.len(), 1);

        let west_indices = parse_r16_indices(world.west().as_slice());
        assert!(west_indices.iter().all(|&idx| idx == 0));
        let east_indices = parse_r16_indices(world.east().as_slice());
        assert!(east_indices.iter().all(|&idx| idx == 0));

        let palette_color = palette_vec.as_slice()[0].0;
        assert_eq!(
            (palette_color.r(), palette_color.g(), palette_color.b()),
            (128, 128, 128)
        );
    }

    #[test]
    #[should_panic(expected = "world width must be even")]
    fn test_odd_width_panics() {
        let width = 5u32;
        let height = 2u32;
        let img = create_rgb8_image(width, height, &[(255, 0, 0)]);
        let _ = index_rgb::<3>(&img, WorldLength::new(width));
    }

    #[test]
    fn test_index_to_color_roundtrip() {
        let width = 8u32;
        let height = 4u32;
        let colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)];
        let img = create_rgb8_image(width, height, &colors);

        let (world, palette) = index_rgb::<3>(&img, WorldLength::new(width));

        let west_indices = parse_r16_indices(world.west().as_slice());
        for (i, &idx) in west_indices.iter().enumerate() {
            let original_pixel =
                get_pixel_color(&img, width, i as u32 % (width / 2), i as u32 / (width / 2));
            let reconstructed = palette.as_slice()[idx as usize];
            assert_eq!(
                original_pixel,
                (reconstructed.r(), reconstructed.g(), reconstructed.b())
            );
        }
    }

    #[test]
    fn test_maximum_colors_65534() {
        let width = 256u32;
        let height = 256u32;

        let mut img = Vec::new();
        for i in 0..(width * height) {
            let color_idx = i % 65535;
            let r = ((color_idx >> 8) & 0xFF) as u8;
            let g = (color_idx & 0xFF) as u8;
            let b = 0;
            img.extend_from_slice(&[r, g, b]);
        }

        let (_world, palette) = index_rgb::<3>(&img, WorldLength::new(width));
        assert_eq!(palette.iter().count(), 65535);
    }

    #[test]
    #[should_panic(expected = "palette exceeded 65534 colors")]
    fn test_exceeds_65534_colors_panics() {
        let width = 256u32;
        let height = 256u32;

        let mut img = Vec::new();
        for i in 0..(width * height) {
            let color_idx = i % 65536;
            let r = ((color_idx >> 8) & 0xFF) as u8;
            let g = (color_idx & 0xFF) as u8;
            let b = 0;
            img.extend_from_slice(&[r, g, b]);
        }

        let _ = index_rgb::<3>(&img, WorldLength::new(width));
    }
}
