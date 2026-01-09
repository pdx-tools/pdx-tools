//! DPI-aware size types for handling physical and logical pixels.
//!
//! The module also provides `Point` and `Rect` types for working with
//! coordinates.

use std::marker::PhantomData;

/// Marker type for physical pixel units (device pixels)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Physical;

/// Marker type for logical pixel units (CSS/virtual pixels)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Logical;

/// Marker type for World units (game world coordinates)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct World;

/// A 2D size tagged with its unit space (Physical or Logical)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Size<Unit, T> {
    pub width: T,
    pub height: T,
    _unit: PhantomData<Unit>,
}

impl<Unit, T> Size<Unit, T> {
    pub fn new(width: T, height: T) -> Self {
        Self {
            width,
            height,
            _unit: PhantomData,
        }
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
    pub fn new(x: T, y: T) -> Self {
        Self {
            x,
            y,
            _unit: PhantomData,
        }
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

// Type aliases for ergonomics
pub type PhysicalSize<T> = Size<Physical, T>;
pub type LogicalSize<T> = Size<Logical, T>;
pub type WorldSize<T> = Size<World, T>;
pub type PhysicalPoint<T> = Point<Physical, T>;
pub type LogicalPoint<T> = Point<Logical, T>;
pub type WorldPoint<T> = Point<World, T>;
pub type PhysicalRect<T> = Rect<Physical, T>;
pub type LogicalRect<T> = Rect<Logical, T>;
pub type WorldRect<T> = Rect<World, T>;

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
}
