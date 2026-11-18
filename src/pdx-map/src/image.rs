use crate::PhysicalSize;
use crate::renderer::MAX_SEAMLESS_WIDTH;

/// One vertical strip of a wide image: its left edge and its width in the
/// image, both in pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Strip {
    pub x: u32,
    pub width: u32,
}

/// How to render an image that is too wide for one render target, so that
/// borders continue across the seams between strips.
///
/// Every strip renders on a target [`render_width`](Self::render_width)
/// wide, which leaves room for the full guard band. Each strip keeps the
/// first [`Strip::width`] columns of its render; only the last strip can be
/// narrower than the render.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StripPlan {
    render_width: u32,
    strips: Vec<Strip>,
}

impl StripPlan {
    /// Plan the fewest strips for an image `width` pixels wide. An image
    /// narrow enough is one strip.
    pub fn new(width: u32) -> Self {
        let count = width.div_ceil(MAX_SEAMLESS_WIDTH).max(1);
        let render_width = width.div_ceil(count);
        let strips = (0..count)
            .map(|i| {
                let x = i * render_width;
                Strip {
                    x,
                    width: render_width.min(width - x),
                }
            })
            .collect();
        Self {
            render_width,
            strips,
        }
    }

    /// Width of the render target that every strip renders on
    pub fn render_width(&self) -> u32 {
        self.render_width
    }

    pub fn strips(&self) -> &[Strip] {
        &self.strips
    }
}

/// An RGBA image assembled from vertical strips rendered one at a time.
#[derive(Debug)]
pub(crate) struct StitchedImage {
    size: PhysicalSize<u32>,
    data: Vec<u8>,
}

impl StitchedImage {
    pub(crate) fn new(size: PhysicalSize<u32>) -> Self {
        Self {
            size,
            data: vec![0u8; (size.area() * 4) as usize],
        }
    }

    /// Write the rows of a strip over the image. There must be a row for
    /// every row of the image, each exactly as wide as the strip.
    pub(crate) fn write_strip<'a, I>(&mut self, strip: Strip, rows: I)
    where
        I: IntoIterator<Item = &'a [u8]>,
    {
        assert!(
            strip.x + strip.width <= self.size.width,
            "strip {strip:?} runs past an image {} wide",
            self.size.width
        );
        let full_row_bytes = (self.size.width * 4) as usize;
        let start = (strip.x * 4) as usize;
        let end = start + (strip.width * 4) as usize;

        let mut dest_rows = self.data.chunks_exact_mut(full_row_bytes);
        for src_row in rows {
            let dest_row = dest_rows
                .next()
                .expect("strip has more rows than the image");
            dest_row[start..end].copy_from_slice(src_row);
        }
        assert!(
            dest_rows.next().is_none(),
            "strip has fewer rows than the image"
        );
    }

    pub(crate) fn into_inner(self) -> Vec<u8> {
        self.data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_plans_use_the_fewest_strips_that_keep_the_guard_band() {
        let strips = |width| {
            let plan = StripPlan::new(width);
            let strips: Vec<_> = plan.strips().iter().map(|s| (s.x, s.width)).collect();
            (plan.render_width(), strips)
        };

        // EU4 fits in one strip
        assert_eq!(strips(5632), (5632, vec![(0, 5632)]));

        // EU5 needs three; the last one is two pixels narrower
        assert_eq!(
            strips(16384),
            (5462, vec![(0, 5462), (5462, 5462), (10924, 5460)])
        );

        assert_eq!(
            strips(MAX_SEAMLESS_WIDTH),
            (MAX_SEAMLESS_WIDTH, vec![(0, MAX_SEAMLESS_WIDTH)])
        );
        assert_eq!(
            strips(MAX_SEAMLESS_WIDTH + 1),
            (4089, vec![(0, 4089), (4089, 4088)])
        );
    }

    #[test]
    fn strips_fill_the_image() {
        let mut img = StitchedImage::new(PhysicalSize::new(5, 2));
        let left = [[10; 12], [11; 12]];
        let right = [[20; 8], [21; 8]];
        img.write_strip(Strip { x: 0, width: 3 }, left.iter().map(|row| &row[..]));
        img.write_strip(Strip { x: 3, width: 2 }, right.iter().map(|row| &row[..]));

        let result = img.into_inner();
        let px = |x: usize, y: usize| &result[(y * 5 + x) * 4..][..4];
        assert_eq!(px(2, 0), [10; 4]);
        assert_eq!(px(3, 0), [20; 4]);
        assert_eq!(px(4, 1), [21; 4]);
        assert_eq!(px(0, 1), [11; 4]);
    }
}
