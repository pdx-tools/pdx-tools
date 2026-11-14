use super::pixel_under;
use crate::{R16, World, WorldPoint, WorldSize};
use std::fmt::{self, Display};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb {
    min: WorldPoint<u16>,
    max: WorldPoint<u16>,
}

impl Aabb {
    pub const fn empty() -> Self {
        Self {
            min: WorldPoint::new(u16::MAX, u16::MAX),
            max: WorldPoint::new(0, 0),
        }
    }

    pub const fn new(min: WorldPoint<u16>, max: WorldPoint<u16>) -> Self {
        Self { min, max }
    }

    #[inline]
    pub fn min(&self) -> WorldPoint<u16> {
        self.min
    }

    #[inline]
    pub fn max(&self) -> WorldPoint<u16> {
        self.max
    }

    #[inline]
    pub fn intersects(&self, other: &Self) -> bool {
        (self.min.x <= other.max.x)
            & (self.max.x >= other.min.x)
            & (self.min.y <= other.max.y)
            & (self.max.y >= other.min.y)
    }
}

impl Display for Aabb {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}-{}]", self.min, self.max)
    }
}

// Divide the world into 64x64 tiles and group locations that occur in each
// time.
const TILE_SIZE: u16 = 64;

#[derive(Debug, Clone, Copy)]
struct Span {
    y: u16,
    x_start: u16,
    x_end: u16,
}

/// Where every location lies on the map, built from a [`World`]: the
/// locations that touch each tile, and every horizontal run of each
/// location's pixels. The runs cover every pixel, so the index answers what is
/// at a point without the world.
#[derive(Debug)]
pub struct SpatialIndex {
    size: WorldSize<u32>,
    tiles_wide: u16,
    tiles_tall: u16,
    tile_offsets: Vec<u32>,
    tile_ranges: Vec<(R16, R16)>,
    span_offsets: Vec<u32>,
    spans: Vec<Span>,
}

impl SpatialIndex {
    /// # Panics
    ///
    /// When the world is wider or taller than 65,535 pixels, as the index
    /// stores coordinates in 16 bits.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.spatial-index.build", skip_all, level = "info")
    )]
    pub fn from_world(world: &World) -> Self {
        let size = world.size();
        let (Ok(world_width), Ok(world_height)) =
            (u16::try_from(size.width), u16::try_from(size.height))
        else {
            panic!("spatial index needs a world at most 65535x65535, not {size}");
        };
        let hemisphere_width = world_width / 2;
        let tiles_wide = world_width.div_ceil(TILE_SIZE);
        let tiles_tall = world_height.div_ceil(TILE_SIZE);
        let tile_count = tiles_wide as usize * tiles_tall as usize;
        let location_capacity = world.location_capacity();

        let mut counts = vec![0u32; tile_count];
        let mut span_counts = vec![0u32; location_capacity];

        // Pass 1: count every tile touched by each horizontal run and count
        // the exact per-location row spans.
        walk_runs(world, hemisphere_width, |run_id, start_x, end_x, y| {
            let li = run_id.value() as usize;
            span_counts[li] += 1;
            let ty = y / TILE_SIZE;
            let tx_start = start_x / TILE_SIZE;
            let tx_end = end_x / TILE_SIZE;
            let row_base = ty as usize * tiles_wide as usize;
            for tx in tx_start..=tx_end {
                counts[row_base + tx as usize] += 1;
            }
        });

        // Per-location span storage is also CSR encoded. The offset slice lets
        // query_exact() jump directly to one candidate location's row spans.
        let mut span_offsets = Vec::with_capacity(location_capacity + 1);
        let mut span_acc = 0u32;
        span_offsets.push(0);
        for count in &span_counts {
            span_acc += count;
            span_offsets.push(span_acc);
        }

        // Turn per-tile touch counts into provisional CSR offsets. These
        // offsets address the temporary flat R16 entries before dedup/ranging.
        let mut prov_offsets = Vec::with_capacity(tile_count + 1);
        let mut acc = 0u32;
        prov_offsets.push(0);
        for count in &counts {
            acc += count;
            prov_offsets.push(acc);
        }

        let mut entries = vec![R16::new(0); acc as usize];
        let mut cursors = prov_offsets[..tile_count].to_vec();
        let mut spans = vec![
            Span {
                y: 0,
                x_start: 0,
                x_end: 0,
            };
            span_acc as usize
        ];
        let mut span_cursors = span_offsets[..location_capacity].to_vec();

        // Pass 2: fill each tile's provisional slice and each location's exact
        // spans. A location can appear multiple times in the same tile when it
        // has several runs there.
        walk_runs(world, hemisphere_width, |run_id, start_x, end_x, y| {
            let li = run_id.value() as usize;
            let span_slot = &mut span_cursors[li];
            spans[*span_slot as usize] = Span {
                y,
                x_start: start_x,
                x_end: end_x,
            };
            *span_slot += 1;

            let ty = y / TILE_SIZE;
            let tx_start = start_x / TILE_SIZE;
            let tx_end = end_x / TILE_SIZE;
            let row_base = ty as usize * tiles_wide as usize;
            for tx in tx_start..=tx_end {
                let slot = &mut cursors[row_base + tx as usize];
                entries[*slot as usize] = run_id;
                *slot += 1;
            }
        });

        #[cfg(debug_assertions)]
        assert_spans_sorted(&span_offsets, &spans);

        // Pass 3: sort each tile independently so duplicates and consecutive
        // location IDs can be collapsed into compact inclusive ranges.
        for tile in 0..tile_count {
            let lo = prov_offsets[tile] as usize;
            let hi = prov_offsets[tile + 1] as usize;
            entries[lo..hi].sort_unstable();
        }

        let mut tile_ranges = Vec::new();
        let mut tile_offsets = Vec::with_capacity(tile_count + 1);
        tile_offsets.push(0);

        // Pass 4: build the final CSR payload. Equal IDs are deduplicated, and
        // adjacent IDs become a single range because R16 assignment is usually
        // spatially coherent.
        for tile in 0..tile_count {
            let lo = prov_offsets[tile] as usize;
            let hi = prov_offsets[tile + 1] as usize;
            let slice = &entries[lo..hi];
            let mut i = 0;
            while i < slice.len() {
                let start = slice[i];
                let mut end = start;
                let mut j = i + 1;

                while j < slice.len() && slice[j].value() <= end.value().saturating_add(1) {
                    if slice[j].value() == end.value().saturating_add(1) {
                        end = slice[j];
                    }
                    j += 1;
                }

                tile_ranges.push((start, end));
                i = j;
            }
            tile_offsets.push(tile_ranges.len() as u32);
        }

        Self {
            size,
            tiles_wide,
            tiles_tall,
            tile_offsets,
            tile_ranges,
            span_offsets,
            spans,
        }
    }

    /// Coarse query: union of tile hits across all `rects`. Clears `out`
    /// before writing.
    pub fn query(&self, rects: &[Aabb], out: &mut LocationBitset) {
        out.reset(self.len());
        for rect in rects {
            self.fill_coarse(*rect, &mut out.words);
        }
    }

    /// Like [`query`](Self::query), then clears any bit whose spans don't
    /// intersect at least one of the rects.
    pub fn query_exact(&self, rects: &[Aabb], out: &mut LocationBitset) {
        self.query(rects, out);

        for word_idx in 0..out.words.len() {
            let mut word = out.words[word_idx];
            while word != 0 {
                let bit = word.trailing_zeros() as usize;
                let bit_mask = 1u64 << bit;
                word &= !bit_mask;

                let spans = self.spans_of(R16::new((word_idx * 64 + bit) as u16));
                if !rects.iter().any(|r| spans_intersect_rect(spans, *r)) {
                    out.words[word_idx] &= !bit_mask;
                }
            }
        }
    }

    fn fill_coarse(&self, query_aabb: Aabb, bitset: &mut [u64]) {
        let qmin = query_aabb.min();
        let qmax = query_aabb.max();
        let tx_start = qmin.x / TILE_SIZE;
        let ty_start = qmin.y / TILE_SIZE;
        let tx_end = (qmax.x / TILE_SIZE).min(self.tiles_wide.saturating_sub(1));
        let ty_end = (qmax.y / TILE_SIZE).min(self.tiles_tall.saturating_sub(1));

        if tx_start > tx_end || ty_start > ty_end {
            return;
        }

        for ty in ty_start..=ty_end {
            for tx in tx_start..=tx_end {
                let idx = ty as usize * self.tiles_wide as usize + tx as usize;
                let lo = self.tile_offsets[idx] as usize;
                let hi = self.tile_offsets[idx + 1] as usize;
                for &(start, end) in &self.tile_ranges[lo..hi] {
                    set_bitrange(bitset, start.value() as usize, end.value() as usize);
                }
            }
        }
    }

    /// The location at `point`, with the same wrap and clamp as
    /// [`World::at`].
    pub fn location_at(&self, point: WorldPoint<f32>) -> R16 {
        let pixel = pixel_under(point, self.size);
        // The pixel is inside the world, which `from_world` checked fits.
        let (x, y) = (pixel.x as u16, pixel.y as u16);
        let tile = (y / TILE_SIZE) as usize * self.tiles_wide as usize + (x / TILE_SIZE) as usize;
        let lo = self.tile_offsets[tile] as usize;
        let hi = self.tile_offsets[tile + 1] as usize;
        let ranges = &self.tile_ranges[lo..hi];

        // A tile with one location needs no search.
        if let [(start, end)] = ranges
            && start == end
        {
            return *start;
        }

        ranges
            .iter()
            .flat_map(|(start, end)| start.value()..=end.value())
            .map(R16::new)
            .find(|&loc| spans_contain(self.spans_of(loc), x, y))
            .expect("every pixel belongs to a location in its tile")
    }

    /// The pixel that stands for the middle of `loc`: the middle of its middle
    /// run, with runs in row order. It belongs to `loc`, also when `loc` wraps
    /// around the map. `None` when `loc` is not on the map.
    pub fn point_of(&self, loc: R16) -> Option<WorldPoint<u32>> {
        let spans = self.spans_of(loc);
        let span = spans.get(spans.len() / 2)?;
        let x = span.x_start + (span.x_end - span.x_start) / 2;
        Some(WorldPoint::new(u32::from(x), u32::from(span.y)))
    }

    /// The [`point_of`](Self::point_of) every location, indexed by location.
    pub fn points(&self) -> impl ExactSizeIterator<Item = Option<WorldPoint<u32>>> + '_ {
        (0..self.len()).map(|loc| self.point_of(R16::new(loc as u16)))
    }

    /// The runs of `loc`, sorted by `(y, x_start)`. Empty when `loc` is not
    /// on the map.
    fn spans_of(&self, loc: R16) -> &[Span] {
        let idx = loc.value() as usize;
        match (self.span_offsets.get(idx), self.span_offsets.get(idx + 1)) {
            (Some(&lo), Some(&hi)) => &self.spans[lo as usize..hi as usize],
            _ => &[],
        }
    }

    pub fn len(&self) -> usize {
        self.span_offsets.len().saturating_sub(1)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

fn walk_runs<F: FnMut(R16, u16, u16, u16)>(world: &World, hemisphere_width: u16, mut visit: F) {
    // This exposes each maximal horizontal R16 run in full-world row-major
    // order: west half, then east half, for each row.
    for (row, (west, east)) in world.west().rows().zip(world.east().rows()).enumerate() {
        // `from_world` checked the height fits.
        let y = row as u16;
        walk_row_runs(west, 0, y, &mut visit);
        walk_row_runs(east, hemisphere_width, y, &mut visit);
    }
}

fn walk_row_runs<F: FnMut(R16, u16, u16, u16)>(row: &[R16], mut x: u16, y: u16, visit: &mut F) {
    for group in row.chunk_by(|a, b| a == b) {
        let end = x + group.len() as u16 - 1;
        visit(group[0], x, end, y);
        x += group.len() as u16;
    }
}

/// Whether one of `spans`, sorted by `(y, x_start)`, covers pixel `(x, y)`.
fn spans_contain(spans: &[Span], x: u16, y: u16) -> bool {
    let idx = spans.partition_point(|span| (span.y, span.x_end) < (y, x));
    spans
        .get(idx)
        .is_some_and(|span| span.y == y && span.x_start <= x)
}

fn spans_intersect_rect(spans: &[Span], rect: Aabb) -> bool {
    let y_min = rect.min().y;
    let y_max = rect.max().y;
    let x_min = rect.min().x;
    let x_max = rect.max().x;

    let start = spans.partition_point(|span| span.y < y_min);
    for span in &spans[start..] {
        if span.y > y_max {
            break;
        }
        if span.x_end >= x_min && span.x_start <= x_max {
            return true;
        }
    }

    false
}

#[cfg(debug_assertions)]
fn assert_spans_sorted(span_offsets: &[u32], spans: &[Span]) {
    for loc in 0..span_offsets.len().saturating_sub(1) {
        let lo = span_offsets[loc] as usize;
        let hi = span_offsets[loc + 1] as usize;
        for window in spans[lo..hi].windows(2) {
            debug_assert!(
                (window[0].y, window[0].x_start) < (window[1].y, window[1].x_start),
                "spans must be sorted by (y, x_start) for location {loc}"
            );
        }
    }
}

/// Reusable scratch buffer for [`SpatialIndex`] queries. Construct once and
/// pass into [`SpatialIndex::query`] / [`SpatialIndex::query_exact`] to avoid
/// per-call allocations on hot paths.
#[derive(Debug, Default)]
pub struct LocationBitset {
    words: Vec<u64>,
}

impl LocationBitset {
    pub fn new() -> Self {
        Self { words: Vec::new() }
    }

    pub fn drain(&mut self) -> Drain<'_> {
        Drain {
            words: &mut self.words,
            word_idx: 0,
        }
    }

    pub fn count(&self) -> usize {
        self.words.iter().map(|w| w.count_ones() as usize).sum()
    }

    pub fn clear(&mut self) {
        self.words.fill(0);
    }

    pub fn contains(&self, index: R16) -> bool {
        let index = index.value() as usize;
        let word = index / 64;
        let bit = index % 64;
        self.words
            .get(word)
            .is_some_and(|value| value & (1u64 << bit) != 0)
    }

    pub fn set(&mut self, index: R16) {
        let index = index.value() as usize;
        let word = index / 64;
        if word >= self.words.len() {
            self.words.resize(word + 1, 0);
        }
        self.words[word] |= 1u64 << (index % 64);
    }

    fn reset(&mut self, len: usize) {
        let words = len.div_ceil(64);
        self.words.clear();
        self.words.resize(words, 0);
    }
}

pub struct Drain<'a> {
    words: &'a mut [u64],
    word_idx: usize,
}

impl<'a> Iterator for Drain<'a> {
    type Item = R16;

    fn next(&mut self) -> Option<Self::Item> {
        while self.word_idx < self.words.len() {
            let word = self.words[self.word_idx];
            if word != 0 {
                let bit = word.trailing_zeros() as usize;
                self.words[self.word_idx] = word & (word - 1);
                return Some(R16::new((self.word_idx * 64 + bit) as u16));
            }
            self.word_idx += 1;
        }
        None
    }

    fn count(self) -> usize {
        self.words[self.word_idx..]
            .iter()
            .map(|w| w.count_ones() as usize)
            .sum()
    }
}

#[inline]
fn set_bitrange(bitset: &mut [u64], start: usize, end: usize) {
    let lo_word = start >> 6;
    let hi_word = end >> 6;
    let lo_bit = start & 63;
    let hi_bit = end & 63;
    if lo_word == hi_word {
        bitset[lo_word] |= (!0u64 >> (63 - hi_bit)) & (!0u64 << lo_bit);
    } else {
        bitset[lo_word] |= !0u64 << lo_bit;
        for word in bitset.iter_mut().take(hi_word).skip(lo_word + 1) {
            *word = !0u64;
        }
        bitset[hi_word] |= !0u64 >> (63 - hi_bit);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Hemisphere, units::HemisphereLength};

    fn coarse(index: &SpatialIndex, rect: Aabb) -> Vec<R16> {
        let mut out = LocationBitset::new();
        index.query(&[rect], &mut out);
        out.drain().collect()
    }

    fn exact(index: &SpatialIndex, rect: Aabb) -> Vec<R16> {
        let mut out = LocationBitset::new();
        index.query_exact(&[rect], &mut out);
        out.drain().collect()
    }

    fn world_from_halves(west: Vec<u16>, east: Vec<u16>, hemisphere_width: u32) -> World {
        let west = west.into_iter().map(R16::new).collect::<Vec<_>>();
        let east = east.into_iter().map(R16::new).collect::<Vec<_>>();

        World::builder(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width)),
        )
        .build()
    }

    fn world_from_grid(grid: Vec<u16>, world_width: u16) -> World {
        assert!(world_width.is_multiple_of(2));
        let hemisphere_width = world_width / 2;
        let height = grid.len() / world_width as usize;
        let mut west = Vec::with_capacity(hemisphere_width as usize * height);
        let mut east = Vec::with_capacity(hemisphere_width as usize * height);

        for row in grid.chunks_exact(world_width as usize) {
            west.extend(
                row[..hemisphere_width as usize]
                    .iter()
                    .copied()
                    .map(R16::new),
            );
            east.extend(
                row[hemisphere_width as usize..]
                    .iter()
                    .copied()
                    .map(R16::new),
            );
        }

        World::builder(
            Hemisphere::new(west, HemisphereLength::new(hemisphere_width as u32)),
            Hemisphere::new(east, HemisphereLength::new(hemisphere_width as u32)),
        )
        .build()
    }

    /// Small worlds with a location that wraps around the map, one across
    /// the hemisphere seam, one with a hole, single pixels at tile and
    /// hemisphere corners, stripes of many locations in a tile, an id that is
    /// not on the map (8), and a world smaller than a tile.
    fn sample_worlds() -> Vec<World> {
        let (width, height) = (160, 70);
        let mut grid = vec![1; width * height];
        for y in 0..height {
            for x in 0..width {
                let id = match (x, y) {
                    (0..5 | 155.., 0..10) => 0,
                    (70..90, 20..40) => 2,
                    (20..30, 40..50) => 4,
                    (10..50, 30..) => 3,
                    (100..140, 50..60) => 9 + ((x / 3 + y) % 4) as u16,
                    _ => continue,
                };
                grid[y * width + x] = id;
            }
        }
        for (x, y, id) in [
            (79, 0, 5),
            (80, 69, 6),
            (159, 69, 7),
            (63, 63, 13),
            (64, 64, 14),
        ] {
            grid[y * width + x] = id;
        }

        vec![
            world_from_grid(grid, width as u16),
            world_from_halves(vec![0, 1, 2, 3], vec![4, 5, 6, 7], 2),
        ]
    }

    #[test]
    fn test_aabb_size() {
        use std::mem::size_of;

        assert_eq!(size_of::<Aabb>(), 8);
        assert_eq!(size_of::<WorldPoint<u16>>(), 4);
    }

    #[test]
    fn test_aabb_new() {
        let aabb = Aabb::new(WorldPoint::new(10, 20), WorldPoint::new(30, 40));
        assert_eq!(aabb.min(), WorldPoint::new(10, 20));
        assert_eq!(aabb.max(), WorldPoint::new(30, 40));
    }

    #[test]
    fn test_aabb_intersects() {
        let aabb1 = Aabb::new(WorldPoint::new(10, 10), WorldPoint::new(20, 20));
        let aabb2 = Aabb::new(WorldPoint::new(15, 15), WorldPoint::new(25, 25));
        let aabb3 = Aabb::new(WorldPoint::new(30, 30), WorldPoint::new(40, 40));

        assert!(aabb1.intersects(&aabb2));
        assert!(aabb2.intersects(&aabb1));

        assert!(!aabb1.intersects(&aabb3));
        assert!(!aabb3.intersects(&aabb1));

        let aabb4 = Aabb::new(WorldPoint::new(20, 20), WorldPoint::new(30, 30));
        assert!(aabb1.intersects(&aabb4));
    }

    #[test]
    fn test_aabb_display() {
        let aabb = Aabb::new(WorldPoint::new(10, 20), WorldPoint::new(100, 80));
        assert_eq!(format!("{}", aabb), "[(10,20)-(100,80)]");
    }

    #[test]
    fn test_spatial_index_construction() {
        let world = world_from_halves(vec![0, 1, 2, 3], vec![4, 5, 6, 7], 2);
        let index = world.build_spatial_index();

        assert_eq!(index.len(), 8);

        assert_eq!(index.point_of(R16::new(0)), Some(WorldPoint::new(0, 0)));
        assert_eq!(index.point_of(R16::new(1)), Some(WorldPoint::new(1, 0)));
        assert_eq!(index.point_of(R16::new(4)), Some(WorldPoint::new(2, 0)));
    }

    #[test]
    fn point_of_is_near_the_middle_of_the_location() {
        // Location 0 fills the west half of 3 rows, x = 0..=7.
        let row = [[0; 8], [1; 8]].concat();
        let world = world_from_grid(row.repeat(3), 16);
        let index = world.build_spatial_index();
        assert_eq!(index.point_of(R16::new(0)), Some(WorldPoint::new(3, 1)));
    }

    #[test]
    fn test_aabb_index_query() {
        let world = world_from_halves(
            vec![0; TILE_SIZE as usize],
            vec![1; TILE_SIZE as usize],
            TILE_SIZE as u32,
        );
        let index = world.build_spatial_index();

        let query = Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(TILE_SIZE - 1, 0));
        let results = coarse(&index, query);

        assert!(results.contains(&R16::new(0)));

        assert!(!results.contains(&R16::new(1)));
    }

    #[test]
    fn wrapping_location_not_matched_in_middle() {
        let width = TILE_SIZE * 4;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];
        grid[0] = 0;
        grid[width as usize - 1] = 0;
        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let mid = Aabb::new(
            WorldPoint::new(TILE_SIZE * 2, 0),
            WorldPoint::new(TILE_SIZE * 2, 0),
        );
        let results = coarse(&index, mid);

        assert!(!results.contains(&R16::new(0)));
    }

    #[test]
    fn wrapping_location_matched_at_either_edge() {
        let width = TILE_SIZE * 4;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];
        grid[0] = 0;
        grid[width as usize - 1] = 0;
        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let left = Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(0, 0));
        assert!(coarse(&index, left).contains(&R16::new(0)));

        let right_x = world.size().width as u16 - 1;
        let right = Aabb::new(WorldPoint::new(right_x, 0), WorldPoint::new(right_x, 0));
        assert!(coarse(&index, right).contains(&R16::new(0)));
    }

    #[test]
    fn concave_location_does_not_match_interior_gap_tile() {
        let width = TILE_SIZE * 4;
        let height = TILE_SIZE * 3;
        let mut grid = vec![1; width as usize * height as usize];

        for y in 0..height {
            for x in 0..(TILE_SIZE * 2) {
                let is_left_arm = x < TILE_SIZE;
                let is_top_arm = y < TILE_SIZE;
                let is_bottom_arm = y >= TILE_SIZE * 2;
                if is_left_arm || is_top_arm || is_bottom_arm {
                    grid[y as usize * width as usize + x as usize] = 0;
                }
            }
        }

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let interior = Aabb::new(
            WorldPoint::new(TILE_SIZE + 1, TILE_SIZE + 1),
            WorldPoint::new(TILE_SIZE + 1, TILE_SIZE + 1),
        );
        assert!(!coarse(&index, interior).contains(&R16::new(0)));

        let on_arm = Aabb::new(
            WorldPoint::new(0, TILE_SIZE + 1),
            WorldPoint::new(0, TILE_SIZE + 1),
        );
        assert!(coarse(&index, on_arm).contains(&R16::new(0)));
    }

    #[test]
    fn location_spanning_tile_boundary_matched_from_either_tile() {
        let width = TILE_SIZE * 2;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];
        grid[(TILE_SIZE - 1) as usize] = 0;
        grid[TILE_SIZE as usize] = 0;
        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let left = Aabb::new(
            WorldPoint::new(TILE_SIZE - 1, 0),
            WorldPoint::new(TILE_SIZE - 1, 0),
        );
        assert!(coarse(&index, left).contains(&R16::new(0)));

        let right = Aabb::new(WorldPoint::new(TILE_SIZE, 0), WorldPoint::new(TILE_SIZE, 0));
        assert!(coarse(&index, right).contains(&R16::new(0)));
    }

    #[test]
    fn point_query_returns_locations_at_that_pixel() {
        let width = TILE_SIZE * 2;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];
        grid[5] = 0;
        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let point = Aabb::new(WorldPoint::new(5, 0), WorldPoint::new(5, 0));
        assert!(coarse(&index, point).contains(&R16::new(0)));
    }

    #[test]
    fn query_exact_excludes_locations_in_tile_but_outside_rect() {
        let width = TILE_SIZE * 2;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];

        for y in 0..32 {
            for x in 0..32 {
                grid[y * width as usize + x] = 0;
            }
        }

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);
        let query = Aabb::new(WorldPoint::new(40, 40), WorldPoint::new(60, 60));

        assert!(coarse(&index, query).contains(&R16::new(0)));
        assert!(!exact(&index, query).contains(&R16::new(0)));
    }

    #[test]
    fn query_exact_includes_locations_with_overlapping_pixels() {
        let width = TILE_SIZE * 2;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];

        for y in 10..=20 {
            for x in 10..=20 {
                grid[y * width as usize + x] = 0;
            }
        }

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);
        let query = Aabb::new(WorldPoint::new(10, 10), WorldPoint::new(20, 20));

        assert!(exact(&index, query).contains(&R16::new(0)));
    }

    #[test]
    fn query_exact_handles_concave_locations() {
        let width = TILE_SIZE * 2;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];

        for y in 0..48 {
            for x in 0..48 {
                let is_left_arm = x < 16;
                let is_top_arm = y < 16;
                let is_bottom_arm = y >= 32;
                if is_left_arm || is_top_arm || is_bottom_arm {
                    grid[y * width as usize + x] = 0;
                }
            }
        }

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);
        let interior = Aabb::new(WorldPoint::new(24, 24), WorldPoint::new(28, 28));

        assert!(coarse(&index, interior).contains(&R16::new(0)));
        assert!(!exact(&index, interior).contains(&R16::new(0)));
    }

    #[test]
    fn query_exact_handles_wrapping_location() {
        let width = TILE_SIZE * 4;
        let height = TILE_SIZE;
        let mut grid = vec![1; width as usize * height as usize];
        grid[0] = 0;
        grid[width as usize - 1] = 0;
        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let mid = Aabb::new(
            WorldPoint::new(TILE_SIZE * 2, 0),
            WorldPoint::new(TILE_SIZE * 2, 0),
        );
        assert!(!exact(&index, mid).contains(&R16::new(0)));

        let left = Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(0, 0));
        assert!(exact(&index, left).contains(&R16::new(0)));

        let right = Aabb::new(WorldPoint::new(width - 1, 0), WorldPoint::new(width - 1, 0));
        assert!(exact(&index, right).contains(&R16::new(0)));
    }

    #[test]
    fn spans_are_sorted_by_y_x_start() {
        let width = TILE_SIZE * 2;
        let height = 4;
        let mut grid = vec![1; width as usize * height as usize];
        grid[0] = 0;
        grid[TILE_SIZE as usize] = 0;
        grid[width as usize] = 0;
        grid[width as usize + TILE_SIZE as usize] = 0;

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);
        let lo = index.span_offsets[0] as usize;
        let hi = index.span_offsets[1] as usize;

        for window in index.spans[lo..hi].windows(2) {
            assert!((window[0].y, window[0].x_start) < (window[1].y, window[1].x_start));
        }
    }

    #[test]
    fn query_results_are_sorted_and_deduplicated() {
        let width = TILE_SIZE * 4;
        let height = TILE_SIZE * 2;
        let mut grid = vec![3; width as usize * height as usize];

        for y in 0..height {
            for x in 0..width {
                let value = if x < TILE_SIZE * 2 { 1 } else { 2 };
                grid[y as usize * width as usize + x as usize] = value;
            }
        }

        for y in 0..height {
            grid[y as usize * width as usize] = 0;
        }

        let world = world_from_grid(grid, width);
        let index = SpatialIndex::from_world(&world);

        let big = Aabb::new(
            WorldPoint::new(0, 0),
            WorldPoint::new(width - 1, height - 1),
        );
        let results = coarse(&index, big);

        let mut sorted = results.clone();
        sorted.sort();
        assert_eq!(results, sorted, "results must be ascending");

        let mut deduped = results.clone();
        deduped.dedup();
        assert_eq!(results, deduped, "results must be deduplicated");
    }

    #[test]
    fn empty_query_outside_world_returns_nothing() {
        let world = world_from_halves(vec![0; TILE_SIZE as usize], vec![1; TILE_SIZE as usize], 64);
        let index = SpatialIndex::from_world(&world);

        let query = Aabb::new(
            WorldPoint::new(TILE_SIZE * 2, 0),
            WorldPoint::new(TILE_SIZE * 2, 0),
        );

        assert_eq!(coarse(&index, query), Vec::<R16>::new());
    }

    #[test]
    fn location_bitset_supports_preview_membership() {
        let mut bitset = LocationBitset::new();
        let first = R16::new(0);
        let last_in_word = R16::new(63);
        let next_word = R16::new(64);

        bitset.set(first);
        bitset.set(last_in_word);
        bitset.set(next_word);

        assert!(bitset.contains(first));
        assert!(bitset.contains(last_in_word));
        assert!(bitset.contains(next_word));
        assert!(!bitset.contains(R16::new(65)));
        assert_eq!(bitset.count(), 3);

        bitset.clear();

        assert!(!bitset.contains(first));
        assert_eq!(bitset.count(), 0);
    }

    #[test]
    fn index_takes_worlds_up_to_u16_size() {
        let tallest = world_from_halves(vec![0; 65535], vec![1; 65535], 1);
        assert_eq!(tallest.build_spatial_index().len(), 2);
        let widest = world_from_halves(vec![0; 32767], vec![1; 32767], 32767);
        assert_eq!(widest.build_spatial_index().len(), 2);

        let too_wide = world_from_halves(vec![0; 32768], vec![1; 32768], 32768);
        let built = std::panic::catch_unwind(|| too_wide.build_spatial_index());
        assert!(built.is_err());
    }

    #[test]
    fn location_at_agrees_with_world_at() {
        for world in sample_worlds() {
            let index = world.build_spatial_index();
            let size = world.size();
            let (width, height) = (size.width as i32, size.height as i32);
            for y in -3..height + 3 {
                for x in -width - 3..2 * width + 3 {
                    for offset in [0.0, 0.5, 0.999] {
                        let point = WorldPoint::new(x as f32 + offset, y as f32 + offset);
                        assert_eq!(index.location_at(point), world.at(point), "at {point}");
                    }
                }
            }
        }
    }

    #[test]
    fn point_of_belongs_to_the_location() {
        for world in sample_worlds() {
            let index = world.build_spatial_index();
            let mut on_map = LocationBitset::new();
            for &loc in world.rows().flatten() {
                on_map.set(loc);
            }

            for (loc, point) in index.points().enumerate() {
                let loc = R16::new(loc as u16);
                assert_eq!(point.is_some(), on_map.contains(loc), "{loc:?}");
                if let Some(point) = point {
                    let point = WorldPoint::new(point.x as f32, point.y as f32);
                    assert_eq!(world.at(point), loc, "{loc:?} at {point}");
                }
            }
        }
    }
}
