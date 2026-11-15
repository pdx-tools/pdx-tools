//! The location index of every world pixel, compressed into tiles.
//!
//! Each 16x16 tile lists the few locations it holds, its palette, and
//! stores each pixel as an index into that list, with as few bits as the
//! palette needs. Most tiles hold one or two locations, so the EU5 world
//! takes about 13 MiB instead of the 256 MiB of 16 bits per pixel.
//!
//! The data is a list of u32 words. A table with one entry per tile comes
//! first, row by row. An entry holds the word offset of the tile's block in
//! its high 29 bits and the bit width code in its low 3 bits. A block holds
//! the packed pixel indices, 8 words per bit of width, then the palette, two
//! location indices per word with the first in the low half. A tile of more
//! than 256 locations stores the location indices themselves in 16 bits and
//! has no palette. The resolve shader reads the same layout.

use super::{SpatialIndex, SpatialIndexBuilder, WorldRows};
use crate::{HemisphereSize, R16};
use std::fmt;

/// Width and height of a tile in pixels
const TILE: usize = 16;

/// Bit widths by their code in a table entry
const WIDTHS: [u32; 6] = [0, 1, 2, 4, 8, 16];

/// The location index of every pixel of a world, compressed into tiles. The
/// map bundle stores it, and the GPU reads it as it is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorldTiles {
    hemisphere: HemisphereSize<u32>,
    words: Vec<u32>,
}

impl WorldTiles {
    /// The tiles of a world from all of its rows.
    ///
    /// # Panics
    ///
    /// When `rows` do not start at the world's first row.
    pub fn from_rows(rows: WorldRows<'_>) -> Self {
        let mut builder =
            WorldTilesBuilder::new(HemisphereSize::new(rows.width().value, rows.height()));
        builder.push(rows);
        builder.finish()
    }

    /// Tiles from their words, as [`WorldTiles::words`] gave them. The table
    /// is checked here, and every pixel when the tiles are decoded.
    pub fn from_words(
        hemisphere: HemisphereSize<u32>,
        words: Vec<u32>,
    ) -> Result<Self, InvalidTiles> {
        let tiles = Self { hemisphere, words };
        let table_len = tiles.tiles_wide() * tiles.tiles_tall();
        let Some(table) = tiles.words.get(..table_len) else {
            return Err(InvalidTiles(format!(
                "{} words cannot hold the table of {table_len} tiles",
                tiles.words.len()
            )));
        };
        for (tile, &entry) in table.iter().enumerate() {
            let code = (entry & 7) as usize;
            let block = (entry >> 3) as usize;
            let Some(&bits) = WIDTHS.get(code) else {
                return Err(InvalidTiles(format!(
                    "tile {tile} has bit width code {code}"
                )));
            };
            // The packed indices, and at least one palette word
            let end = block + 8 * bits as usize + usize::from(bits < 16);
            if block < table_len || end > tiles.words.len() {
                return Err(InvalidTiles(format!(
                    "tile {tile} has its block outside the data"
                )));
            }
        }
        Ok(tiles)
    }

    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.hemisphere
    }

    /// The data, in the layout of the module docs
    pub fn words(&self) -> &[u32] {
        &self.words
    }

    /// Decode the rows of the world, and give each band of 16 rows, the
    /// height of a tile, to `sink`, top to bottom. On an error, the rows
    /// given so far are not the whole world.
    pub fn for_each_band(&self, mut sink: impl FnMut(WorldRows<'_>)) -> Result<(), InvalidTiles> {
        let width = self.hemisphere.width as usize;
        let height = self.hemisphere.height as usize;
        let mut west = vec![R16::new(0); width * TILE];
        let mut east = vec![R16::new(0); width * TILE];
        let mut ids = [R16::new(0); TILE * TILE];
        for tile_y in 0..self.tiles_tall() {
            let rows = TILE.min(height - tile_y * TILE);
            for tile_x in 0..self.tiles_wide() {
                let pixels = self.decode_tile(tile_y * self.tiles_wide() + tile_x, &mut ids)?;
                // The part of the tile in each hemisphere, in world x
                let x0 = tile_x * TILE;
                for (half, half_x) in [(&mut west, 0), (&mut east, width)] {
                    let start = x0.max(half_x);
                    let end = (x0 + TILE).min(half_x + width);
                    for y in (0..rows).filter(|_| start < end) {
                        let row = y * width;
                        let dst = &mut half[row + start - half_x..row + end - half_x];
                        match pixels {
                            TilePixels::One(id) => dst.fill(id),
                            TilePixels::Each => dst
                                .copy_from_slice(&ids[y * TILE + start - x0..y * TILE + end - x0]),
                        }
                    }
                }
            }
            sink(WorldRows::new(
                (tile_y * TILE) as u32,
                &west[..rows * width],
                &east[..rows * width],
                self.hemisphere.width_length(),
            ));
        }
        Ok(())
    }

    /// The spatial index of the world, built from its decoded rows
    pub fn build_spatial_index(&self) -> Result<SpatialIndex, InvalidTiles> {
        let mut index = SpatialIndexBuilder::new(self.hemisphere);
        self.for_each_band(|rows| index.push(rows))?;
        Ok(index.finish())
    }

    fn tiles_wide(&self) -> usize {
        (self.hemisphere.width as usize * 2).div_ceil(TILE)
    }

    fn tiles_tall(&self) -> usize {
        (self.hemisphere.height as usize).div_ceil(TILE)
    }

    /// Decode a tile: one location, or the location of each pixel, row by
    /// row, in `ids`. [`WorldTiles::from_words`] checked that the block's
    /// indices and first palette word are in the data, so only a palette
    /// index can point past it.
    fn decode_tile(
        &self,
        tile: usize,
        ids: &mut [R16; TILE * TILE],
    ) -> Result<TilePixels, InvalidTiles> {
        let entry = self.words[tile];
        let block = (entry >> 3) as usize;
        let bits = WIDTHS[(entry & 7) as usize];
        if bits == 0 {
            return Ok(TilePixels::One(R16::new(self.words[block] as u16)));
        }
        let palette = block + 8 * bits as usize;
        for (i, id) in ids.iter_mut().enumerate() {
            let bit = i as u32 * bits;
            let index =
                (self.words[block + (bit / 32) as usize] >> (bit % 32)) & ((1u32 << bits) - 1);
            let value = if bits == 16 {
                index
            } else {
                let pair = self
                    .words
                    .get(palette + (index / 2) as usize)
                    .ok_or_else(|| {
                        InvalidTiles(format!("tile {tile} reads past the end of the data"))
                    })?;
                pair >> ((index % 2) * 16)
            };
            *id = R16::new(value as u16);
        }
        Ok(TilePixels::Each)
    }
}

/// What [`WorldTiles::decode_tile`] found
#[derive(Clone, Copy)]
enum TilePixels {
    /// Every pixel is this location
    One(R16),
    /// The pixels are in the tile's ids
    Each,
}

/// Tiles whose data does not fit their layout
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidTiles(String);

impl fmt::Display for InvalidTiles {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid world tiles: {}", self.0)
    }
}

impl std::error::Error for InvalidTiles {}

/// Builds the tiles of a world from its rows, a band at a time, top to
/// bottom
#[derive(Debug)]
struct WorldTilesBuilder {
    hemisphere: HemisphereSize<u32>,
    /// Rows of a tile row that a band left unfinished, as west and east
    /// halves
    pending_west: Vec<u16>,
    pending_east: Vec<u16>,
    next_row: usize,
    table: Vec<u32>,
    blocks: Vec<u32>,
}

/// The rows of one tile row, each as its west and east half
type TileRows<'a> = [(&'a [u16], &'a [u16]); TILE];

impl WorldTilesBuilder {
    fn new(hemisphere: HemisphereSize<u32>) -> Self {
        let world = hemisphere.world();
        Self {
            hemisphere,
            pending_west: Vec::new(),
            pending_east: Vec::new(),
            next_row: 0,
            table: Vec::with_capacity(
                (world.width as usize).div_ceil(TILE) * (world.height as usize).div_ceil(TILE),
            ),
            blocks: Vec::new(),
        }
    }

    fn hemisphere_width(&self) -> usize {
        self.hemisphere.width as usize
    }

    /// Add `rows`, which start where the rows already added end
    ///
    /// # Panics
    ///
    /// When `rows` do not start at the next row, are not as wide as the
    /// hemispheres, or go past the bottom of the world.
    fn push(&mut self, rows: WorldRows<'_>) {
        assert_eq!(
            rows.first_row() as usize,
            self.next_row,
            "rows must come top to bottom"
        );
        assert_eq!(
            rows.width().value,
            self.hemisphere.width,
            "rows must be as wide as the hemispheres"
        );
        let count = rows.height() as usize;
        assert!(
            self.next_row + count <= self.hemisphere.height as usize,
            "rows go past the bottom"
        );
        self.next_row += count;

        let width = self.hemisphere_width();
        let west: &[u16] = bytemuck::cast_slice(rows.west());
        let east: &[u16] = bytemuck::cast_slice(rows.east());
        let mut start = 0;
        // Finish a tile row that an earlier band began
        if !self.pending_west.is_empty() {
            let missing = TILE - self.pending_west.len() / width;
            let take = missing.min(count);
            self.pending_west.extend_from_slice(&west[..take * width]);
            self.pending_east.extend_from_slice(&east[..take * width]);
            start = take;
            if take == missing {
                let pending_west = std::mem::take(&mut self.pending_west);
                let pending_east = std::mem::take(&mut self.pending_east);
                self.encode_tile_row(&tile_rows(&pending_west, &pending_east, width));
            }
        }
        // Whole tile rows straight from the band
        while count - start >= TILE {
            let band = start * width..(start + TILE) * width;
            self.encode_tile_row(&tile_rows(&west[band.clone()], &east[band], width));
            start += TILE;
        }
        self.pending_west.extend_from_slice(&west[start * width..]);
        self.pending_east.extend_from_slice(&east[start * width..]);
    }

    /// The tiles.
    ///
    /// # Panics
    ///
    /// When rows are missing.
    fn finish(mut self) -> WorldTiles {
        assert_eq!(
            self.next_row, self.hemisphere.height as usize,
            "every row must be added"
        );
        if !self.pending_west.is_empty() {
            // Pixels below the world are never read, so they repeat the
            // last row
            let width = self.hemisphere_width();
            let mut west = std::mem::take(&mut self.pending_west);
            let mut east = std::mem::take(&mut self.pending_east);
            let last_west = west[west.len() - width..].to_vec();
            let last_east = east[east.len() - width..].to_vec();
            while west.len() < width * TILE {
                west.extend_from_slice(&last_west);
                east.extend_from_slice(&last_east);
            }
            self.encode_tile_row(&tile_rows(&west, &east, width));
        }

        // Block offsets are relative to the blocks. Make them absolute.
        let table_len = self.table.len() as u32;
        let mut words = self.table;
        for entry in &mut words {
            *entry += table_len << 3;
        }
        words.extend_from_slice(&self.blocks);
        WorldTiles {
            hemisphere: self.hemisphere,
            words,
        }
    }

    fn encode_tile_row(&mut self, rows: &TileRows<'_>) {
        let hemisphere_width = self.hemisphere_width();
        let world_width = hemisphere_width * 2;
        let mut ids = [0u16; TILE * TILE];
        let mut palette = Vec::new();
        for tile_x in 0..world_width.div_ceil(TILE) {
            let x0 = tile_x * TILE;
            // Most tiles hold one location and sit inside one hemisphere
            if let Some(id) = single_location(rows, x0, hemisphere_width) {
                self.table.push((self.blocks.len() as u32) << 3);
                self.blocks.push(u32::from(id));
                continue;
            }

            palette.clear();
            for (y, row) in ids.as_chunks_mut::<TILE>().0.iter_mut().enumerate() {
                for (x, id) in row.iter_mut().enumerate() {
                    // Pixels past the east edge are never read, so they
                    // repeat the last column
                    let world_x = (x0 + x).min(world_width - 1);
                    let (west, east) = rows[y];
                    *id = if world_x < hemisphere_width {
                        west[world_x]
                    } else {
                        east[world_x - hemisphere_width]
                    };
                    if !palette.contains(id) {
                        palette.push(*id);
                    }
                }
            }
            self.encode_tile(&ids, &palette);
        }
    }

    fn encode_tile(&mut self, ids: &[u16; TILE * TILE], palette: &[u16]) {
        let code = match palette.len() {
            1 => 0,
            2 => 1,
            3..=4 => 2,
            5..=16 => 3,
            17..=256 => 4,
            _ => 5,
        };
        let bits = WIDTHS[code];
        self.table
            .push(((self.blocks.len() as u32) << 3) | code as u32);

        if bits > 0 {
            let start = self.blocks.len();
            self.blocks
                .resize(start + (TILE * TILE) * bits as usize / 32, 0);
            for (i, &id) in ids.iter().enumerate() {
                let value = if bits == 16 {
                    u32::from(id)
                } else {
                    palette.iter().position(|&p| p == id).unwrap() as u32
                };
                let bit = i as u32 * bits;
                self.blocks[start + (bit / 32) as usize] |= value << (bit % 32);
            }
        }
        if bits < 16 {
            self.blocks.extend(palette.chunks(2).map(|pair| {
                u32::from(pair[0]) | u32::from(pair.get(1).copied().unwrap_or(0)) << 16
            }));
        }
    }
}

/// The rows of a tile row from 16 rows of west and east halves
fn tile_rows<'a>(west: &'a [u16], east: &'a [u16], width: usize) -> TileRows<'a> {
    let mut west_rows = west.chunks_exact(width);
    let mut east_rows = east.chunks_exact(width);
    std::array::from_fn(|_| (west_rows.next().unwrap(), east_rows.next().unwrap()))
}

/// The location of a tile that lies inside one hemisphere and holds one
/// location, or `None`
fn single_location<'a>(rows: &TileRows<'a>, x0: usize, hemisphere_width: usize) -> Option<u16> {
    let in_west = x0 + TILE <= hemisphere_width;
    let in_east = x0 >= hemisphere_width && x0 + TILE <= 2 * hemisphere_width;
    if !in_west && !in_east {
        return None;
    }
    let x = if in_west { x0 } else { x0 - hemisphere_width };
    let half = |(west, east): (&'a [u16], &'a [u16])| if in_west { west } else { east };
    let id = half(rows[0])[x];
    rows.iter()
        .all(|&row| half(row)[x..x + TILE].iter().all(|&v| v == id))
        .then_some(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::HemisphereLength;

    const HEMISPHERE_WIDTH: u32 = 40;
    const HEIGHT: u32 = 37;

    /// Blocks of one location, then stripes of 2, 3, 9, 200 and 600
    /// locations, so there are tiles of every bit width
    fn id_at(x: u32, y: u32) -> u16 {
        match x / 16 {
            0 => 7,
            1 => (y % 2) as u16,
            2 => (x % 3) as u16 + 10,
            3 => ((x + y) % 9) as u16 + 20,
            4 => ((x * 7 + y * 13) % 200) as u16 + 100,
            _ => ((x * 31 + y * 17) % 600) as u16 + 1000,
        }
    }

    fn hemisphere(offset: u32) -> Vec<R16> {
        (0..HEIGHT)
            .flat_map(|y| (0..HEMISPHERE_WIDTH).map(move |x| R16::new(id_at(x + offset, y))))
            .collect()
    }

    fn decoded(tiles: &WorldTiles) -> (Vec<R16>, Vec<R16>) {
        let (mut west, mut east) = (Vec::new(), Vec::new());
        tiles
            .for_each_band(|rows| {
                west.extend_from_slice(rows.west());
                east.extend_from_slice(rows.east());
            })
            .unwrap();
        (west, east)
    }

    /// Every pixel decodes to its location, for tiles of every bit width, a
    /// world whose size is not a multiple of the tile, and bands that
    /// split tile rows, match them, and span them
    #[test]
    fn tiles_round_trip() {
        let (west, east) = (hemisphere(0), hemisphere(HEMISPHERE_WIDTH));
        let rows = WorldRows::new(0, &west, &east, HemisphereLength::new(HEMISPHERE_WIDTH));
        for band_rows in [5, 16, 33] {
            let mut builder = WorldTilesBuilder::new(HemisphereSize::new(HEMISPHERE_WIDTH, HEIGHT));
            for band in rows.bands(band_rows) {
                builder.push(band);
            }
            let tiles = builder.finish();
            assert_eq!(
                decoded(&tiles),
                (west.clone(), east.clone()),
                "bands of {band_rows}"
            );
            let words = WorldTiles::from_words(tiles.hemisphere_size(), tiles.words().to_vec());
            assert_eq!(words.as_ref(), Ok(&tiles));
        }
    }

    /// Data that does not fit the layout is refused, never read out of
    /// bounds
    #[test]
    fn broken_tiles_are_refused() {
        let (west, east) = (hemisphere(0), hemisphere(HEMISPHERE_WIDTH));
        let rows = WorldRows::new(0, &west, &east, HemisphereLength::new(HEMISPHERE_WIDTH));
        let tiles = WorldTiles::from_rows(rows);
        let size = tiles.hemisphere_size();
        let words = tiles.words().to_vec();

        let short_table = words[..3].to_vec();
        assert!(WorldTiles::from_words(size, short_table).is_err());

        let mut bad_code = words.clone();
        bad_code[0] |= 7;
        assert!(WorldTiles::from_words(size, bad_code).is_err());

        let mut block_in_table = words.clone();
        block_in_table[0] &= 7;
        assert!(WorldTiles::from_words(size, block_in_table).is_err());

        // The last tile's palette is cut short, which only decoding finds
        let truncated = words[..words.len() - 1].to_vec();
        let truncated = WorldTiles::from_words(size, truncated).unwrap();
        assert!(truncated.for_each_band(|_| {}).is_err());
    }
}
