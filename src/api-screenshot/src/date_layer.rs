use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use pdx_map::wgpu;
use pdx_map::wgpu::util::DeviceExt;
use pdx_map::{RenderLayer, ViewportBounds};
use tracing::instrument;

const GLYPH_PATTERN_WIDTH: usize = 5;
const GLYPH_PATTERN_HEIGHT: usize = 7;
const LETTER_SPACING: u32 = 1;
const PADDING_X: u32 = 14;
const PADDING_Y: u32 = 10;
const CORNER_OFFSET_X: f32 = 0.0;
const CORNER_OFFSET_Y: f32 = 0.0;
const BG_COLOR: [u8; 4] = [0, 0, 0, 220];
const TEXT_COLOR: [u8; 4] = [255, 255, 255, 255];

const TEXTURE_SHADER: &str = include_str!("./shaders/texture.wgsl");

/// Pipeline resources (created once, reused)
struct DatePipeline {
    pipeline: wgpu::RenderPipeline,
    format: wgpu::TextureFormat,
    bind_group_layout: wgpu::BindGroupLayout,
    sampler: wgpu::Sampler,
}

/// Overlay texture with rendering resources (created on resize)
struct OverlayTexture {
    texture: wgpu::Texture,
    bind_group: wgpu::BindGroup,
}

/// Vertex geometry for quad positioning
struct OverlayGeometry {
    buffer: wgpu::Buffer,
    vertex_count: u32,
}

/// Pending pixel data awaiting GPU upload
struct PendingUpload {
    pixels: Vec<u8>,
    width: u32,
    height: u32,
}

pub struct DateLayer {
    text: String,
    glyph_scale: u32,
    pipeline: Option<DatePipeline>,
    texture: Option<OverlayTexture>,
    geometry: Option<OverlayGeometry>,
    pending_upload: Option<PendingUpload>,
    target_size: Option<(u32, u32)>,
}

impl DateLayer {
    pub fn new(text: String, glyph_scale: u32) -> Self {
        assert!(glyph_scale > 0, "glyph scale must be at least 1");
        Self {
            text,
            glyph_scale,
            pipeline: None,
            texture: None,
            geometry: None,
            pending_upload: None,
            target_size: None,
        }
    }

    fn ensure_pipeline(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        if let Some(pipeline) = &self.pipeline {
            if pipeline.format == format {
                return;
            }
        }

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Date Layer Bind Group Layout"),
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
        });

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Date Layer Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Date Layer Shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(TEXTURE_SHADER)),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Date Layer Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let vertex_buffers = [wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<OverlayVertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2],
        }];

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Date Layer Pipeline"),
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

        self.pipeline = Some(DatePipeline {
            pipeline,
            format,
            bind_group_layout,
            sampler,
        });
    }

    fn rebuild_resources(&mut self, device: &wgpu::Device, target_width: u32, target_height: u32) {
        let (pixels, overlay_width, overlay_height) =
            rasterize_text_overlay(&self.text, self.glyph_scale);

        self.target_size = Some((target_width, target_height));
        self.pending_upload = Some(PendingUpload {
            pixels,
            width: overlay_width,
            height: overlay_height,
        });

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Date Layer Texture"),
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

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let pipeline = self.pipeline.as_ref().expect("pipeline should exist");

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Date Layer Bind Group"),
            layout: &pipeline.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pipeline.sampler),
                },
            ],
        });

        let vertices = quad_vertices(
            target_width as f32,
            target_height as f32,
            overlay_width,
            overlay_height,
        );

        let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Date Layer Vertex Buffer"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });

        self.texture = Some(OverlayTexture {
            texture,
            bind_group,
        });

        self.geometry = Some(OverlayGeometry {
            buffer,
            vertex_count: vertices.len() as u32,
        });
    }

    fn upload(&mut self, queue: &wgpu::Queue) {
        let (Some(upload), Some(texture)) = (&self.pending_upload, &self.texture) else {
            return;
        };

        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &upload.pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(upload.width * 4),
                rows_per_image: Some(upload.height),
            },
            wgpu::Extent3d {
                width: upload.width,
                height: upload.height,
                depth_or_array_layers: 1,
            },
        );

        self.pending_upload = None;
    }
}

impl RenderLayer for DateLayer {
    fn resize(&mut self, config: &wgpu::SurfaceConfiguration, device: &wgpu::Device) {
        self.ensure_pipeline(device, config.format);
        self.rebuild_resources(device, config.width, config.height);
    }

    fn update(&mut self, queue: &wgpu::Queue) {
        self.upload(queue);
    }

    fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        _viewport: &ViewportBounds,
        _canvas_size: pdx_map::PhysicalSize<u32>,
    ) {
        if self.pending_upload.is_some() {
            return;
        }

        let (Some(pipeline), Some(texture), Some(geometry)) =
            (&self.pipeline, &self.texture, &self.geometry)
        else {
            return;
        };

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_bind_group(0, &texture.bind_group, &[]);
        pass.set_vertex_buffer(0, geometry.buffer.slice(..));
        pass.draw(0..geometry.vertex_count, 0..1);
    }
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct OverlayVertex {
    position: [f32; 2],
    uv: [f32; 2],
}

#[instrument]
fn rasterize_text_overlay(text: &str, glyph_scale: u32) -> (Vec<u8>, u32, u32) {
    let glyphs: Vec<char> = text.chars().collect();
    let glyph_count = glyphs.len() as u32;
    let glyph_width = GLYPH_PATTERN_WIDTH as u32 * glyph_scale;
    let glyph_height = GLYPH_PATTERN_HEIGHT as u32 * glyph_scale;
    let letter_spacing = LETTER_SPACING * glyph_scale;
    let padding_x = PADDING_X * glyph_scale;
    let padding_y = PADDING_Y * glyph_scale;

    let text_width = if glyph_count == 0 {
        0
    } else {
        glyph_count * (glyph_width + letter_spacing) - letter_spacing
    };

    let overlay_width = text_width + padding_x * 2;
    let overlay_height = glyph_height + padding_y * 2;

    let mut pixels = vec![0u8; (overlay_width * overlay_height * 4) as usize];
    for chunk in pixels.chunks_mut(4) {
        chunk.copy_from_slice(&BG_COLOR);
    }

    let mut cursor_x = padding_x;
    for ch in glyphs {
        let glyph = glyph_pattern(ch);
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
) {
    let stroke_x = 0;
    let stroke_y = 0;

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
/// pixels, `0` bits stay background. The shapes match the classic "Tom Thumb"
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
