use bytemuck::{Pod, Zeroable};
use std::cell::RefCell;
use std::collections::HashMap;
use wgpu::SurfaceTarget;

use crate::error::RenderError;
use crate::{GpuLocationIdx, LocationArrays, PhysicalSize, ViewportBounds};

/// A drawable layer that can be composed into the main map render pass
pub trait RenderLayer: Send + Sync {
    /// Called when the render target is resized so layers can recreate GPU state
    fn resize(&mut self, _config: &wgpu::SurfaceConfiguration, _device: &wgpu::Device) {}

    /// Called before rendering to upload any per-frame data to the GPU
    fn update(&mut self, _queue: &wgpu::Queue) {}

    /// Record draw commands for this layer
    fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        viewport: &ViewportBounds,
        size: PhysicalSize<u32>,
    );
}

/// Opaque handle to identify a layer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LayerId(u32);

struct LayerEntry {
    id: LayerId,
    layer: Box<dyn RenderLayer>,
    visible: bool,
}

impl LayerEntry {
    fn new(id: LayerId, layer: impl RenderLayer + 'static) -> Self {
        Self {
            id,
            layer: Box::new(layer),
            visible: true, // Default to visible
        }
    }
}

/// Maximum texture dimension supported
const MAX_TEXTURE_DIMENSION: u32 = 8192;

/// Combines a texture and its view for map rendering operations
#[derive(Debug, Clone)]
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

/// Rendering configuration - constants and user-configurable options
#[derive(Debug, Clone)]
pub struct RenderConfig {
    tile_width: u32,
    tile_height: u32,

    pub enable_location_borders: bool,
    pub enable_owner_borders: bool,
}

impl RenderConfig {
    /// Create a new render configuration
    pub(crate) fn new(tile_width: u32, tile_height: u32) -> Self {
        Self {
            tile_width,
            tile_height,
            enable_location_borders: true,
            enable_owner_borders: true,
        }
    }

    /// Get the tile width (read-only)
    pub fn tile_width(&self) -> u32 {
        self.tile_width
    }

    /// Get the tile height (read-only)
    pub fn tile_height(&self) -> u32 {
        self.tile_height
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct ComputeUniforms {
    tile_width: u32,
    tile_height: u32,
    enable_location_borders: u32,
    enable_owner_borders: u32,

    zoom_level: f32,
    viewport_x_offset: u32,
    viewport_y_offset: u32,

    canvas_width: u32,
    canvas_height: u32,
    world_width: u32,
    world_height: u32,
    _padding: u32,
}

/// Core GPU resources shared across rendering components
#[derive(Debug, Clone)]
struct GpuResources {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter: wgpu::Adapter,
}

/// GPU context containing all initialized GPU resources for map rendering
#[derive(Debug, Clone)]
pub struct GpuContext {
    gpu: GpuResources,
    instance: wgpu::Instance,
    map_shader_module: wgpu::ShaderModule,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuContext {
    /// Create a new headless GPU context for map rendering
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "info"))]
    pub async fn new() -> Result<Self, RenderError> {
        let instance = Self::create_instance();
        let adapter = Self::request_adapter(&instance, None).await?;
        Self::from_instance_and_adapter(instance, adapter).await
    }

    /// Create an R16Uint storage texture for location index data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip(self, texture_data), level = "debug", fields(texture_len = texture_data.len()))
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
    async fn from_instance_and_adapter(
        instance: wgpu::Instance,
        adapter: wgpu::Adapter,
    ) -> Result<Self, RenderError> {
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
                trace: wgpu::Trace::default(),
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
            })
            .await?;

        // Create GPU resources
        let gpu = GpuResources {
            device: device.clone(),
            queue: queue.clone(),
            adapter: adapter.clone(),
        };

        // Create shader module and bind group layout
        let (map_shader_module, bind_group_layout) = Self::compile_map_resources(&device);

        Ok(GpuContext {
            gpu,
            instance,
            map_shader_module,
            bind_group_layout,
        })
    }

    /// Create compute and render pipelines from shader sources and GPU device
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "debug"))]
    fn compile_map_resources(device: &wgpu::Device) -> (wgpu::ShaderModule, wgpu::BindGroupLayout) {
        let shader_source = include_str!("./shaders/map_renderer.wgsl");

        // Create shader module
        let map_shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Map Renderer Shader"),
            source: wgpu::ShaderSource::Wgsl(shader_source.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Map Render Bind Group Layout"),
            entries: &[
                // Binding 0: West input texture
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Uint,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Binding 1: East input texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Uint,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Binding 2: Uniform buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Binding 3: Location primary colors buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Binding 4: Location states buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Binding 5: Location owner colors buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Binding 6: Location secondary colors buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        (map_shader_module, bind_group_layout)
    }

    /// Create a render pipeline for a specific target format
    pub fn create_render_pipeline(
        &self,
        target_format: wgpu::TextureFormat,
    ) -> wgpu::RenderPipeline {
        let pipeline_layout =
            self.gpu
                .device
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("Map Render Pipeline Layout"),
                    bind_group_layouts: &[&self.bind_group_layout],
                    push_constant_ranges: &[],
                });

        self.gpu
            .device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("Map Render Pipeline"),
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &self.map_shader_module,
                    entry_point: Some("vs_main"),
                    buffers: &[],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &self.map_shader_module,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format: target_format,
                        blend: Some(wgpu::BlendState::REPLACE),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
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
            })
    }

    /// Create a new surface using the existing GPU instance
    pub fn create_surface(
        &self,
        target: SurfaceTarget<'static>,
    ) -> Result<wgpu::Surface<'static>, RenderError> {
        Ok(self.instance.create_surface(target)?)
    }

    /// Build a surface configuration for a target surface and physical size
    pub fn surface_config_for_surface(
        &self,
        surface: &wgpu::Surface<'static>,
        size: PhysicalSize<u32>,
    ) -> wgpu::SurfaceConfiguration {
        let surface_caps = surface.get_capabilities(&self.gpu.adapter);

        wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: choose_texture_format(&surface_caps.formats),
            width: size.width,
            height: size.height,
            present_mode: choose_present_mode(&surface_caps.present_modes),
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        }
    }
}

pub struct GpuSurfaceContext {
    core: GpuContext,
    surface: wgpu::Surface<'static>,
}

impl GpuSurfaceContext {
    /// Create a new GPU surface context for rendering to a surface
    #[cfg_attr(feature = "tracing", tracing::instrument(skip_all, level = "info"))]
    pub async fn new(surface: impl Into<SurfaceTarget<'static>>) -> Result<Self, RenderError> {
        let surface = surface.into();
        Self::new_surface(surface).await
    }

    async fn new_surface(surface: SurfaceTarget<'static>) -> Result<Self, RenderError> {
        let instance = GpuContext::create_instance();
        let surface = instance.create_surface(surface)?;
        let adapter = GpuContext::request_adapter(&instance, Some(&surface)).await?;
        let core = GpuContext::from_instance_and_adapter(instance, adapter).await?;
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
    /// Get surface configuration for the given physical size
    pub fn surface_config(&self, size: PhysicalSize<u32>) -> wgpu::SurfaceConfiguration {
        self.core.surface_config_for_surface(self.surface, size)
    }
}

/// GPU resource container - owns textures and storage buffers for map data
#[derive(Debug)]
pub struct MapResources {
    // Textures
    west_texture: MapTexture,
    east_texture: MapTexture,

    // Storage buffers
    primary_colors: wgpu::Buffer,
    owner_colors: wgpu::Buffer,
    secondary_colors: wgpu::Buffer,
    states: wgpu::Buffer,

    // Cached bind group built lazily when a renderer needs it
    bind_group: RefCell<Option<wgpu::BindGroup>>,
}

impl Clone for MapResources {
    fn clone(&self) -> Self {
        Self {
            west_texture: self.west_texture.clone(),
            east_texture: self.east_texture.clone(),
            primary_colors: self.primary_colors.clone(),
            owner_colors: self.owner_colors.clone(),
            secondary_colors: self.secondary_colors.clone(),
            states: self.states.clone(),
            // force uniform buffer bind group recreation for new renderers.
            bind_group: RefCell::new(None),
        }
    }
}

impl MapResources {
    /// Create new map resources from textures
    pub fn new(ctx: &GpuContext, west: MapTexture, east: MapTexture) -> Self {
        let device = &ctx.gpu.device;

        let [primary_colors, owner_colors, secondary_colors, states] =
            Self::location_buffers(device, 1);

        Self {
            west_texture: west,
            east_texture: east,
            primary_colors,
            owner_colors,
            secondary_colors,
            states,
            bind_group: RefCell::new(None),
        }
    }

    /// Update storage buffers from location arrays
    pub fn update(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, arrays: &LocationArrays) {
        if arrays.len() > (self.owner_colors.size() as usize / std::mem::size_of::<u32>()) {
            let [primary_colors, owner_colors, secondary_colors, states] =
                Self::location_buffers(device, arrays.len() as u64);
            self.primary_colors = primary_colors;
            self.owner_colors = owner_colors;
            self.secondary_colors = secondary_colors;
            self.states = states;
            self.bind_group.replace(None);
        }

        let buffers = arrays.buffers();

        queue.write_buffer(
            &self.primary_colors,
            0,
            bytemuck::cast_slice(buffers.primary_colors()),
        );
        queue.write_buffer(
            &self.owner_colors,
            0,
            bytemuck::cast_slice(buffers.owner_colors()),
        );
        queue.write_buffer(
            &self.secondary_colors,
            0,
            bytemuck::cast_slice(buffers.secondary_colors()),
        );
        queue.write_buffer(&self.states, 0, bytemuck::cast_slice(buffers.state_flags()));
    }

    pub fn ensure_bind_group(
        &self,
        device: &wgpu::Device,
        layout: &wgpu::BindGroupLayout,
        uniforms: &wgpu::Buffer,
    ) -> wgpu::BindGroup {
        // 1. Fast path: Check cache
        // wgpu objects are essentially Arcs, so cloning the BindGroup handle is cheap.
        if let Some(bg) = self.bind_group.borrow().as_ref() {
            return bg.clone();
        }

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Map Frame Bind Group"),
            layout,
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
                    resource: uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.primary_colors.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: self.states.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: self.owner_colors.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: self.secondary_colors.as_entire_binding(),
                },
            ],
        });

        *self.bind_group.borrow_mut() = Some(bind_group.clone());
        bind_group
    }

    fn location_buffers(device: &wgpu::Device, locations: u64) -> [wgpu::Buffer; 4] {
        [
            "Location Primary Colors Buffer",
            "Location Owner Colors Buffer",
            "Location Secondary Colors Buffer",
            "Location States Buffer",
        ]
        .map(|label| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(label),
                size: locations * std::mem::size_of::<u32>() as u64,
                usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            })
        })
    }

    // Accessors
    pub fn west_texture(&self) -> &MapTexture {
        &self.west_texture
    }

    pub fn east_texture(&self) -> &MapTexture {
        &self.east_texture
    }
}

/// Stateless pipeline renderer with lazy pipeline cache
pub struct MapRenderer {
    // Need device for creating pipelines and bind groups
    device: wgpu::Device,

    // Shader and layout
    shader: wgpu::ShaderModule,
    bind_group_layout: wgpu::BindGroupLayout,

    // Viewport uniforms
    uniform_buffer: wgpu::Buffer,

    // Pipeline cache: TextureFormat -> RenderPipeline
    pipelines: RefCell<HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>>,

    // Rendering configuration - tile dimensions and border flags
    config: RenderConfig,
}

impl MapRenderer {
    /// Create a new stateless renderer with the given tile dimensions
    pub fn new(ctx: &GpuContext, tile_width: u32, tile_height: u32) -> Self {
        let (shader, bind_group_layout) = GpuContext::compile_map_resources(&ctx.gpu.device);

        let uniform_buffer = Self::create_uniform_buffer(&ctx.gpu.device);

        Self {
            device: ctx.gpu.device.clone(),
            shader,
            bind_group_layout,
            uniform_buffer,
            pipelines: RefCell::new(HashMap::new()),
            config: RenderConfig::new(tile_width, tile_height),
        }
    }

    /// Create a new renderer that reuses an existing device/shader/layout but has its own pipeline cache
    pub fn from_existing(renderer: &MapRenderer) -> Self {
        let uniform_buffer = Self::create_uniform_buffer(&renderer.device);

        Self {
            device: renderer.device.clone(),
            shader: renderer.shader.clone(),
            bind_group_layout: renderer.bind_group_layout.clone(),
            uniform_buffer,
            pipelines: RefCell::new(HashMap::new()),
            config: renderer.config.clone(),
        }
    }

    fn create_uniform_buffer(device: &wgpu::Device) -> wgpu::Buffer {
        device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Viewport Uniform Buffer"),
            size: std::mem::size_of::<ComputeUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        })
    }

    /// Get the tile width
    pub fn tile_width(&self) -> u32 {
        self.config.tile_width()
    }

    /// Get the tile height
    pub fn tile_height(&self) -> u32 {
        self.config.tile_height()
    }

    /// Update viewport uniforms and prepare a bind group for the current frame
    pub fn prepare_bind_group(
        &self,
        queue: &wgpu::Queue,
        resources: &MapResources,
        bounds: ViewportBounds,
        size: PhysicalSize<u32>,
    ) -> wgpu::BindGroup {
        let uniforms = ComputeUniforms {
            tile_width: self.config.tile_width(),
            tile_height: self.config.tile_height(),
            enable_location_borders: if self.config.enable_location_borders {
                1
            } else {
                0
            },
            enable_owner_borders: if self.config.enable_owner_borders {
                1
            } else {
                0
            },
            zoom_level: bounds.zoom_level,
            viewport_x_offset: bounds.x,
            viewport_y_offset: bounds.y,
            canvas_width: size.width,
            canvas_height: size.height,
            world_width: bounds.width,
            world_height: bounds.height,
            _padding: 0,
        };

        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));

        resources.ensure_bind_group(&self.device, &self.bind_group_layout, &self.uniform_buffer)
    }

    /// Record map draw commands into an existing render pass
    pub fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        format: wgpu::TextureFormat,
        bind_group: &'a wgpu::BindGroup,
    ) {
        let pipeline = self.pipeline_for_format(format);
        pass.set_pipeline(&pipeline);
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..3, 0..1); // Full-screen triangle
    }

    /// Get or create a render pipeline for the given format
    fn pipeline_for_format(&self, format: wgpu::TextureFormat) -> wgpu::RenderPipeline {
        let mut cache = self.pipelines.borrow_mut();
        cache
            .entry(format)
            .or_insert_with(|| self.create_pipeline(format))
            .clone()
    }

    fn create_pipeline(&self, format: wgpu::TextureFormat) -> wgpu::RenderPipeline {
        let pipeline_layout = self
            .device
            .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Map Render Pipeline Layout"),
                bind_group_layouts: &[&self.bind_group_layout],
                push_constant_ranges: &[],
            });

        self.device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("Map Render Pipeline"),
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &self.shader,
                    entry_point: Some("vs_main"),
                    buffers: &[],
                    compilation_options: Default::default(),
                },
                fragment: Some(wgpu::FragmentState {
                    module: &self.shader,
                    entry_point: Some("fs_main"),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: Some(wgpu::BlendState::REPLACE),
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                    compilation_options: Default::default(),
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
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
            })
    }
}

/// Shared scene state for both onscreen and headless rendering
pub struct MapScene {
    base_renderer: MapRenderer,
    resources: MapResources,
    layers: Vec<LayerEntry>,
    next_layer_id: u32,
}

impl MapScene {
    pub fn new(base_renderer: MapRenderer, resources: MapResources) -> Self {
        Self {
            base_renderer,
            resources,
            layers: Vec::new(),
            next_layer_id: 0,
        }
    }

    /// Add a layer and return a stable Handle to control it later
    pub fn add_layer(
        &mut self,
        mut layer: impl RenderLayer + 'static,
        config: &wgpu::SurfaceConfiguration,
    ) -> LayerId {
        layer.resize(config, &self.base_renderer.device);
        let id = LayerId(self.next_layer_id);
        self.next_layer_id += 1;
        self.layers.push(LayerEntry::new(id, layer));
        id
    }

    /// Toggle visibility (Zero cost compared to adding/removing)
    pub fn set_layer_visible(&mut self, id: LayerId, visible: bool) {
        if let Some(entry) = self.layers.iter_mut().find(|e| e.id == id) {
            entry.visible = visible;
        }
    }

    pub fn draw<'a>(
        &'a self,
        pass: &mut wgpu::RenderPass<'a>,
        bind_group: &'a wgpu::BindGroup,
        format: wgpu::TextureFormat,
        viewport: &ViewportBounds,
        size: PhysicalSize<u32>,
    ) {
        self.base_renderer.draw(pass, format, bind_group);

        for entry in &self.layers {
            if entry.visible {
                entry.layer.draw(pass, viewport, size);
            }
        }
    }

    pub fn update_locations(&mut self, queue: &wgpu::Queue, arrays: &LocationArrays) {
        let device = &self.base_renderer.device;
        self.resources.update(device, queue, arrays);
    }

    pub fn update_layers(&mut self, queue: &wgpu::Queue) {
        for entry in &mut self.layers {
            entry.layer.update(queue);
        }
    }

    pub fn resize_layers(&mut self, config: &wgpu::SurfaceConfiguration) {
        for entry in &mut self.layers {
            entry.layer.resize(config, &self.base_renderer.device);
        }
    }

    pub fn tile_width(&self) -> u32 {
        self.base_renderer.tile_width()
    }

    pub fn tile_height(&self) -> u32 {
        self.base_renderer.tile_height()
    }

    pub fn resources(&self) -> &MapResources {
        &self.resources
    }

    pub fn resources_mut(&mut self) -> &mut MapResources {
        &mut self.resources
    }

    pub fn renderer(&self) -> &MapRenderer {
        &self.base_renderer
    }

    pub fn renderer_mut(&mut self) -> &mut MapRenderer {
        &mut self.base_renderer
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
    scene: MapScene,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    gpu: GpuContext,
}

impl SurfaceMapRenderer {
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip_all, level = "info", fields(width = size.width, height = size.height))
    )]
    pub fn new(
        components: GpuSurfaceContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
        size: PhysicalSize<u32>,
    ) -> Self {
        // Get surface configuration before consuming components
        let surface_ctx_ref = components.as_ref();
        let surface_config = surface_ctx_ref.surface_config(size);
        surface_ctx_ref
            .surface
            .configure(&surface_ctx_ref.core.gpu.device, &surface_config);

        let renderer = MapRenderer::new(
            &components.core,
            west_texture.width(),
            west_texture.height(),
        );
        let resources = MapResources::new(&components.core, west_texture, east_texture);
        let scene = MapScene::new(renderer, resources);

        Self {
            scene,
            surface: components.surface,
            surface_config,
            gpu: components.core,
        }
    }

    pub fn render(&mut self, bounds: ViewportBounds) -> Result<(), RenderError> {
        let output = self.surface.get_current_texture()?;
        let format = output.texture.format();
        let size = PhysicalSize::new(output.texture.width(), output.texture.height());
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let device = &self.scene.renderer().device;
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Map Render Encoder"),
        });

        let queue = &self.gpu.gpu.queue;
        self.scene.update_layers(queue);

        let bind_group = {
            let renderer = self.scene.renderer();
            let resources = self.scene.resources();
            renderer.prepare_bind_group(queue, resources, bounds, size)
        };

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Map Render Pass"),
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

            self.scene
                .draw(&mut pass, &bind_group, format, &bounds, size);
        }

        self.queue().submit(Some(encoder.finish()));
        output.present();

        Ok(())
    }

    pub fn add_layer(&mut self, layer: impl RenderLayer + 'static) {
        self.scene.add_layer(layer, &self.surface_config);
    }

    pub fn tile_width(&self) -> u32 {
        self.scene.tile_width()
    }

    pub fn tile_height(&self) -> u32 {
        self.scene.tile_height()
    }

    pub fn update_locations(&mut self, arrays: &LocationArrays) {
        let queue = &self.gpu.gpu.queue;
        self.scene.update_locations(queue, arrays);
    }

    pub fn resources(&self) -> &MapResources {
        self.scene.resources()
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.gpu.gpu.queue
    }

    #[cfg_attr(feature = "tracing", tracing::instrument(skip(self), level = "debug"))]
    pub fn resize(&mut self, size: PhysicalSize<u32>) {
        self.surface_config.width = size.width;
        self.surface_config.height = size.height;
        self.surface
            .configure(&self.scene.renderer().device, &self.surface_config);
        self.scene.resize_layers(&self.surface_config);
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.scene.renderer_mut().config.enable_location_borders = enabled;
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.scene.renderer_mut().config.enable_owner_borders = enabled;
    }

    /// Get location ID at world coordinates using direct input texture sampling
    /// This avoids viewport manipulation and provides fast cursor-to-location mapping
    pub fn create_color_id_readback_at(
        &self,
        world_x: i32,
        world_y: i32,
    ) -> Result<ColorIdReadback, RenderError> {
        let global_x = world_x;
        let global_y = world_y.clamp(0, (self.tile_height() - 1) as i32);

        // Handle world wraparound (same logic as shader)
        let world_width = (self.tile_width() * 2) as i32;
        let wrapped_x = ((global_x % world_width) + world_width) % world_width;

        // Determine which texture and local coordinates
        let (texture, local_x) = if wrapped_x < self.tile_width() as i32 {
            // West texture
            (
                self.scene.resources().west_texture().texture(),
                wrapped_x as u32,
            )
        } else {
            // East texture
            (
                self.scene.resources().east_texture().texture(),
                (wrapped_x - self.tile_width() as i32) as u32,
            )
        };

        // Read single pixel from input texture (contains raw color ID)
        let buffer_size = 256u32;
        let pixel_staging_buffer =
            self.scene
                .renderer()
                .device
                .create_buffer(&wgpu::BufferDescriptor {
                    label: Some("Single Pixel Staging Buffer"),
                    size: buffer_size as u64,
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                });

        let mut encoder =
            self.scene
                .renderer()
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Single Pixel Readback Encoder"),
                });

        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d {
                    x: local_x,
                    y: global_y as u32,
                    z: 0,
                },
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

        self.queue().submit(Some(encoder.finish()));

        let (sender, receiver) = futures_channel::oneshot::channel();
        pixel_staging_buffer
            .slice(..)
            .map_async(wgpu::MapMode::Read, |result| {
                let _ = sender.send(result);
            });

        Ok(ColorIdReadback {
            receiver,
            pixel_staging_buffer,
        })
    }

    /// Queue work and return a future that completes when the GPU work is done
    pub fn queued_work(&self) -> QueuedWorkFuture {
        let (sender, receiver) = futures_channel::oneshot::channel();
        self.queue().on_submitted_work_done(|| {
            let _ = sender.send(());
        });

        QueuedWorkFuture { receiver }
    }

    /// Create an independent screenshot renderer that shares GPU resources but
    /// operates with a separate surface
    #[cfg(feature = "render")]
    pub fn create_screenshot_renderer(
        &self,
        screenshot_target: SurfaceTarget<'static>,
        size: PhysicalSize<u32>,
    ) -> Result<Self, RenderError> {
        let surface = self.gpu.create_surface(screenshot_target)?;
        let surface_config = self.gpu.surface_config_for_surface(&surface, size);
        surface.configure(&self.scene.renderer().device, &surface_config);

        let renderer = MapRenderer::from_existing(self.scene.renderer());
        let resources = self.scene.resources().clone();
        let scene = MapScene::new(renderer, resources);

        Ok(Self {
            scene,
            surface,
            surface_config,
            gpu: self.gpu.clone(),
        })
    }
}

fn offscreen_surface_config(
    width: u32,
    height: u32,
    format: wgpu::TextureFormat,
) -> wgpu::SurfaceConfiguration {
    wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        format,
        width,
        height,
        present_mode: wgpu::PresentMode::Fifo,
        alpha_mode: wgpu::CompositeAlphaMode::Opaque,
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    }
}

pub struct HeadlessMapRenderer {
    gpu: GpuContext,
    scene: MapScene,

    // Offscreen rendering target
    viewport_texture: wgpu::Texture,
    viewport_staging_buffer: Option<wgpu::Buffer>,
    target_config: wgpu::SurfaceConfiguration,
}

impl HeadlessMapRenderer {
    /// Create a headless map renderer from initialized GPU context and texture data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(skip(gpu, west_texture, east_texture), level = "info")
    )]
    pub fn new(
        gpu: GpuContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
        viewport_width: u32,
        viewport_height: u32,
    ) -> Result<HeadlessMapRenderer, RenderError> {
        let device = &gpu.gpu.device;

        // Create offscreen rendering target
        let viewport_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Viewport Offscreen Texture"),
            size: wgpu::Extent3d {
                width: viewport_width,
                height: viewport_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            // Palette values are already gamma-encoded, so render to a linear target to avoid double encoding
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        let renderer = MapRenderer::new(&gpu, west_texture.width(), west_texture.height());
        let resources = MapResources::new(&gpu, west_texture, east_texture);
        let scene = MapScene::new(renderer, resources);
        let target_config =
            offscreen_surface_config(viewport_width, viewport_height, viewport_texture.format());
        Ok(HeadlessMapRenderer {
            gpu,
            scene,
            viewport_texture,
            viewport_staging_buffer: None,
            target_config,
        })
    }

    /// Render an arbitrary viewport to the offscreen texture and read back the bytes.
    #[cfg_attr(feature = "tracing", tracing::instrument(skip(self), fields(bounds = %bounds)))]
    pub async fn capture_viewport(
        &mut self,
        bounds: ViewportBounds,
    ) -> Result<PdxBufferView<'_>, RenderError> {
        // Note: we trust the caller has resized() this renderer to match the buffer size
        let texture_width = self.viewport_texture.width();
        let texture_height = self.viewport_texture.height();

        // Calculate the zoom level required to fit the requested world bounds
        // into the current texture dimensions.
        // zoom = pixels / world_units
        let zoom_x = texture_width as f32 / bounds.width as f32;
        let zoom_y = texture_height as f32 / bounds.height as f32;

        // Create the actual bounds passed to the shader
        // We use the calculated zoom, but keep the requested x/y/width/height
        let render_bounds = ViewportBounds {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            zoom_level: zoom_x.max(zoom_y),
        };

        // Calculate aligned bytes per row for GPU copy
        const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;
        let unpadded_bytes_per_row = bounds.width * 4;

        // Align a value to the given alignment (power of 2)
        let alignment = COPY_BYTES_PER_ROW_ALIGNMENT;
        let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(alignment) * alignment;

        // Create staging buffer if it doesn't exist or has wrong size
        let buffer_size = (padded_bytes_per_row * bounds.height) as u64;
        if self.viewport_staging_buffer.is_none()
            || self
                .viewport_staging_buffer
                .as_ref()
                .is_some_and(|b| b.size() != buffer_size)
        {
            self.viewport_staging_buffer = Some(self.scene.renderer().device.create_buffer(
                &wgpu::BufferDescriptor {
                    label: Some("Viewport Staging Buffer"),
                    size: buffer_size,
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                },
            ));
        }

        let viewport_staging_buffer = self.viewport_staging_buffer.as_ref().unwrap();

        let device = &self.scene.renderer().device;
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Offscreen Render Encoder"),
        });

        let render_view = self
            .viewport_texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let queue = &self.gpu.gpu.queue;
        self.scene.update_layers(queue);

        let bind_group = {
            let renderer = self.scene.renderer();
            let resources = self.scene.resources();
            let size = PhysicalSize::new(
                self.viewport_texture.width(),
                self.viewport_texture.height(),
            );
            renderer.prepare_bind_group(queue, resources, render_bounds, size)
        };

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Offscreen Map Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &render_view,
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

            let size = PhysicalSize::new(
                self.viewport_texture.width(),
                self.viewport_texture.height(),
            );
            self.scene.draw(
                &mut pass,
                &bind_group,
                self.viewport_texture.format(),
                &render_bounds,
                size,
            );
        }

        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.viewport_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: viewport_staging_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(bounds.height),
                },
            },
            wgpu::Extent3d {
                width: bounds.width,
                height: bounds.height,
                depth_or_array_layers: 1,
            },
        );

        self.queue().submit(Some(encoder.finish()));

        // Read back results
        let buffer_slice = viewport_staging_buffer.slice(..buffer_size);
        let (sender, receiver) = futures_channel::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        self.scene.renderer().device.poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })?;
        receiver.await??;

        let data = buffer_slice.get_mapped_range();

        Ok(PdxBufferView::new(
            viewport_staging_buffer,
            data,
            bounds.width,
            padded_bytes_per_row,
        ))
    }

    /// Resize the internal offscreen texture.
    pub fn resize(&mut self, size: PhysicalSize<u32>) {
        if self.target_config.width == size.width && self.target_config.height == size.height {
            return;
        }

        // Recreate texture with new dimensions
        self.viewport_texture = self
            .gpu
            .gpu
            .device
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("Viewport Offscreen Texture"),
                size: wgpu::Extent3d {
                    width: size.width,
                    height: size.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            });

        // Update config
        self.target_config.width = size.width;
        self.target_config.height = size.height;

        // Invalidate staging buffer so it gets recreated with correct size on next readback
        self.viewport_staging_buffer = None;
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.scene.renderer_mut().config.enable_location_borders = enabled;
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.scene.renderer_mut().config.enable_owner_borders = enabled;
    }

    pub fn add_layer(&mut self, layer: impl RenderLayer + 'static) -> LayerId {
        self.scene.add_layer(layer, &self.target_config)
    }

    pub fn set_layer_visible(&mut self, id: LayerId, visible: bool) {
        self.scene.set_layer_visible(id, visible);
    }

    pub fn update_locations(&mut self, arrays: &LocationArrays) {
        let queue = &self.gpu.gpu.queue;
        self.scene.update_locations(queue, arrays);
    }

    pub fn resources(&self) -> &MapResources {
        self.scene.resources()
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.gpu.gpu.queue
    }
}

#[derive(Debug)]
pub struct PdxBufferView<'a> {
    buffer: &'a wgpu::Buffer,
    view: Option<wgpu::BufferView>,
    width: u32,
    stride: u32,
}

impl<'a> PdxBufferView<'a> {
    pub fn new(buffer: &'a wgpu::Buffer, view: wgpu::BufferView, width: u32, stride: u32) -> Self {
        Self {
            buffer,
            view: Some(view),
            width,
            stride,
        }
    }

    pub fn rows(&self) -> impl ExactSizeIterator<Item = &[u8]> + use<'_> {
        let unpadded_bytes = (self.width * 4) as usize;
        self.view
            .as_ref()
            .expect("buffer is not finished")
            .chunks_exact(self.stride as usize)
            .map(move |row| &row[..unpadded_bytes])
    }

    pub fn finish(mut self) {
        self.finish_internal();
    }

    fn finish_internal(&mut self) {
        if let Some(view) = self.view.take() {
            drop(view);
            self.buffer.unmap();
        }
    }
}

impl Drop for PdxBufferView<'_> {
    fn drop(&mut self) {
        self.finish_internal();
    }
}

fn choose_present_mode(available_modes: &[wgpu::PresentMode]) -> wgpu::PresentMode {
    // Mailbox is preferred for an input-based application as we only care about
    // the latest frame.
    let preferred = wgpu::PresentMode::Mailbox;
    let result = if available_modes.contains(&preferred) {
        preferred
    } else {
        // Fallback to FIFO as it's supported everywhere and similar to mailbox,
        // won't have tearing.
        wgpu::PresentMode::Fifo
    };

    #[cfg(feature = "tracing")]
    tracing::debug!(name: "renderer.present_mode.selected", present_mode = ?result, available_options = ?available_modes);
    result
}

fn choose_texture_format(available_textures: &[wgpu::TextureFormat]) -> wgpu::TextureFormat {
    // Our input colors are already gamma-corrected, so prefer non-sRGB formats.
    // (eg. if we england's map color is #FF0000, we want it to appear as pure
    // red on the screen too).
    let result = available_textures
        .iter()
        .find(|x| !x.is_srgb())
        .copied()
        .unwrap_or(available_textures[0]);

    #[cfg(feature = "tracing")]
    tracing::debug!(name: "renderer.texture_format.selected", texture_format = ?result, available_options = ?available_textures);
    result
}
