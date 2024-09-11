use super::{
    errors::BmpError,
    utils::{le_u32, next_i32, next_u16, next_u32},
};

/// A BMP-format bitmap
#[derive(Debug, Clone)]
pub struct Bmp<'a> {
    pub header: BmpHeader,
    pub dib_header: DibHeader,

    pixel_data: &'a [u8],
    palette_data: &'a [u8],
}

#[derive(Debug, Clone, PartialEq)]
pub struct BmpHeader {
    pub bytes: u32,
    pub reserved1: u16,
    pub reserved2: u16,
    pub pixel_offset: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DibHeader {
    pub header_size: u32,
    pub width: i32,
    pub height: i32,
    pub planes: u16,
    pub bpp: u16,
    pub compression: u32,
    pub size: u32,
    pub xresolution: i32,
    pub yresolution: i32,
    pub palette_colors: u32,
    pub important_colors: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PaletteColors<'a> {
    palette_data: &'a [u8],
}

#[derive(Debug, Clone, PartialEq)]
pub struct DataRows<'a> {
    data: &'a [u8],
    byte_width: usize,
    stride: usize,
}

#[derive(Debug)]
pub struct RgbPixels<'a> {
    data: &'a [u8],
    ind: usize,
    byte_width: usize,
    stride: usize,
    use_palette: bool,
    palette_data: &'a [u8],
}

#[derive(Debug)]
pub enum Pixels<'a> {
    Rgb(RgbPixels<'a>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl PartialOrd for Rgb {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Rgb {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.r
            .cmp(&other.r)
            .then(self.g.cmp(&other.g))
            .then(self.b.cmp(&other.b))
    }
}

impl From<(u8, u8, u8)> for Rgb {
    fn from(x: (u8, u8, u8)) -> Self {
        let (r, g, b) = x;
        Rgb { r, g, b }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PaletteRgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub extra: u8,
}

impl<'a> Bmp<'a> {
    pub fn parse(data: &'a [u8]) -> Result<Self, BmpError> {
        let header_data = data.get(0..14).ok_or_else(BmpError::eof)?;
        let header = BmpHeader::parse(header_data)?;

        let orig_data = data;
        let data = &data[14..];
        let dib_header_size = data.get(..4).map(le_u32).ok_or_else(BmpError::eof)?;
        if dib_header_size < 40 {
            return Err(BmpError::unsupported_dib());
        }

        let dib_header_data = data
            .get(..dib_header_size as usize)
            .ok_or_else(BmpError::eof)?;
        let dib_header = DibHeader::parse(dib_header_data);
        let data = &data[dib_header_size as usize..];

        let palette_data = data
            .get(..4 * dib_header.palette_colors as usize)
            .ok_or_else(BmpError::eof)?;

        let pixel_data = orig_data
            .get(header.pixel_offset as usize..header.bytes as usize)
            .ok_or_else(BmpError::eof)?;

        Ok(Bmp {
            header,
            dib_header,
            pixel_data,
            palette_data,
        })
    }

    pub fn data(&self) -> DataRows {
        DataRows {
            data: self.pixel_data,
            byte_width: self.byte_width(),
            stride: self.stride(),
        }
    }

    pub fn pixels(&self) -> Pixels {
        Pixels::Rgb(RgbPixels {
            data: self.pixel_data,
            ind: 0,
            byte_width: self.byte_width(),
            stride: self.stride(),
            use_palette: self.dib_header.bpp == 8,
            palette_data: self.palette_data,
        })
    }

    pub fn pixels_len(&self) -> usize {
        let w = self.dib_header.width.unsigned_abs() as usize;
        let h = self.dib_header.height.unsigned_abs() as usize;
        w * h
    }

    fn byte_width(&self) -> usize {
        let width = self.dib_header.width.unsigned_abs() as usize;
        let bytes_per_pixel = (self.dib_header.bpp + 7) / 8;
        width * usize::from(bytes_per_pixel)
    }

    pub fn stride(&self) -> usize {
        let byte_width = self.byte_width();

        // Windows GDI+ requires that the stride be a multiple of four.
        4 * ((byte_width + 3) / 4)
    }

    pub fn palette(&self) -> PaletteColors {
        PaletteColors {
            palette_data: self.palette_data,
        }
    }
}

impl<'a> Iterator for PaletteColors<'a> {
    type Item = PaletteRgb;
    fn next(&mut self) -> Option<Self::Item> {
        if self.palette_data.is_empty() {
            None
        } else {
            let b = self.palette_data[0];
            let g = self.palette_data[1];
            let r = self.palette_data[2];
            let extra = self.palette_data[3];
            self.palette_data = &self.palette_data[4..];
            Some(PaletteRgb { r, g, b, extra })
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.palette_data.len() / 4;
        (len, Some(len))
    }
}

impl<'a> Iterator for DataRows<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<Self::Item> {
        if self.data.len() < self.byte_width {
            None
        } else {
            let result = &self.data[..self.byte_width];
            self.data = &self.data[self.stride..];
            Some(result)
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = self.data.len() / self.stride;
        (len, Some(len))
    }
}

impl<'a> Iterator for RgbPixels<'a> {
    type Item = Rgb;

    fn next(&mut self) -> Option<Self::Item> {
        if self.data.len() < self.byte_width {
            None
        } else if self.use_palette {
            let palette_ind = usize::from(self.data[self.ind]) * 4;
            let b = self.palette_data[palette_ind];
            let g = self.palette_data[palette_ind + 1];
            let r = self.palette_data[palette_ind + 2];
            self.ind += 1;

            if self.ind == self.byte_width {
                self.ind = 0;
                self.data = &self.data[self.stride..];
            }

            Some(Rgb { r, g, b })
        } else {
            let b = self.data[self.ind];
            let g = self.data[self.ind + 1];
            let r = self.data[self.ind + 2];
            self.ind += 3;
            if self.ind == self.byte_width {
                self.ind = 0;
                self.data = &self.data[self.stride..];
            }

            Some(Rgb { r, g, b })
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let whole = self.data.len() / self.stride;
        let rem = self.byte_width - self.ind;
        (whole + rem, Some(whole + rem))
    }
}

impl BmpHeader {
    fn parse(data: &[u8]) -> Result<Self, BmpError> {
        debug_assert!(data.len() == 14);

        let (magic, rest) = data.split_at(2);
        if magic != b"BM" {
            return Err(BmpError::unrecognized_magic());
        }

        let (bytes, rest) = next_u32(rest);
        let (reserved1, rest) = next_u16(rest);
        let (reserved2, rest) = next_u16(rest);
        let pixel_offset = le_u32(rest);

        Ok(BmpHeader {
            bytes,
            reserved1,
            reserved2,
            pixel_offset,
        })
    }
}

impl DibHeader {
    fn parse(data: &[u8]) -> Self {
        debug_assert!(data.len() >= 40);
        let data = &data[4..];

        let (width, rest) = next_i32(data);
        let (height, rest) = next_i32(rest);
        let (planes, rest) = next_u16(rest);
        let (bpp, rest) = next_u16(rest);
        let (compression, rest) = next_u32(rest);
        let (size, rest) = next_u32(rest);
        let (xresolution, rest) = next_i32(rest);
        let (yresolution, rest) = next_i32(rest);
        let (palette_colors, rest) = next_u32(rest);
        let important_colors = le_u32(rest);

        DibHeader {
            header_size: 40,
            width,
            height,
            planes,
            bpp,
            compression,
            size,
            xresolution,
            yresolution,
            palette_colors,
            important_colors,
        }
    }
}
