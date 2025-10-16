struct ComputeUniforms {
    tile_width: u32,
    tile_height: u32, 
    enable_location_borders: u32,
    enable_owner_borders: u32,
    
    background_color: vec4<u32>,
    
    table_size: u32,
    _padding1: u32,
    viewport_x_offset: u32,
    viewport_y_offset: u32,

    canvas_width: u32,
    canvas_height: u32,
    world_width: u32,
    world_height: u32,
}


@group(0) @binding(0) var west_input_texture: texture_2d<f32>;
@group(0) @binding(1) var east_input_texture: texture_2d<f32>;
@group(0) @binding(2) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<storage, read> location_color_ids: array<u32>;
@group(0) @binding(4) var<uniform> uniforms: ComputeUniforms;
@group(0) @binding(5) var<storage, read> location_primary_colors: array<u32>;
@group(0) @binding(6) var<storage, read> location_states: array<u32>;
@group(0) @binding(7) var<storage, read> location_owner_colors: array<u32>;
@group(0) @binding(8) var<storage, read> location_secondary_colors: array<u32>;

const STATE_NO_LOCATION_BORDERS = 1u; // Bit 0: opt out of location border drawing
const STATE_HIGHLIGHTED = 2u; // Bit 1: location is highlighted (hover effect)

// Pack RGB values into a u32 key
fn pack_rgb(r: u32, g: u32, b: u32) -> u32 {
    return (r << 16u) | (g << 8u) | b;
}

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

// FNV-1a hash function for u32 keys
fn fnv(key: u32) -> u32 {
    var hash = 2166136261u; // FNV offset basis
    let bytes = array<u32, 4>(
        (key >> 0u) & 0xFFu,
        (key >> 8u) & 0xFFu,
        (key >> 16u) & 0xFFu,
        (key >> 24u) & 0xFFu
    );
    for (var i = 0u; i < 4u; i++) {
        hash ^= bytes[i];
        hash = hash * 16777619u; // FNV prime
    }
    return hash;
}

// Find location index by color ID using hash table approach with linear probing
fn find_location_index(color_key: u32) -> u32 {
    let table_size = uniforms.table_size;
    
    // Hash the color key to find initial position
    var index = fnv(color_key) % table_size;
    
    // Linear probing to find the matching color ID
    for (var i = 0u; i < table_size; i++) {
        if (location_color_ids[index] == color_key) {
            return index; // Found the location at this index
        }
        if (location_color_ids[index] == 0u) {
            return 0xFFFFFFFFu; // Hit empty slot, color not found
        }
        // Move to next slot (linear probing)
        index = (index + 1u) % table_size;
    }
    return 0xFFFFFFFFu; // Color ID not found
}

// Get primary color by location index, with fallback for unmapped locations
fn get_primary_color_by_index(location_idx: u32, fallback_color: u32) -> u32 {
    if (location_idx == 0xFFFFFFFFu) { return fallback_color; } // Use texture color for unmapped
    return location_primary_colors[location_idx];
}

// Get owner color by location index, with fallback for unmapped locations
fn get_owner_color_by_index(location_idx: u32, fallback_color: u32) -> u32 {
    if (location_idx == 0xFFFFFFFFu) { return fallback_color; } // Use texture color for unmapped
    return location_owner_colors[location_idx];
}

// Get secondary color by location index, with fallback for unmapped locations
fn get_secondary_color_by_index(location_idx: u32, fallback_color: u32) -> u32 {
    if (location_idx == 0xFFFFFFFFu) { return fallback_color; } // Use texture color for unmapped
    return location_secondary_colors[location_idx];
}

// Get state flags by location index
fn get_state_flags_by_index(location_idx: u32) -> u32 {
    if (location_idx == 0xFFFFFFFFu) { return 0u; } // Invalid index
    return location_states[location_idx];
}

// Get location index for a pixel at global coordinates  
fn get_location_index_at(global_x: i32, global_y: i32) -> u32 {
    let color_key = get_color_key_at(global_x, global_y);
    return find_location_index(color_key);
}

// Get color hash key for a pixel at global coordinates with cross-boundary support
fn get_color_key_at(global_x: i32, global_y: i32) -> u32 {
    // Handle out-of-bounds cases vertically (no wraparound for Y)
    if (global_y < 0 || global_y >= i32(uniforms.tile_height)) {
        return 0u; // Out of bounds vertically
    }
    
    // Wrap x coordinate for horizontal world wraparound
    let wrapped_x = wrap_x_coordinate(global_x);
    
    var pixel: vec4<f32>;
    if (wrapped_x < i32(uniforms.tile_width)) {
        // West texture
        let coord = vec2<i32>(wrapped_x, global_y);
        pixel = textureLoad(west_input_texture, coord, 0);
    } else {
        // East texture
        let coord = vec2<i32>(wrapped_x - i32(uniforms.tile_width), global_y);
        pixel = textureLoad(east_input_texture, coord, 0);
    }
    
    // Convert to RGB key
    let r = u32(round(pixel.r * 255.0));
    let g = u32(round(pixel.g * 255.0));
    let b = u32(round(pixel.b * 255.0));
    return pack_rgb(r, g, b);
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
            return true; // Found a neighbor with different location
        }
    }
    
    return false; // All neighbors have same location
}

// Check if this pixel should be an owner border (2-pixel thick border detection)
fn is_owner_border_pixel(global_x: i32, global_y: i32, center_location_idx: u32, center_color_key: u32) -> bool {
    if (uniforms.enable_owner_borders == 0u) {
        return false;
    }

    let center_value = get_owner_color_by_index(center_location_idx, center_color_key);

    for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
            // Skip the center pixel
            if (dx == 0 && dy == 0) {
                continue;
            }

            let neighbor_x = global_x + dx;
            let neighbor_y = global_y + dy;
            let neighbor_location_idx = get_location_index_at(neighbor_x, neighbor_y);
            let neighbor_color_key = get_color_key_at(neighbor_x, neighbor_y);
            let neighbor_value = get_owner_color_by_index(neighbor_location_idx, neighbor_color_key);

            // If neighbor has different owner (different owner color), this is an owner border
            if (neighbor_value != center_value) {
                return true;
            }
        }
    }

    return false; // All neighbors have same owner or no mapping
}

// Create stripe pattern when primary and secondary colors differ
fn create_stripe_pattern(global_x: i32, global_y: i32, primary_color: u32, secondary_color: u32) -> vec4<f32> {
    // Use diagonal stripe pattern - every 4 pixels switch between primary and secondary
    let stripe_frequency = 4;
    let diagonal = (global_x + global_y) / stripe_frequency;
    let use_secondary = (diagonal % 2) == 0;
    
    let color_to_use = select(primary_color, secondary_color, use_secondary);
    let rgb = unpack_color(color_to_use);
    return vec4<f32>(rgb.r, rgb.g, rgb.b, 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let canvas_x = global_id.x;
    let canvas_y = global_id.y;
    
    // Check canvas bounds (process full canvas)
    if (canvas_x >= uniforms.canvas_width || canvas_y >= uniforms.canvas_height) {
        return;
    }
    
    // Map canvas coordinates to world coordinates with zoom scaling
    // Scale canvas position to world position within the viewed area
    let world_x_float = (f32(canvas_x) / f32(uniforms.canvas_width)) * f32(uniforms.world_width);
    let world_y_float = (f32(canvas_y) / f32(uniforms.canvas_height)) * f32(uniforms.world_height);
    
    // Calculate global coordinates by adding viewport offset
    let global_x = i32(world_x_float) + i32(uniforms.viewport_x_offset);
    let global_y = i32(world_y_float) + i32(uniforms.viewport_y_offset);
    
    // Get pixel from appropriate texture based on global coordinates with wraparound
    let wrapped_global_x = wrap_x_coordinate(global_x);
    var input_pixel: vec4<f32>;
    if (wrapped_global_x < i32(uniforms.tile_width)) {
        // West texture
        let coord = vec2<i32>(wrapped_global_x, global_y);
        input_pixel = textureLoad(west_input_texture, coord, 0);
    } else {
        // East texture  
        let coord = vec2<i32>(wrapped_global_x - i32(uniforms.tile_width), global_y);
        input_pixel = textureLoad(east_input_texture, coord, 0);
    }
    
    // Convert to 0-255 range to match exact CPU values
    let r = u32(round(input_pixel.r * 255.0));
    let g = u32(round(input_pixel.g * 255.0));
    let b = u32(round(input_pixel.b * 255.0));
    let rgb_key = pack_rgb(r, g, b);
    
    // Single hash lookup to get location index for this pixel
    let location_idx = find_location_index(rgb_key);
    
    // Check if this location is highlighted
    let state_flags = get_state_flags_by_index(location_idx);
    let is_highlighted = (state_flags & STATE_HIGHLIGHTED) != 0u;
    
    // Check for different types of borders (owner borders take precedence)
    let is_owner_border = is_owner_border_pixel(global_x, global_y, location_idx, rgb_key);
    let is_location_border = is_location_border_pixel(global_x, global_y, location_idx);
    
    var output_color: vec4<f32>;
    if (is_owner_border) {
        // Owner border: darken the current pixel by 30%
        let mapped_value = get_owner_color_by_index(location_idx, rgb_key);
        let mapped_rgb = unpack_color(mapped_value);
        output_color = vec4<f32>(mapped_rgb.r * 0.7, mapped_rgb.g * 0.7, mapped_rgb.b * 0.7, 1.0);
    } else if (is_location_border) {
        // Location border: darken the looked-up color
        let mapped_value = get_primary_color_by_index(location_idx, rgb_key);
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
        let primary_color = get_primary_color_by_index(location_idx, rgb_key);
        let secondary_color = get_secondary_color_by_index(location_idx, rgb_key);

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
    
    // Write output pixel using canvas coordinates
    let output_coord = vec2<i32>(i32(canvas_x), i32(canvas_y));
    textureStore(output_texture, output_coord, output_color);
}