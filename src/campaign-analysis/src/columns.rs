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
    fn allocated_bytes(&self) -> usize;
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

    fn allocated_bytes(&self) -> usize {
        self.capacity() * size_of::<T>()
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
            fn allocated_bytes(&self) -> usize {
                0 $(+ $crate::Columns::allocated_bytes(&self.$field))+
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

    pub fn serde<T: serde::Serialize>(&mut self, value: &T) {
        self.column(&postcard::to_allocvec(value).expect("snapshot value can be encoded"));
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

    pub fn serde<T: serde::de::DeserializeOwned>(&mut self) -> Result<T, DecodeError> {
        postcard::from_bytes(&self.column::<u8>()?).map_err(|e| DecodeError::Header(e.to_string()))
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
    Table(crate::TableError),
    Column(ColumnError),
    Reference(ReferenceError),
    Truncated,
    TrailingBytes,
    Header(String),
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DecodeError::NotASnapshot => write!(f, "The data is not a campaign snapshot"),
            DecodeError::Table(error) => write!(f, "Invalid table: {error}"),
            DecodeError::Column(error) => write!(f, "Invalid column: {error}"),
            DecodeError::Reference(error) => write!(f, "Invalid reference: {error}"),
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ColumnError {
    SizeOverflow,
    Length { expected: usize, actual: usize },
    BitmapLength { expected: usize, actual: usize },
    UnusedValidityBits,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReferenceError {
    Dictionary {
        row: u32,
        rows: usize,
    },
    Row {
        column: &'static str,
        row: u32,
        rows: usize,
    },
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PayloadError {
    Invalid(String),
    Column(ColumnError),
    Reference(ReferenceError),
    DictionaryWidth {
        table: &'static str,
        width: usize,
        actual: usize,
    },
    DictionarySize {
        table: &'static str,
    },
    NonFinite,
    NonFiniteAt {
        key: u32,
    },
}

/// Columns that have one value slot for each table row.
/// Check each aligned field and delegate to nested aligned structs.
/// Keep dictionaries and tables of other lengths in the payload.
/// See `examples/market_goods.rs` for nullable and numeric fields.
pub trait RowColumns: Columns {
    fn check_rows(&self, expected: usize) -> Result<(), ColumnError>;
}
impl<T: Pod> RowColumns for Vec<T> {
    fn check_rows(&self, expected: usize) -> Result<(), ColumnError> {
        check_length(self.len(), expected)
    }
}
pub fn check_length(actual: usize, expected: usize) -> Result<(), ColumnError> {
    if actual == expected {
        Ok(())
    } else {
        Err(ColumnError::Length { expected, actual })
    }
}

/// A numeric column with one low-order validity bit for each value.
/// The bitmap must contain exactly `len.div_ceil(8)` bytes. Unused high bits
/// must be zero. A zero bit marks an absent measurement. The codec writes a
/// zero placeholder in that slot. See the nullable price in
/// `examples/market_goods.rs` for table, range, and validation use.
#[derive(Debug, Clone, PartialEq)]
pub struct NullableColumn<T> {
    values: Vec<T>,
    validity: Vec<u8>,
}
impl<T: Pod> NullableColumn<T> {
    pub fn new(values: Vec<T>, validity: Vec<u8>) -> Result<Self, ColumnError> {
        let expected = (values.len() / 8)
            .checked_add(usize::from(!values.len().is_multiple_of(8)))
            .ok_or(ColumnError::SizeOverflow)?;
        if validity.len() != expected {
            return Err(ColumnError::BitmapLength {
                expected,
                actual: validity.len(),
            });
        }
        let used = values.len() % 8;
        if used != 0 && validity.last().is_some_and(|last| last >> used != 0) {
            return Err(ColumnError::UnusedValidityBits);
        }
        Ok(Self { values, validity })
    }
    pub fn len(&self) -> usize {
        self.values.len()
    }
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
    pub fn get(&self, offset: usize) -> Option<Option<T>> {
        let value = self.values.get(offset)?;
        Some(if self.validity[offset / 8] & (1 << (offset % 8)) != 0 {
            Some(*value)
        } else {
            None
        })
    }
    pub fn iter(&self) -> impl ExactSizeIterator<Item = Option<T>> + '_ {
        (0..self.len()).map(|i| self.get(i).expect("in-range row"))
    }
}
impl<T: Pod> Columns for NullableColumn<T> {
    fn encode(&self, out: &mut Encoder) {
        let canonical: Vec<T> = self
            .iter()
            .map(|value| value.unwrap_or_else(T::zeroed))
            .collect();
        out.column(&canonical);
        out.column(&self.validity);
    }
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        Self::new(input.column()?, input.column()?).map_err(DecodeError::Column)
    }
    fn heap_bytes(&self) -> usize {
        self.values.heap_bytes() + self.validity.heap_bytes()
    }
    fn allocated_bytes(&self) -> usize {
        self.values.allocated_bytes() + self.validity.allocated_bytes()
    }
}
impl<T: Pod> RowColumns for NullableColumn<T> {
    fn check_rows(&self, expected: usize) -> Result<(), ColumnError> {
        check_length(self.len(), expected)
    }
}
impl<T: Pod> crate::Column for NullableColumn<T> {
    type Value<'a>
        = Option<T>
    where
        T: 'a;
    fn get_value(&self, offset: usize) -> Option<Option<T>> {
        self.get(offset)
    }
}

impl fmt::Display for ColumnError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SizeOverflow => f.write_str("Column size exceeds the supported range"),
            Self::Length { expected, actual } => {
                write!(f, "Column has {actual} rows, expected {expected}")
            }
            Self::BitmapLength { expected, actual } => {
                write!(f, "Validity bitmap has {actual} bytes, expected {expected}")
            }
            Self::UnusedValidityBits => f.write_str("Validity bitmap has nonzero unused bits"),
        }
    }
}
impl std::error::Error for ColumnError {}
impl fmt::Display for ReferenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dictionary { row, rows } => {
                write!(f, "Dictionary reference {row} is outside {rows} rows")
            }
            Self::Row { column, row, rows } => write!(
                f,
                "Column {column} names row {row} of {rows} dictionary rows"
            ),
        }
    }
}
impl std::error::Error for ReferenceError {}
impl fmt::Display for PayloadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(message) => f.write_str(message),
            Self::Column(error) => error.fmt(f),
            Self::Reference(error) => error.fmt(f),
            Self::DictionaryWidth {
                table,
                width,
                actual,
            } => write!(
                f,
                "Dictionary {table} has {actual} values, expected rows of {width}"
            ),
            Self::DictionarySize { table } => write!(f, "Dictionary {table} has too many rows"),
            Self::NonFinite => f.write_str("Measurement is not finite"),
            Self::NonFiniteAt { key } => write!(f, "Measurement for key {key} is not finite"),
        }
    }
}
impl std::error::Error for PayloadError {}

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

#[cfg(test)]
mod nullable_tests {
    use super::*;
    #[test]
    fn nullable_bitmap_and_value_bounds_are_checked() {
        let empty = NullableColumn::<f64>::new(vec![], vec![]).unwrap();
        assert!(empty.is_empty());
        assert_eq!(empty.get(0), None);
        NullableColumn::<u32>::new(vec![], vec![0]).unwrap_err();
        NullableColumn::new(vec![1u32; 9], vec![0]).unwrap_err();
        NullableColumn::new(vec![1u32; 9], vec![0, 2]).unwrap_err();
        NullableColumn::new(vec![1u32], vec![0, 0]).unwrap_err();
        let values = NullableColumn::new(vec![0u32; 9], vec![0b10000001, 1]).unwrap();
        assert_eq!(values.get(0), Some(Some(0)));
        assert_eq!(values.get(1), Some(None));
        assert_eq!(values.get(7), Some(Some(0)));
        assert_eq!(values.get(8), Some(Some(0)));
        assert_eq!(values.get(9), None);
        assert_eq!(values.heap_bytes(), 9 * 4 + 2);
        let spare =
            NullableColumn::new(Vec::<u32>::with_capacity(16), Vec::with_capacity(2)).unwrap();
        assert_eq!(spare.heap_bytes(), 0);
        assert_eq!(spare.allocated_bytes(), 16 * 4 + 2);
        values.check_rows(8).unwrap_err();
    }
    #[test]
    fn codec_preserves_absence_and_writes_a_canonical_placeholder() {
        let value = NullableColumn::new(vec![0.0f64, f64::NAN, 12.0], vec![0b101]).unwrap();
        let mut out = Encoder::new();
        value.encode(&mut out);
        let bytes = out.finish();
        let mut raw = Decoder::new(&bytes);
        assert_eq!(raw.column::<f64>().unwrap(), [0.0, 0.0, 12.0]);
        let decoded = NullableColumn::<f64>::decode(&mut Decoder::new(&bytes)).unwrap();
        assert_eq!(
            decoded.iter().collect::<Vec<_>>(),
            [Some(0.0), None, Some(12.0)]
        );
        for (values, bits) in [(vec![1u16; 9], vec![0u8]), (vec![1u16], vec![128u8])] {
            let mut out = Encoder::new();
            out.column(&values);
            out.column(&bits);
            assert!(matches!(
                NullableColumn::<u16>::decode(&mut Decoder::new(&out.finish())),
                Err(DecodeError::Column(_))
            ));
        }
        let mut out = Encoder::new();
        NullableColumn::<f32>::new(vec![], vec![])
            .unwrap()
            .encode(&mut out);
        assert!(
            NullableColumn::<f32>::decode(&mut Decoder::new(&out.finish()))
                .unwrap()
                .is_empty()
        );
    }
}
