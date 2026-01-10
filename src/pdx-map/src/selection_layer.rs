use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

use crate::{
    PhysicalPoint, PhysicalSize, RenderLayer, SelectionBox, SharedSelectionState, ViewportBounds,
};

const SELECTION_SHADER: &str = include_str!("./shaders/selection.wgsl");

/// Number of vertices for a selection box (2 triangles = 6 vertices)
const VERTEX_COUNT: u32 = 6;

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct SelectionVertex {
    position: [f32; 2],
}

const UNIT_QUAD_VERTICES: [SelectionVertex; 6] = [
    SelectionVertex {
        position: [0.0, 0.0],
    },
    SelectionVertex {
        position: [1.0, 0.0],
    },
    SelectionVertex {
        position: [1.0, 1.0],
    },
    SelectionVertex {
        position: [0.0, 0.0],
    },
    SelectionVertex {
        position: [1.0, 1.0],
    },
    SelectionVertex {
        position: [0.0, 1.0],
    },
];

#[repr(C)]
#[derive(Copy, Clone, Pod, Zeroable)]
struct SelectionUniform {
    rect_min: [f32; 2],
    rect_max: [f32; 2],
    color: [f32; 4],
}

/// Pipeline resources (created once, reused)
struct SelectionPipeline {
    pipeline: wgpu::RenderPipeline,
    format: wgpu::TextureFormat,
    bind_group_layout: wgpu::BindGroupLayout,
}

/// A render layer that draws a translucent selection box
pub struct SelectionLayer {
    /// Shared selection state (shared with InteractionController)
    selection_state: SharedSelectionState,
    last_selection: Option<SelectionBox>,
    has_selection: bool,
    scale_factor: f32,
    needs_uniform_update: bool,

    pipeline: Option<SelectionPipeline>,
    unit_quad_buffer: Option<wgpu::Buffer>,
    uniform_buffer: Option<wgpu::Buffer>,
    bind_group: Option<wgpu::BindGroup>,
    canvas_size: Option<PhysicalSize<u32>>,
}

impl SelectionLayer {
    /// Create a new selection layer with shared state
    pub fn new(selection_state: SharedSelectionState, scale_factor: f32) -> Self {
        Self {
            selection_state,
            pipeline: None,
            unit_quad_buffer: None,
            uniform_buffer: None,
            bind_group: None,
            has_selection: false,
            scale_factor,
            last_selection: None,
            canvas_size: None,
            needs_uniform_update: true,
        }
    }

    /// Ensure the pipeline is created for the current format
    fn ensure_pipeline(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        if let Some(pipeline) = &self.pipeline
            && pipeline.format == format
        {
            return;
        }

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Selection Layer Bind Group Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Selection Layer Shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(SELECTION_SHADER)),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Selection Layer Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let vertex_buffers = [wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<SelectionVertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Float32x2],
        }];

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Selection Layer Pipeline"),
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

        self.pipeline = Some(SelectionPipeline {
            pipeline,
            format,
            bind_group_layout,
        });
        self.bind_group = None;
    }

    fn ensure_resources(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        self.ensure_pipeline(device, format);

        if self.unit_quad_buffer.is_none() {
            let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Selection Layer Quad Buffer"),
                contents: bytemuck::cast_slice(&UNIT_QUAD_VERTICES),
                usage: wgpu::BufferUsages::VERTEX,
            });
            self.unit_quad_buffer = Some(buffer);
        }

        if self.uniform_buffer.is_none() {
            let initial_uniform = SelectionUniform {
                rect_min: [0.0, 0.0],
                rect_max: [0.0, 0.0],
                color: [0.0, 0.0, 0.0, 0.0],
            };
            let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Selection Layer Uniform Buffer"),
                contents: bytemuck::bytes_of(&initial_uniform),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });
            self.uniform_buffer = Some(buffer);
            self.bind_group = None;
        }

        if self.bind_group.is_none() {
            let pipeline = self
                .pipeline
                .as_ref()
                .expect("SelectionLayer pipeline not initialized");
            let uniform_buffer = self
                .uniform_buffer
                .as_ref()
                .expect("SelectionLayer uniform buffer not initialized");
            let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Selection Layer Bind Group"),
                layout: &pipeline.bind_group_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });
            self.bind_group = Some(bind_group);
        }
    }

    fn update_uniforms(
        &self,
        queue: &wgpu::Queue,
        physical_size: PhysicalSize<u32>,
        rect: SelectionBox,
    ) {
        let Some(uniform_buffer) = self.uniform_buffer.as_ref() else {
            return;
        };
        let (min, max) = rect.normalized_rect();

        // 1. Logical -> Physical
        let phys_min = min.to_physical(self.scale_factor);
        let phys_max = max.to_physical(self.scale_factor);

        // 2. Physical -> NDC (-1.0 to 1.0)
        let to_ndc = |p: PhysicalPoint<f32>| {
            [
                (p.x / physical_size.width as f32) * 2.0 - 1.0,
                1.0 - (p.y / physical_size.height as f32) * 2.0, // Flip Y for screen space
            ]
        };

        let uniform = SelectionUniform {
            rect_min: to_ndc(phys_min),
            rect_max: to_ndc(phys_max),
            color: [0.2, 0.5, 0.8, 0.3],
        };

        queue.write_buffer(uniform_buffer, 0, bytemuck::bytes_of(&uniform));
    }
}

impl RenderLayer for SelectionLayer {
    fn resize(&mut self, config: &wgpu::SurfaceConfiguration, device: &wgpu::Device) {
        self.canvas_size = Some(PhysicalSize::new(config.width, config.height));
        self.needs_uniform_update = true;
        self.ensure_resources(device, config.format);
    }

    fn update(&mut self, queue: &wgpu::Queue) {
        // Read current selection from shared state - panic if lock is held by another thread
        let selection = self
            .selection_state
            .try_lock()
            .expect("SelectionLayer::update() - selection_state lock is already held! This should never happen as rendering is single-threaded.")
            .get();

        self.has_selection = selection.is_some();
        if selection != self.last_selection {
            self.last_selection = selection;
            self.needs_uniform_update = true;
        }

        if self.has_selection
            && self.needs_uniform_update
            && let (Some(sel), Some(size)) = (selection, self.canvas_size)
        {
            self.update_uniforms(queue, size, sel);
            self.needs_uniform_update = false;
        }
    }

    fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        _viewport: &ViewportBounds,
        _canvas_size: PhysicalSize<u32>,
    ) {
        if !self.has_selection {
            return;
        }

        let pipeline = self
            .pipeline
            .as_ref()
            .expect("SelectionLayer pipeline not initialized");
        let unit_quad_buffer = self
            .unit_quad_buffer
            .as_ref()
            .expect("SelectionLayer unit quad buffer not initialized");
        let bind_group = self
            .bind_group
            .as_ref()
            .expect("SelectionLayer bind group not initialized");

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_bind_group(0, bind_group, &[]);
        pass.set_vertex_buffer(0, unit_quad_buffer.slice(..));
        pass.draw(0..VERTEX_COUNT, 0..1);
    }
}
