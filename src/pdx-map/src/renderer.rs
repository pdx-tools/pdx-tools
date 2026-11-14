use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use wgpu::SurfaceTarget;

use crate::error::{RenderError, RenderErrorKind, SurfaceError};
use crate::frame_tracker::FrameTracker;
use crate::image::{StitchedImage, StripPlan};
use crate::{
    GpuLocationIdx, HemisphereSize, LocationArrays, LocationFlags, PhysicalSize, R16,
    ViewportBounds, WorldPoint, WorldRect, WorldSize,
};

/// A drawable layer that can be composed into the main map render pass.
///
/// A layer shows the same picture for the same view and render target: a
/// surface renderer draws a new frame only when its own state changes.
pub trait RenderLayer: Send + Sync {
    /// Called when the render target is resized so layers can recreate GPU state
    fn resize(&mut self, _config: &wgpu::SurfaceConfiguration, _device: &wgpu::Device) {}

    /// Called before rendering to upload any per-frame data to the GPU
    fn update(&mut self, _queue: &wgpu::Queue) {}

    /// Record draw commands for this layer
    fn draw(
        &self,
        pass: &mut wgpu::RenderPass<'_>,
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
pub(crate) const MAX_TEXTURE_DIMENSION: u32 = 8192;

/// Combines a texture and its view for map rendering operations
#[derive(Debug, Clone)]
pub struct MapTexture {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
}

impl MapTexture {
    /// Create a new MapTexture
    pub(crate) fn new(texture: wgpu::Texture, view: wgpu::TextureView) -> Self {
        Self { texture, view }
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
        self.texture.size().width
    }

    /// Get the texture height
    pub fn height(&self) -> u32 {
        self.texture.size().height
    }
}

/// Rendering configuration - constants and user-configurable options
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct RenderConfig {
    hemisphere: HemisphereSize<u32>,

    pub enable_location_borders: bool,
    pub enable_owner_borders: bool,
    pub interaction_mask: LocationFlags,
}

impl RenderConfig {
    /// Create a new render configuration
    pub(crate) fn new(hemisphere: HemisphereSize<u32>) -> Self {
        Self {
            hemisphere,
            enable_location_borders: true,
            enable_owner_borders: true,
            interaction_mask: LocationFlags::INTERACTION,
        }
    }

    fn disable_interactions(&mut self) {
        self.interaction_mask = LocationFlags::empty();
    }

    fn set_interaction_mask(&mut self, mask: LocationFlags) {
        self.interaction_mask =
            LocationFlags::from_bits(mask.bits() & LocationFlags::INTERACTION.bits());
    }

    /// Get the hemisphere size
    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.hemisphere
    }
}

/// Uniforms for the resolve pass: the map geometry
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct ResolveUniforms {
    tile_width: u32,
    tile_height: u32,
    view_x: u32,
    view_y: u32,

    view_width: u32,
    view_height: u32,
    surface_width: u32,
    surface_height: u32,

    guard_band_x: u32,
    guard_band_y: u32,
    _pad0: u32,
    _pad1: u32,
}

/// Physical pixels the resolved target extends past the output on each
/// side. The shade pass reads neighbors of edge pixels from this band, so
/// borders continue across the seams of tiled renders and do not pop at
/// the screen edge while panning. Covers an owner border on a 4x display.
///
/// This is the upper limit. [`GuardBand`] shrinks it on an axis where the
/// output is near [`MAX_TEXTURE_DIMENSION`], down to zero at the limit.
const GUARD_BAND: u32 = 8;

/// Widest output that keeps the full guard band on its left and right.
pub(crate) const MAX_SEAMLESS_WIDTH: u32 = MAX_TEXTURE_DIMENSION - 2 * GUARD_BAND;

/// Uniforms for the shade pass: the appearance
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct ShadeUniforms {
    surface_width: u32,
    surface_height: u32,
    enable_location_borders: u32,
    enable_owner_borders: u32,

    interaction_mask: u32,
    scale_factor: f32,
    stripe_phase_x: f32,
    stripe_phase_y: f32,

    location_border_radius: u32,
    owner_border_radius: u32,
    owner_glow_radius: u32,
    // Strength of the owner border, coast, and impassable edge darkening
    edge_strength: f32,

    // Strength of the location border darkening
    location_edge_strength: f32,
    guard_band_x: u32,
    guard_band_y: u32,
    _pad0: u32,
}

/// Border widths in logical pixels at zoom 1. The owner border is a thin
/// line: at two pixels a side, small countries were mostly border. The
/// wider light band inside it carries the weight of the frontier.
const LOCATION_BORDER_WIDTH: f32 = 1.0;
const OWNER_BORDER_WIDTH: f32 = 1.0;
/// Logical width of the light band inside an owner border
const OWNER_GLOW_WIDTH: f32 = 2.0;

/// Strength of the border darkening for a zoom level.
///
/// Zoomed out, borders are one pixel wide and dense, so full-strength
/// lines darken the whole map. The strength eases from 1 at zoom 1 to 0.6
/// at the smallest zoom, in the same spirit as the border radius.
fn edge_strength(zoom_level: f32) -> f32 {
    0.6 + 0.4 * zoom_level.clamp(0.0, 1.0)
}

/// Strength of the location border darkening for a zoom level.
///
/// Zoomed out, the location grid is texture, not information, so it fades
/// faster than the political borders: from 1 at zoom 1 to 0.3 at the
/// smallest zoom.
fn location_edge_strength(zoom_level: f32) -> f32 {
    0.3 + 0.7 * zoom_level.clamp(0.0, 1.0)
}

/// Physical pixel radius of a border.
///
/// At zoom 1 and above the border keeps its logical width. When zoomed out
/// it shrinks with the map so thick borders do not dominate the view, but
/// never below one logical pixel.
fn border_radius(logical_width: f32, zoom_level: f32, scale_factor: f32) -> u32 {
    let logical = (logical_width * zoom_level.min(1.0)).max(1.0);
    ((logical * scale_factor).round() as u32).max(1)
}

impl ShadeUniforms {
    fn new(config: &RenderConfig, bounds: ViewportBounds, size: PhysicalSize<u32>) -> Self {
        // Physical pixels per world pixel on each axis
        let px_scale_x = size.width as f32 / bounds.rect.size.width.max(1) as f32;
        let px_scale_y = size.height as f32 / bounds.rect.size.height.max(1) as f32;
        let band = GuardBand::around(size);

        // The zoom level is logical pixels per world pixel, so the ratio to
        // the physical scale recovers the display scale factor. Deriving it
        // here keeps the shade pass correct for any surface size, including
        // screenshot and headless targets.
        let scale_factor = if bounds.zoom_level > 0.0 {
            px_scale_x / bounds.zoom_level
        } else {
            1.0
        };

        Self {
            surface_width: size.width,
            surface_height: size.height,
            enable_location_borders: config.enable_location_borders as u32,
            enable_owner_borders: config.enable_owner_borders as u32,
            interaction_mask: config.interaction_mask.bits(),
            scale_factor,
            stripe_phase_x: bounds.rect.origin.x as f32 * px_scale_x,
            stripe_phase_y: bounds.rect.origin.y as f32 * px_scale_y,
            location_border_radius: border_radius(
                LOCATION_BORDER_WIDTH,
                bounds.zoom_level,
                scale_factor,
            ),
            owner_border_radius: border_radius(OWNER_BORDER_WIDTH, bounds.zoom_level, scale_factor),
            owner_glow_radius: border_radius(OWNER_GLOW_WIDTH, bounds.zoom_level, scale_factor),
            edge_strength: edge_strength(bounds.zoom_level),
            location_edge_strength: location_edge_strength(bounds.zoom_level),
            guard_band_x: band.x,
            guard_band_y: band.y,
            _pad0: 0,
        }
    }
}

/// Format of the intermediate location index target
const RESOLVED_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::R16Uint;

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
}

impl GpuContext {
    /// Create a new headless GPU context for map rendering
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.gpu.acquire", skip_all, level = "info")
    )]
    pub async fn new() -> Result<Self, RenderError> {
        let instance = Self::create_instance();
        let adapter = Self::request_adapter(&instance, None).await?;
        Self::from_instance_and_adapter(instance, adapter).await
    }

    /// Create an R16Uint storage texture for location index data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.gpu.create-texture", skip(self, texture_data), level = "debug", fields(texture_len = texture_data.len()))
    )]
    pub fn create_texture(
        &self,
        texture_data: &[R16],
        size: PhysicalSize<u32>,
        label: &'static str,
    ) -> MapTexture {
        // Validate dimensions
        assert!(
            size.width <= MAX_TEXTURE_DIMENSION && size.height <= MAX_TEXTURE_DIMENSION,
            "Texture dimensions ({}x{}) exceed maximum supported dimension ({MAX_TEXTURE_DIMENSION})",
            size.width,
            size.height
        );

        let texture = self.gpu.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width: size.width,
                height: size.height,
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
            bytemuck::cast_slice(texture_data),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(2 * size.width), // R16 = 2 bytes per pixel
                rows_per_image: Some(size.height),
            },
            wgpu::Extent3d {
                width: size.width,
                height: size.height,
                depth_or_array_layers: 1,
            },
        );

        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        MapTexture::new(texture, view)
    }

    /// Create a new GPU instance
    pub fn create_instance() -> wgpu::Instance {
        wgpu::Instance::new(wgpu::InstanceDescriptor {
            // Use DX12 backend on Windows as it seems less susceptible to
            // swap-chain issues. and DX12 will become the default on windows
            // someday: https://github.com/gfx-rs/wgpu/issues/2719
            #[cfg(target_os = "windows")]
            backends: wgpu::Backends::DX12,
            #[cfg(not(target_os = "windows"))]
            backends: wgpu::Backends::all(),
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        })
    }

    /// Request a GPU adapter
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.gpu.request-adapter", skip_all, level = "debug")
    )]
    async fn request_adapter(
        instance: &wgpu::Instance,
        surface: Option<&wgpu::Surface<'_>>,
    ) -> Result<wgpu::Adapter, RenderError> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: surface,
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await?;

        Ok(adapter)
    }

    /// Initialize GPU device, adapter, buffers, and pipelines from an adapter
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.gpu.construct", skip_all, level = "info")
    )]
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

        Ok(GpuContext { gpu, instance })
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
            color_space: wgpu::SurfaceColorSpace::Auto,
        }
    }
}

pub struct GpuSurfaceContext {
    core: GpuContext,
    surface: wgpu::Surface<'static>,
}

impl GpuSurfaceContext {
    /// Create a new GPU surface context for rendering to a surface
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.gpu.new-surface", skip_all, level = "info")
    )]
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
        texture_data: &[R16],
        size: PhysicalSize<u32>,
        label: &'static str,
    ) -> MapTexture {
        self.core.create_texture(texture_data, size, label)
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
#[derive(Debug, Clone)]
pub(crate) struct MapResources {
    // Textures
    west_texture: MapTexture,
    east_texture: MapTexture,

    // Storage buffers
    primary_colors: wgpu::Buffer,
    border_colors: wgpu::Buffer,
    secondary_colors: wgpu::Buffer,
    states: wgpu::Buffer,

    // Incremented when a buffer is reallocated so renderers rebuild their
    // bind groups
    generation: u64,
}

impl MapResources {
    /// Create new map resources from textures
    pub fn new(ctx: &GpuContext, west: MapTexture, east: MapTexture) -> Self {
        let device = &ctx.gpu.device;

        let [primary_colors, border_colors, secondary_colors, states] =
            Self::location_buffers(device, 1);

        Self {
            west_texture: west,
            east_texture: east,
            primary_colors,
            border_colors,
            secondary_colors,
            states,
            generation: 0,
        }
    }

    /// Update storage buffers from location arrays
    pub fn update(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, arrays: &LocationArrays) {
        self.update_colors(device, queue, arrays);
        self.update_flags(device, queue, arrays);
    }

    /// Update the primary, owner, and secondary color buffers.
    pub fn update_colors(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        arrays: &LocationArrays,
    ) {
        self.ensure_capacity(device, arrays.len());
        let buffers = arrays.buffers();

        queue.write_buffer(
            &self.primary_colors,
            0,
            bytemuck::cast_slice(buffers.primary_colors()),
        );
        queue.write_buffer(
            &self.border_colors,
            0,
            bytemuck::cast_slice(buffers.border_colors()),
        );
        queue.write_buffer(
            &self.secondary_colors,
            0,
            bytemuck::cast_slice(buffers.secondary_colors()),
        );
    }

    /// Update the state flags buffer.
    pub fn update_flags(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        arrays: &LocationArrays,
    ) {
        self.ensure_capacity(device, arrays.len());
        let buffers = arrays.buffers();
        queue.write_buffer(&self.states, 0, bytemuck::cast_slice(buffers.state_flags()));
    }

    fn ensure_capacity(&mut self, device: &wgpu::Device, locations: usize) {
        if locations > (self.border_colors.size() as usize / std::mem::size_of::<u32>()) {
            let [primary_colors, border_colors, secondary_colors, states] =
                Self::location_buffers(device, locations as u64);
            self.primary_colors = primary_colors;
            self.border_colors = border_colors;
            self.secondary_colors = secondary_colors;
            self.states = states;
            self.generation += 1;
        }
    }

    fn location_buffers(device: &wgpu::Device, locations: u64) -> [wgpu::Buffer; 4] {
        [
            "Location Primary Colors Buffer",
            "Location Border Colors Buffer",
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

/// Shader modules and bind group layouts for the resolve and shade passes.
/// Shared between renderers that use the same device.
#[derive(Clone)]
struct MapPipelines {
    resolve_layout: wgpu::BindGroupLayout,
    resolve_pipeline: wgpu::RenderPipeline,
    shade_shader: wgpu::ShaderModule,
    shade_layout: wgpu::BindGroupLayout,
}

impl MapPipelines {
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.map-shader.compile", skip_all, level = "debug")
    )]
    fn new(device: &wgpu::Device) -> Self {
        let resolve_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Map Resolve Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("./shaders/resolve.wgsl").into()),
        });
        let shade_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Map Shade Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("./shaders/shade.wgsl").into()),
        });

        let resolve_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Map Resolve Bind Group Layout"),
            entries: &[
                // Binding 0: West input texture
                uint_texture_entry(0),
                // Binding 1: East input texture
                uint_texture_entry(1),
                // Binding 2: Resolve uniforms
                uniform_entry(2),
            ],
        });

        let shade_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Map Shade Bind Group Layout"),
            entries: &[
                // Binding 0: Resolved location index texture
                uint_texture_entry(0),
                // Binding 1: Shade uniforms
                uniform_entry(1),
                // Binding 2: Location primary colors buffer
                storage_entry(2),
                // Binding 3: Location states buffer
                storage_entry(3),
                // Binding 4: Location border colors buffer
                storage_entry(4),
                // Binding 5: Location secondary colors buffer
                storage_entry(5),
            ],
        });

        // The resolve target format never changes, so its pipeline is built once
        let resolve_pipeline = fullscreen_pipeline(
            device,
            "Map Resolve Pipeline",
            &resolve_shader,
            &resolve_layout,
            RESOLVED_FORMAT,
        );

        Self {
            resolve_layout,
            resolve_pipeline,
            shade_shader,
            shade_layout,
        }
    }
}

fn uint_texture_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Uint,
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn storage_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only: true },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

/// Create a fullscreen triangle pipeline for a shader with `vs_main` and
/// `fs_main` entry points
fn fullscreen_pipeline(
    device: &wgpu::Device,
    label: &str,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    // Integer formats do not support blending
    let blend = if format.sample_type(None, None)
        == Some(wgpu::TextureSampleType::Float { filterable: true })
        || format.sample_type(None, None)
            == Some(wgpu::TextureSampleType::Float { filterable: false })
    {
        Some(wgpu::BlendState::REPLACE)
    } else {
        None
    };
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some(label),
        bind_group_layouts: &[Some(layout)],
        immediate_size: 0,
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend,
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
        multiview_mask: None,
        cache: None,
    })
}

/// The location index target that the resolve pass writes and the shade
/// pass reads. Sized to the render target plus the guard band.
struct ResolvedTarget {
    /// Output size, without the guard band
    size: PhysicalSize<u32>,
    view: wgpu::TextureView,
}

impl ResolvedTarget {
    fn new(device: &wgpu::Device, size: PhysicalSize<u32>) -> Self {
        let band = GuardBand::around(size);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Resolved Location Texture"),
            size: wgpu::Extent3d {
                width: size.width.max(1) + band.x * 2,
                height: size.height.max(1) + band.y * 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: RESOLVED_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        Self { size, view }
    }
}

/// The guard band on each axis that fits around an output.
///
/// The resolved target grows by the band on each side, so an axis near
/// [`MAX_TEXTURE_DIMENSION`] uses a smaller band to stay inside it. Each
/// axis has its own band, so a tall, narrow strip keeps the full band at
/// its left and right.
#[derive(Debug, Clone, Copy)]
struct GuardBand {
    x: u32,
    y: u32,
}

impl GuardBand {
    fn around(size: PhysicalSize<u32>) -> Self {
        let fit =
            |length: u32| GUARD_BAND.min(MAX_TEXTURE_DIMENSION.saturating_sub(length.max(1)) / 2);
        Self {
            x: fit(size.width),
            y: fit(size.height),
        }
    }
}

/// Bind groups for one frame. Cached until the resources or the resolved
/// target change.
struct FrameBindGroups {
    resources_generation: u64,
    resolve: wgpu::BindGroup,
    shade: wgpu::BindGroup,
}

/// GPU handles a frame needs to record the resolve and shade passes
pub(crate) struct MapFrame {
    resolved_view: wgpu::TextureView,
    resolve_bind_group: wgpu::BindGroup,
    shade_bind_group: wgpu::BindGroup,
    shade_pipeline: wgpu::RenderPipeline,
}

/// Records the resolve and shade passes. Owns the per-renderer state: the
/// uniform buffers, the resolved target, and a pipeline cache for the shade
/// pass keyed by output format.
pub(crate) struct MapRenderer {
    // Need device for creating pipelines and bind groups
    device: wgpu::Device,

    pipelines: MapPipelines,

    resolve_uniforms: wgpu::Buffer,
    shade_uniforms: wgpu::Buffer,

    resolved: Option<ResolvedTarget>,
    frame_bind_groups: Option<FrameBindGroups>,

    // Shade pipeline cache: TextureFormat -> RenderPipeline
    shade_pipelines: HashMap<wgpu::TextureFormat, wgpu::RenderPipeline>,

    // Rendering configuration
    config: RenderConfig,
}

impl MapRenderer {
    /// Create a new renderer with the given tile dimensions
    pub fn new(ctx: &GpuContext, hemisphere: HemisphereSize<u32>) -> Self {
        let device = &ctx.gpu.device;
        let pipelines = MapPipelines::new(device);
        Self::with_pipelines(device, pipelines, RenderConfig::new(hemisphere))
    }

    /// Create a new renderer that reuses an existing device and pipelines
    /// but has its own uniforms, resolved target, and caches
    pub fn from_existing(renderer: &MapRenderer) -> Self {
        Self::with_pipelines(
            &renderer.device,
            renderer.pipelines.clone(),
            renderer.config,
        )
    }

    fn with_pipelines(
        device: &wgpu::Device,
        pipelines: MapPipelines,
        config: RenderConfig,
    ) -> Self {
        Self {
            device: device.clone(),
            pipelines,
            resolve_uniforms: uniform_buffer::<ResolveUniforms>(device, "Resolve Uniform Buffer"),
            shade_uniforms: uniform_buffer::<ShadeUniforms>(device, "Shade Uniform Buffer"),
            resolved: None,
            frame_bind_groups: None,
            shade_pipelines: HashMap::new(),
            config,
        }
    }

    /// Get the size of the hemisphere
    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.config.hemisphere_size()
    }

    /// Upload the frame uniforms and return the handles the passes need.
    ///
    /// `size` is the physical size and `format` the texture format of the
    /// output. The resolved target is recreated when the size differs.
    pub fn prepare_frame(
        &mut self,
        queue: &wgpu::Queue,
        resources: &MapResources,
        bounds: ViewportBounds,
        size: PhysicalSize<u32>,
        format: wgpu::TextureFormat,
    ) -> MapFrame {
        let hemisphere = self.config.hemisphere_size();
        let band = GuardBand::around(size);
        let resolve_uniforms = ResolveUniforms {
            tile_width: hemisphere.width,
            tile_height: hemisphere.height,
            view_x: bounds.rect.origin.x,
            view_y: bounds.rect.origin.y,
            view_width: bounds.rect.size.width,
            view_height: bounds.rect.size.height,
            surface_width: size.width,
            surface_height: size.height,
            guard_band_x: band.x,
            guard_band_y: band.y,
            _pad0: 0,
            _pad1: 0,
        };
        queue.write_buffer(
            &self.resolve_uniforms,
            0,
            bytemuck::cast_slice(&[resolve_uniforms]),
        );

        let shade_uniforms = ShadeUniforms::new(&self.config, bounds, size);
        queue.write_buffer(
            &self.shade_uniforms,
            0,
            bytemuck::cast_slice(&[shade_uniforms]),
        );

        let resolved_view = self.ensure_resolved_target(size);
        let bind_groups = self.ensure_bind_groups(resources, &resolved_view);

        MapFrame {
            resolved_view,
            resolve_bind_group: bind_groups.0,
            shade_bind_group: bind_groups.1,
            shade_pipeline: self.shade_pipeline_for_format(format),
        }
    }

    fn ensure_resolved_target(&mut self, size: PhysicalSize<u32>) -> wgpu::TextureView {
        match &self.resolved {
            Some(target) if target.size == size => target.view.clone(),
            _ => {
                let target = ResolvedTarget::new(&self.device, size);
                let view = target.view.clone();
                self.resolved = Some(target);
                // The shade bind group holds the old view
                self.frame_bind_groups = None;
                view
            }
        }
    }

    fn ensure_bind_groups(
        &mut self,
        resources: &MapResources,
        resolved_view: &wgpu::TextureView,
    ) -> (wgpu::BindGroup, wgpu::BindGroup) {
        let generation = resources.generation;
        if let Some(groups) = &self.frame_bind_groups
            && groups.resources_generation == generation
        {
            // wgpu objects are essentially Arcs, so cloning handles is cheap.
            return (groups.resolve.clone(), groups.shade.clone());
        }

        let resolve = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Map Resolve Bind Group"),
            layout: &self.pipelines.resolve_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(resources.west_texture.view()),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(resources.east_texture.view()),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.resolve_uniforms.as_entire_binding(),
                },
            ],
        });

        let shade = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Map Shade Bind Group"),
            layout: &self.pipelines.shade_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(resolved_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: self.shade_uniforms.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: resources.primary_colors.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: resources.states.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: resources.border_colors.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: resources.secondary_colors.as_entire_binding(),
                },
            ],
        });

        self.frame_bind_groups = Some(FrameBindGroups {
            resources_generation: generation,
            resolve: resolve.clone(),
            shade: shade.clone(),
        });
        (resolve, shade)
    }

    /// Record the resolve pass, which writes the location index of each
    /// output pixel to the resolved target
    pub fn resolve(&self, encoder: &mut wgpu::CommandEncoder, frame: &MapFrame) {
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("Map Resolve Pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &frame.resolved_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    // The fullscreen triangle overwrites every pixel, and a
                    // clear is cheaper than a load on tiled GPUs
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
                depth_slice: None,
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });

        pass.set_pipeline(&self.pipelines.resolve_pipeline);
        pass.set_bind_group(0, &frame.resolve_bind_group, &[]);
        pass.draw(0..3, 0..1); // Full-screen triangle
    }

    /// Record the shade pass into an existing render pass
    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>, frame: &MapFrame) {
        pass.set_pipeline(&frame.shade_pipeline);
        pass.set_bind_group(0, &frame.shade_bind_group, &[]);
        pass.draw(0..3, 0..1); // Full-screen triangle
    }

    /// Get or create a shade pipeline for the given output format
    fn shade_pipeline_for_format(&mut self, format: wgpu::TextureFormat) -> wgpu::RenderPipeline {
        self.shade_pipelines
            .entry(format)
            .or_insert_with(|| {
                fullscreen_pipeline(
                    &self.device,
                    "Map Shade Pipeline",
                    &self.pipelines.shade_shader,
                    &self.pipelines.shade_layout,
                    format,
                )
            })
            .clone()
    }
}

fn uniform_buffer<T>(device: &wgpu::Device, label: &str) -> wgpu::Buffer {
    device.create_buffer(&wgpu::BufferDescriptor {
        label: Some(label),
        size: std::mem::size_of::<T>() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    })
}

/// Shared scene state for both onscreen and headless rendering
pub(crate) struct MapScene {
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

    /// Whether a layer is drawn, to toggle at no cost compared to adding or
    /// removing it
    pub fn layer_visible_mut(&mut self, id: LayerId) -> Option<&mut bool> {
        let entry = self.layers.iter_mut().find(|e| e.id == id)?;
        Some(&mut entry.visible)
    }

    /// Upload the frame uniforms and return the handles the passes need
    pub fn prepare_frame(
        &mut self,
        queue: &wgpu::Queue,
        bounds: ViewportBounds,
        size: PhysicalSize<u32>,
        format: wgpu::TextureFormat,
    ) -> MapFrame {
        self.base_renderer
            .prepare_frame(queue, &self.resources, bounds, size, format)
    }

    /// Record the shade pass and the visible layers
    pub fn draw(
        &self,
        pass: &mut wgpu::RenderPass<'_>,
        frame: &MapFrame,
        viewport: &ViewportBounds,
        size: PhysicalSize<u32>,
    ) {
        self.base_renderer.draw(pass, frame);

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

    pub fn update_colors(&mut self, queue: &wgpu::Queue, arrays: &LocationArrays) {
        let device = &self.base_renderer.device;
        self.resources.update_colors(device, queue, arrays);
    }

    pub fn update_flags(&mut self, queue: &wgpu::Queue, arrays: &LocationArrays) {
        let device = &self.base_renderer.device;
        self.resources.update_flags(device, queue, arrays);
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

    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.base_renderer.hemisphere_size()
    }

    pub fn config(&self) -> &RenderConfig {
        &self.base_renderer.config
    }

    pub fn config_mut(&mut self) -> &mut RenderConfig {
        &mut self.base_renderer.config
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.base_renderer.device
    }

    pub fn resources(&self) -> &MapResources {
        &self.resources
    }

    pub fn renderer(&self) -> &MapRenderer {
        &self.base_renderer
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

        let pixel_data = self
            .pixel_staging_buffer
            .slice(0..8)
            .get_mapped_range()
            .expect("buffer mapped successfully");
        let mut result = [0u8; 2];
        result.copy_from_slice(&pixel_data[0..2]);

        drop(pixel_data);
        self.pixel_staging_buffer.unmap();

        let idx = u16::from_le_bytes(result);
        GpuLocationIdx::new(idx)
    }
}

/// Draws the map on a window or canvas surface, and knows whether the
/// surface still shows the current picture. Every change to what it draws
/// goes through its methods, which make a frame due.
pub struct SurfaceMapRenderer {
    scene: MapScene,
    surface: wgpu::Surface<'static>,
    surface_config: wgpu::SurfaceConfiguration,
    gpu: GpuContext,
    frame: FrameTracker,
}

impl SurfaceMapRenderer {
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.surface.new", skip_all, level = "info", fields(width = size.width, height = size.height))
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
            HemisphereSize::new(west_texture.width(), west_texture.height()),
        );
        let resources = MapResources::new(&components.core, west_texture, east_texture);
        let scene = MapScene::new(renderer, resources);

        Self {
            scene,
            surface: components.surface,
            surface_config,
            gpu: components.core,
            frame: FrameTracker::new(),
        }
    }

    /// Whether a frame of `bounds` would change what the surface shows:
    /// something drawn has changed since the last frame, or the view is
    /// not the one it drew.
    pub fn frame_due(&self, bounds: ViewportBounds) -> bool {
        self.frame.is_due(bounds)
    }

    /// Make the next frame due even if nothing has changed, as for a
    /// surface that may have lost its picture.
    pub fn request_frame(&mut self) {
        self.frame.invalidate();
    }

    /// Draw `bounds`, whether or not a frame is due. A failed frame stays
    /// due.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.render", skip(self), level = "trace", fields(%bounds))
    )]
    pub fn render(&mut self, bounds: ViewportBounds) -> Result<(), RenderError> {
        self.draw_frame(bounds)?;
        self.frame.drawn(bounds);
        Ok(())
    }

    fn draw_frame(&mut self, bounds: ViewportBounds) -> Result<(), RenderError> {
        let output = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t)
            | wgpu::CurrentSurfaceTexture::Suboptimal(t) => t,
            wgpu::CurrentSurfaceTexture::Timeout => {
                return Err(RenderError::new(RenderErrorKind::Surface(
                    SurfaceError::Timeout,
                )));
            }
            wgpu::CurrentSurfaceTexture::Occluded => {
                return Err(RenderError::new(RenderErrorKind::Surface(
                    SurfaceError::Occluded,
                )));
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                return Err(RenderError::new(RenderErrorKind::Surface(
                    SurfaceError::Outdated,
                )));
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                return Err(RenderError::new(RenderErrorKind::Surface(
                    SurfaceError::Lost,
                )));
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(RenderError::new(RenderErrorKind::Surface(
                    SurfaceError::Validation,
                )));
            }
        };
        let format = output.texture.format();
        let size = PhysicalSize::new(output.texture.width(), output.texture.height());
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder =
            self.scene
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Map Render Encoder"),
                });

        let queue = &self.gpu.gpu.queue;
        self.scene.update_layers(queue);
        let frame = self.scene.prepare_frame(queue, bounds, size, format);
        self.scene.renderer().resolve(&mut encoder, &frame);

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
                multiview_mask: None,
            });

            self.scene.draw(&mut pass, &frame, &bounds, size);
        }

        queue.submit(Some(encoder.finish()));
        queue.present(output);

        Ok(())
    }

    /// Add a layer drawn over the map, visible until hidden
    pub fn add_layer(&mut self, layer: impl RenderLayer + 'static) -> LayerId {
        self.frame.invalidate();
        self.scene.add_layer(layer, &self.surface_config)
    }

    pub fn set_layer_visible(&mut self, id: LayerId, visible: bool) {
        if let Some(shown) = self.scene.layer_visible_mut(id) {
            self.frame.update(shown, visible);
        }
    }

    pub fn hemisphere_size(&self) -> HemisphereSize<u32> {
        self.scene.hemisphere_size()
    }

    pub fn update_locations(&mut self, arrays: &LocationArrays) {
        self.scene.update_locations(&self.gpu.gpu.queue, arrays);
        self.frame.invalidate();
    }

    pub fn update_colors(&mut self, arrays: &LocationArrays) {
        self.scene.update_colors(&self.gpu.gpu.queue, arrays);
        self.frame.invalidate();
    }

    pub fn update_flags(&mut self, arrays: &LocationArrays) {
        self.scene.update_flags(&self.gpu.gpu.queue, arrays);
        self.frame.invalidate();
    }

    /// Reconfigure the surface. This clears it, so a frame is always due.
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(name = "pdx-map.surface.resize", skip(self), level = "debug")
    )]
    pub fn resize(&mut self, size: PhysicalSize<u32>) {
        self.surface_config.width = size.width;
        self.surface_config.height = size.height;
        self.surface
            .configure(self.scene.device(), &self.surface_config);
        self.scene.resize_layers(&self.surface_config);
        self.frame.invalidate();
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.change_config(|config| config.enable_location_borders = enabled);
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.change_config(|config| config.enable_owner_borders = enabled);
    }

    pub fn set_interaction_mask(&mut self, mask: LocationFlags) {
        self.change_config(|config| config.set_interaction_mask(mask));
    }

    /// Change the render settings, and make a frame due if they differ
    fn change_config(&mut self, change: impl FnOnce(&mut RenderConfig)) {
        let mut config = *self.scene.config();
        change(&mut config);
        self.frame.update(self.scene.config_mut(), config);
    }

    /// Get location ID at world coordinates using direct input texture sampling
    /// This avoids viewport manipulation and provides fast cursor-to-location mapping
    pub fn create_color_id_readback_at(
        &self,
        world_pos: WorldPoint<i32>,
    ) -> Result<ColorIdReadback, RenderError> {
        let global_x = world_pos.x;
        let global_y = world_pos
            .y
            .clamp(0, (self.hemisphere_size().height - 1) as i32);

        // Handle world wraparound (same logic as shader)
        let world_width = self.hemisphere_size().world().width as i32;
        let wrapped_x = ((global_x % world_width) + world_width) % world_width;

        // Determine which texture and local coordinates
        let (texture, local_x) = if wrapped_x < self.hemisphere_size().width as i32 {
            // West texture
            (
                self.scene.resources().west_texture().texture(),
                wrapped_x as u32,
            )
        } else {
            // East texture
            (
                self.scene.resources().east_texture().texture(),
                (wrapped_x - self.hemisphere_size().width as i32) as u32,
            )
        };

        // Read single pixel from input texture (contains raw color ID)
        let buffer_size = 256u32;
        let device = self.scene.device();
        let pixel_staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Single Pixel Staging Buffer"),
            size: buffer_size as u64,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
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
    pub fn create_screenshot_renderer(
        &self,
        screenshot_target: SurfaceTarget<'static>,
        size: PhysicalSize<u32>,
    ) -> Result<ScreenshotRenderer, RenderError> {
        let surface = self.gpu.create_surface(screenshot_target)?;
        let surface_config = self.gpu.surface_config_for_surface(&surface, size);
        surface.configure(self.scene.device(), &surface_config);

        let mut renderer = MapRenderer::from_existing(self.scene.renderer());
        renderer.config.disable_interactions();
        let resources = self.scene.resources().clone();
        let scene = MapScene::new(renderer, resources);

        let renderer = Self {
            scene,
            surface,
            surface_config,
            gpu: self.gpu.clone(),
            frame: FrameTracker::new(),
        };
        Ok(ScreenshotRenderer { renderer })
    }

    fn queue(&self) -> &wgpu::Queue {
        &self.gpu.gpu.queue
    }
}

/// Draws on a surface of its own from the location data of the renderer
/// that made it. It cannot change that data, so every change goes through
/// the original renderer and makes a frame due there.
pub struct ScreenshotRenderer {
    renderer: SurfaceMapRenderer,
}

impl ScreenshotRenderer {
    /// Show or hide the borders between locations. The renderer starts with
    /// the settings of the one that made it.
    pub fn set_location_borders(&mut self, enabled: bool) {
        self.renderer.set_location_borders(enabled);
    }

    /// Draw `bounds` to the screenshot surface
    pub fn render(&mut self, bounds: ViewportBounds) -> Result<(), RenderError> {
        self.renderer.render(bounds)
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
        color_space: wgpu::SurfaceColorSpace::Auto,
    }
}

pub struct HeadlessMapRenderer {
    gpu: GpuContext,
    scene: MapScene,

    // Offscreen rendering target, sized by the latest capture
    target: Option<wgpu::Texture>,
    staging_buffer: Option<wgpu::Buffer>,
    target_config: wgpu::SurfaceConfiguration,

    // Physical pixels per logical pixel of the simulated display
    scale_factor: f32,
}

/// Palette values are already gamma-encoded, so render to a linear target to
/// avoid double encoding
const HEADLESS_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

impl HeadlessMapRenderer {
    /// Create a headless map renderer from initialized GPU context and texture data
    #[cfg_attr(
        feature = "tracing",
        tracing::instrument(
            name = "pdx-map.headless.new",
            skip(gpu, west_texture, east_texture),
            level = "info"
        )
    )]
    pub fn new(
        gpu: GpuContext,
        west_texture: MapTexture,
        east_texture: MapTexture,
    ) -> Result<HeadlessMapRenderer, RenderError> {
        let renderer = MapRenderer::new(
            &gpu,
            HemisphereSize::new(west_texture.width(), west_texture.height()),
        );
        let resources = MapResources::new(&gpu, west_texture, east_texture);
        let mut scene = MapScene::new(renderer, resources);
        scene.config_mut().disable_interactions();
        Ok(HeadlessMapRenderer {
            gpu,
            scene,
            target: None,
            staging_buffer: None,
            target_config: offscreen_surface_config(1, 1, HEADLESS_FORMAT),
            scale_factor: 1.0,
        })
    }

    /// Set the scale factor of the display to simulate.
    ///
    /// Borders and stripes are measured in logical pixels, so a scale factor
    /// of 2.0 renders them twice as wide, as a 2x display would show them.
    /// The default is 1.0.
    pub fn set_scale_factor(&mut self, scale_factor: f32) {
        self.scale_factor = scale_factor;
    }

    /// Render a viewport, scaled to fill an image of `size`, with its layers,
    /// and read back the bytes.
    #[cfg_attr(feature = "tracing", tracing::instrument(name = "pdx-map.headless.capture-viewport", skip(self), fields(bounds = %bounds)))]
    pub async fn capture_viewport(
        &mut self,
        bounds: ViewportBounds,
        size: PhysicalSize<u32>,
    ) -> Result<PdxBufferView<'_>, RenderError> {
        self.ensure_target(size)?;
        self.render(bounds, true).await
    }

    /// Render a rectangle of the world at one pixel per world pixel and
    /// return the RGBA image, as wide and tall as the rectangle.
    ///
    /// An image wider than one render target renders in the strips of a
    /// [`StripPlan`], so borders continue across the seams. Layers are not
    /// drawn, since each belongs to one render target: write overlays over
    /// the finished image instead.
    #[cfg_attr(feature = "tracing", tracing::instrument(name = "pdx-map.headless.capture-world", skip(self), fields(rect = %rect)))]
    pub async fn capture_world(&mut self, rect: WorldRect<u32>) -> Result<Vec<u8>, RenderError> {
        let plan = StripPlan::new(rect.size.width);
        let height = rect.size.height;
        self.ensure_target(PhysicalSize::new(plan.render_width(), height))?;

        let mut image = StitchedImage::new(PhysicalSize::new(rect.size.width, height));
        for &strip in plan.strips() {
            let origin = WorldPoint::new(rect.origin.x + strip.x, rect.origin.y);
            let bounds = ViewportBounds {
                rect: WorldRect::new(origin, WorldSize::new(plan.render_width(), height)),
                // The render derives the zoom from the target size
                zoom_level: 1.0,
            };
            let view = self.render(bounds, false).await?;
            let strip_bytes = strip.width as usize * 4;
            image.write_strip(strip, view.rows().map(|row| &row[..strip_bytes]));
            view.finish();
        }
        Ok(image.into_inner())
    }

    /// Make the render target `size`, and let the layers know when it
    /// changes.
    fn ensure_target(&mut self, size: PhysicalSize<u32>) -> Result<(), RenderError> {
        let fits = |length: u32| (1..=MAX_TEXTURE_DIMENSION).contains(&length);
        if !fits(size.width) || !fits(size.height) {
            return Err(RenderError::new(RenderErrorKind::TargetSize(size)));
        }

        let unchanged =
            self.target_config.width == size.width && self.target_config.height == size.height;
        if self.target.is_some() && unchanged {
            return Ok(());
        }

        self.target = Some(
            self.gpu
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
                    format: HEADLESS_FORMAT,
                    usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
                    view_formats: &[],
                }),
        );
        self.target_config.width = size.width;
        self.target_config.height = size.height;
        self.staging_buffer = None;
        self.scene.resize_layers(&self.target_config);
        Ok(())
    }

    /// Render `bounds` to the render target and read back the bytes
    async fn render(
        &mut self,
        bounds: ViewportBounds,
        draw_layers: bool,
    ) -> Result<PdxBufferView<'_>, RenderError> {
        let target = self.target.as_ref().expect("render target to be created");
        let texture_width = target.width();
        let texture_height = target.height();

        // The zoom level that fits the world bounds into the target.
        // zoom = logical pixels / world_units
        let zoom_x = texture_width as f32 / self.scale_factor / bounds.rect.size.width as f32;
        let zoom_y = texture_height as f32 / self.scale_factor / bounds.rect.size.height as f32;
        let render_bounds = ViewportBounds {
            rect: bounds.rect,
            zoom_level: zoom_x.max(zoom_y),
        };

        // Calculate aligned bytes per row for GPU copy
        const COPY_BYTES_PER_ROW_ALIGNMENT: u32 = 256;
        let unpadded_bytes_per_row = texture_width * 4;

        // Align a value to the given alignment (power of 2)
        let alignment = COPY_BYTES_PER_ROW_ALIGNMENT;
        let padded_bytes_per_row = unpadded_bytes_per_row.div_ceil(alignment) * alignment;

        // Create staging buffer if it doesn't exist or has wrong size
        let buffer_size = (padded_bytes_per_row * texture_height) as u64;
        if self
            .staging_buffer
            .as_ref()
            .is_none_or(|b| b.size() != buffer_size)
        {
            self.staging_buffer =
                Some(self.scene.device().create_buffer(&wgpu::BufferDescriptor {
                    label: Some("Viewport Staging Buffer"),
                    size: buffer_size,
                    usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                }));
        }

        let staging_buffer = self.staging_buffer.as_ref().unwrap();
        let target = self.target.as_ref().expect("render target to be created");

        let mut encoder =
            self.scene
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Offscreen Render Encoder"),
                });

        let render_view = target.create_view(&wgpu::TextureViewDescriptor::default());

        let queue = &self.gpu.gpu.queue;
        if draw_layers {
            self.scene.update_layers(queue);
        }

        let size = PhysicalSize::new(texture_width, texture_height);
        let frame = self
            .scene
            .prepare_frame(queue, render_bounds, size, HEADLESS_FORMAT);

        self.scene.renderer().resolve(&mut encoder, &frame);

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
                multiview_mask: None,
            });

            if draw_layers {
                self.scene.draw(&mut pass, &frame, &render_bounds, size);
            } else {
                self.scene.renderer().draw(&mut pass, &frame);
            }
        }

        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: target,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: staging_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(texture_height),
                },
            },
            wgpu::Extent3d {
                width: texture_width,
                height: texture_height,
                depth_or_array_layers: 1,
            },
        );

        queue.submit(Some(encoder.finish()));

        // Read back results
        let buffer_slice = staging_buffer.slice(..buffer_size);
        let (sender, receiver) = futures_channel::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        self.scene.device().poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: None,
        })?;
        receiver.await??;

        let data = buffer_slice.get_mapped_range()?;

        Ok(PdxBufferView::new(
            staging_buffer,
            data,
            texture_width,
            padded_bytes_per_row,
        ))
    }

    pub fn set_location_borders(&mut self, enabled: bool) {
        self.scene.config_mut().enable_location_borders = enabled;
    }

    pub fn set_owner_borders(&mut self, enabled: bool) {
        self.scene.config_mut().enable_owner_borders = enabled;
    }

    pub fn add_layer(&mut self, layer: impl RenderLayer + 'static) -> LayerId {
        self.scene.add_layer(layer, &self.target_config)
    }

    pub fn set_layer_visible(&mut self, id: LayerId, visible: bool) {
        if let Some(shown) = self.scene.layer_visible_mut(id) {
            *shown = visible;
        }
    }

    pub fn update_locations(&mut self, arrays: &LocationArrays) {
        let queue = &self.gpu.gpu.queue;
        self.scene.update_locations(queue, arrays);
    }

    pub fn update_colors(&mut self, arrays: &LocationArrays) {
        let queue = &self.gpu.gpu.queue;
        self.scene.update_colors(queue, arrays);
    }

    pub fn update_flags(&mut self, arrays: &LocationArrays) {
        let queue = &self.gpu.gpu.queue;
        self.scene.update_flags(queue, arrays);
    }

    pub fn set_interaction_mask(&mut self, mask: LocationFlags) {
        self.scene.config_mut().set_interaction_mask(mask);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shade_uniforms_derive_the_scale_factor() {
        let config = RenderConfig::new(HemisphereSize::new(32, 24));

        // Logical 64x24 at zoom 1 on a 2x display is a 128x48 surface
        let bounds = ViewportBounds {
            rect: crate::Rect::new(WorldPoint::new(16, 0), crate::WorldSize::new(64, 24)),
            zoom_level: 1.0,
        };
        let uniforms = ShadeUniforms::new(&config, bounds, PhysicalSize::new(128, 48));
        assert_eq!(uniforms.scale_factor, 2.0);
        assert_eq!(uniforms.stripe_phase_x, 32.0);
        assert_eq!(uniforms.stripe_phase_y, 0.0);

        // Zoomed out on a 1x display: 128 world pixels in 64 physical pixels
        let bounds = ViewportBounds {
            rect: crate::Rect::new(WorldPoint::new(0, 0), crate::WorldSize::new(128, 24)),
            zoom_level: 0.5,
        };
        let uniforms = ShadeUniforms::new(&config, bounds, PhysicalSize::new(64, 12));
        assert_eq!(uniforms.scale_factor, 1.0);
    }

    #[test]
    fn guard_band_fits_the_texture_limit_per_axis() {
        let band = |width, height| {
            let band = GuardBand::around(PhysicalSize::new(width, height));
            (band.x, band.y)
        };
        assert_eq!(band(1024, 1024), (GUARD_BAND, GUARD_BAND));
        assert_eq!(band(MAX_TEXTURE_DIMENSION - 8, 1024), (4, GUARD_BAND));

        // A full-height strip keeps its band at the left and right
        assert_eq!(
            band(MAX_SEAMLESS_WIDTH, MAX_TEXTURE_DIMENSION),
            (GUARD_BAND, 0)
        );
    }

    #[test]
    fn border_radius_shrinks_when_zoomed_out_to_one_logical_pixel() {
        // At zoom 1 and above, the logical width holds
        assert_eq!(border_radius(2.0, 1.0, 1.0), 2);
        assert_eq!(border_radius(2.0, 2.0, 1.0), 2);
        assert_eq!(border_radius(2.0, 1.0, 2.0), 4);
        assert_eq!(border_radius(1.0, 1.0, 3.0), 3);

        // Zoomed out, the border follows the map down to one logical pixel
        assert_eq!(border_radius(2.0, 0.5, 1.0), 1);
        assert_eq!(border_radius(2.0, 0.25, 1.0), 1);
        assert_eq!(border_radius(2.0, 0.5, 2.0), 2);
        assert_eq!(border_radius(1.0, 0.25, 1.0), 1);

        // Never zero, even at fractional scale factors
        assert_eq!(border_radius(1.0, 1.0, 0.4), 1);
    }

    #[test]
    fn live_renderer_enables_interaction_effects() {
        let mut config = RenderConfig::new(HemisphereSize::new(1, 1));

        assert_eq!(config.interaction_mask, LocationFlags::INTERACTION);

        config.disable_interactions();

        assert_eq!(config.interaction_mask, LocationFlags::empty());
    }

    #[test]
    fn interaction_masks_exclude_structural_flags() {
        let mut config = RenderConfig::new(HemisphereSize::new(1, 1));

        config.set_interaction_mask(LocationFlags::from_bits(
            LocationFlags::NO_LOCATION_BORDERS.bits() | LocationFlags::FOCUSED.bits(),
        ));

        assert_eq!(config.interaction_mask, LocationFlags::FOCUSED);
    }
}
