use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use pdx_map::{PhysicalSize, RenderLayer, SelectionBox, SharedSelectionState, ViewportBounds};

const SELECTION_SHADER: &str = include_str!("./shaders/selection.wgsl");

/// Number of vertices for a selection box (2 triangles = 6 vertices)
const VERTEX_COUNT: u32 = 6;

/// Vertex data for the selection box
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SelectionVertex {
    position: [f32; 2], // NDC coordinates
    color: [f32; 4],    // RGBA
}

/// Pipeline resources (created once, reused)
struct SelectionPipeline {
    pipeline: wgpu::RenderPipeline,
    format: wgpu::TextureFormat,
}

/// Persistent vertex buffer for the selection quad
struct SelectionGeometry {
    buffer: wgpu::Buffer,
}

/// A render layer that draws a translucent selection box
pub struct SelectionLayer {
    /// Shared selection state (shared with InteractionController)
    selection_state: SharedSelectionState,
    last_selection: Option<SelectionBox>,

    has_selection: bool,

    /// Pipeline resources
    pipeline: Option<SelectionPipeline>,

    /// Persistent geometry buffer (updated via write_buffer)
    geometry: Option<SelectionGeometry>,

    /// Target surface dimensions
    target_size: Option<PhysicalSize<u32>>,
}

impl SelectionLayer {
    /// Create a new selection layer with shared state
    pub fn new(selection_state: SharedSelectionState) -> Self {
        Self {
            selection_state,
            pipeline: None,
            geometry: None,
            target_size: None,
            has_selection: false,
            last_selection: None,
        }
    }

    /// Ensure the pipeline is created for the current format
    fn ensure_pipeline(&mut self, device: &wgpu::Device, format: wgpu::TextureFormat) {
        if let Some(pipeline) = &self.pipeline
            && pipeline.format == format
        {
            return;
        }

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Selection Layer Shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(SELECTION_SHADER)),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Selection Layer Pipeline Layout"),
            bind_group_layouts: &[],
            push_constant_ranges: &[],
        });

        let vertex_buffers = [wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<SelectionVertex>() as u64,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x4],
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

        self.pipeline = Some(SelectionPipeline { pipeline, format });
    }

    /// Generate vertices for the selection box
    fn generate_vertices(
        &self,
        selection: SelectionBox,
        viewport_width: f32,
        viewport_height: f32,
    ) -> Vec<SelectionVertex> {
        let (min, max) = selection.normalized_rect();

        // Convert logical canvas coordinates to NDC
        let logical_to_ndc = |x: f32, y: f32| -> [f32; 2] {
            let ndc_x = (x / viewport_width) * 2.0 - 1.0;
            let ndc_y = 1.0 - (y / viewport_height) * 2.0; // Y-axis flip
            [ndc_x, ndc_y]
        };

        let top_left = logical_to_ndc(min.x, min.y);
        let top_right = logical_to_ndc(max.x, min.y);
        let bottom_left = logical_to_ndc(min.x, max.y);
        let bottom_right = logical_to_ndc(max.x, max.y);

        // Semi-transparent blue
        let color = [0.2, 0.5, 0.8, 0.3];

        // Two triangles forming a rectangle
        vec![
            SelectionVertex {
                position: top_left,
                color,
            },
            SelectionVertex {
                position: bottom_left,
                color,
            },
            SelectionVertex {
                position: top_right,
                color,
            },
            SelectionVertex {
                position: bottom_left,
                color,
            },
            SelectionVertex {
                position: bottom_right,
                color,
            },
            SelectionVertex {
                position: top_right,
                color,
            },
        ]
    }

    /// Create the persistent vertex buffer (called once during resize)
    fn ensure_geometry(&mut self, device: &wgpu::Device) {
        if self.geometry.is_some() {
            return;
        }

        // Create a persistent buffer large enough for VERTEX_COUNT vertices
        // We'll update the contents each frame with queue.write_buffer()
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Selection Layer Vertex Buffer"),
            size: (std::mem::size_of::<SelectionVertex>() * VERTEX_COUNT as usize) as u64,
            usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        self.geometry = Some(SelectionGeometry { buffer });
    }
}

impl RenderLayer for SelectionLayer {
    fn resize(&mut self, config: &wgpu::SurfaceConfiguration, device: &wgpu::Device) {
        self.ensure_pipeline(device, config.format);
        self.ensure_geometry(device);
        self.target_size = Some(PhysicalSize::new(config.width, config.height));
    }

    fn update(&mut self, queue: &wgpu::Queue) {
        // Update the persistent buffer with current selection data
        let Some(geometry) = &self.geometry else {
            return;
        };

        let Some(size) = self.target_size else {
            return;
        };

        // Read current selection from shared state - panic if lock is held by another thread
        let selection = self
            .selection_state
            .try_lock()
            .expect("SelectionLayer::update() - selection_state lock is already held! This should never happen as rendering is single-threaded.")
            .get();

        self.has_selection = selection.is_some();
        if selection != self.last_selection
            && let Some(sel) = selection
        {
            let vertices = self.generate_vertices(sel, size.width as f32, size.height as f32);
            queue.write_buffer(&geometry.buffer, 0, bytemuck::cast_slice(&vertices));
            self.last_selection = Some(sel);
        }
    }

    fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        _viewport: &ViewportBounds,
        _canvas_size: PhysicalSize<u32>,
    ) {
        let Some(pipeline) = &self.pipeline else {
            return;
        };

        let Some(geometry) = &self.geometry else {
            return;
        };

        if !self.has_selection {
            return;
        }

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_vertex_buffer(0, geometry.buffer.slice(..));
        pass.draw(0..VERTEX_COUNT, 0..1);
    }
}
