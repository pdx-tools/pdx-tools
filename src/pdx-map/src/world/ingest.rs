use crate::{Hemisphere, R16, R16Palette, Rgb, World, hash::FnvBuildHasher, units::WorldLength};
use std::collections::{HashMap, hash_map::Entry};

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
pub(crate) fn index_rgb8(img: &[u8], width: WorldLength<u32>) -> (World, R16Palette) {
    index_rgb::<3>(img, width)
}

/// See [`index_rgb8`] for details.
///
/// Alpha channel is ignored.
pub(crate) fn index_rgba8(img: &[u8], width: WorldLength<u32>) -> (World, R16Palette) {
    index_rgb::<4>(img, width)
}

fn index_rgb<const SRC_DEPTH: usize>(img: &[u8], width: WorldLength<u32>) -> (World, R16Palette) {
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

    // Previously this hashmap was was a linear look up table that held all
    // possible RGB combinations (16.7 million entries) for O(1) to read/write,
    // but it was too big to be jumping around in memory for.
    let mut color_lut = HashMap::with_capacity_and_hasher(30_000, FnvBuildHasher::new());
    let mut palette: Vec<Rgb> = Vec::with_capacity(30_000);

    let mut last_key = u32::MAX;
    let mut last_idx = 0u16;

    fn chunkify<const SRC_DEPTH: usize>(row: &[u8]) -> impl Iterator<Item = [u8; 3]> {
        let (output, _) = row.as_chunks::<SRC_DEPTH>();
        output.iter().map(|pixel| [pixel[0], pixel[1], pixel[2]])
    }

    let src_rows = img
        .chunks_exact(width.value as usize * SRC_DEPTH)
        .map(|row| row.split_at(row.len() / 2))
        .map(|(west, east)| (chunkify::<SRC_DEPTH>(west), chunkify::<SRC_DEPTH>(east)));

    let dst_rows = west_data
        .chunks_exact_mut(hemisphere_width)
        .zip(east_data.chunks_exact_mut(hemisphere_width));

    for ((west_src, east_src), (west_dst, east_dst)) in src_rows.zip(dst_rows) {
        for (src, dst) in [(west_src, west_dst), (east_src, east_dst)] {
            for ([r, g, b], dst_r16) in src.zip(dst.iter_mut()) {
                let key = (r as u32) << 16 | (g as u32) << 8 | b as u32;
                let key_rgb = Rgb::new(r, g, b);

                if key == last_key {
                    *dst_r16 = R16::new(last_idx);
                    continue;
                }

                last_idx = match color_lut.entry(key) {
                    Entry::Occupied(entry) => *entry.get(),
                    Entry::Vacant(entry) => {
                        assert!(palette.len() < 65535, "palette exceeded 65535 colors");
                        let len = palette.len();
                        entry.insert(len as u16);
                        palette.push(key_rgb);
                        len as u16
                    }
                };

                last_key = key;
                *dst_r16 = R16::new(last_idx);
            }
        }
    }

    let hemisphere_width = width.hemisphere();
    let mut world_builder = World::builder(
        Hemisphere::new(west_data, hemisphere_width),
        Hemisphere::new(east_data, hemisphere_width),
    );

    if let Some(max) = palette
        .len()
        .checked_sub(1)
        .and_then(|idx| u16::try_from(idx).ok())
        .map(R16::new)
    {
        // SAFETY: The indexing logic writes contiguous palette indices in the
        // closed range 0..=palette.len() - 1 into the world data.
        world_builder = unsafe { world_builder.with_max_location_index_unchecked(max) };
    }

    let world = world_builder.build();

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
    #[should_panic(expected = "palette exceeded 65535 colors")]
    fn test_exceeds_65535_colors_panics() {
        let width = 256u32;
        let height = 256u32;

        let mut img = Vec::new();
        for i in 0..(width * height) {
            let color_idx = i % 65537;
            let r = ((color_idx >> 8) & 0xFF) as u8;
            let g = (color_idx & 0xFF) as u8;
            let b = 0;
            img.extend_from_slice(&[r, g, b]);
        }

        let _ = index_rgb::<3>(&img, WorldLength::new(width));
    }
}
