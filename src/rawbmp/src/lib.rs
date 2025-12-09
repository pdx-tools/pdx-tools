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
        let data = include_bytes!("../tests/fixtures/8bit.bmp");
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

        let Pixels::Rgb(mut pixs) = image.pixels();
        assert_eq!(pixs.size_hint(), (6, Some(6)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 178,
                b: 127
            }
        );
        assert_eq!(pixs.size_hint(), (5, Some(5)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 127,
                g: 255,
                b: 244
            }
        );
        assert_eq!(pixs.size_hint(), (4, Some(4)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 127,
                g: 174,
                b: 255
            }
        );
        assert_eq!(pixs.size_hint(), (3, Some(3)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 218,
                b: 127
            }
        );
        assert_eq!(pixs.size_hint(), (2, Some(2)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 127,
                b: 138
            }
        );
        assert_eq!(pixs.size_hint(), (1, Some(1)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 127,
                b: 242
            }
        );
        assert_eq!(pixs.size_hint(), (0, Some(0)));
        assert_eq!(pixs.next(), None);

        let mut data = image.data();
        assert_eq!(data.size_hint(), (2, Some(2)));
        assert!(data.next().is_some());
        assert_eq!(data.size_hint(), (1, Some(1)));
        assert!(data.next().is_some());
        assert_eq!(data.size_hint(), (0, Some(0)));
        assert!(data.next().is_none());
    }

    #[test]
    pub fn bit24test() {
        let data = include_bytes!("../tests/fixtures/24bit.bmp");
        let image = Bmp::parse(&data[..]).unwrap();
        assert_eq!(image.header.bytes, 78);
        assert_eq!(image.header.pixel_offset, 54);

        assert_eq!(image.dib_header.width, 3);
        assert_eq!(image.dib_header.height, 2);
        assert_eq!(image.dib_header.bpp, 24);
        assert_eq!(image.dib_header.palette_colors, 0);
        assert_eq!(image.palette().count(), 0);
        assert_eq!(image.pixels_len(), 6);

        let Pixels::Rgb(mut pixs) = image.pixels();
        assert_eq!(pixs.size_hint(), (6, Some(6)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 178,
                b: 127
            }
        );
        assert_eq!(pixs.size_hint(), (5, Some(5)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 127,
                g: 255,
                b: 244
            }
        );
        assert_eq!(pixs.size_hint(), (4, Some(4)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 127,
                g: 174,
                b: 255
            }
        );
        assert_eq!(pixs.size_hint(), (3, Some(3)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 218,
                b: 127
            }
        );
        assert_eq!(pixs.size_hint(), (2, Some(2)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 127,
                b: 138
            }
        );
        assert_eq!(pixs.size_hint(), (1, Some(1)));
        assert_eq!(
            pixs.next().unwrap(),
            Rgb {
                r: 255,
                g: 127,
                b: 242
            }
        );
        assert_eq!(pixs.size_hint(), (0, Some(0)));
        assert_eq!(pixs.next(), None);
    }
}
