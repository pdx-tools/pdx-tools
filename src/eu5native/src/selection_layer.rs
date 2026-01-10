use std::borrow::Cow;

use bytemuck::{Pod, Zeroable};
use pdx_map::wgpu::util::DeviceExt;
use pdx_map::{PhysicalSize, RenderLayer, SelectionBox, SharedSelectionState, ViewportBounds};

const SELECTION_SHADER: &str = include_str!("./shaders/selection.wgsl");

/// Vertex data for the selection box
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SelectionVertex {
    position: [f32; 2],  // NDC coordinates
    color: [f32; 4],     // RGBA
}

/// Pipeline resources (created once, reused)
struct SelectionPipeline {
    pipeline: wgpu::RenderPipeline,
    format: wgpu::TextureFormat,
}

/// Vertex geometry for the selection quad
struct SelectionGeometry {
    buffer: wgpu::Buffer,
    vertex_count: u32,
}

/// A render layer that draws a translucent selection box
pub struct SelectionLayer {
    /// Shared selection state (shared with InteractionController)
    selection_state: SharedSelectionState,

    /// Pipeline resources
    pipeline: Option<SelectionPipeline>,

    /// Current geometry (regenerated when selection changes)
    geometry: Option<SelectionGeometry>,

    /// Target surface dimensions (width, height)
    target_size: Option<(u32, u32)>,

    /// Cached device reference for creating buffers
    device: Option<wgpu::Device>,
}

impl SelectionLayer {
    /// Create a new selection layer with shared state
    pub fn new(selection_state: SharedSelectionState) -> Self {
        Self {
            selection_state,
            pipeline: None,
            geometry: None,
            target_size: None,
            device: None,
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

    /// Rebuild geometry from current selection
    fn rebuild_geometry(&mut self, device: &wgpu::Device) {
        let Some((width, height)) = self.target_size else {
            return;
        };

        // Read current selection from shared state
        let selection = self.selection_state.lock().ok().and_then(|s| s.get());

        if let Some(sel) = selection {
            let vertices = self.generate_vertices(sel, width as f32, height as f32);

            let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("Selection Layer Vertex Buffer"),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });

            self.geometry = Some(SelectionGeometry {
                buffer,
                vertex_count: vertices.len() as u32,
            });
        } else {
            // No selection, clear geometry
            self.geometry = None;
        }
    }
}

impl RenderLayer for SelectionLayer {
    fn resize(&mut self, config: &wgpu::SurfaceConfiguration, device: &wgpu::Device) {
        self.ensure_pipeline(device, config.format);
        self.target_size = Some((config.width, config.height));
        self.device = Some(device.clone());
    }

    fn update(&mut self, _queue: &wgpu::Queue) {
        // Rebuild geometry from current selection state
        let Some(device) = self.device.clone() else {
            return;
        };

        self.rebuild_geometry(&device);
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

        pass.set_pipeline(&pipeline.pipeline);
        pass.set_vertex_buffer(0, geometry.buffer.slice(..));
        pass.draw(0..geometry.vertex_count, 0..1);
    }
}
