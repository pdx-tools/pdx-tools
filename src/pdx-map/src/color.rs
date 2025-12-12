use bytemuck::{Pod, Zeroable};

use crate::Rgb;

/// A GPU-optimized color structure that stores RGB values in a packed u32 format.
///
/// The color is stored as: `0xFFRRGGBB` where each component is 0-255.
/// This matches the packing format used in the GPU shaders and provides efficient
/// storage and transfer to GPU buffers.
#[repr(transparent)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Pod, Zeroable)]
pub struct GpuColor(u32);

impl GpuColor {
    /// Create a new GpuColor from RGB components (0-255 each)
    pub const fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self((255 << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32))
    }

    /// Create a new GpuColor from a packed u32 value
    pub const fn from_packed(packed: u32) -> Self {
        Self(packed)
    }

    /// Get the raw packed u32 value
    pub const fn packed(self) -> u32 {
        self.0
    }

    /// Extract RGB components as a tuple (r, g, b)
    pub const fn rgb(self) -> (u8, u8, u8) {
        (self.r(), self.g(), self.b())
    }

    /// Extract individual red component
    pub const fn r(self) -> u8 {
        ((self.0 >> 16) & 0xFF) as u8
    }

    /// Extract individual green component
    pub const fn g(self) -> u8 {
        ((self.0 >> 8) & 0xFF) as u8
    }

    /// Extract individual blue component
    pub const fn b(self) -> u8 {
        (self.0 & 0xFF) as u8
    }

    // FNV-1a hash function to match GPU shader
    pub fn fnv(&self) -> u32 {
        let mut hash = 2166136261u32; // FNV offset basis
        let bytes = self.0.to_le_bytes();
        for byte in bytes {
            hash ^= byte as u32;
            hash = hash.wrapping_mul(16777619); // FNV prime
        }
        hash
    }

    /// Blend with another color using linear interpolation
    /// factor: 0.0 = self, 1.0 = other
    pub fn blend(self, other: Self, factor: f32) -> Self {
        let factor = factor.clamp(0.0, 1.0);
        let (r1, g1, b1) = self.rgb();
        let (r2, g2, b2) = other.rgb();

        let r = (r1 as f32 + factor * (r2 as f32 - r1 as f32)) as u8;
        let g = (g1 as f32 + factor * (g2 as f32 - g1 as f32)) as u8;
        let b = (b1 as f32 + factor * (b2 as f32 - b1 as f32)) as u8;

        Self::from_rgb(r, g, b)
    }

    /// Check if this color represents "no color" (black/zero)
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }
}

// Predefined colors for common use cases
impl GpuColor {
    /// Transparent/empty color (black)
    pub const EMPTY: Self = Self(0);

    /// Standard water color: RGB(69, 94, 119)
    pub const WATER: Self = Self::from_rgb(69, 94, 119);

    /// Standard impassable terrain color: RGB(100, 100, 100)
    pub const IMPASSABLE: Self = Self::from_rgb(100, 100, 100);

    pub const UNOWNED: Self = Self::from_rgb(128, 128, 128);

    /// Dark gray for missing locations: RGB(64, 64, 64)
    pub const MISSING: Self = Self::from_rgb(64, 64, 64);

    /// Standard background color: RGB(248, 248, 248)
    pub const BACKGROUND: Self = Self::from_rgb(248, 248, 248);

    pub const DEBUG: Self = Self::from_rgb(255, 0, 220);
}

impl From<[u8; 3]> for GpuColor {
    fn from(rgb: [u8; 3]) -> Self {
        Self::from_rgb(rgb[0], rgb[1], rgb[2])
    }
}

impl From<Rgb> for GpuColor {
    fn from(rgb: Rgb) -> Self {
        Self::from_rgb(rgb.r(), rgb.g(), rgb.b())
    }
}

impl From<GpuColor> for [u8; 3] {
    fn from(gpu_color: GpuColor) -> Self {
        let (r, g, b) = gpu_color.rgb();
        [r, g, b]
    }
}

impl From<u32> for GpuColor {
    fn from(packed: u32) -> Self {
        Self::from_packed(packed)
    }
}

impl From<GpuColor> for u32 {
    fn from(gpu_color: GpuColor) -> Self {
        gpu_color.packed()
    }
}

// Display implementation for debugging
impl std::fmt::Display for GpuColor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (r, g, b) = self.rgb();
        write!(f, "RGB({r}, {g}, {b})")
    }
}

impl std::fmt::LowerHex for GpuColor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:06x}", self.packed() & 0x00FFFFFF)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rgb_packing() {
        let color = GpuColor::from_rgb(255, 128, 64);
        assert_eq!(color.packed(), 0xFFFF8040);
        assert_eq!(color.rgb(), (255, 128, 64));
    }

    #[test]
    fn test_blend() {
        let color1 = GpuColor::from_rgb(0, 0, 0);
        let color2 = GpuColor::from_rgb(100, 100, 100);
        let blended = color1.blend(color2, 0.5);
        assert_eq!(blended.rgb(), (50, 50, 50));
    }

    #[test]
    fn test_predefined_colors() {
        assert_eq!(GpuColor::WATER.rgb(), (69, 94, 119));
        assert_eq!(GpuColor::EMPTY.packed(), 0);
        assert!(GpuColor::EMPTY.is_empty());
    }
}
