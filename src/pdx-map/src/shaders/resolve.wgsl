// Resolve pass: find the location index under each output pixel.
//
// This pass owns all of the map geometry: the view rectangle, horizontal
// wraparound, and the tiles that the world's location indices are
// compressed into. It writes one location
// index per output pixel to an R16Uint target that the shade pass reads
// with screen-space offsets. The target is larger than the output by a
// guard band on each side, so the shade pass can read neighbors past the
// output edge and borders continue across tile seams.

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen vertex shader. See:
// https://github.com/bevyengine/bevy/blob/ffc66f1b6485b8c7bef0436415df61aa81f9ff28/crates/bevy_core_pipeline/src/fullscreen_vertex_shader/fullscreen.wgsl
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    let uv = vec2<f32>(f32(vertex_index >> 1u), f32(vertex_index & 1u)) * 2.0;
    let clip_position = vec4<f32>(uv * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);
    return VertexOutput(clip_position, uv);
}

struct ResolveUniforms {
    tile_width: u32,
    tile_height: u32,
    view_x: u32,
    view_y: u32,

    view_width: u32,
    view_height: u32,
    surface_width: u32,
    surface_height: u32,

    // Guard band in physical pixels around the output, per axis
    guard_band_x: u32,
    guard_band_y: u32,
    _pad0: u32,
    _pad1: u32,
}

// The world's location indices in 16x16 tiles: a table of tile entries,
// then each tile's packed pixel indices and its palette. See
// `world/tiles.rs`.
@group(0) @binding(0) var<storage, read> world_tiles: array<u32>;

const TILE = 16u;
@group(0) @binding(2) var<uniform> uniforms: ResolveUniforms;

// Wrap x coordinate to handle world wraparound
fn wrap_x_coordinate(x: i32) -> i32 {
    let world_width = i32(uniforms.tile_width * 2u);
    let wrapped = x % world_width;
    if (wrapped < 0) {
        return wrapped + world_width;
    }
    return wrapped;
}

// Location index for a world pixel. X wraps around the world and y clamps
// to the map, so a read is never out of bounds.
fn id_at(global_x: i32, global_y: i32) -> u32 {
    let x = u32(wrap_x_coordinate(global_x));
    let y = u32(clamp(global_y, 0, i32(uniforms.tile_height) - 1));
    let tiles_per_row = (uniforms.tile_width * 2u + TILE - 1u) / TILE;
    let entry = world_tiles[(y / TILE) * tiles_per_row + x / TILE];
    let block = entry >> 3u;
    // Bit widths 0, 1, 2, 4, 8, 16 by code
    let bits = (1u << (entry & 7u)) >> 1u;
    let bit = ((y % TILE) * TILE + x % TILE) * bits;
    let word = world_tiles[block + bit / 32u];
    let index = (word >> (bit % 32u)) & ((1u << bits) - 1u);
    if (bits == 16u) {
        return index;
    }
    let pair = world_tiles[block + 8u * bits + index / 2u];
    return (pair >> ((index % 2u) * 16u)) & 0xFFFFu;
}

// Floor division for a positive divisor. Integer division rounds toward
// zero, which would pull the negative offsets of the guard band in by one.
fn floor_div(a: vec2<i32>, b: vec2<i32>) -> vec2<i32> {
    let q = a / b;
    let round_down = (a % b != vec2<i32>(0)) & (a < vec2<i32>(0));
    return select(q, q - vec2<i32>(1), round_down);
}

// World pixel under the top-left corner of an output pixel. The math is in
// integers, so at zoom 1 every output pixel lands on its own world pixel.
// The view splits into whole surfaces and a remainder, so that no product
// grows past the world coordinate it computes.
fn world_pixel(output: vec2<i32>) -> vec2<i32> {
    let surface = max(vec2<i32>(i32(uniforms.surface_width), i32(uniforms.surface_height)), vec2<i32>(1));
    let view_origin = vec2<i32>(i32(uniforms.view_x), i32(uniforms.view_y));
    let view_size = vec2<i32>(i32(uniforms.view_width), i32(uniforms.view_height));
    let whole = view_size / surface;
    let rest = view_size % surface;
    return output * whole + floor_div(output * rest, surface) + view_origin;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) u32 {
    // Fragment position relative to the output, which the guard band
    // shifts. Fragments in the band fall outside the output.
    let band = vec2<i32>(i32(uniforms.guard_band_x), i32(uniforms.guard_band_y));
    let output = vec2<i32>(floor(in.position.xy)) - band;
    let world = world_pixel(output);
    return id_at(world.x, world.y);
}
