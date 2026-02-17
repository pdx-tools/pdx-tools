use crate::units::{HemisphereLength, HemisphereSize};
use bytemuck::Pod;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hemisphere<T> {
    data: Box<[T]>,
    width: HemisphereLength<u32>,
}

impl<T> Hemisphere<T> {
    pub fn new(data: impl Into<Box<[T]>>, width: HemisphereLength<u32>) -> Self {
        let data = data.into();
        assert_eq!(
            data.len() % (width.value as usize),
            0,
            "hemisphere data length must be a multiple of width"
        );
        Self { data, width }
    }

    pub fn size(&self) -> HemisphereSize<u32> {
        HemisphereSize::new(self.width.value, self.data.len() as u32 / self.width.value)
    }

    pub fn rows(&self) -> std::slice::ChunksExact<'_, T> {
        self.data.chunks_exact(self.width.value as usize)
    }

    pub fn as_slice(&self) -> &[T] {
        &self.data
    }

    pub fn as_mut_slice(&mut self) -> &mut [T] {
        &mut self.data
    }

    pub fn into_data(self) -> Box<[T]> {
        self.data
    }
}

impl<T: Pod> Hemisphere<T> {
    pub fn as_bytes(&self) -> &[u8] {
        bytemuck::cast_slice(&self.data)
    }

    pub fn as_bytes_mut(&mut self) -> &mut [u8] {
        bytemuck::cast_slice_mut(&mut self.data)
    }
}
