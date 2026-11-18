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
    // Width in physical pixels of the light band inside an owner border
    owner_glow_radius: u32,
    // Strength of the owner border, coast, and impassable edge darkening,
    // 0 to 1. Eases off when zoomed out.
    edge_strength: f32,

    // Strength of the location border darkening, 0 to 1. Eases off faster
    // than `edge_strength`: zoomed out, the location grid is texture.
    location_edge_strength: f32,
    // Guard band in physical pixels around the output in the resolved
    // texture, per axis
    guard_band_x: u32,
    guard_band_y: u32,
    _pad0: u32,
}

@group(0) @binding(0) var resolved_texture: texture_2d<u32>;
@group(0) @binding(1) var<uniform> uniforms: ShadeUniforms;
@group(0) @binding(2) var<storage, read> location_primary_colors: array<u32>;
@group(0) @binding(3) var<storage, read> location_states: array<u32>;
@group(0) @binding(4) var<storage, read> location_border_colors: array<u32>;
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
const STATE_SOFTENED = 512u; // Bit 9: location is selected, but another location has the focus

// Lightness offsets in Oklab. Oklab lightness is perceptual, so the same
// offset reads the same on a navy fill and on a cream fill.
const LOCATION_BORDER_DARKEN = 0.07;
const OWNER_BORDER_DARKEN = 0.28;
const OWNER_GLOW_LIGHTEN = 0.05;
const COAST_DARKEN = 0.14;
const SHALLOWS_LIGHTEN = 0.05;
const IMPASSABLE_EDGE_DARKEN = 0.10;

// Out of the selection, land moves into a narrow band of Oklab lightness
// and keeps a trace of its hue. Then only the selection reaches the light
// and dark ends of the scale, whatever the colors of the map. The sea goes
// below the band, so land stays above water.
const DIMMED_LAND_FLOOR = 0.28;
const DIMMED_LAND_RANGE = 0.14;
const DIMMED_CHROMA = 0.32;
const DIMMED_WATER_SCALE = 0.53;
// A bright sea, such as a market color, stops below the land band, with
// room for the shallows
const DIMMED_WATER_CEILING = 0.24;
// Edges out of the selection are weaker, so the quiet land does not have
// the strongest lines on the map
const DIMMED_EDGE_SCALE = 0.5;
// Around a focused location, the selection moves this part of the way to
// the dimmed color
const SOFTENED_SHARE = 0.5;

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

// How an edge changes the lightness of a color.
//
// A plain shift of lightness. A positive delta lightens.
const TONE_SHIFT = 0u;
// A rim or a band that lightens. A fill near white has no room to get
// lighter, so the part of the delta that lightness cannot absorb is spent
// on chroma instead: a cream fill takes a paler rim rather than none at
// all. Fills with room take a plain lightness shift.
const TONE_RIM = 1u;
// A line on a fill: darker by the negative delta, or lighter when the fill
// is too dark for a darker line to show
const TONE_LINE = 2u;

// Change the lightness of an Oklab color for an edge
fn edge_tone(color: vec3<f32>, delta: f32, kind: u32) -> vec3<f32> {
    var lab = color;
    let flip = kind == TONE_LINE && lab.x < -delta;
    let headroom = max(1.0 - lab.x, 0.0);
    let shortfall = max(delta - headroom, 0.0);
    let chroma_scale = select(1.0, 1.0 - shortfall / delta, kind == TONE_RIM);
    lab.x = clamp(lab.x + select(delta, -delta, flip), 0.0, 1.0);
    lab.y *= chroma_scale;
    lab.z *= chroma_scale;
    return lab;
}

// The dimmed form of a color in Oklab
fn dim_lab(lab: vec3<f32>, is_water: bool) -> vec3<f32> {
    if (is_water) {
        let water = lab * DIMMED_WATER_SCALE;
        return vec3<f32>(min(water.x, DIMMED_WATER_CEILING), water.yz);
    }
    return vec3<f32>(DIMMED_LAND_FLOOR + lab.x * DIMMED_LAND_RANGE, lab.yz * DIMMED_CHROMA);
}

// Show the selection on an Oklab color of a location that is dimmed or
// softened: dim it out of the selection, or soften it around a focused
// location
fn selection_lab(lab: vec3<f32>, is_dimmed: bool, is_water: bool) -> vec3<f32> {
    let dimmed = dim_lab(lab, is_water);
    return select(mix(lab, dimmed, SOFTENED_SHARE), dimmed, is_dimmed);
}

// Hover brightens a color
fn highlight(c: vec3<f32>) -> vec3<f32> {
    return min(c + vec3<f32>(0.25), vec3<f32>(1.0));
}

fn get_primary_color_by_index(location_idx: u32) -> u32 {
    return location_primary_colors[location_idx];
}

fn get_border_color_by_index(location_idx: u32) -> u32 {
    return location_border_colors[location_idx];
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
    let band = vec2<i32>(i32(uniforms.guard_band_x), i32(uniforms.guard_band_y));
    let surface = vec2<i32>(i32(uniforms.surface_width), i32(uniforms.surface_height));
    let max_coord = surface + band * 2 - vec2<i32>(1, 1);
    let c = clamp(p + band, vec2<i32>(0, 0), max_coord);
    return textureLoad(resolved_texture, c, 0).r;
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

// Distance of an edge that is not within reach
const FAR = 0x7fffffff;

// What lies around a pixel. The distances are in L1 (diamond) pixels to
// the nearest pixel of a different owner, to the nearest coast, and to the
// nearest edge of another terrain class, or FAR. Only owned land has an
// owner, and its frontier with unowned land counts as an owner edge. A
// coast is an edge between water and anything else. `terrain` is any edge
// between terrain classes, so it includes coasts and the edges of
// impassable and unowned land. Impassable terrain or a lake that shows the
// color of the country around it has no terrain edge against that country:
// it is filled so that it merges with the country, and an outline would
// undo that. `location_border` is a different location within the
// location border radius.
struct Surroundings {
    owner: i32,
    coast: i32,
    terrain: i32,
    location_border: bool,
}

// The pixel whose surroundings a scan describes
struct Center {
    location_idx: u32,
    primary_color: u32,
    secondary_color: u32,
    border_color: u32,
    terrain: u32,
    in_secondary_zone: bool,
}

// Add one neighbor at distance `d` to what lies around the center. A
// neighbor of the same location adds nothing.
fn visit_neighbor(
    result: ptr<function, Surroundings>,
    center: Center,
    neighbor_location_idx: u32,
    d: i32,
    edge_reach: i32,
    location_reach: i32,
) {
    let differs = neighbor_location_idx != center.location_idx;
    if (!differs) {
        return;
    }
    // In the secondary stripe zone, a neighbor with the same stripe color
    // is not a location border
    let same_stripe = center.in_secondary_zone
        && get_secondary_color_by_index(neighbor_location_idx) == center.secondary_color;
    (*result).location_border = (*result).location_border
        || (differs && d <= location_reach && !same_stripe);

    let edge = select(FAR, d, differs && d <= edge_reach);
    let neighbor_terrain = terrain_class(get_state_flags_by_index(neighbor_location_idx));
    let terrain_differs = neighbor_terrain != center.terrain;
    let filled = (center.terrain == TERRAIN_IMPASSABLE || center.terrain == TERRAIN_LAKE)
        && get_primary_color_by_index(neighbor_location_idx) == center.primary_color;
    let coast = terrain_differs
        && (neighbor_terrain == TERRAIN_WATER || center.terrain == TERRAIN_WATER);
    let owner = center.terrain == TERRAIN_LAND && select(
        get_border_color_by_index(neighbor_location_idx) != center.border_color,
        neighbor_terrain == TERRAIN_UNOWNED,
        terrain_differs,
    );
    (*result).terrain = min((*result).terrain, select(FAR, edge, terrain_differs && !filled));
    (*result).coast = min((*result).coast, select(FAR, edge, coast));
    (*result).owner = min((*result).owner, select(FAR, edge, owner));
}

// Scan the rings around `p`, out to `edge_r` for edges and to `location_r`
// for a location border. A radius of 0 skips that search. Each texel is
// read once for both.
fn scan_surroundings(
    p: vec2<i32>,
    center: Center,
    edge_r: i32,
    location_r: i32,
) -> Surroundings {
    var result = Surroundings(FAR, FAR, FAR, false);

    // Each search stops at the ring that answers it, so a pixel on a border
    // stops early and an interior pixel reads each ring once.
    var edge_reach = edge_r;
    var location_reach = location_r;
    for (var d = 1; d <= max(edge_reach, location_reach); d++) {
        // Walk the ring from its right point, counterclockwise on screen,
        // turning at each corner
        var offset = vec2<i32>(d, 0);
        var step = vec2<i32>(-1, 1);
        for (var k = 0; k < 4 * d; k++) {
            let neighbor = resolved_id(p + offset);
            visit_neighbor(&result, center, neighbor, d, edge_reach, location_reach);
            offset += step;
            step = select(step, vec2<i32>(-step.y, step.x), offset.x == 0 || offset.y == 0);
        }
        location_reach = select(location_reach, 0, result.location_border);
        // The edge search stops at the first ring that decides this
        // pixel's edge: the owner edge on land, the coast on water, and any
        // edge on a lake or on impassable terrain. A closer coast cannot
        // change a land pixel that already has its owner edge, because the
        // band takes the nearer of the two.
        var found = result.terrain <= d;
        if (center.terrain == TERRAIN_LAND) {
            found = result.owner <= d;
        } else if (center.terrain == TERRAIN_WATER) {
            found = result.coast <= d;
        }
        edge_reach = select(edge_reach, 0, found);
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
    let is_softened = is_interaction_enabled(state_flags, STATE_SOFTENED);
    let is_highlighted = is_interaction_enabled(state_flags, STATE_HIGHLIGHTED)
        || is_interaction_enabled(state_flags, STATE_PREVIEW);
    let is_focused = is_interaction_enabled(state_flags, STATE_FOCUSED);

    let primary_color = get_primary_color_by_index(location_idx);
    let secondary_color = get_secondary_color_by_index(location_idx);
    let has_stripes = primary_color != secondary_color && secondary_color != 0u;

    let stripe_blend = stripe_blend_factor(vec2<f32>(safe));
    let in_secondary_zone = has_stripes && stripe_blend > 0.5;

    let center_terrain = terrain_class(state_flags);
    let owner_r = i32(uniforms.owner_border_radius);
    let glow_r = i32(uniforms.owner_glow_radius);
    // Unowned land draws no owner, coast or terrain edge of its own
    let draws_edges = uniforms.enable_owner_borders != 0u && center_terrain != TERRAIN_UNOWNED;
    // Water shows its location borders only as the focused outline
    let draws_location_borders = uniforms.enable_location_borders != 0u
        && (state_flags & STATE_NO_LOCATION_BORDERS) == 0u
        && (is_focused || center_terrain != TERRAIN_WATER);
    let center = Center(
        location_idx,
        primary_color,
        secondary_color,
        get_border_color_by_index(location_idx),
        center_terrain,
        in_secondary_zone,
    );
    let around = scan_surroundings(
        screen,
        center,
        select(0, owner_r + glow_r, draws_edges),
        select(0, i32(uniforms.location_border_radius), draws_location_borders),
    );

    var fill_rgb = unpack_color(primary_color);
    if (has_stripes) {
        fill_rgb = create_stripe_pattern(primary_color, secondary_color, stripe_blend).rgb;
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
    //
    // The branches only pick the edge. The color work comes after them, one
    // trip through Oklab for each step that applies.
    let is_water = center_terrain == TERRAIN_WATER;
    // Focused border: bright white outline to distinguish the focused tile
    let outline = is_focused && around.location_border;
    let owner_line = !outline && center_terrain == TERRAIN_LAND && around.owner <= owner_r;
    let edge_scale = select(1.0, DIMMED_EDGE_SCALE, is_dimmed);
    let edge_strength = uniforms.edge_strength * edge_scale;
    let location_edge = LOCATION_BORDER_DARKEN * uniforms.location_edge_strength * edge_scale;
    let rim = OWNER_GLOW_LIGHTEN * edge_scale;
    var tone = TONE_SHIFT;
    var delta = 0.0;
    var toned = false;
    var rim_border = false;
    if (is_water) {
        if (around.coast <= owner_r) {
            delta = -COAST_DARKEN * edge_strength;
            toned = true;
        } else if (around.coast <= owner_r + glow_r) {
            tone = TONE_RIM;
            delta = SHALLOWS_LIGHTEN * edge_scale;
            toned = true;
        }
    } else if (center_terrain == TERRAIN_IMPASSABLE || center_terrain == TERRAIN_LAKE) {
        if (around.terrain <= owner_r) {
            delta = -IMPASSABLE_EDGE_DARKEN * edge_strength;
            toned = true;
        } else if (around.location_border) {
            delta = -location_edge;
            toned = true;
        }
    } else if (center_terrain == TERRAIN_UNOWNED) {
        if (around.location_border) {
            delta = -location_edge;
            toned = true;
        }
    } else if (owner_line) {
        tone = TONE_LINE;
        delta = -(OWNER_BORDER_DARKEN * edge_strength);
        toned = true;
    } else if (min(around.owner, around.coast) <= owner_r + glow_r) {
        tone = TONE_RIM;
        delta = rim;
        toned = true;
        // A location border crosses the rim
        rim_border = around.location_border;
    } else if (around.location_border) {
        delta = -location_edge;
        toned = true;
    }

    // The owner line is the primary color without stripes or hover. On a
    // political map that is the owner color, and on a map of values it is
    // the value.
    var rgb = select(fill_rgb, unpack_color(primary_color), owner_line);
    let selected = is_dimmed || is_softened;
    let hovered = is_highlighted && !owner_line;
    rgb = select(rgb, highlight(rgb), hovered && !selected);

    if (selected) {
        rgb = oklab_to_srgb(selection_lab(srgb_to_oklab(rgb), is_dimmed, is_water));
        if (hovered) {
            rgb = highlight(rgb);
        }
    }
    if (toned) {
        rgb = oklab_to_srgb(edge_tone(srgb_to_oklab(rgb), delta, tone));
    }
    if (rim_border) {
        rgb = oklab_to_srgb(edge_tone(srgb_to_oklab(rgb), -location_edge, TONE_SHIFT));
    }
    rgb = select(rgb, vec3<f32>(1.0), outline);
    return vec4<f32>(rgb, 1.0);
}
