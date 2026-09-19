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

fn location_arrays(flags: [LocationFlags; LOCATIONS]) -> LocationArrays {
    let ids: Vec<LocationId> = (0..LOCATIONS as u32).map(LocationId::new).collect();
    let mut arrays = LocationArrays::from_locations(&ids);
    let colors = palette();
    arrays.set_primary_colors(&colors);
    arrays.set_secondary_colors(&colors);
    // Locations 0 and 1 share an owner so the diagonal is a location border
    // only. Locations 2 and 3 have their own owners.
    arrays.set_owner_colors(&[colors[0], colors[0], colors[2], colors[3]]);
    arrays.set_flags(&flags);
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
        let close = actual.iter().zip(expected).all(|(a, e)| a.abs_diff(e) <= 3);
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

fn srgb_to_linear(c: f64) -> f64 {
    if c > 0.04045 {
        ((c + 0.055) / 1.055).powf(2.4)
    } else {
        c / 12.92
    }
}

fn linear_to_srgb(c: f64) -> f64 {
    let c = c.clamp(0.0, 1.0);
    if c > 0.0031308 {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    } else {
        c * 12.92
    }
}

/// Shift the Oklab lightness of a color, the way the shade pass does.
fn shift_lightness(rgb: [u8; 3], delta: f64) -> [u8; 3] {
    let [r, g, b] = rgb.map(|c| srgb_to_linear(c as f64 / 255.0));
    let l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b).cbrt();
    let m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b).cbrt();
    let s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b).cbrt();
    let lab_l = (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s + delta).clamp(0.0, 1.0);
    let lab_a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    let lab_b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    let l = (lab_l + 0.3963377774 * lab_a + 0.2158037573 * lab_b).powi(3);
    let m = (lab_l - 0.1055613458 * lab_a - 0.0638541728 * lab_b).powi(3);
    let s = (lab_l - 0.0894841775 * lab_a - 1.2914855480 * lab_b).powi(3);
    [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ]
    .map(|c| (linear_to_srgb(c) * 255.0).round() as u8)
}

/// Lighten a color the way the shade pass does for a rim or a band: the
/// part of the delta that lightness cannot absorb is spent on chroma.
fn lighten(rgb: [u8; 3], delta: f64) -> [u8; 3] {
    let [r, g, b] = rgb.map(|c| srgb_to_linear(c as f64 / 255.0));
    let l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b).cbrt();
    let m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b).cbrt();
    let s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b).cbrt();
    let lab_l = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    let shortfall = (delta - (1.0 - lab_l)).max(0.0);
    let chroma_scale = 1.0 - shortfall / delta;
    let lab_l = (lab_l + delta).min(1.0);
    let lab_a = (1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s) * chroma_scale;
    let lab_b = (0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) * chroma_scale;
    let l = (lab_l + 0.3963377774 * lab_a + 0.2158037573 * lab_b).powi(3);
    let m = (lab_l - 0.1055613458 * lab_a - 0.0638541728 * lab_b).powi(3);
    let s = (lab_l - 0.0894841775 * lab_a - 1.2914855480 * lab_b).powi(3);
    [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ]
    .map(|c| (linear_to_srgb(c) * 255.0).round() as u8)
}

/// Location border: the fill darkened a little
fn location_border(fill: [u8; 3]) -> [u8; 3] {
    shift_lightness(fill, -0.07)
}

/// Location border at half zoom, where the darkening eases to 0.65
fn location_border_zoomed_out(fill: [u8; 3]) -> [u8; 3] {
    shift_lightness(fill, -0.07 * 0.65)
}

/// Owner border: the owner color darkened a lot
fn owner_border(owner: [u8; 3]) -> [u8; 3] {
    shift_lightness(owner, -0.28)
}

/// Owner border at half zoom, where the darkening eases to 0.8
fn owner_border_zoomed_out(owner: [u8; 3]) -> [u8; 3] {
    shift_lightness(owner, -0.28 * 0.8)
}

/// The light band inside an owner border or along a coast
fn glow(fill: [u8; 3]) -> [u8; 3] {
    lighten(fill, 0.05)
}

/// Coast: the water darkened
fn coast(water: [u8; 3]) -> [u8; 3] {
    shift_lightness(water, -0.14)
}

/// Shallows: the water inside a coast lightened
fn shallows(water: [u8; 3]) -> [u8; 3] {
    lighten(water, 0.05)
}

/// The soft edge of a lake or of impassable terrain: the fill darkened a
/// little more than a location border
fn soft_edge(fill: [u8; 3]) -> [u8; 3] {
    shift_lightness(fill, -0.10)
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
    let flags = [LocationFlags::empty(); LOCATIONS];
    render_flagged(
        surface,
        rect,
        location_borders,
        owner_borders,
        scale_factor,
        flags,
    )
    .await
}

async fn render_flagged(
    surface: PhysicalSize<u32>,
    rect: WorldRect<u32>,
    location_borders: bool,
    owner_borders: bool,
    scale_factor: f32,
    flags: [LocationFlags; LOCATIONS],
) -> Option<Frame> {
    let gpu = GpuContext::new().await.ok()?;
    let size = PhysicalSize::new(HEMI_W, HEMI_H);
    let west = gpu.create_texture(&hemisphere(0), size, "West");
    let east = gpu.create_texture(&hemisphere(HEMI_W), size, "East");
    let mut renderer =
        HeadlessMapRenderer::new(gpu, west, east, surface.width, surface.height).unwrap();
    renderer.update_locations(&location_arrays(flags));
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

    // Owner border around the corner block is one pixel on each side,
    // with a two pixel light band inside. The block is six wide, so its
    // middle is all band.
    frame.assert_px(2, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(3, 2, glow(BLUE), "blue glow");
    frame.assert_px(4, 2, glow(BLUE), "blue glow");
    frame.assert_px(5, 2, glow(BLUE), "blue glow");
    frame.assert_px(6, 2, glow(BLUE), "blue glow");
    frame.assert_px(7, 2, owner_border(BLUE), "blue owner border");
    frame.assert_px(8, 2, owner_border(RED), "red owner border");
    frame.assert_px(9, 2, glow(RED), "red glow");
    frame.assert_px(10, 2, glow(RED), "red glow");
    frame.assert_px(11, 2, RED, "red fill");
}

#[test]
fn coasts_line_the_water_side() {
    // Location 1 is water. Its edge with location 0 is a coast: a dark
    // line and shallows on the water side, a light band on the land side,
    // and no owner border on either.
    let mut flags = [LocationFlags::empty(); LOCATIONS];
    flags[1] = LocationFlags::WATER;
    let frame = frame_or_skip!(render_flagged(
        PhysicalSize::new(HEMI_W * 2, HEMI_H),
        full_world(),
        true,
        true,
        1.0,
        flags,
    ));

    frame.assert_px(28, 12, RED, "red fill");
    frame.assert_px(29, 12, glow(RED), "red glow at coast");
    frame.assert_px(30, 12, glow(RED), "red glow at coast");
    frame.assert_px(
        31,
        12,
        location_border(glow(RED)),
        "red location border at coast",
    );
    frame.assert_px(32, 12, coast(GREEN), "coast");
    frame.assert_px(33, 12, shallows(GREEN), "shallows");
    frame.assert_px(34, 12, shallows(GREEN), "shallows");
    frame.assert_px(35, 12, GREEN, "water fill");
}

#[test]
fn lake_shores_are_not_coasts() {
    // Location 1 is a lake. Its edge with location 0 is drawn like the
    // edge of impassable terrain: a soft line on the lake side only, no
    // shallows, and no light band on the land side.
    let mut flags = [LocationFlags::empty(); LOCATIONS];
    flags[1] = LocationFlags::LAKE.union(LocationFlags::NO_LOCATION_BORDERS);
    let frame = frame_or_skip!(render_flagged(
        PhysicalSize::new(HEMI_W * 2, HEMI_H),
        full_world(),
        true,
        true,
        1.0,
        flags,
    ));

    frame.assert_px(29, 12, RED, "red fill, no glow at a lake");
    frame.assert_px(30, 12, RED, "red fill, no glow at a lake");
    frame.assert_px(31, 12, location_border(RED), "red location border at lake");
    frame.assert_px(32, 12, soft_edge(GREEN), "lake edge");
    frame.assert_px(33, 12, GREEN, "lake fill, no shallows");
    frame.assert_px(34, 12, GREEN, "lake fill, no shallows");
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
    frame.assert_px(4, 0, glow(BLUE), "blue glow at top edge");
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
    west.assert_px(0, 12, glow(YELLOW), "yellow glow at wrap");
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
    // Yellow strip: x 30..32 of the east tile. The owner border is one
    // pixel in from green on the left, and the light band reaches across
    // the wrap from red on the right. Green shares red's owner.
    east.assert_px(29, 12, owner_border(RED), "owner border on green");
    east.assert_px(30, 12, owner_border(YELLOW), "yellow owner border");
    east.assert_px(31, 12, glow(YELLOW), "yellow glow across wrap");
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

    // Owner border is one logical pixel: two physical pixels each side,
    // with a four physical pixel band inside. The corner block spans
    // world x 2..8, so physical x 4..16.
    frame.assert_px(4, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(5, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(6, 4, glow(BLUE), "blue glow");
    frame.assert_px(13, 4, glow(BLUE), "blue glow");
    frame.assert_px(14, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(15, 4, owner_border(BLUE), "blue owner border");
    frame.assert_px(16, 4, owner_border(RED), "red owner border");
    frame.assert_px(17, 4, owner_border(RED), "red owner border");
    frame.assert_px(18, 4, glow(RED), "red glow");
    frame.assert_px(21, 4, glow(RED), "red glow");
    frame.assert_px(22, 4, RED, "red fill");
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

    // Location border stays one pixel, and eases with the zoom
    frame.assert_px(14, 6, RED, "red fill");
    frame.assert_px(
        15,
        6,
        location_border_zoomed_out(RED),
        "red location border",
    );
    frame.assert_px(
        16,
        6,
        location_border_zoomed_out(GREEN),
        "green location border",
    );
    frame.assert_px(17, 6, GREEN, "green fill");

    // Owner border shrinks with the map to one pixel. The corner block is
    // world x 2..8, so screen x 1..4.
    frame.assert_px(0, 1, owner_border_zoomed_out(YELLOW), "yellow owner border");
    frame.assert_px(1, 1, owner_border_zoomed_out(BLUE), "blue owner border");
    frame.assert_px(2, 1, glow(BLUE), "blue glow");
    frame.assert_px(3, 1, owner_border_zoomed_out(BLUE), "blue owner border");
    frame.assert_px(4, 1, owner_border_zoomed_out(RED), "red owner border");
    frame.assert_px(5, 1, glow(RED), "red glow");
    frame.assert_px(6, 1, RED, "red fill");
}
