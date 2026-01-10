struct SelectionUniform {
    rect_min: vec2<f32>, 
    rect_max: vec2<f32>,
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> selection: SelectionUniform;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@location(0) pos: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    
    let world_pos = mix(selection.rect_min, selection.rect_max, pos);
    out.clip_position = vec4<f32>(world_pos, 0.0, 1.0);
    out.color = selection.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}
