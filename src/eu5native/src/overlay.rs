use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use pdx_map::wgpu::util::DeviceExt;
use pdx_map::{OverlayMiddleware, OverlayTarget, wgpu};

const GLYPH_PATTERN_WIDTH: usize = 5;
const GLYPH_PATTERN_HEIGHT: usize = 7;
const LETTER_SPACING: u32 = 1;
const PADDING_X: u32 = 14;
const PADDING_Y: u32 = 10;
const CORNER_OFFSET_X: f32 = 0.0;
const CORNER_OFFSET_Y: f32 = 0.0;
const BG_COLOR: [u8; 4] = [0, 0, 0, 220];
const TEXT_COLOR: [u8; 4] = [255, 255, 255, 255];
const BOLD_STROKE_DIVISOR: u32 = 3;

pub struct DateOverlay {
    text: String,
    glyph_scale: u32,
    pipeline: Option<wgpu::RenderPipeline>,
    pipeline_format: Option<wgpu::TextureFormat>,
    bind_group_layout: Option<wgpu::BindGroupLayout>,
    sampler: Option<wgpu::Sampler>,
    vertex_buffer: Option<wgpu::Buffer>,
    vertex_count: u32,
    bind_group: Option<wgpu::BindGroup>,
    texture: Option<wgpu::Texture>,
    texture_view: Option<wgpu::TextureView>,
}

impl DateOverlay {
    pub fn new(text: String, glyph_scale: u32) -> Self {
        assert!(glyph_scale > 0, "glyph scale must be at least 1");
        Self {
            text,
            glyph_scale,
            pipeline: None,
            pipeline_format: None,
            bind_group_layout: None,
            sampler: None,
            vertex_buffer: None,
            vertex_count: 0,
            bind_group: None,
            texture: None,
            texture_view: None,
        }
    }

    fn ensure_pipeline(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        let layout = self.bind_group_layout.get_or_insert_with(|| {
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("Date Overlay Bind Group Layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            })
        });

        self.sampler.get_or_insert_with(|| {
            device.create_sampler(&wgpu::SamplerDescriptor {
                label: Some("Date Overlay Sampler"),
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                mipmap_filter: wgpu::FilterMode::Nearest,
                ..Default::default()
            })
        });

        if self.pipeline_format == Some(format) && self.pipeline.is_some() {
            return;
        }

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Date Overlay Shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(OVERLAY_SHADER)),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Date Overlay Pipeline Layout"),
            bind_group_layouts: &[layout],
            push_constant_ranges: &[],
        });

        let vertex_buffers = [wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<OverlayVertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2],
        }];

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Date Overlay Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &vertex_buffers,
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        self.pipeline = Some(pipeline);
        self.pipeline_format = Some(format);
    }

    fn rebuild_resources(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        target: &OverlayTarget<'_>,
    ) {
        let (pixels, overlay_width, overlay_height) =
            build_overlay_image(&self.text, self.glyph_scale);

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Date Overlay Texture"),
            size: wgpu::Extent3d {
                width: overlay_width,
                height: overlay_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(overlay_width * 4),
                rows_per_image: Some(overlay_height),
            },
            wgpu::Extent3d {
                width: overlay_width,
                height: overlay_height,
                depth_or_array_layers: 1,
            },
        );

        let texture_view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = self.sampler.as_ref().expect("sampler should exist");
        let bind_group_layout = self
            .bind_group_layout
            .as_ref()
            .expect("layout should exist");

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Date Overlay Bind Group"),
            layout: bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        });

        let vertices = quad_vertices(
            target.width as f32,
            target.height as f32,
            overlay_width,
            overlay_height,
        );

        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Date Overlay Vertex Buffer"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });

        self.vertex_buffer = Some(vertex_buffer);
        self.vertex_count = vertices.len() as u32;
        self.bind_group = Some(bind_group);
        self.texture = Some(texture);
        self.texture_view = Some(texture_view);
    }
}

impl OverlayMiddleware for DateOverlay {
    fn prepare(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, target: &OverlayTarget<'_>) {
        self.ensure_pipeline(device, target.format);
        self.rebuild_resources(device, queue, target);
    }

    fn render<'pass>(
        &'pass self,
        pass: &mut wgpu::RenderPass<'pass>,
        _target: &OverlayTarget<'pass>,
    ) {
        let (pipeline, bind_group, vertex_buffer) = match (
            self.pipeline.as_ref(),
            self.bind_group.as_ref(),
            self.vertex_buffer.as_ref(),
        ) {
            (Some(pipeline), Some(bind_group), Some(vertex_buffer)) => {
                (pipeline, bind_group, vertex_buffer)
            }
            _ => return,
        };

        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, bind_group, &[]);
        pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        pass.draw(0..self.vertex_count, 0..1);
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct OverlayVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

fn build_overlay_image(text: &str, glyph_scale: u32) -> (Vec<u8>, u32, u32) {
    let glyphs: Vec<char> = text.chars().collect();
    let glyph_count = glyphs.len() as u32;
    let glyph_width = GLYPH_PATTERN_WIDTH as u32 * glyph_scale;
    let glyph_height = GLYPH_PATTERN_HEIGHT as u32 * glyph_scale;
    let letter_spacing = LETTER_SPACING * glyph_scale;
    let padding_x = PADDING_X * glyph_scale;
    let padding_y = PADDING_Y * glyph_scale;
    let stroke_extra = (glyph_scale / BOLD_STROKE_DIVISOR).max(1);

    let text_width = if glyph_count == 0 {
        0
    } else {
        glyph_count * (glyph_width + letter_spacing) - letter_spacing
    };

    let overlay_width = text_width + padding_x * 2 + stroke_extra;
    let overlay_height = glyph_height + padding_y * 2 + stroke_extra;

    let mut pixels = vec![0u8; (overlay_width * overlay_height * 4) as usize];
    for chunk in pixels.chunks_mut(4) {
        chunk.copy_from_slice(&BG_COLOR);
    }

    let mut cursor_x = padding_x;
    for ch in glyphs {
        let glyph = glyph_pattern(ch);
        let bold_extra = stroke_extra;
        for (row, bits) in glyph.iter().enumerate() {
            for col in 0..GLYPH_PATTERN_WIDTH {
                if bits & (1 << (GLYPH_PATTERN_WIDTH - 1 - col)) != 0 {
                    let base_x = cursor_x + (col as u32) * glyph_scale;
                    let base_y = padding_y + (row as u32) * glyph_scale;
                    fill_glyph_block(
                        &mut pixels,
                        overlay_width,
                        overlay_height,
                        base_x,
                        base_y,
                        glyph_scale,
                        bold_extra,
                    );
                }
            }
        }
        cursor_x += glyph_width + letter_spacing;
    }

    (pixels, overlay_width, overlay_height)
}

fn fill_glyph_block(
    pixels: &mut [u8],
    overlay_width: u32,
    overlay_height: u32,
    base_x: u32,
    base_y: u32,
    glyph_scale: u32,
    bold_extra: u32,
) {
    let stroke_x = bold_extra;
    let stroke_y = bold_extra;

    for dy in 0..glyph_scale {
        for dx in 0..glyph_scale {
            for extra_y in 0..=stroke_y {
                for extra_x in 0..=stroke_x {
                    let x = base_x + dx + extra_x;
                    let y = base_y + dy + extra_y;
                    if x < overlay_width && y < overlay_height {
                        let idx = ((y * overlay_width + x) * 4) as usize;
                        pixels[idx..idx + 4].copy_from_slice(&TEXT_COLOR);
                    }
                }
            }
        }
    }
}

fn quad_vertices(
    viewport_width: f32,
    viewport_height: f32,
    overlay_width: u32,
    overlay_height: u32,
) -> [OverlayVertex; 6] {
    let overlay_width_f = overlay_width as f32;
    let overlay_height_f = overlay_height as f32;
    let max_left = (viewport_width - overlay_width_f).max(0.0);
    let left = CORNER_OFFSET_X.min(max_left);
    let bottom_limit = (viewport_height - CORNER_OFFSET_Y).max(overlay_height_f);
    let top = (bottom_limit - overlay_height_f).max(0.0);
    let bottom = (top + overlay_height_f).min(viewport_height);
    let right = (left + overlay_width_f).min(viewport_width);

    let ndc = |x: f32, y: f32| {
        let ndc_x = (x / viewport_width) * 2.0 - 1.0;
        let ndc_y = 1.0 - (y / viewport_height) * 2.0;
        [ndc_x, ndc_y]
    };

    let top_left = ndc(left, top);
    let top_right = ndc(right, top);
    let bottom_left = ndc(left, bottom);
    let bottom_right = ndc(right, bottom);

    [
        OverlayVertex {
            position: top_left,
            uv: [0.0, 0.0],
        },
        OverlayVertex {
            position: bottom_left,
            uv: [0.0, 1.0],
        },
        OverlayVertex {
            position: top_right,
            uv: [1.0, 0.0],
        },
        OverlayVertex {
            position: bottom_left,
            uv: [0.0, 1.0],
        },
        OverlayVertex {
            position: bottom_right,
            uv: [1.0, 1.0],
        },
        OverlayVertex {
            position: top_right,
            uv: [1.0, 0.0],
        },
    ]
}

/// Returns the 5×7 bitmap for `ch`, encoded as one byte per row where the
/// high-order bits describe pixels from left to right. `1` bits become text
/// pixels, `0` bits stay background. The shapes match the classic “Tom Thumb”
/// 5×7 pixel font used in early LCD/LED displays.
fn glyph_pattern(ch: char) -> [u8; GLYPH_PATTERN_HEIGHT] {
    match ch {
        '0' => [
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ],
        '1' => [
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ],
        '2' => [
            0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111,
        ],
        '3' => [
            0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110,
        ],
        '4' => [
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ],
        '5' => [
            0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110,
        ],
        '6' => [
            0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110,
        ],
        '7' => [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ],
        '8' => [
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ],
        '9' => [
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100,
        ],
        '-' => [
            0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000,
        ],
        '.' => [
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00110,
        ],
        ' ' => [0; GLYPH_PATTERN_HEIGHT],
        _ => [0; GLYPH_PATTERN_HEIGHT],
    }
}

const OVERLAY_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) uv : vec2<f32>,
};

@vertex
fn vs_main(@location(0) position: vec2<f32>, @location(1) uv_in: vec2<f32>) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4<f32>(position, 0.0, 1.0);
    out.uv = uv_in;
    return out;
}

@group(0) @binding(0) var overlay_texture: texture_2d<f32>;
@group(0) @binding(1) var overlay_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(overlay_texture, overlay_sampler, in.uv);
}
"#;
