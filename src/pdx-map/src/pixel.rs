use std::{
    fmt::LowerHex,
    ops::{Index, IndexMut},
};

use bytemuck::{Pod, Zeroable};

/// 24-bit RGB color
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]
pub struct Rgb([u8; 3]);

impl Rgb {
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self([r, g, b])
    }

    pub const fn r(&self) -> u8 {
        self.0[0]
    }

    pub const fn g(&self) -> u8 {
        self.0[1]
    }

    pub const fn b(&self) -> u8 {
        self.0[2]
    }
}

impl From<[u8; 3]> for Rgb {
    fn from(value: [u8; 3]) -> Self {
        Rgb(value)
    }
}

/// 16-bit red channel used as location index in Paradox map textures
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Pod, Zeroable)]
#[repr(transparent)]
pub struct R16(u16);

impl R16 {
    pub const fn new(value: u16) -> Self {
        R16(value)
    }

    /// Create an RGB value with R and G from R16, B=0
    pub const fn as_rgb(&self) -> Rgb {
        Rgb::new(((self.0 >> 8) & 0xFF) as u8, (self.0 & 0xFF) as u8, 0)
    }

    pub const fn value(&self) -> u16 {
        self.0
    }
}

impl From<[u8; 2]> for R16 {
    fn from(value: [u8; 2]) -> Self {
        R16(u16::from_le_bytes(value))
    }
}

impl LowerHex for Rgb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:02x}{:02x}{:02x}", self.r(), self.g(), self.b())
    }
}

pub type R16Palette = R16SecondaryMap<Rgb>;

#[derive(Debug, PartialEq, Eq, Clone)]
pub struct R16SecondaryMap<T> {
    data: Vec<T>,
}

impl<T> R16SecondaryMap<T> {
    pub fn new(data: Vec<T>) -> Self {
        Self { data }
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&T, R16)> + '_ {
        self.data
            .iter()
            .enumerate()
            .map(|(i, v)| (v, R16(i as u16)))
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut T> + '_ {
        self.data.iter_mut()
    }

    pub fn map<F, U>(&self, f: F) -> R16SecondaryMap<U>
    where
        F: Fn(&T, R16) -> U,
    {
        R16SecondaryMap {
            data: self.iter().map(|(v, r16)| f(v, r16)).collect(),
        }
    }

    pub fn as_slice(&self) -> &[T] {
        &self.data
    }
}

impl<T> Index<R16> for R16SecondaryMap<T> {
    type Output = T;

    fn index(&self, index: R16) -> &Self::Output {
        &self.data[index.0 as usize]
    }
}

impl<T> IndexMut<R16> for R16SecondaryMap<T> {
    fn index_mut(&mut self, index: R16) -> &mut Self::Output {
        &mut self.data[index.0 as usize]
    }
}
