struct SelectionUniform {
    rect_min: vec2<f32>,
    rect_max: vec2<f32>,
    color: vec4<f32>,
    physical_dimensions: vec2<f32>,  // width, height in physical pixels
    border_width_px: f32,            // border width in physical pixels
    _padding: f32,                   // alignment padding
};

@group(0) @binding(0) var<uniform> selection: SelectionUniform;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    
    let world_pos = mix(selection.rect_min, selection.rect_max, pos);
    out.clip_position = vec4<f32>(world_pos, 0.0, 1.0);
    out.color = selection.color;
    out.uv = pos;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Convert border width from physical pixels to UV space
    let border_width_uv = vec2<f32>(
        selection.border_width_px / selection.physical_dimensions.x,
        selection.border_width_px / selection.physical_dimensions.y
    );

    // Calculate distance from each edge in UV space [0, 1]
    let dist_left = in.uv.x;
    let dist_right = 1.0 - in.uv.x;
    let dist_top = in.uv.y;
    let dist_bottom = 1.0 - in.uv.y;

    // Check if we're in the border region for horizontal edges (left/right)
    let in_horizontal_border = dist_left <= border_width_uv.x || dist_right <= border_width_uv.x;

    // Check if we're in the border region for vertical edges (top/bottom)
    let in_vertical_border = dist_top <= border_width_uv.y || dist_bottom <= border_width_uv.y;

    // Draw white border if we're within border distance of any edge
    if (in_horizontal_border || in_vertical_border) {
        return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }

    return in.color;
}
