// Resolve pass: find the location index under each output pixel.
//
// This pass owns all of the map geometry: the view rectangle, horizontal
// wraparound, and the west/east hemisphere split. It writes one location
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

    // Guard band in physical pixels around the output
    guard_band: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var west_input_texture: texture_2d<u32>;
@group(0) @binding(1) var east_input_texture: texture_2d<u32>;
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
    let wrapped_x = wrap_x_coordinate(global_x);
    let clamped_y = clamp(global_y, 0, i32(uniforms.tile_height) - 1);
    if (wrapped_x < i32(uniforms.tile_width)) {
        let coord = vec2<i32>(wrapped_x, clamped_y);
        return textureLoad(west_input_texture, coord, 0).r;
    } else {
        let coord = vec2<i32>(wrapped_x - i32(uniforms.tile_width), clamped_y);
        return textureLoad(east_input_texture, coord, 0).r;
    }
}

// Location index for a fractional world coordinate. A scaling rule that
// uses the sub-pixel position would replace the body of this function.
fn resolve(world: vec2<f32>) -> u32 {
    let c = vec2<i32>(floor(world));
    return id_at(c.x, c.y);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) u32 {
    let surface = vec2<f32>(f32(uniforms.surface_width), f32(uniforms.surface_height));
    // Fragment position relative to the output, which the guard band
    // shifts. Fragments in the band fall outside the output.
    let output = floor(in.position.xy) - f32(uniforms.guard_band);

    let view_origin = vec2<f32>(f32(uniforms.view_x), f32(uniforms.view_y));
    let view_size = vec2<f32>(f32(uniforms.view_width), f32(uniforms.view_height));
    let world = output / surface * view_size + view_origin;

    return resolve(world);
}
