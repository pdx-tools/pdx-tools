use std::fmt;

/// Error type for pdx-map operations
pub struct RenderError {
    kind: RenderErrorKind,
}

impl RenderError {
    pub(crate) fn new(kind: RenderErrorKind) -> Self {
        Self { kind }
    }

    pub fn surface_error(&self) -> Option<&wgpu::SurfaceError> {
        match &self.kind {
            RenderErrorKind::Surface(err) => Some(err),
            _ => None,
        }
    }

    pub fn is_surface_reconfigurable(&self) -> bool {
        matches!(
            self.surface_error(),
            Some(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated)
        )
    }
}

/// Enumeration of possible error sources in pdx-map
#[derive(Debug)]
pub enum RenderErrorKind {
    /// Surface texture acquisition failed
    Surface(wgpu::SurfaceError),
    /// Surface creation failed
    CreateSurface(wgpu::CreateSurfaceError),
    /// Device request failed
    RequestDevice(wgpu::RequestDeviceError),
    /// Adapter request failed
    RequestAdapter(wgpu::RequestAdapterError),
    /// Buffer mapping operation failed
    BufferAsync(wgpu::BufferAsyncError),
    /// Async operation was canceled
    OperationCanceled,
    /// Device polling failed
    DevicePoll(wgpu::PollError),
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.kind {
            RenderErrorKind::Surface(e) => write!(f, "Surface error: {e}"),
            RenderErrorKind::CreateSurface(e) => write!(f, "Failed to create surface: {e}"),
            RenderErrorKind::RequestDevice(e) => write!(f, "Failed to request GPU device: {e}"),
            RenderErrorKind::RequestAdapter(e) => write!(f, "Failed to request GPU adapter: {e}"),
            RenderErrorKind::BufferAsync(e) => write!(f, "Buffer mapping failed: {e}"),
            RenderErrorKind::OperationCanceled => write!(f, "Async operation was canceled"),
            RenderErrorKind::DevicePoll(e) => write!(f, "Device polling failed: {e}"),
        }
    }
}

impl fmt::Debug for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl std::error::Error for RenderError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match &self.kind {
            RenderErrorKind::Surface(e) => Some(e),
            RenderErrorKind::CreateSurface(e) => Some(e),
            RenderErrorKind::RequestDevice(e) => Some(e),
            RenderErrorKind::RequestAdapter(e) => Some(e),
            RenderErrorKind::BufferAsync(e) => Some(e),
            RenderErrorKind::OperationCanceled => None,
            RenderErrorKind::DevicePoll(e) => Some(e),
        }
    }
}

impl From<wgpu::SurfaceError> for RenderError {
    fn from(err: wgpu::SurfaceError) -> Self {
        Self::new(RenderErrorKind::Surface(err))
    }
}

impl From<wgpu::CreateSurfaceError> for RenderError {
    fn from(err: wgpu::CreateSurfaceError) -> Self {
        Self::new(RenderErrorKind::CreateSurface(err))
    }
}

impl From<wgpu::RequestDeviceError> for RenderError {
    fn from(err: wgpu::RequestDeviceError) -> Self {
        Self::new(RenderErrorKind::RequestDevice(err))
    }
}

impl From<wgpu::RequestAdapterError> for RenderError {
    fn from(err: wgpu::RequestAdapterError) -> Self {
        Self::new(RenderErrorKind::RequestAdapter(err))
    }
}

impl From<wgpu::BufferAsyncError> for RenderError {
    fn from(err: wgpu::BufferAsyncError) -> Self {
        Self::new(RenderErrorKind::BufferAsync(err))
    }
}

impl From<futures_channel::oneshot::Canceled> for RenderError {
    fn from(_: futures_channel::oneshot::Canceled) -> Self {
        Self::new(RenderErrorKind::OperationCanceled)
    }
}

impl From<wgpu::PollError> for RenderError {
    fn from(err: wgpu::PollError) -> Self {
        Self::new(RenderErrorKind::DevicePoll(err))
    }
}
