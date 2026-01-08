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

struct ComputeUniforms {
    tile_width: u32,
    tile_height: u32,
    enable_location_borders: u32,
    enable_owner_borders: u32,

    view_x: u32,
    view_y: u32,
    view_width: u32,
    view_height: u32,

    zoom_level: f32,
    surface_width: u32,
    surface_height: u32,
}


@group(0) @binding(0) var west_input_texture: texture_2d<u32>;
@group(0) @binding(1) var east_input_texture: texture_2d<u32>;
@group(0) @binding(2) var<uniform> uniforms: ComputeUniforms;
@group(0) @binding(3) var<storage, read> location_primary_colors: array<u32>;
@group(0) @binding(4) var<storage, read> location_states: array<u32>;
@group(0) @binding(5) var<storage, read> location_owner_colors: array<u32>;
@group(0) @binding(6) var<storage, read> location_secondary_colors: array<u32>;

const STATE_NO_LOCATION_BORDERS = 1u; // Bit 0: opt out of location border drawing
const STATE_HIGHLIGHTED = 2u; // Bit 1: location is highlighted (hover effect)

// Wrap x coordinate to handle world wraparound
fn wrap_x_coordinate(x: i32) -> i32 {
    let world_width = i32(uniforms.tile_width * 2u);
    let wrapped = x % world_width;
    if (wrapped < 0) {
        return wrapped + world_width;
    }
    return wrapped;
}

// Unpack u32 value to RGB color
fn unpack_color(value: u32) -> vec3<f32> {
    let r = f32((value >> 16u) & 0xFFu) / 255.0;
    let g = f32((value >> 8u) & 0xFFu) / 255.0;
    let b = f32(value & 0xFFu) / 255.0;
    return vec3<f32>(r, g, b);
}

fn get_primary_color_by_index(location_idx: u32) -> u32 {
    return location_primary_colors[location_idx];
}

fn get_owner_color_by_index(location_idx: u32) -> u32 {
    return location_owner_colors[location_idx];
}

fn get_secondary_color_by_index(location_idx: u32) -> u32 {
    return location_secondary_colors[location_idx];
}

fn get_state_flags_by_index(location_idx: u32) -> u32 {
    return location_states[location_idx];
}

// Get location index for a pixel at global coordinates (direct read from R16 texture)
fn get_location_index_at(global_x: i32, global_y: i32) -> u32 {
    // Wrap x coordinate for horizontal world wraparound
    let wrapped_x = wrap_x_coordinate(global_x);
    if (wrapped_x < i32(uniforms.tile_width)) {
        // West texture
        let coord = vec2<i32>(wrapped_x, global_y);
        return textureLoad(west_input_texture, coord, 0).r;
    } else {
        // East texture
        let coord = vec2<i32>(wrapped_x - i32(uniforms.tile_width), global_y);
        return textureLoad(east_input_texture, coord, 0).r;
    }
}

// Check if this pixel should be a location border (4-neighbor color difference)
fn is_location_border_pixel(global_x: i32, global_y: i32, center_location_idx: u32) -> bool {
    if (uniforms.enable_location_borders == 0u) {
        return false;
    }

    // Check if this location opts out of location border drawing
    let state_flags = get_state_flags_by_index(center_location_idx);
    if ((state_flags & STATE_NO_LOCATION_BORDERS) != 0u) {
        return false;
    }

    // Get stripe info for current location
    let primary_color = get_primary_color_by_index(center_location_idx);
    let secondary_color = get_secondary_color_by_index(center_location_idx);
    let has_stripes = primary_color != secondary_color && secondary_color != 0u;

    // Check if we're in secondary color zone
    var in_secondary_zone = false;
    if (has_stripes) {
        let base_frequency = 8.0;
        let stripe_frequency = max(2.0, base_frequency / uniforms.zoom_level);
        let pattern_val = (f32(global_x) + f32(global_y)) / stripe_frequency;
        let f = fract(pattern_val);
        in_secondary_zone = f > 0.5;
    }

    // Check 4 neighbors: up, down, left, right
    let neighbors = array<vec2<i32>, 4>(
        vec2<i32>(global_x, global_y - 1), // up
        vec2<i32>(global_x, global_y + 1), // down
        vec2<i32>(global_x - 1, global_y), // left
        vec2<i32>(global_x + 1, global_y)  // right
    );

    for (var i = 0; i < 4; i++) {
        let neighbor_location_idx = get_location_index_at(neighbors[i].x, neighbors[i].y);
        if (neighbor_location_idx != center_location_idx) {
            // Different location found

            // If we're in secondary zone, check if neighbor has same secondary color
            if (in_secondary_zone) {
                let neighbor_secondary = get_secondary_color_by_index(neighbor_location_idx);
                if (neighbor_secondary == secondary_color) {
                    continue; // Same secondary color, don't draw border here
                }
            }

            return true; // Draw border
        }
    }

    return false; // All neighbors have same location
}

// Check if this pixel should be an owner border (2-pixel thick border detection)
fn is_owner_border_pixel(global_x: i32, global_y: i32, center_location_idx: u32, center_owner_color: u32) -> bool {
    if (uniforms.enable_owner_borders == 0u) {
        return false;
    }

    // Define a 12-point diamond pattern (skipping corners of the 5x5)
    let offsets = array<vec2<i32>, 12>(
        vec2<i32>( 0, -1), vec2<i32>( 0,  1), vec2<i32>(-1,  0), vec2<i32>( 1,  0), // Cross 1
        vec2<i32>( 0, -2), vec2<i32>( 0,  2), vec2<i32>(-2,  0), vec2<i32>( 2,  0), // Cross 2
        vec2<i32>(-1, -1), vec2<i32>( 1, -1), vec2<i32>(-1,  1), vec2<i32>( 1,  1)  // Inner Diagonals
    );

    for (var i = 0; i < 12; i++) {
        let neighbor_x = global_x + offsets[i].x;
        let neighbor_y = global_y + offsets[i].y;
        
        let neighbor_location_idx = get_location_index_at(neighbor_x, neighbor_y);
        let neighbor_value = get_owner_color_by_index(neighbor_location_idx);

        if (neighbor_value != center_owner_color) {
            return true;
        }
    }

    return false;
}

// Create a crisp, anti-aliased stripe pattern
fn create_stripe_pattern(global_x: i32, global_y: i32, primary_color: u32, secondary_color: u32) -> vec4<f32> {
    // 1. Calculate a continuous, floating-point value for the pattern
    let base_frequency = 8.0;
    let stripe_frequency = max(2.0, base_frequency / uniforms.zoom_level);
    let pattern_val = (f32(global_x) + f32(global_y)) / stripe_frequency;

    // 2. Calculate the pattern's change across one pixel (our analytical fwidth)
    let width = 2.0 / stripe_frequency;
    let half_width = width / 2.0;

    // 3. Get the fractional part to create repeating bands.
    let f = fract(pattern_val);

    // 4. Use smoothstep with a more precise range for a sharper transition.
    // The blend now happens exactly centered around the 0.5 mark.
    let blend_factor = smoothstep(0.5 - half_width, 0.5 + half_width, f);

    // 5. Unpack and mix the colors
    let primary_rgb = unpack_color(primary_color);
    let secondary_rgb = unpack_color(secondary_color);
    let mixed_rgb = mix(primary_rgb, secondary_rgb, blend_factor);

    return vec4<f32>(mixed_rgb, 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Calculate canvas coordinates from fragment position
    let canvas_x = u32(in.position.x);
    let canvas_y = u32(in.position.y);

    let safe_x = min(u32(in.position.x), uniforms.surface_width - 1u);
    let safe_y = min(u32(in.position.y), uniforms.surface_height - 1u);

    let world_x_float = (f32(safe_x) / f32(uniforms.surface_width)) * f32(uniforms.view_width);
    let world_y_float = (f32(safe_y) / f32(uniforms.surface_height)) * f32(uniforms.view_height);

    // Calculate global coordinates by adding viewport offset
    let global_x = i32(floor(world_x_float + f32(uniforms.view_x)));
    let global_y = i32(floor(world_y_float + f32(uniforms.view_y)));

    // Get location index directly from R16 texture
    let location_idx = get_location_index_at(global_x, global_y);

    // Check if this location is highlighted
    let state_flags = get_state_flags_by_index(location_idx);
    let is_highlighted = (state_flags & STATE_HIGHLIGHTED) != 0u;

    // Check for different types of borders (owner borders take precedence)
    let center_owner_color = get_owner_color_by_index(location_idx);
    let is_owner_border = is_owner_border_pixel(global_x, global_y, location_idx, center_owner_color);
    let is_location_border = is_location_border_pixel(global_x, global_y, location_idx);

    var output_color: vec4<f32>;
    if (is_owner_border) {
        // Owner border: darken the current pixel by 30%
        let mapped_value = get_owner_color_by_index(location_idx);
        let mapped_rgb = unpack_color(mapped_value);
        output_color = vec4<f32>(mapped_rgb.r * 0.7, mapped_rgb.g * 0.7, mapped_rgb.b * 0.7, 1.0);
    } else if (is_location_border) {
        // Location border: darken the looked-up color
        let mapped_value = get_primary_color_by_index(location_idx);
        let mapped_rgb = unpack_color(mapped_value);
        // Darken by reducing brightness
        output_color = vec4<f32>(
            max(0.0, mapped_rgb.r - 0.08),
            max(0.0, mapped_rgb.g - 0.08),
            max(0.0, mapped_rgb.b - 0.08),
            1.0
        );
    } else {
        // Normal pixel: check for stripes or use primary color
        let primary_color = get_primary_color_by_index(location_idx);
        let secondary_color = get_secondary_color_by_index(location_idx);

        if (primary_color != secondary_color && secondary_color != 0u) {
            // Primary and secondary colors differ - create stripe pattern
            output_color = create_stripe_pattern(global_x, global_y, primary_color, secondary_color);
        } else {
            // Use primary color only
            let mapped_rgb = unpack_color(primary_color);
            output_color = vec4<f32>(mapped_rgb.r, mapped_rgb.g, mapped_rgb.b, 1.0);
        }

        // Apply highlighting effect if location is highlighted
        if (is_highlighted) {
            // Lighten the color by blending with white
            output_color = vec4<f32>(
                min(1.0, output_color.r + 0.25),
                min(1.0, output_color.g + 0.25),
                min(1.0, output_color.b + 0.25),
                1.0
            );
        }
    }

    // Return color directly to render target
    return output_color;
}
