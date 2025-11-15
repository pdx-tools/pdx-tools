use crate::wgpu;

/// Target texture metadata shared with overlay middleware.
pub struct OverlayTarget<'view> {
    pub view: &'view wgpu::TextureView,
    pub format: wgpu::TextureFormat,
    pub width: u32,
    pub height: u32,
}

impl<'view> OverlayTarget<'view> {
    pub fn size(&self) -> (u32, u32) {
        (self.width, self.height)
    }
}

/// Middleware hook that can render additional content on top of the map output.
pub trait OverlayMiddleware {
    /// Optional per-frame preparation step (e.g., updating buffers, glyph caches).
    fn prepare(
        &mut self,
        _device: &wgpu::Device,
        _queue: &wgpu::Queue,
        _target: &OverlayTarget<'_>,
    ) {
    }

    /// Encode draw commands into the provided render pass.
    fn render<'pass>(
        &'pass self,
        pass: &mut wgpu::RenderPass<'pass>,
        target: &OverlayTarget<'pass>,
    );
}
