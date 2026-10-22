//! The binary form of snapshot columns. Each column is a little-endian
//! element count and its elements, padded to 8 bytes, so a later reader can
//! borrow aligned columns without a copy.

use bytemuck::Pod;
use std::fmt;

#[cfg(not(target_endian = "little"))]
compile_error!("The snapshot format is little-endian");

const ALIGN: usize = 8;

/// A value that the snapshot format can write and read again.
pub trait Columns: Sized {
    fn encode(&self, out: &mut Encoder);
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError>;
    /// The bytes of the values. The limit of a store counts these bytes.
    fn heap_bytes(&self) -> usize;
}

impl<T: Pod> Columns for Vec<T> {
    fn encode(&self, out: &mut Encoder) {
        out.column(self);
    }

    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        input.column()
    }

    fn heap_bytes(&self) -> usize {
        self.len() * size_of::<T>()
    }
}

/// Implement [`Columns`] for a struct, field by field in the order given.
#[macro_export]
macro_rules! columns {
    ($name:ty { $($field:ident),+ $(,)? }) => {
        impl $crate::Columns for $name {
            fn encode(&self, out: &mut $crate::Encoder) {
                $($crate::Columns::encode(&self.$field, out);)+
            }

            fn decode(input: &mut $crate::Decoder<'_>) -> Result<Self, $crate::DecodeError> {
                Ok(Self { $($field: $crate::Columns::decode(input)?),+ })
            }

            fn heap_bytes(&self) -> usize {
                0 $(+ $crate::Columns::heap_bytes(&self.$field))+
            }
        }
    };
}

#[derive(Debug, Default)]
pub struct Encoder {
    bytes: Vec<u8>,
}

impl Encoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn column<T: Pod>(&mut self, values: &[T]) {
        let count = u32::try_from(values.len()).expect("a column has fewer than 2^32 values");
        self.bytes.extend_from_slice(&count.to_le_bytes());
        self.pad();
        self.bytes.extend_from_slice(bytemuck::cast_slice(values));
        self.pad();
    }

    pub(crate) fn raw(&mut self, bytes: &[u8]) {
        self.bytes.extend_from_slice(bytes);
    }

    fn pad(&mut self) {
        let len = self.bytes.len().next_multiple_of(ALIGN);
        self.bytes.resize(len, 0);
    }

    pub fn finish(self) -> Vec<u8> {
        self.bytes
    }
}

#[derive(Debug)]
pub struct Decoder<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Decoder<'a> {
    pub fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, at: 0 }
    }

    /// A copy of the next column. The input does not need to be aligned.
    pub fn column<T: Pod>(&mut self) -> Result<Vec<T>, DecodeError> {
        let count = u32::from_le_bytes(self.take(4)?.try_into().unwrap_or_default());
        self.skip_padding()?;
        let len = (count as usize)
            .checked_mul(size_of::<T>())
            .ok_or(DecodeError::Truncated)?;
        let values = bytemuck::pod_collect_to_vec(self.take(len)?);
        self.skip_padding()?;
        Ok(values)
    }

    pub(crate) fn raw(&mut self, len: usize) -> Result<&'a [u8], DecodeError> {
        self.take(len)
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], DecodeError> {
        let end = self.at.checked_add(len).ok_or(DecodeError::Truncated)?;
        let bytes = self.bytes.get(self.at..end).ok_or(DecodeError::Truncated)?;
        self.at = end;
        Ok(bytes)
    }

    fn skip_padding(&mut self) -> Result<(), DecodeError> {
        let len = self.at.next_multiple_of(ALIGN) - self.at;
        self.take(len).map(|_| ())
    }

    /// Refuse bytes after the last column.
    pub fn finish(self) -> Result<(), DecodeError> {
        if self.at == self.bytes.len() {
            Ok(())
        } else {
            Err(DecodeError::TrailingBytes)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecodeError {
    NotASnapshot,
    UnknownFormat(u32),
    Truncated,
    TrailingBytes,
    Header(String),
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DecodeError::NotASnapshot => write!(f, "The data is not a campaign snapshot"),
            DecodeError::UnknownFormat(format) => {
                write!(f, "Unknown campaign snapshot format {format}")
            }
            DecodeError::Truncated => write!(f, "The campaign snapshot is incomplete"),
            DecodeError::TrailingBytes => {
                write!(f, "The campaign snapshot has data after its last column")
            }
            DecodeError::Header(message) => {
                write!(f, "Invalid campaign snapshot header: {message}")
            }
        }
    }
}

impl std::error::Error for DecodeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq)]
    struct Pair {
        a: Vec<u16>,
        b: Vec<f64>,
    }
    columns!(Pair { a, b });

    #[test]
    fn writes_and_reads_columns_of_mixed_widths() {
        let pair = Pair {
            a: vec![1, 2, 3],
            b: vec![0.5, -1.0],
        };
        let mut out = Encoder::new();
        pair.encode(&mut out);
        let bytes = out.finish();
        assert_eq!(bytes.len() % ALIGN, 0);
        assert_eq!(pair.heap_bytes(), 3 * 2 + 2 * 8);

        let mut input = Decoder::new(&bytes);
        assert_eq!(Pair::decode(&mut input).unwrap(), pair);
        input.finish().unwrap();
    }

    #[test]
    fn refuses_truncated_and_trailing_bytes() {
        let mut out = Encoder::new();
        out.column(&[7u32; 3]);
        let bytes = out.finish();
        for len in 0..bytes.len() {
            assert!(
                Decoder::new(&bytes[..len]).column::<u32>().is_err(),
                "{len}"
            );
        }
        let mut longer = bytes.clone();
        longer.push(0);
        let mut input = Decoder::new(&longer);
        input.column::<u32>().unwrap();
        assert_eq!(input.finish(), Err(DecodeError::TrailingBytes));
    }
}
