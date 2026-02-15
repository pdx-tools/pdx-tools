//! DPI-aware size types for handling physical and logical pixels.
//!
//! The module also provides `Point` and `Rect` types for working with
//! coordinates.

use std::fmt::{self, Display};
use std::marker::PhantomData;

/// Marker type for physical pixel units (device pixels)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Physical;

/// Marker type for logical pixel units (CSS/virtual pixels)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Logical;

/// Marker type for World units (game world coordinates)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct WorldSpace;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct HemisphereSpace;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Length<Unit, T> {
    pub value: T,
    _unit: PhantomData<Unit>,
}

impl<Unit, T> Length<Unit, T> {
    pub const fn new(value: T) -> Self {
        Self {
            value,
            _unit: PhantomData,
        }
    }
}

impl Length<HemisphereSpace, u32> {
    pub fn world(&self) -> Length<WorldSpace, u32> {
        Length::<WorldSpace, u32>::new(self.value * 2)
    }
}

impl Length<WorldSpace, u32> {
    pub fn hemisphere(&self) -> Length<HemisphereSpace, u32> {
        Length::<HemisphereSpace, u32>::new(self.value / 2)
    }
}

/// A 2D size tagged with its unit space (Physical or Logical)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Size<Unit, T> {
    pub width: T,
    pub height: T,
    _unit: PhantomData<Unit>,
}

impl<Unit, T> Size<Unit, T> {
    pub const fn new(width: T, height: T) -> Self {
        Self {
            width,
            height,
            _unit: PhantomData,
        }
    }

    pub fn area(&self) -> T
    where
        T: std::ops::Mul<Output = T> + Copy,
    {
        self.width * self.height
    }

    pub fn width_length(&self) -> Length<Unit, T>
    where
        T: Copy,
    {
        Length::new(self.width)
    }

    pub fn height_length(&self) -> Length<Unit, T>
    where
        T: Copy,
    {
        Length::new(self.height)
    }
}

impl<Unit, T: Display> Display for Size<Unit, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}x{}", self.width, self.height)
    }
}

impl Size<HemisphereSpace, u32> {
    pub fn world(&self) -> Size<WorldSpace, u32> {
        Size::<WorldSpace, u32>::new(self.width * 2, self.height)
    }

    pub fn physical(&self) -> Size<Physical, u32> {
        Size::<Physical, u32>::new(self.width, self.height)
    }
}

/// A 2D point tagged with its unit space (Physical or Logical)
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Point<Unit, T> {
    pub x: T,
    pub y: T,
    _unit: PhantomData<Unit>,
}

impl<Unit, T> Point<Unit, T> {
    pub const fn new(x: T, y: T) -> Self {
        Self {
            x,
            y,
            _unit: PhantomData,
        }
    }
}

impl<Unit, T: Display> Display for Point<Unit, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "({},{})", self.x, self.y)
    }
}

/// A rectangle with an origin point and size, both tagged with the same unit space
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect<Unit, T> {
    pub origin: Point<Unit, T>,
    pub size: Size<Unit, T>,
}

impl<Unit, T> Rect<Unit, T> {
    pub fn new(origin: Point<Unit, T>, size: Size<Unit, T>) -> Self {
        Self { origin, size }
    }
}

impl<Unit, T: Display> Display for Rect<Unit, T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}@{}", self.size, self.origin)
    }
}

// Type aliases for ergonomics
pub type WorldLength<T> = Length<WorldSpace, T>;
pub type HemisphereLength<T> = Length<HemisphereSpace, T>;
pub type PhysicalSize<T> = Size<Physical, T>;
pub type LogicalSize<T> = Size<Logical, T>;
pub type WorldSize<T> = Size<WorldSpace, T>;
pub type HemisphereSize<T> = Size<HemisphereSpace, T>;
pub type PhysicalPoint<T> = Point<Physical, T>;
pub type LogicalPoint<T> = Point<Logical, T>;
pub type WorldPoint<T> = Point<WorldSpace, T>;
pub type PhysicalRect<T> = Rect<Physical, T>;
pub type LogicalRect<T> = Rect<Logical, T>;
pub type WorldRect<T> = Rect<WorldSpace, T>;

// Conversion implementations (require explicit scale_factor)
impl LogicalSize<u32> {
    pub fn to_physical(self, scale_factor: f32) -> PhysicalSize<u32> {
        PhysicalSize::new(
            (self.width as f32 * scale_factor).round() as u32,
            (self.height as f32 * scale_factor).round() as u32,
        )
    }
}

impl PhysicalSize<u32> {
    pub fn to_logical(self, scale_factor: f32) -> LogicalSize<u32> {
        LogicalSize::new(
            (self.width as f32 / scale_factor).round() as u32,
            (self.height as f32 / scale_factor).round() as u32,
        )
    }
}

impl LogicalPoint<f32> {
    pub fn to_physical(self, scale_factor: f32) -> PhysicalPoint<f32> {
        PhysicalPoint::new(self.x * scale_factor, self.y * scale_factor)
    }
}

impl PhysicalPoint<f32> {
    pub fn to_logical(self, scale_factor: f32) -> LogicalPoint<f32> {
        LogicalPoint::new(self.x / scale_factor, self.y / scale_factor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logical_to_physical() {
        let logical = LogicalSize::new(100, 50);
        let physical = logical.to_physical(2.0);
        assert_eq!(physical, PhysicalSize::new(200, 100));
    }

    #[test]
    fn test_physical_to_logical() {
        let physical = PhysicalSize::new(200, 100);
        let logical = physical.to_logical(2.0);
        assert_eq!(logical, LogicalSize::new(100, 50));
    }

    #[test]
    fn test_point_display_u32() {
        let point = PhysicalPoint::new(100u32, 200u32);
        assert_eq!(format!("{}", point), "(100,200)");
    }

    #[test]
    fn test_point_display_f32() {
        let point = LogicalPoint::new(15.5f32, 32.8f32);
        assert_eq!(format!("{}", point), "(15.5,32.8)");
    }

    #[test]
    fn test_point_display_u16() {
        let point = WorldPoint::new(872u16, 494u16);
        assert_eq!(format!("{}", point), "(872,494)");
    }

    #[test]
    fn test_size_display_u32() {
        let size = PhysicalSize::new(1920u32, 1080u32);
        assert_eq!(format!("{}", size), "1920x1080");
    }

    #[test]
    fn test_size_display_f32() {
        let size = LogicalSize::new(800.5f32, 600.3f32);
        assert_eq!(format!("{}", size), "800.5x600.3");
    }

    #[test]
    fn test_rect_display() {
        let rect = WorldRect::new(
            WorldPoint::new(100u32, 200u32),
            WorldSize::new(800u32, 600u32),
        );
        assert_eq!(format!("{}", rect), "800x600@(100,200)");
    }

    #[test]
    fn test_rect_display_origin_zero() {
        let rect = LogicalRect::new(
            LogicalPoint::new(0u32, 0u32),
            LogicalSize::new(1920u32, 1080u32),
        );
        assert_eq!(format!("{}", rect), "1920x1080@(0,0)");
    }
}
