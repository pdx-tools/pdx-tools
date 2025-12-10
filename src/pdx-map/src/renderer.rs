use bytemuck::{Pod, Zeroable};
use std::cell::Cell;
use wgpu::SurfaceTarget;

use crate::error::RenderError;
use crate::{CanvasDimensions, GpuLocationIdx, LocationArrays, LocationFlags, ViewportBounds};

/// Maximum texture dimension supported
const MAX_TEXTURE_DIMENSION: u32 = 8192;

fn device_trace_descriptor() -> wgpu::Trace {
    wgpu::Trace::default()
}

/// Combines a texture and its view for map rendering operations
#[derive(Debug)]
pub struct MapTexture {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
}

impl MapTexture {
    /// Create a new MapTexture
    pub(crate) fn new(
        texture: wgpu::Texture,
        view: wgpu::TextureView,
        width: u32,
        height: u32,
    ) -> Self {
        Self {
            texture,
            view,
            width,
            height,
        }
    }

    /// Get a reference to the underlying texture
    pub fn texture(&self) -> &wgpu::Texture {
        &self.texture
    }

    /// Get a reference to the texture view
    pub fn view(&self) -> &wgpu::TextureView {
        &self.view
    }

    /// Get the texture width
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Get the texture height
    pub fn height(&self) -> u32 {
        self.height
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct ComputeUniforms {
    tile_width: u32,
    tile_height: u32,
    enable_location_borders: u32,
    enable_owner_borders: u32,

    background_color: [u32; 4],

    table_size: u32,
    zoom_level: f32,
    viewport_x_offset: u32,
    viewport_y_offset: u32,

    canvas_width: u32,
    canvas_height: u32,
    world_width: u32,
    world_height: u32,
}

/// Core GPU resources shared across rendering components
#[derive(Debug, Clone)]
struct GpuResources {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter: wgpu::Adapter,
}

/// Collection of GPU buffers for location-based rendering data
#[derive(Debug, Clone)]
struct LocationBuffers {
    primary_colors: wgpu::Buffer,
    owner_colors: wgpu::Buffer,
    secondary_colors: wgpu::Buffer,
    states: wgpu::Buffer,
}

/// GPU context containing all initialized GPU resources for map rendering
pub struct GpuContext {
    gpu: GpuResources,
    location_buffers: LocationBuffers,
    uniform_buffer: wgpu::Buffer,
    compute_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuContext {
    /// Create a new headless GPU context for map rendering
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "info"))]
    pub async fn new() -> Result<Self, RenderError> {
        let instance = Self::create_instance();
        let adapter = Self::request_adapter(&instance, None).await?;
        Self::from_adapter(adapter).await
    }

    /// Create an R16Uint storage texture for location index data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(width = width, height = height, label = label))
    )]
    pub fn create_texture(
        &self,
        texture_data: &[u8],
        width: u32,
        height: u32,
        label: &'static str,
    ) -> MapTexture {
        // Validate dimensions
        assert!(
            width <= MAX_TEXTURE_DIMENSION && height <= MAX_TEXTURE_DIMENSION,
            "Texture dimensions ({width}x{height}) exceed maximum supported dimension ({MAX_TEXTURE_DIMENSION})"
        );

        let texture = self.gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R16Uint,
            usage: wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_DST
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        self.gpu.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            texture_data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(2 * width), // R16 = 2 bytes per pixel
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        MapTexture::new(texture, view, width, height)
    }

    /// Create a new GPU instance
    pub fn create_instance() -> wgpu::Instance {
        wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        })
    }

    /// Request a GPU adapter
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    async fn request_adapter(
        instance: &wgpu::Instance,
        surface: Option<&wgpu::Surface<'_>>,
    ) -> Result<wgpu::Adapter, RenderError> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: surface,
                force_fallback_adapter: false,
            })
            .await?;

        Ok(adapter)
    }

    /// Initialize GPU device, adapter, buffers, and pipelines from an adapter
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "info"))]
    async fn from_adapter(adapter: wgpu::Adapter) -> Result<Self, RenderError> {
        let limits = wgpu::Limits {
            max_texture_dimension_2d: MAX_TEXTURE_DIMENSION,
            ..Default::default()
        };

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                required_features: wgpu::Features::empty(),
                required_limits: limits,
                label: None,
                memory_hints: wgpu::MemoryHints::default(),
                trace: device_trace_descriptor(),
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
            })
            .await?;

        // Create location array buffers (sized for reasonable number of locations)
        let max_locations = 65536u64; // Maximum expected locations

        let location_primary_colors_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Location Primary Colors Buffer"),
            size: std::mem::size_of::<u32>() as u64 * max_locations,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let location_owner_colors_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Location Owner Colors Buffer"),
            size: std::mem::size_of::<u32>() as u64 * max_locations,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let location_secondary_colors_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Location Secondary Colors Buffer"),
            size: std::mem::size_of::<u32>() as u64 * max_locations,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let location_states_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Location States Buffer"),
            size: std::mem::size_of::<u32>() as u64 * max_locations,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Reusable Uniform Buffer"),
            size: std::mem::size_of::<ComputeUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create GPU resources and location buffers
        let gpu = GpuResources {
            device: device.clone(),
            queue: queue.clone(),
            adapter: adapter.clone(),
        };

        let location_buffers = LocationBuffers {
            primary_colors: location_primary_colors_buffer.clone(),
            owner_colors: location_owner_colors_buffer.clone(),
            secondary_colors: location_secondary_colors_buffer.clone(),
            states: location_states_buffer.clone(),
        };

        // Create compute pipeline
        let (compute_pipeline, bind_group_layout) = Self::compile_compute_pipeline(&device);

        Ok(GpuContext {
            gpu,
            location_buffers,
            uniform_buffer,
            compute_pipeline,
            bind_group_layout,
        })
    }

    /// Create compute and render pipelines from shader sources and GPU device
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    fn compile_compute_pipeline(
        device: &wgpu::Device,
    ) -> (wgpu::ComputePipeline, wgpu::BindGroupLayout) {
        let compute_shader_source = include_str!("./shaders/map_renderer.wgsl");

        // Create compute shader module
        let compute_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Pixel Transform Compute Shader"),
            source: wgpu::ShaderSource::Wgsl(compute_shader_source.into()),
        });

        // Create compute bind group layout
        let compute_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("Compute Bind Group Layout"),
                entries: &[
                    // West input texture (R16Uint regular texture)
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Uint,
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // East input texture (R16Uint regular texture)
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Uint,
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // Output texture
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::StorageTexture {
                            access: wgpu::StorageTextureAccess::WriteOnly,
                            format: wgpu::TextureFormat::Rgba8Unorm,
                            view_dimension: wgpu::TextureViewDimension::D2,
                        },
                        count: None,
                    },
                    // Uniform buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 3,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Location primary colors buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 4,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: true },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Location states buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 5,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: true },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Location owner colors buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 6,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: true },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Location secondary colors buffer
                    wgpu::BindGroupLayoutEntry {
                        binding: 7,
                        visibility: wgpu::ShaderStages::COMPUTE,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Storage { read_only: true },
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                ],
            });

        // Create compute pipeline
        let compute_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Compute Pipeline Layout"),
                bind_group_layouts: &[&compute_bind_group_layout],
                push_constant_ranges: &[],
            });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Pixel Transform Pipeline"),
            layout: Some(&compute_pipeline_layout),
            module: &compute_shader,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });

        (compute_pipeline, compute_bind_group_layout)
    }
}

pub struct GpuSurfaceContext {
    core: GpuContext,
    surface: wgpu::Surface<'static>,
}

impl GpuSurfaceContext {
    /// Create a new GPU surface context for rendering to a surface
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "info"))]
    pub async fn new(surface: SurfaceTarget<'static>) -> Result<Self, RenderError> {
        let instance = GpuContext::create_instance();
        let surface = instance.create_surface(surface)?;
        let adapter = GpuContext::request_adapter(&instance, Some(&surface)).await?;
        let core = GpuContext::from_adapter(adapter).await?;
        Ok(GpuSurfaceContext { core, surface })
    }

    /// Create an R16Uint storage texture for location index data
    pub fn create_texture(
        &self,
        texture_data: &[u8],
        width: u32,
        height: u32,
        label: &'static str,
    ) -> MapTexture {
        self.core.create_texture(texture_data, width, height, label)
    }

    pub fn as_ref(&self) -> GpuSurfaceContextRef<'_> {
        GpuSurfaceContextRef {
            core: &self.core,
            surface: &self.surface,
        }
    }
}

pub struct GpuSurfaceContextRef<'a> {
    core: &'a GpuContext,
    surface: &'a wgpu::Surface<'static>,
}

impl<'a> GpuSurfaceContextRef<'a> {
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    pub fn display_surface(&self, display: CanvasDimensions) -> SurfacePipeline {
        let surface_caps = self.surface.get_capabilities(&self.core.gpu.adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(surface_caps.formats[0]);

        let surface_config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: display.physical_width(),
            height: display.physical_height(),
            present_mode: surface_caps.present_modes[0],
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        self.surface
            .configure(&self.core.gpu.device, &surface_config);

        let render_shader =
            self.core
                .gpu
                .device
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("Surface Render Shader"),
                    source: wgpu::ShaderSource::Wgsl(
                        include_str!("./shaders/surface_render.wgsl").into(),
                    ),
                });

        // Create bind group layout for surface rendering
        let render_bind_group_layout =
            self.core
                .gpu
                .device
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("Surface Render Bind Group Layout"),
                    entries: &[
                        // Combined output texture
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
                        // Sampler
                        wgpu::BindGroupLayoutEntry {
                            binding: 1,
                            visibility: wgpu::ShaderStages::FRAGMENT,
                            ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                            count: None,
                        },
                    ],
                });

        let render_pipeline_layout =
            self.core
                .gpu
                .device
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("Surface Render Pipeline Layout"),
                    bind_group_layouts: &[&render_bind_group_layout],
                    push_constant_ranges: &[],
                });

        let render_pipeline =
            self.core
                .gpu
                .device
                .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                    label: Some("Surface Render Pipeline"),
                    layout: Some(&render_pipeline_layout),
                    vertex: wgpu::VertexState {
                        module: &render_shader,
                        entry_point: Some("vs_main"),
                        buffers: &[],
                        compilation_options: Default::default(),
                    },
                    fragment: Some(wgpu::FragmentState {
                        module: &render_shader,
                        entry_point: Some("fs_main"),
                        targets: &[Some(wgpu::ColorTargetState {
                            format: surface_config.format,
                            blend: Some(wgpu::BlendState::REPLACE),
                            write_mask: wgpu::ColorWrites::ALL,
                        })],
                        compilation_options: Default::default(),
                    }),
                    primitive: wgpu::PrimitiveState {
                        topology: wgpu::PrimitiveTopology::TriangleStrip,
                        strip_index_format: None,
                        front_face: wgpu::FrontFace::Ccw,
                        cull_mode: None,
                        polygon_mode: wgpu::PolygonMode::Fill,
                        unclipped_depth: false,
                        conservative: false,
                    },
                    depth_stencil: None,
                    multisample: wgpu::MultisampleState {
                        count: 1,
                        mask: !0,
                        alpha_to_coverage_enabled: false,
                    },
                    multiview: None,
                    cache: None,
                });

        SurfacePipeline {
            surface_config,
            render_bind_group_layout,
            render_pipeline,
        }
    }
}

pub struct SurfacePipeline {
    surface_config: wgpu::SurfaceConfiguration,
    render_bind_group_layout: wgpu::BindGroupLayout,
    render_pipeline: wgpu::RenderPipeline,
}

pub struct Renderer {
    gpu: GpuResources,
    location_buffers: LocationBuffers,
    compute_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    // Viewport dimensions
    viewport_width: u32,
    viewport_height: u32,
    // Tile dimensions
    tile_width: u32,
    tile_height: u32,
    // Single viewport-sized output texture
    viewport_output_texture: wgpu::Texture,
    viewport_staging_buffer: Option<wgpu::Buffer>,
    uniform_buffer: wgpu::Buffer,
    // Location array management
    location_arrays: crate::LocationArrays,
    location_arrays_dirty: Cell<bool>,
    // Border rendering configuration
    enable_location_borders: bool,
    enable_owner_borders: bool,
    // State for staged processing
    // Map textures for rendering and cursor lookup
    west_texture: MapTexture,
    east_texture: MapTexture,
    viewport_output_view: wgpu::TextureView,
    viewport_bind_group: wgpu::BindGroup,
}

impl Renderer {
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "info", fields(viewport_width = viewport_width, viewport_height = viewport_height))
    )]
    pub fn new(
        pipelines: GpuContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
        viewport_width: u32,
        viewport_height: u32,
    ) -> Self {
        let tile_width = west_texture.width();
        let tile_height = west_texture.height();

        let viewport_output_texture =
            Self::viewport_texture(&pipelines.gpu.device, viewport_width, viewport_height);
        let viewport_output_view =
            viewport_output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Essentially creating a null bind group here just so that we don't
        // need to store an optional field. This is assuming that the proper
        // viewport bind group is created later.
        let viewport_bind_group =
            pipelines
                .gpu
                .device
                .create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("Viewport Bind Group"),
                    layout: &pipelines.gpu.device.create_bind_group_layout(
                        &wgpu::BindGroupLayoutDescriptor {
                            label: None,
                            entries: &[],
                        },
                    ),
                    entries: &[],
                });

        let mut result = Self {
            gpu: pipelines.gpu,
            location_buffers: pipelines.location_buffers,
            compute_pipeline: pipelines.compute_pipeline,
            bind_group_layout: pipelines.bind_group_layout,
            viewport_width,
            viewport_height,
            tile_width,
            tile_height,
            viewport_output_texture,
            viewport_staging_buffer: None,
            uniform_buffer: pipelines.uniform_buffer,
            location_arrays: crate::LocationArrays::new(),
            location_arrays_dirty: Cell::new(true),
            enable_location_borders: true,
            enable_owner_borders: true,
            west_texture,
            east_texture,
            viewport_output_view,
            viewport_bind_group,
        };

        result.recreate_viewport_bind_group();
        result
    }

    /// Create a new Renderer that shares GPU resources with an existing renderer but has different viewport dimensions
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(viewport_width = viewport_width, viewport_height = viewport_height))
    )]
    pub fn with_shared_gpu(
        source_renderer: &Renderer,
        viewport_width: u32,
        viewport_height: u32,
    ) -> Self {
        let viewport_output_texture =
            Self::viewport_texture(&source_renderer.gpu.device, viewport_width, viewport_height);
        let viewport_output_view =
            viewport_output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let mut result = Self {
            // Share GPU resources (these are references/handles, not data copies)
            gpu: source_renderer.gpu.clone(),
            location_buffers: source_renderer.location_buffers.clone(),
            compute_pipeline: source_renderer.compute_pipeline.clone(),
            bind_group_layout: source_renderer.bind_group_layout.clone(),
            uniform_buffer: source_renderer.uniform_buffer.clone(),
            // Share texture references (no data duplication)
            west_texture: MapTexture::new(
                source_renderer.west_texture.texture().clone(),
                source_renderer.west_texture.view().clone(),
                source_renderer.west_texture.width(),
                source_renderer.west_texture.height(),
            ),
            east_texture: MapTexture::new(
                source_renderer.east_texture.texture().clone(),
                source_renderer.east_texture.view().clone(),
                source_renderer.east_texture.width(),
                source_renderer.east_texture.height(),
            ),
            // Share location arrays reference
            location_arrays: source_renderer.location_arrays.clone(),
            location_arrays_dirty: Cell::new(false), // Will be synced via shared arrays
            // Screenshot rendering configuration - always enable location borders for detailed output
            enable_location_borders: true,
            enable_owner_borders: source_renderer.enable_owner_borders,
            // Copy tile dimensions
            tile_width: source_renderer.tile_width,
            tile_height: source_renderer.tile_height,
            // Screenshot-specific viewport
            viewport_width,
            viewport_height,
            viewport_output_texture,
            viewport_staging_buffer: None,
            viewport_output_view,
            viewport_bind_group: source_renderer.viewport_bind_group.clone(),
        };

        result.recreate_viewport_bind_group();
        result
    }

    pub fn gpu_context(&self) -> GpuContext {
        GpuContext {
            gpu: self.gpu.clone(),
            location_buffers: self.location_buffers.clone(),
            uniform_buffer: self.uniform_buffer.clone(),
            compute_pipeline: self.compute_pipeline.clone(),
            bind_group_layout: self.bind_group_layout.clone(),
        }
    }

    fn viewport_texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
        device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Viewport Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
    }

    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(new_width, new_height))
    )]
    pub fn resize_viewport(&mut self, new_width: u32, new_height: u32) {
        if self.viewport_width == new_width && self.viewport_height == new_height {
            return;
        }

        self.viewport_width = new_width;
        self.viewport_height = new_height;

        // Recreate viewport output texture with new dimensions
        self.viewport_output_texture =
            Self::viewport_texture(&self.gpu.device, new_width, new_height);
        self.viewport_output_view = self
            .viewport_output_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.recreate_viewport_bind_group();

        // Invalidate staging buffer (will be recreated lazily if needed)
        self.viewport_staging_buffer = None;
    }

    fn recreate_viewport_bind_group(&mut self) {
        let bind_group = self
            .gpu
            .device
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Viewport Bind Group"),
                layout: &self.bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(self.west_texture.view()),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(self.east_texture.view()),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(&self.viewport_output_view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: self.location_buffers.primary_colors.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: self.location_buffers.states.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 6,
                        resource: self.location_buffers.owner_colors.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 7,
                        resource: self.location_buffers.secondary_colors.as_entire_binding(),
                    },
                ],
            });

        self.viewport_bind_group = bind_group;
    }

    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(x = bounds.x, y = bounds.y, w = bounds.width, h = bounds.height, zoom = bounds.zoom_level))
    )]
    pub fn render_scene(&self, bounds: ViewportBounds) {
        let texture = &self.viewport_output_texture;

        // Upload the location arrays to GPU buffers (only if dirty)
        self.ensure_location_arrays_uploaded();

        // Update uniform buffer with viewport parameters
        let uniforms = ComputeUniforms {
            tile_width: self.tile_width,
            tile_height: self.tile_height,
            enable_location_borders: if self.enable_location_borders { 1 } else { 0 },
            enable_owner_borders: if self.enable_owner_borders { 1 } else { 0 },
            background_color: [248, 248, 248, 255],
            table_size: self.location_arrays.len() as u32,
            zoom_level: bounds.zoom_level,
            viewport_x_offset: bounds.x,
            viewport_y_offset: bounds.y,
            canvas_width: texture.width(),
            canvas_height: texture.height(),
            world_width: bounds.width,
            world_height: bounds.height,
        };

        self.gpu
            .queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));

        self.process_viewport(&uniforms);
    }

    // Process viewport with compute shader
    fn process_viewport(&self, uniforms: &ComputeUniforms) {
        // Dispatch compute shader for viewport-sized area
        let mut encoder = self
            .gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Viewport Compute Encoder"),
            });

        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Viewport Compute Pass"),
                timestamp_writes: None,
            });

            compute_pass.set_pipeline(&self.compute_pipeline);
            compute_pass.set_bind_group(0, &self.viewport_bind_group, &[]);

            // 8x8 workgroup size for canvas area
            let workgroup_size = 8;
            let workgroups_x = uniforms.canvas_width.div_ceil(workgroup_size);
            let workgroups_y = uniforms.canvas_height.div_ceil(workgroup_size);

            compute_pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        self.gpu.queue.submit(std::iter::once(encoder.finish()));
    }

    fn ensure_location_arrays_uploaded(&self) {
        if !self.location_arrays_dirty.get() {
            return;
        }

        // Check buffer sizes
        let required_size = std::mem::size_of::<u32>() as u64 * self.location_arrays.len() as u64;
        assert!(
            required_size <= self.location_buffers.primary_colors.size(),
            "Location buffers too small! Need {} bytes, have {} bytes",
            required_size,
            self.location_buffers.primary_colors.size()
        );

        let location_buffers = self.location_arrays.buffers();

        // Upload location arrays data to GPU buffers
        self.gpu.queue.write_buffer(
            &self.location_buffers.primary_colors,
            0,
            bytemuck::cast_slice(location_buffers.primary_colors()),
        );

        self.gpu.queue.write_buffer(
            &self.location_buffers.owner_colors,
            0,
            bytemuck::cast_slice(location_buffers.owner_colors()),
        );

        self.gpu.queue.write_buffer(
            &self.location_buffers.secondary_colors,
            0,
            bytemuck::cast_slice(location_buffers.secondary_colors()),
        );

        self.gpu.queue.write_buffer(
            &self.location_buffers.states,
            0,
            bytemuck::cast_slice(location_buffers.state_flags()),
        );

        self.location_arrays_dirty.set(false);
    }

    // Read a single pixel from an input texture (for cursor-to-location mapping)
    pub fn create_color_id_readback_at(
        &self,
        texture: &wgpu::Texture,
        x: u32,
        y: u32,
    ) -> Result<ColorIdReadback, RenderError> {
        // Create staging buffer - must be aligned to 256 bytes for WebGPU
        let buffer_size = 256u32; // Minimum alignment for WebGPU buffer mapping
        let pixel_staging_buffer = self.gpu.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Single Pixel Staging Buffer"),
            size: buffer_size as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Single Pixel Readback Encoder"),
            });

        // Copy just 1 pixel from the input texture
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d { x, y, z: 0 },
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &pixel_staging_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(buffer_size),
                    rows_per_image: Some(1),
                },
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );

        self.gpu.queue.submit(Some(encoder.finish()));

        let (sender, receiver) = futures_channel::oneshot::channel();
        pixel_staging_buffer
            .slice(..)
            .map_async(wgpu::MapMode::Read, |result| {
                let _ = sender.send(result);
            });

        // Single poll to process the async operation
        self.gpu.device.poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })?;

        let readback = ColorIdReadback {
            receiver,
            pixel_staging_buffer,
        };

        Ok(readback)
    }

    fn queued_work(&self) -> QueuedWorkFuture {
        let (sender, receiver) = futures_channel::oneshot::channel();
        self.gpu.queue.on_submitted_work_done(|| {
            let _ = sender.send(());
        });

        QueuedWorkFuture { receiver }
    }
}

pub struct QueuedWorkFuture {
    receiver: futures_channel::oneshot::Receiver<()>,
}

impl QueuedWorkFuture {
    pub async fn wait(self) {
        let _ = self.receiver.await;
    }
}

#[derive(Debug)]
pub struct ColorIdReadback {
    pixel_staging_buffer: wgpu::Buffer,
    receiver: futures_channel::oneshot::Receiver<Result<(), wgpu::BufferAsyncError>>,
}

impl ColorIdReadback {
    pub async fn read_id(self) -> GpuLocationIdx {
        let _ = self.receiver.await;

        let pixel_data = self.pixel_staging_buffer.slice(0..8).get_mapped_range();
        let mut result = [0u8; 2];
        result.copy_from_slice(&pixel_data[0..2]);

        drop(pixel_data);
        self.pixel_staging_buffer.unmap();

        let idx = u16::from_le_bytes(result);
        GpuLocationIdx::new(idx)
    }
}

pub struct SurfaceMapRenderer {
    renderer: Renderer,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    render_pipeline: wgpu::RenderPipeline,
    render_bind_group_layout: wgpu::BindGroupLayout,
    display: CanvasDimensions,
    sampler: wgpu::Sampler,
    render_bind_group: wgpu::BindGroup,
}

impl SurfaceMapRenderer {
    pub fn tile_width(&self) -> u32 {
        self.renderer.tile_width
    }

    pub fn tile_height(&self) -> u32 {
        self.renderer.tile_height
    }

    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "info", fields(width = dimensions.canvas_width, height = dimensions.canvas_height))
    )]
    pub fn new(
        components: GpuSurfaceContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
        display_pipeline: SurfacePipeline,
        dimensions: CanvasDimensions,
    ) -> Self {
        let renderer = Renderer::new(
            components.core,
            west_texture,
            east_texture,
            dimensions.canvas_width,
            dimensions.canvas_height,
        );

        let sampler = renderer
            .gpu
            .device
            .create_sampler(&wgpu::SamplerDescriptor {
                address_mode_u: wgpu::AddressMode::ClampToEdge,
                address_mode_v: wgpu::AddressMode::ClampToEdge,
                address_mode_w: wgpu::AddressMode::ClampToEdge,
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                mipmap_filter: wgpu::FilterMode::Nearest,
                ..Default::default()
            });

        let render_bind_group = create_render_bind_group(
            &renderer.gpu.device,
            &display_pipeline.render_bind_group_layout,
            &renderer.viewport_output_view,
            &sampler,
        );
        Self {
            renderer,
            surface: components.surface,
            render_pipeline: display_pipeline.render_pipeline,
            render_bind_group_layout: display_pipeline.render_bind_group_layout,
            display: dimensions,
            sampler,
            render_bind_group,
            surface_config: display_pipeline.surface_config,
        }
    }

    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(new_width, new_height))
    )]
    pub fn resize(&mut self, new_width: u32, new_height: u32) {
        self.display.canvas_height = new_height;
        self.display.canvas_width = new_width;
        self.renderer.resize_viewport(new_width, new_height);
        self.setup_surface_rendering();
    }

    pub fn render_scene(&self, bounds: ViewportBounds) {
        self.renderer.render_scene(bounds)
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.renderer.enable_location_borders = enabled;
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.renderer.enable_owner_borders = enabled;
    }

    pub fn set_location_arrays(&mut self, location_arrays: crate::LocationArrays) {
        self.renderer.location_arrays = location_arrays;
        self.renderer.location_arrays_dirty.set(true);
    }

    pub fn location_arrays_mut(&mut self) -> &mut crate::LocationArrays {
        self.renderer.location_arrays_dirty.set(true);
        &mut self.renderer.location_arrays
    }

    /// Get location ID at world coordinates using direct input texture sampling
    /// This avoids viewport manipulation and provides fast cursor-to-location mapping
    pub fn create_color_id_readback_at(
        &self,
        world_x: i32,
        world_y: i32,
    ) -> Result<ColorIdReadback, RenderError> {
        let global_x = world_x;
        let global_y = world_y.clamp(0, (self.renderer.tile_height - 1) as i32);

        // Handle world wraparound (same logic as shader)
        let world_width = (self.renderer.tile_width * 2) as i32;
        let wrapped_x = ((global_x % world_width) + world_width) % world_width;

        // Determine which texture and local coordinates
        let (texture, local_x) = if wrapped_x < self.renderer.tile_width as i32 {
            // West texture
            (self.renderer.west_texture.texture(), wrapped_x as u32)
        } else {
            // East texture
            (
                self.renderer.east_texture.texture(),
                (wrapped_x - self.renderer.tile_width as i32) as u32,
            )
        };

        // Read single pixel from input texture (contains raw color ID)
        let pixel_readback =
            self.renderer
                .create_color_id_readback_at(texture, local_x, global_y as u32)?;

        Ok(pixel_readback)
    }

    // Create the render pipeline for surface rendering
    fn setup_surface_rendering(&mut self) {
        let gpu_ctx = self.renderer.gpu_context();
        let surface_ctx_ref = GpuSurfaceContextRef {
            core: &gpu_ctx,
            surface: &self.surface,
        };
        let display_pipeline = surface_ctx_ref.display_surface(self.display);
        self.surface_config = display_pipeline.surface_config;
        self.render_pipeline = display_pipeline.render_pipeline;
        self.render_bind_group_layout = display_pipeline.render_bind_group_layout;
        self.render_bind_group = create_render_bind_group(
            &self.renderer.gpu.device,
            &self.render_bind_group_layout,
            &self.renderer.viewport_output_view,
            &self.sampler,
        );
    }

    pub fn queued_work(&self) -> QueuedWorkFuture {
        self.renderer.queued_work()
    }

    // Render viewport results to surface
    pub fn present(&self) -> Result<(), RenderError> {
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Create command encoder and render pass
        let mut encoder =
            self.renderer
                .gpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Surface Render Encoder"),
                });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Surface Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &self.render_bind_group, &[]);
            render_pass.draw(0..4, 0..1); // Full-screen quad
        }

        self.renderer
            .gpu
            .queue
            .submit(std::iter::once(encoder.finish()));
        output.present();

        Ok(())
    }

    /// Create an independent screenshot renderer that shares GPU resources but operates with a separate surface
    pub(crate) fn create_screenshot_renderer(
        &self,
        screenshot_surface: wgpu::Surface<'static>,
    ) -> Result<SurfaceMapRenderer, RenderError> {
        let surface_caps: wgpu::SurfaceCapabilities =
            screenshot_surface.get_capabilities(&self.renderer.gpu.adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(surface_caps.formats[0]);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: self.renderer.tile_width,
            height: self.renderer.tile_height,
            present_mode: surface_caps.present_modes[0],
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        screenshot_surface.configure(&self.renderer.gpu.device, &config);

        // Create new Renderer that shares GPU resources but has screenshot-specific viewport
        let mut screenshot_renderer = Renderer::with_shared_gpu(
            &self.renderer,
            self.renderer.tile_width,  // viewport width
            self.renderer.tile_height, // viewport height
        );

        let mut loc_iter = screenshot_renderer.location_arrays.iter_mut();
        while let Some(mut loc) = loc_iter.next_location() {
            loc.flags_mut().clear(LocationFlags::HIGHLIGHTED);
        }

        // Create screenshot surface renderer with shared render pipeline components
        let mut surface_renderer = SurfaceMapRenderer {
            renderer: screenshot_renderer,
            surface: screenshot_surface,
            surface_config: self.surface_config.clone(),
            render_pipeline: self.render_pipeline.clone(),
            render_bind_group_layout: self.render_bind_group_layout.clone(),
            sampler: self.sampler.clone(),
            render_bind_group: create_render_bind_group(
                &self.renderer.gpu.device,
                &self.render_bind_group_layout,
                &self.renderer.viewport_output_view,
                &self.sampler,
            ),
            display: CanvasDimensions {
                canvas_width: self.renderer.tile_width,
                canvas_height: self.renderer.tile_height,
                scale_factor: 1.0,
            },
        };

        // Set up surface rendering for screenshot renderer
        surface_renderer.setup_surface_rendering();

        Ok(surface_renderer)
    }
}

impl MapRenderer for SurfaceMapRenderer {
    fn set_location_arrays(&mut self, location_arrays: LocationArrays) {
        self.set_location_arrays(location_arrays);
    }

    fn location_arrays(&self) -> &LocationArrays {
        &self.renderer.location_arrays
    }

    fn location_arrays_mut(&mut self) -> &mut LocationArrays {
        self.location_arrays_mut()
    }

    fn set_location_borders(&mut self, enabled: bool) {
        self.set_location_borders(enabled);
    }

    fn set_owner_borders(&mut self, enabled: bool) {
        self.set_owner_borders(enabled);
    }

    fn resize_viewport(&mut self, new_width: u32, new_height: u32) {
        self.resize(new_width, new_height)
    }

    fn render_scene(&self, bounds: ViewportBounds) {
        self.render_scene(bounds);
    }
}

impl SurfaceRenderer for SurfaceMapRenderer {
    fn present(&self) -> Result<(), RenderError> {
        self.present()
    }
}

fn create_render_bind_group(
    device: &wgpu::Device,
    layout: &wgpu::BindGroupLayout,
    viewport_output_view: &wgpu::TextureView,
    sampler: &wgpu::Sampler,
) -> wgpu::BindGroup {
    device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("Surface Render Bind Group"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(viewport_output_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
        ],
    })
}

pub struct HeadlessMapRenderer {
    renderer: Renderer,
}

impl HeadlessMapRenderer {
    /// Create a headless map renderer from initialized GPU context and texture data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "info", fields(viewport_width = viewport_width, viewport_height = viewport_height))
    )]
    pub fn new(
        gpu: GpuContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
        viewport_width: u32,
        viewport_height: u32,
    ) -> Result<HeadlessMapRenderer, RenderError> {
        let renderer = Renderer::new(
            gpu,
            west_texture,
            east_texture,
            viewport_width,
            viewport_height,
        );

        Ok(HeadlessMapRenderer { renderer })
    }

    // Create viewport-sized output texture and staging buffer
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "debug", fields(new_width = new_width, new_height = new_height))
    )]
    pub fn resize_viewport(&mut self, new_width: u32, new_height: u32) {
        self.renderer.resize_viewport(new_width, new_height)
    }

    // Read back viewport data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(
            skip_all,
            level = "debug",
            fields(world_width, world_height, x_offset)
        )
    )]
    pub async fn readback_viewport_data(
        &mut self,
        world_width: u32,
        world_height: u32,
        output_buffer: &mut [u8],
        x_offset: u32,
    ) -> Result<(), RenderError> {
        let viewport_output_texture = &self.renderer.viewport_output_texture;

        // Create staging buffer (only used for readbacks) if it doesn't exist
        let viewport_staging_buffer =
            self.renderer
                .viewport_staging_buffer
                .get_or_insert_with(|| {
                    let viewport_buffer_size = (world_width * world_height * 4) as u64;
                    self.renderer
                        .gpu
                        .device
                        .create_buffer(&wgpu::BufferDescriptor {
                            label: Some("Viewport Staging Buffer"),
                            size: viewport_buffer_size,
                            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                            mapped_at_creation: false,
                        })
                });

        // Copy viewport texture to staging buffer
        let mut encoder =
            self.renderer
                .gpu
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Viewport Readback Encoder"),
                });

        let buffer_size = (world_width * world_height * 4) as u64;
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: viewport_output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: viewport_staging_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(world_width * 4),
                    rows_per_image: Some(world_height),
                },
            },
            wgpu::Extent3d {
                width: world_width,
                height: world_height,
                depth_or_array_layers: 1,
            },
        );

        self.renderer
            .gpu
            .queue
            .submit(std::iter::once(encoder.finish()));

        // Read back results
        let buffer_slice = viewport_staging_buffer.slice(..buffer_size);
        let (sender, receiver) = futures_channel::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        self.renderer.gpu.device.poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })?;
        receiver.await??;

        let data = buffer_slice.get_mapped_range();

        // Calculate parameters for copying
        let tile_width_bytes = world_width * 4; // RGBA bytes per row in source
        let output_width_bytes = (output_buffer.len() / (world_height as usize * 4)) as u32 * 4; // Total output width in bytes
        let x_offset_bytes = x_offset * 4; // X offset in bytes

        // Copy row by row from buffer to output buffer at the specified x_offset
        for y in 0..world_height {
            let src_row_start = (y * tile_width_bytes) as usize;
            let src_row_end = src_row_start + tile_width_bytes as usize;

            let dst_row_start = (y * output_width_bytes + x_offset_bytes) as usize;
            let dst_row_end = dst_row_start + tile_width_bytes as usize;

            if src_row_end <= data.len() && dst_row_end <= output_buffer.len() {
                output_buffer[dst_row_start..dst_row_end]
                    .copy_from_slice(&data[src_row_start..src_row_end]);
            }
        }

        drop(data);
        viewport_staging_buffer.unmap();

        Ok(())
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.renderer.enable_location_borders = enabled;
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.renderer.enable_owner_borders = enabled;
    }

    /// Set new location arrays (marks for re-upload)
    pub fn set_location_arrays(&mut self, location_arrays: crate::LocationArrays) {
        self.renderer.location_arrays = location_arrays;
        self.renderer.location_arrays_dirty.set(true);
    }

    /// Create a screenshot renderer from this headless renderer
    ///
    /// Consumes the headless renderer and returns a ScreenshotRenderer that
    /// encapsulates screenshot-specific operations (render_west/east, readback_west/east).
    /// Tile dimensions are automatically extracted from the renderer.
    pub fn into_screenshot_renderer(self) -> crate::ScreenshotRenderer<Self> {
        let tile_width = self.renderer.tile_width;
        let tile_height = self.renderer.tile_height;
        crate::ScreenshotRenderer::new(self, tile_width, tile_height)
    }
}

impl MapRenderer for HeadlessMapRenderer {
    fn set_location_arrays(&mut self, location_arrays: LocationArrays) {
        self.set_location_arrays(location_arrays);
    }

    fn location_arrays(&self) -> &LocationArrays {
        &self.renderer.location_arrays
    }

    fn location_arrays_mut(&mut self) -> &mut LocationArrays {
        self.renderer.location_arrays_dirty.set(true);
        &mut self.renderer.location_arrays
    }

    fn set_location_borders(&mut self, enabled: bool) {
        self.set_location_borders(enabled);
    }

    fn set_owner_borders(&mut self, enabled: bool) {
        self.set_owner_borders(enabled);
    }

    fn resize_viewport(&mut self, new_width: u32, new_height: u32) {
        self.resize_viewport(new_width, new_height)
    }

    fn render_scene(&self, bounds: ViewportBounds) {
        self.renderer.render_scene(bounds);
    }
}

/// Trait defining common functionality for map renderers
pub trait MapRenderer {
    /// Set the location arrays data
    fn set_location_arrays(&mut self, location_arrays: LocationArrays);

    fn location_arrays(&self) -> &LocationArrays;

    /// Get mutable access to location arrays
    fn location_arrays_mut(&mut self) -> &mut LocationArrays;

    /// Enable or disable location border rendering
    fn set_location_borders(&mut self, enabled: bool);

    /// Enable or disable owner border rendering
    fn set_owner_borders(&mut self, enabled: bool);

    /// Resize the viewport
    fn resize_viewport(&mut self, new_width: u32, new_height: u32);

    /// Render a scene with given viewport bounds
    fn render_scene(&self, bounds: ViewportBounds);
}

/// Trait for surface-based renderers that can present to screen
pub trait SurfaceRenderer: MapRenderer {
    /// Present the rendered content to the surface
    fn present(&self) -> Result<(), RenderError>;
}
