//! Headless render tests. These tests need a GPU adapter (lavapipe is
//! sufficient) and skip when none is available.

use pdx_map::{
    GpuColor, GpuContext, HeadlessMapRenderer, LocationArrays, LocationFlags, LocationId,
    PhysicalSize, R16, Rect, ViewportBounds, WorldPoint, WorldRect, WorldSize,
};

const HEMI_W: u32 = 32;
const HEMI_H: u32 = 24;
const LOCATIONS: usize = 4;

/// Location index for a world pixel of the synthetic map.
///
/// Layout (world is 64x24):
/// - Location 0: x in 2..32, except the top-left corner block.
/// - Location 1: x in 32..62.
/// - Location 2: top-left corner block, x in 2..8 and y in 0..6. Touches
///   the top map edge.
/// - Location 3: a 4-pixel-wide vertical strip across the wrap seam,
///   x in 62..64 and 0..2.
fn synthetic_id(x: u32, y: u32) -> u16 {
    if !(2..62).contains(&x) {
        return 3;
    }
    if x < 8 && y < 6 {
        return 2;
    }
    if x < 32 { 0 } else { 1 }
}

fn hemisphere(offset_x: u32) -> Vec<R16> {
    (0..HEMI_H)
        .flat_map(|y| (0..HEMI_W).map(move |x| R16::new(synthetic_id(x + offset_x, y))))
        .collect()
}

fn palette() -> [GpuColor; LOCATIONS] {
    [
        GpuColor::from_rgb(200, 40, 40),
        GpuColor::from_rgb(40, 200, 40),
        GpuColor::from_rgb(40, 40, 200),
        GpuColor::from_rgb(200, 200, 40),
    ]
}

fn location_arrays() -> LocationArrays {
    let ids: Vec<LocationId> = (0..LOCATIONS as u32).map(LocationId::new).collect();
    let mut arrays = LocationArrays::from_locations(&ids);
    let colors = palette();
    arrays.set_primary_colors(&colors);
    arrays.set_secondary_colors(&colors);
    // Locations 0 and 1 share an owner so the diagonal is a location border
    // only. Locations 2 and 3 have their own owners.
    arrays.set_owner_colors(&[colors[0], colors[0], colors[2], colors[3]]);
    arrays.set_flags(&[LocationFlags::empty(); LOCATIONS]);
    arrays
}

struct Frame {
    width: u32,
    rgba: Vec<u8>,
}

impl Frame {
    fn px(&self, x: u32, y: u32) -> [u8; 3] {
        let i = ((y * self.width + x) * 4) as usize;
        [self.rgba[i], self.rgba[i + 1], self.rgba[i + 2]]
    }

    #[track_caller]
    fn assert_px(&self, x: u32, y: u32, expected: [u8; 3], what: &str) {
        let actual = self.px(x, y);
        let close = actual.iter().zip(expected).all(|(a, e)| a.abs_diff(e) <= 2);
        assert!(
            close,
            "({x}, {y}) {what}: expected {expected:?}, got {actual:?}"
        );
    }
}

const RED: [u8; 3] = [200, 40, 40];
const GREEN: [u8; 3] = [40, 200, 40];
const BLUE: [u8; 3] = [40, 40, 200];
const YELLOW: [u8; 3] = [200, 200, 40];

/// Location border: the fill darkened by 0.08
fn location_border(fill: [u8; 3]) -> [u8; 3] {
    fill.map(|c| c.saturating_sub(20))
}

/// Owner border: the owner color scaled by 0.7
fn owner_border(owner: [u8; 3]) -> [u8; 3] {
    owner.map(|c| (c as f32 * 0.7).round() as u8)
}

async fn render(
    surface: PhysicalSize<u32>,
    rect: WorldRect<u32>,
    location_borders: bool,
    owner_borders: bool,
) -> Option<Frame> {
    render_scaled(surface, rect, location_borders, owner_borders, 1.0).await
}

async fn render_scaled(
    surface: PhysicalSize<u32>,
    rect: WorldRect<u32>,
    location_borders: bool,
    owner_borders: bool,
    scale_factor: f32,
) -> Option<Frame> {
    let gpu = GpuContext::new().await.ok()?;
    let size = PhysicalSize::new(HEMI_W, HEMI_H);
    let west = gpu.create_texture(&hemisphere(0), size, "West");
    let east = gpu.create_texture(&hemisphere(HEMI_W), size, "East");
    let mut renderer =
        HeadlessMapRenderer::new(gpu, west, east, surface.width, surface.height).unwrap();
    renderer.update_locations(&location_arrays());
    renderer.set_location_borders(location_borders);
    renderer.set_owner_borders(owner_borders);
    renderer.set_scale_factor(scale_factor);

    let bounds = ViewportBounds {
        rect,
        zoom_level: 1.0,
    };
    let buffer = renderer.capture_viewport(bounds).await.unwrap();
    let rgba: Vec<u8> = buffer.rows().flat_map(|r| r.iter().copied()).collect();
    buffer.finish();
    Some(Frame {
        width: surface.width,
        rgba,
    })
}

fn block_on<T>(fut: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .build()
        .unwrap()
        .block_on(fut)
}

fn full_world() -> WorldRect<u32> {
    Rect::new(WorldPoint::new(0, 0), WorldSize::new(HEMI_W * 2, HEMI_H))
}

macro_rules! frame_or_skip {
    ($e:expr) => {
        match block_on($e) {
            Some(frame) => frame,
            None => {
                eprintln!("no GPU adapter, skipping");
                return;
            }
        }
    };
}

#[test]
fn zoom_one_borders_match_world_pixels() {
    let frame = frame_or_skip!(render(
        PhysicalSize::new(HEMI_W * 2, HEMI_H),
        full_world(),
        true,
        true,
    ));

    // Location border between 0 and 1 is one pixel on each side
    frame.assert_px(30, 12, RED, "red fill");
    frame.assert_px(31, 12, location_border(RED), "red location border");
    frame.assert_px(32, 12, location_border(GREEN), "green location border");
    frame.assert_px(33, 12, GREEN, "green fill");

    // Owner border around the corner block is two pixels on each side
    frame.assert_px(2, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(3, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(4, 2, BLUE, "blue fill");
    frame.assert_px(5, 2, BLUE, "blue fill");
    frame.assert_px(6, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(7, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(8, 2, owner_border(RED), "red owner border");
    frame.assert_px(9, 2, owner_border(RED), "red owner border");
    frame.assert_px(10, 2, RED, "red fill");
}

#[test]
fn screen_edges_are_not_borders() {
    let frame = frame_or_skip!(render(
        PhysicalSize::new(HEMI_W * 2, HEMI_H),
        full_world(),
        true,
        true,
    ));

    // Top and bottom map rows are plain fill, not borders against the
    // out-of-bounds texels above and below the map.
    frame.assert_px(48, 0, GREEN, "green fill at top edge");
    frame.assert_px(48, HEMI_H - 1, GREEN, "green fill at bottom edge");
    frame.assert_px(4, 0, BLUE, "blue fill at top edge");
    frame.assert_px(16, 0, RED, "red fill at top edge");
}

#[test]
fn view_wraps_around_the_world() {
    // View starts at world x 48 and spans 32 pixels, so screen x 16 is
    // world x 64, which wraps to 0.
    let rect = Rect::new(WorldPoint::new(48, 0), WorldSize::new(32, HEMI_H));
    let frame = frame_or_skip!(render(PhysicalSize::new(32, HEMI_H), rect, false, false));

    frame.assert_px(13, 12, GREEN, "world x 61");
    frame.assert_px(14, 12, YELLOW, "world x 62");
    frame.assert_px(15, 12, YELLOW, "world x 63");
    frame.assert_px(16, 12, YELLOW, "world x 0");
    frame.assert_px(17, 12, YELLOW, "world x 1");
    frame.assert_px(18, 12, RED, "world x 2");
}

#[test]
fn borders_continue_across_tile_seams() {
    // Each hemisphere rendered as its own tile, as screenshots do. The
    // location boundary at world x 32 is the seam, and the owner strip at
    // world x 62..2 straddles the wrap.
    let west = Rect::new(WorldPoint::new(0, 0), WorldSize::new(HEMI_W, HEMI_H));
    let west = frame_or_skip!(render(PhysicalSize::new(HEMI_W, HEMI_H), west, true, true));
    west.assert_px(30, 12, RED, "red fill");
    west.assert_px(31, 12, location_border(RED), "red location border at seam");
    west.assert_px(0, 12, owner_border(YELLOW), "yellow owner border at wrap");
    west.assert_px(1, 12, owner_border(YELLOW), "yellow owner border at wrap");

    let east = Rect::new(WorldPoint::new(HEMI_W, 0), WorldSize::new(HEMI_W, HEMI_H));
    let east = frame_or_skip!(render(PhysicalSize::new(HEMI_W, HEMI_H), east, true, true));
    east.assert_px(
        0,
        12,
        location_border(GREEN),
        "green location border at seam",
    );
    east.assert_px(1, 12, GREEN, "green fill");
    // Yellow strip: x 30..32 of the east tile. Owner border reaches two
    // pixels from green on the left, and from red across the wrap on the
    // right, so the whole strip is border. Green shares red's owner.
    east.assert_px(29, 12, owner_border(RED), "owner border on green");
    east.assert_px(30, 12, owner_border(YELLOW), "yellow owner border");
    east.assert_px(
        31,
        12,
        owner_border(YELLOW),
        "yellow owner border across wrap",
    );
}

#[test]
fn borders_scale_with_the_display_scale_factor() {
    // Twice the physical pixels at the same logical size is a 2x display
    let frame = frame_or_skip!(render_scaled(
        PhysicalSize::new(HEMI_W * 4, HEMI_H * 2),
        full_world(),
        true,
        true,
        2.0,
    ));

    // Location border is one logical pixel: two physical pixels each side
    frame.assert_px(61, 24, RED, "red fill");
    frame.assert_px(62, 24, location_border(RED), "red location border");
    frame.assert_px(63, 24, location_border(RED), "red location border");
    frame.assert_px(64, 24, location_border(GREEN), "green location border");
    frame.assert_px(65, 24, location_border(GREEN), "green location border");
    frame.assert_px(66, 24, GREEN, "green fill");

    // Owner border is two logical pixels: four physical pixels each side.
    // The corner block spans world x 2..8, so physical x 4..16.
    frame.assert_px(7, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(8, 4, BLUE, "blue fill");
    frame.assert_px(11, 4, BLUE, "blue fill");
    frame.assert_px(12, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(15, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(16, 4, owner_border(RED), "red owner border");
    frame.assert_px(19, 4, owner_border(RED), "red owner border");
    frame.assert_px(20, 4, RED, "red fill");
}

#[test]
fn borders_keep_their_width_when_zoomed_out() {
    // Half the physical pixels: two world pixels per screen pixel
    let frame = frame_or_skip!(render(
        PhysicalSize::new(HEMI_W, HEMI_H / 2),
        full_world(),
        true,
        true,
    ));

    // Location border stays one pixel
    frame.assert_px(14, 6, RED, "red fill");
    frame.assert_px(15, 6, location_border(RED), "red location border");
    frame.assert_px(16, 6, location_border(GREEN), "green location border");
    frame.assert_px(17, 6, GREEN, "green fill");

    // Owner border shrinks with the map to one pixel. The corner block is
    // world x 2..8, so screen x 1..4.
    frame.assert_px(0, 1, owner_border(YELLOW), "yellow owner border");
    frame.assert_px(1, 1, owner_border(BLUE), "blue owner border");
    frame.assert_px(2, 1, BLUE, "blue fill");
    frame.assert_px(3, 1, owner_border(BLUE), "blue owner border");
    frame.assert_px(4, 1, owner_border(RED), "red owner border");
    frame.assert_px(5, 1, RED, "red fill");
}
