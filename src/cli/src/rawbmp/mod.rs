/*!

A no-nonense, no-std, no-dependency, low level crate for parsing BMP files

Nothing is hidden and nothing is provided, so seek higher level crates if
ergonomics is the top priority.

*/

mod bmp;
mod errors;
mod utils;

pub use bmp::*;
pub use errors::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    pub fn bit8test() {
        let data = include_bytes!("../../tests/fixtures/8bit.bmp");
        let image = Bmp::parse(&data[..]).unwrap();
        assert_eq!(image.header.bytes, 86);
        assert_eq!(image.header.pixel_offset, 78);

        assert_eq!(image.dib_header.width, 3);
        assert_eq!(image.dib_header.height, 2);
        assert_eq!(image.dib_header.bpp, 8);
        assert_eq!(image.dib_header.palette_colors, 6);
        assert_eq!(image.palette().count(), 6);

        for &byte in image.data().flatten() {
            assert!(byte < 6);
        }

        assert_eq!(image.data().flatten().count(), 6);
        assert_eq!(image.pixels_len(), 6);

        let Pixels::Rgb(pixs) = image.pixels();
        let pixels: Vec<_> = pixs.collect();

        assert_eq!(
            pixels,
            vec![
                Rgb {
                    r: 255,
                    g: 178,
                    b: 127
                },
                Rgb {
                    r: 127,
                    g: 255,
                    b: 244
                },
                Rgb {
                    r: 127,
                    g: 174,
                    b: 255
                },
                Rgb {
                    r: 255,
                    g: 218,
                    b: 127
                },
                Rgb {
                    r: 255,
                    g: 127,
                    b: 138
                },
                Rgb {
                    r: 255,
                    g: 127,
                    b: 242
                },
            ]
        );

        let Pixels::Rgb(mut pixs) = image.pixels();
        for i in 6..=0 {
            assert_eq!(pixs.size_hint(), (i, Some(i)));
            pixs.next().unwrap();
        }

        let mut data = image.data();
        for i in 2..=0 {
            assert_eq!(data.size_hint(), (i, Some(i)));
            data.next().unwrap();
        }
    }

    #[test]
    pub fn bit24test() {
        let data = include_bytes!("../../tests/fixtures/24bit.bmp");
        let image = Bmp::parse(&data[..]).unwrap();
        assert_eq!(image.header.bytes, 78);
        assert_eq!(image.header.pixel_offset, 54);

        assert_eq!(image.dib_header.width, 3);
        assert_eq!(image.dib_header.height, 2);
        assert_eq!(image.dib_header.bpp, 24);
        assert_eq!(image.dib_header.palette_colors, 0);
        assert_eq!(image.palette().count(), 0);
        assert_eq!(image.pixels_len(), 6);

        let Pixels::Rgb(pixs) = image.pixels();
        let pixels: Vec<_> = pixs.collect();

        assert_eq!(
            pixels,
            vec![
                Rgb {
                    r: 255,
                    g: 178,
                    b: 127
                },
                Rgb {
                    r: 127,
                    g: 255,
                    b: 244
                },
                Rgb {
                    r: 127,
                    g: 174,
                    b: 255
                },
                Rgb {
                    r: 255,
                    g: 218,
                    b: 127
                },
                Rgb {
                    r: 255,
                    g: 127,
                    b: 138
                },
                Rgb {
                    r: 255,
                    g: 127,
                    b: 242
                },
            ]
        );

        let Pixels::Rgb(mut pixs) = image.pixels();
        for i in 6..=0 {
            assert_eq!(pixs.size_hint(), (i, Some(i)));
            pixs.next().unwrap();
        }
    }
}
