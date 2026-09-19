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
    // Width in physical pixels of the light band inside an owner border
    owner_glow_radius: u32,

    // Strength of the owner border, coast, and impassable edge darkening,
    // 0 to 1. Eases off when zoomed out.
    edge_strength: f32,
    // Strength of the location border darkening, 0 to 1. Eases off faster
    // than `edge_strength`: zoomed out, the location grid is texture.
    location_edge_strength: f32,
    _pad0: u32,
    _pad1: u32,
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
const STATE_WATER = 32u; // Bit 5: location is water, so its edge with land is a coast
const STATE_IMPASSABLE = 64u; // Bit 6: location is impassable terrain, which no one owns
const STATE_UNOWNED = 128u; // Bit 7: location is land that no country owns
const STATE_LAKE = 256u; // Bit 8: location is a lake, which has no coast

// Lightness offsets in Oklab. Oklab lightness is perceptual, so the same
// offset reads the same on a navy fill and on a cream fill.
const LOCATION_BORDER_DARKEN = 0.07;
const OWNER_BORDER_DARKEN = 0.28;
const OWNER_GLOW_LIGHTEN = 0.05;
const COAST_DARKEN = 0.14;
const SHALLOWS_LIGHTEN = 0.05;
const IMPASSABLE_EDGE_DARKEN = 0.10;

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

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((c + 0.055) / 1.055, vec3<f32>(2.4));
    return select(lo, hi, c > vec3<f32>(0.04045));
}

fn linear_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let v = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    let lo = v * 12.92;
    let hi = 1.055 * pow(v, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(lo, hi, v > vec3<f32>(0.0031308));
}

// sRGB to Oklab (L, a, b). See https://bottosson.github.io/posts/oklab/
fn srgb_to_oklab(c: vec3<f32>) -> vec3<f32> {
    let rgb = srgb_to_linear(c);
    let l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
    let m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
    let s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;
    let l_ = pow(max(l, 0.0), 1.0 / 3.0);
    let m_ = pow(max(m, 0.0), 1.0 / 3.0);
    let s_ = pow(max(s, 0.0), 1.0 / 3.0);
    return vec3<f32>(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    );
}

fn oklab_to_srgb(lab: vec3<f32>) -> vec3<f32> {
    let l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    let m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    let s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
    let l = l_ * l_ * l_;
    let m = m_ * m_ * m_;
    let s = s_ * s_ * s_;
    let rgb = vec3<f32>(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    );
    return linear_to_srgb(rgb);
}

// Shift the perceptual lightness of a color. A positive delta lightens.
fn shift_lightness(c: vec3<f32>, delta: f32) -> vec3<f32> {
    var lab = srgb_to_oklab(c);
    lab.x = clamp(lab.x + delta, 0.0, 1.0);
    return oklab_to_srgb(lab);
}

// Lighten a color for a rim or a band. A fill near white has no room to
// get lighter, so the part of the delta that lightness cannot absorb is
// spent on chroma instead: a cream fill takes a paler rim rather than
// none at all. Fills with room take a plain lightness shift.
fn lighten(c: vec3<f32>, delta: f32) -> vec3<f32> {
    var lab = srgb_to_oklab(c);
    let headroom = max(1.0 - lab.x, 0.0);
    let shortfall = max(delta - headroom, 0.0);
    lab.x = min(lab.x + delta, 1.0);
    let chroma_scale = 1.0 - shortfall / delta;
    lab.y *= chroma_scale;
    lab.z *= chroma_scale;
    return oklab_to_srgb(lab);
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

// Terrain class of a location. Only owned land has a political border.
// Water, lakes, impassable terrain, and unowned land have no owner, so
// their own edges are not political borders, but a country that meets
// unowned land still has a frontier there. A lake is its own class so
// that it keeps an edge against impassable terrain, but it is not water:
// its shore is not a coast.
const TERRAIN_LAND = 0u;
const TERRAIN_WATER = 1u;
const TERRAIN_IMPASSABLE = 2u;
const TERRAIN_UNOWNED = 3u;
const TERRAIN_LAKE = 4u;

fn terrain_class(state_flags: u32) -> u32 {
    if ((state_flags & STATE_LAKE) != 0u) {
        return TERRAIN_LAKE;
    }
    if ((state_flags & STATE_WATER) != 0u) {
        return TERRAIN_WATER;
    }
    if ((state_flags & STATE_IMPASSABLE) != 0u) {
        return TERRAIN_IMPASSABLE;
    }
    if ((state_flags & STATE_UNOWNED) != 0u) {
        return TERRAIN_UNOWNED;
    }
    return TERRAIN_LAND;
}

// Distances in L1 (diamond) pixels from `p` to the nearest pixel of a
// different owner, to the nearest coast, and to the nearest edge of
// another terrain class, each capped at `max_r + 1` when none is within
// reach. Only owned land has an owner, and its frontier with unowned land
// counts as an owner edge. A coast is an edge between water and anything
// else. `terrain` is any edge between terrain classes, so it includes
// coasts and the edges of impassable and unowned land. Impassable terrain
// or a lake that shows the color of the country around it has no terrain
// edge against that country: it is filled so that it merges with the
// country, and an outline would undo that.
struct EdgeDistances {
    owner: i32,
    coast: i32,
    terrain: i32,
}

fn edge_distances(p: vec2<i32>, center_location_idx: u32, center_primary_color: u32, center_owner_color: u32, center_terrain: u32, max_r: i32) -> EdgeDistances {
    var result = EdgeDistances(max_r + 1, max_r + 1, max_r + 1);
    // Unowned land draws no edge from this scan, so skip it
    if (uniforms.enable_owner_borders == 0u || center_terrain == TERRAIN_UNOWNED) {
        return result;
    }

    // Scan ring by ring so a pixel on a border stops at the first ring.
    for (var d = 1; d <= max_r; d++) {
        for (var dy = -d; dy <= d; dy++) {
            let span = d - abs(dy);
            // Only the two points on the ring for this row
            for (var side = 0; side < 2; side++) {
                let dx = select(-span, span, side == 1);
                if (side == 1 && span == 0) {
                    continue;
                }
                let neighbor_location_idx = resolved_id(p + vec2<i32>(dx, dy));
                if (neighbor_location_idx == center_location_idx) {
                    continue;
                }
                let neighbor_terrain = terrain_class(get_state_flags_by_index(neighbor_location_idx));
                if (neighbor_terrain != center_terrain) {
                    let filled = (center_terrain == TERRAIN_IMPASSABLE || center_terrain == TERRAIN_LAKE)
                        && get_primary_color_by_index(neighbor_location_idx) == center_primary_color;
                    if (!filled) {
                        result.terrain = min(result.terrain, d);
                    }
                    if (neighbor_terrain == TERRAIN_WATER || center_terrain == TERRAIN_WATER) {
                        result.coast = min(result.coast, d);
                    }
                    if (center_terrain == TERRAIN_LAND && neighbor_terrain == TERRAIN_UNOWNED) {
                        result.owner = min(result.owner, d);
                    }
                } else if (center_terrain == TERRAIN_LAND) {
                    let neighbor_value = get_owner_color_by_index(neighbor_location_idx);
                    if (neighbor_value != center_owner_color) {
                        result.owner = min(result.owner, d);
                    }
                }
            }
        }
        // Stop at the first ring that decides this pixel's edge: the owner
        // edge on land, the coast on water, and any edge on a lake or on
        // impassable terrain. A closer coast cannot change a land pixel
        // that already has its owner edge, because the band takes the
        // nearer of the two.
        var found = result.terrain <= d;
        if (center_terrain == TERRAIN_LAND) {
            found = result.owner <= d;
        } else if (center_terrain == TERRAIN_WATER) {
            found = result.coast <= d;
        }
        if (found) {
            break;
        }
    }

    return result;
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

    let center_terrain = terrain_class(state_flags);
    let center_owner_color = get_owner_color_by_index(location_idx);
    let owner_r = i32(uniforms.owner_border_radius);
    let glow_r = i32(uniforms.owner_glow_radius);
    let edges = edge_distances(screen, location_idx, primary_color, center_owner_color, center_terrain, owner_r + glow_r);
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

    // Edge treatment, outermost first. An owner border is a dark line on
    // both sides of the boundary with a light band inside each country. A
    // coast is a dark line and a band of shallows on the water side only,
    // so the land keeps its light rim and coasts read thinner than
    // political borders. Impassable terrain and lakes get a soft edge of
    // their own and give their neighbors no rim, so wasteland does not
    // shout and a lake does not read as a sea. Terrain filled with its
    // country's color has no such edge, only its location borders, so it
    // fades into the country with the rest of the grid.
    // Unowned land draws only its location borders: it is not a country.
    var rgb = fill_color.rgb;
    if (is_focused && is_location_border) {
        // Focused border: bright white outline to distinguish the focused tile
        rgb = vec3<f32>(1.0, 1.0, 1.0);
    } else if (center_terrain == TERRAIN_WATER) {
        if (edges.coast <= owner_r) {
            rgb = shift_lightness(rgb, -COAST_DARKEN * uniforms.edge_strength);
        } else if (edges.coast <= owner_r + glow_r) {
            rgb = lighten(rgb, SHALLOWS_LIGHTEN);
        }
    } else if (center_terrain == TERRAIN_IMPASSABLE || center_terrain == TERRAIN_LAKE) {
        if (edges.terrain <= owner_r) {
            rgb = shift_lightness(rgb, -IMPASSABLE_EDGE_DARKEN * uniforms.edge_strength);
        } else if (is_location_border) {
            rgb = shift_lightness(rgb, -LOCATION_BORDER_DARKEN * uniforms.location_edge_strength);
        }
    } else if (center_terrain == TERRAIN_UNOWNED) {
        if (is_location_border) {
            rgb = shift_lightness(rgb, -LOCATION_BORDER_DARKEN * uniforms.location_edge_strength);
        }
    } else if (edges.owner <= owner_r) {
        rgb = shift_lightness(unpack_color(center_owner_color), -OWNER_BORDER_DARKEN * uniforms.edge_strength);
    } else {
        if (min(edges.owner, edges.coast) <= owner_r + glow_r) {
            rgb = lighten(rgb, OWNER_GLOW_LIGHTEN);
        }
        if (is_location_border) {
            rgb = shift_lightness(rgb, -LOCATION_BORDER_DARKEN * uniforms.location_edge_strength);
        }
    }
    let output_color = vec4<f32>(rgb, fill_color.a);

    // Return color directly to render target
    return output_color;
}
