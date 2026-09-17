// Shade pass: compute the color of each output pixel.
//
// This pass reads the location index texture that the resolve pass wrote,
// so every lookup is in screen space and has no knowledge of the map
// geometry. Borders and stripes are measured in logical pixels, so they
// have the same width on every display. The renderer computes the border
// radii, which shrink with the map when zoomed out.

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

struct ShadeUniforms {
    surface_width: u32,
    surface_height: u32,
    enable_location_borders: u32,
    enable_owner_borders: u32,

    interaction_mask: u32,
    // Physical pixels per logical pixel
    scale_factor: f32,
    // Screen-space offset of the stripe pattern so stripes stay anchored to
    // the world while the view pans
    stripe_phase_x: f32,
    stripe_phase_y: f32,

    // Border radii in physical pixels, at least 1
    location_border_radius: u32,
    owner_border_radius: u32,
    // Guard band in physical pixels around the output in the resolved texture
    guard_band: u32,
    _pad0: u32,
}

@group(0) @binding(0) var resolved_texture: texture_2d<u32>;
@group(0) @binding(1) var<uniform> uniforms: ShadeUniforms;
@group(0) @binding(2) var<storage, read> location_primary_colors: array<u32>;
@group(0) @binding(3) var<storage, read> location_states: array<u32>;
@group(0) @binding(4) var<storage, read> location_owner_colors: array<u32>;
@group(0) @binding(5) var<storage, read> location_secondary_colors: array<u32>;

const STATE_NO_LOCATION_BORDERS = 1u; // Bit 0: opt out of location border drawing
const STATE_HIGHLIGHTED = 2u; // Bit 1: location is highlighted (hover effect)
const STATE_FOCUSED = 4u; // Bit 2: location is the focused single tile
const STATE_DIMMED = 8u; // Bit 3: location is outside the active selection
const STATE_PREVIEW = 16u; // Bit 4: location is inside a box-select drag

// Stripe period in logical pixels
const STRIPE_WIDTH = 8.0;

const TAU = acos(-1.0) * 2.0;

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

fn is_interaction_enabled(state_flags: u32, flag: u32) -> bool {
    return (state_flags & flag) != 0u && (uniforms.interaction_mask & flag) != 0u;
}

// Location index at a screen pixel. The resolved texture extends past the
// output by the guard band, so neighbors of an edge pixel are real map
// pixels. Coordinates clamp to the texture in case a radius exceeds the
// band, so a read is never out of bounds.
fn resolved_id(p: vec2<i32>) -> u32 {
    let band = i32(uniforms.guard_band);
    let max_coord = vec2<i32>(
        i32(uniforms.surface_width) + band * 2 - 1,
        i32(uniforms.surface_height) + band * 2 - 1,
    );
    let c = clamp(p + vec2<i32>(band, band), vec2<i32>(0, 0), max_coord);
    return textureLoad(resolved_texture, c, 0).r;
}

// Check if this pixel should be a location border: a different location
// within the L1 (diamond) neighborhood of the location border radius.
fn is_location_border_pixel(p: vec2<i32>, center_location_idx: u32, in_secondary_zone: bool, secondary_color: u32) -> bool {
    if (uniforms.enable_location_borders == 0u) {
        return false;
    }

    // Check if this location opts out of location border drawing
    let state_flags = get_state_flags_by_index(center_location_idx);
    if ((state_flags & STATE_NO_LOCATION_BORDERS) != 0u) {
        return false;
    }

    let r = i32(uniforms.location_border_radius);
    for (var dy = -r; dy <= r; dy++) {
        let span = r - abs(dy);
        for (var dx = -span; dx <= span; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            let neighbor_location_idx = resolved_id(p + vec2<i32>(dx, dy));
            if (neighbor_location_idx == center_location_idx) {
                continue;
            }

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

// Check if this pixel should be an owner border: a different owner within
// the L1 (diamond) neighborhood of the owner border radius.
fn is_owner_border_pixel(p: vec2<i32>, center_location_idx: u32, center_owner_color: u32) -> bool {
    if (uniforms.enable_owner_borders == 0u) {
        return false;
    }

    let r = i32(uniforms.owner_border_radius);
    for (var dy = -r; dy <= r; dy++) {
        let span = r - abs(dy);
        for (var dx = -span; dx <= span; dx++) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            let neighbor_location_idx = resolved_id(p + vec2<i32>(dx, dy));
            // Same location, same owner: skip the buffer read
            if (neighbor_location_idx == center_location_idx) {
                continue;
            }
            let neighbor_value = get_owner_color_by_index(neighbor_location_idx);
            if (neighbor_value != center_owner_color) {
                return true;
            }
        }
    }

    return false;
}

// Screen-space stripe blend factor (consistent thickness across zoom)
fn stripe_blend_factor(screen: vec2<f32>) -> f32 {
    let stripe_px = STRIPE_WIDTH * uniforms.scale_factor;
    let phase = vec2<f32>(uniforms.stripe_phase_x, uniforms.stripe_phase_y);
    let anchored = screen + phase;
    let pattern_val = (anchored.x + anchored.y) / stripe_px;

    let wave = 0.5 + 0.5 * cos(pattern_val * TAU);
    let edge = fwidth(wave);

    return smoothstep(0.5 - edge, 0.5 + edge, wave);
}

// Create a crisp, anti-aliased stripe pattern
fn create_stripe_pattern(primary_color: u32, secondary_color: u32, blend_factor: f32) -> vec4<f32> {
    let primary_rgb = unpack_color(primary_color);
    let secondary_rgb = unpack_color(secondary_color);
    let mixed_rgb = mix(primary_rgb, secondary_rgb, blend_factor);

    return vec4<f32>(mixed_rgb, 1.0);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let surface = vec2<u32>(uniforms.surface_width, uniforms.surface_height);
    let safe = min(vec2<u32>(in.position.xy), surface - vec2<u32>(1u));
    let screen = vec2<i32>(safe);

    let location_idx = resolved_id(screen);

    // Check which interaction effects are active for this renderer.
    let state_flags = get_state_flags_by_index(location_idx);
    let is_dimmed = is_interaction_enabled(state_flags, STATE_DIMMED);
    let is_highlighted = is_interaction_enabled(state_flags, STATE_HIGHLIGHTED)
        || is_interaction_enabled(state_flags, STATE_PREVIEW);
    let is_focused = is_interaction_enabled(state_flags, STATE_FOCUSED);

    let primary_color = get_primary_color_by_index(location_idx);
    let secondary_color = get_secondary_color_by_index(location_idx);
    let has_stripes = primary_color != secondary_color && secondary_color != 0u;

    let stripe_blend = stripe_blend_factor(vec2<f32>(safe));
    let in_secondary_zone = has_stripes && stripe_blend > 0.5;

    // Check for different types of borders
    let center_owner_color = get_owner_color_by_index(location_idx);
    let is_owner_border = is_owner_border_pixel(screen, location_idx, center_owner_color);
    let is_location_border = is_location_border_pixel(screen, location_idx, in_secondary_zone, secondary_color);

    var fill_color: vec4<f32>;
    // Apply interaction effects after the domain fill is complete.
    if (has_stripes) {
        fill_color = create_stripe_pattern(primary_color, secondary_color, stripe_blend);
    } else {
        let mapped_rgb = unpack_color(primary_color);
        fill_color = vec4<f32>(mapped_rgb.r, mapped_rgb.g, mapped_rgb.b, 1.0);
    }

    if (is_dimmed) {
        fill_color = vec4<f32>(fill_color.rgb * 0.3, 1.0);
    }
    if (is_highlighted) {
        fill_color = vec4<f32>(
            min(1.0, fill_color.r + 0.25),
            min(1.0, fill_color.g + 0.25),
            min(1.0, fill_color.b + 0.25),
            1.0
        );
    }
    if (is_focused) {
        fill_color = vec4<f32>(
            min(1.0, fill_color.r + 0.35),
            min(1.0, fill_color.g + 0.35),
            min(1.0, fill_color.b + 0.35),
            1.0
        );
    }

    var output_color: vec4<f32>;
    if (is_focused && is_location_border) {
        // Focused border: bright white outline to distinguish the focused tile
        output_color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    } else if (is_owner_border) {
        // Owner border: darken the current pixel by 30%
        let mapped_value = get_owner_color_by_index(location_idx);
        let mapped_rgb = unpack_color(mapped_value);
        output_color = vec4<f32>(mapped_rgb.r * 0.7, mapped_rgb.g * 0.7, mapped_rgb.b * 0.7, 1.0);
    } else if (is_location_border) {
        // Location border: darken the final fill.
        output_color = vec4<f32>(
            max(0.0, fill_color.r - 0.08),
            max(0.0, fill_color.g - 0.08),
            max(0.0, fill_color.b - 0.08),
            fill_color.a
        );
    } else {
        output_color = fill_color;
    }

    // Return color directly to render target
    return output_color;
}
