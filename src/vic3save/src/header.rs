use crate::{Vic3Error, Vic3ErrorKind};
use std::io::Write;

/// A simplified and const generic version of arrayref
#[inline]
fn take<const N: usize>(data: &[u8]) -> [u8; N] {
    debug_assert!(data.len() >= N);
    unsafe { *(data.as_ptr() as *const [u8; N]) }
}

/// The kind of save file
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveHeaderKind {
    /// uncompressed text
    Text,

    /// uncompressed binary
    Binary,

    /// uncompressed metadata header with compressed gamestate that includes
    /// metadata (text)
    UnifiedText,

    /// uncompressed metadata header with compressed gamestate that includes
    /// metadata (binary)
    UnifiedBinary,

    /// uncompressed metadata header with compressed gamestate that excludes
    /// metadata (text)
    SplitText,

    /// uncompressed metadata header with compressed gamestate that excludes
    /// metadata (binary)
    SplitBinary,

    /// An unknown type
    Other(u16),
}

impl SaveHeaderKind {
    pub fn new(kind: u16) -> SaveHeaderKind {
        match kind {
            0 => SaveHeaderKind::Text,
            1 => SaveHeaderKind::Binary,
            2 => SaveHeaderKind::UnifiedText,
            3 => SaveHeaderKind::UnifiedBinary,
            4 => SaveHeaderKind::SplitText,
            5 => SaveHeaderKind::SplitBinary,
            x => SaveHeaderKind::Other(x),
        }
    }

    pub fn value(&self) -> u16 {
        match self {
            SaveHeaderKind::Text => 0,
            SaveHeaderKind::Binary => 1,
            SaveHeaderKind::UnifiedText => 2,
            SaveHeaderKind::UnifiedBinary => 3,
            SaveHeaderKind::SplitText => 4,
            SaveHeaderKind::SplitBinary => 5,
            SaveHeaderKind::Other(x) => *x,
        }
    }

    pub fn is_binary(&self) -> bool {
        matches!(
            self,
            SaveHeaderKind::Binary | SaveHeaderKind::UnifiedBinary | SaveHeaderKind::SplitBinary
        )
    }

    pub fn is_text(&self) -> bool {
        matches!(
            self,
            SaveHeaderKind::Text | SaveHeaderKind::UnifiedText | SaveHeaderKind::SplitText
        )
    }
}

/// The first line of the save file
#[derive(Debug, Clone, PartialEq)]
pub struct SaveHeader {
    unknown: [u8; 2],
    kind: SaveHeaderKind,
    random: [u8; 8],
    meta_len: u64,
    header_len: usize,
}

impl SaveHeader {
    pub fn from_slice(data: &[u8]) -> Result<Self, Vic3Error> {
        if data.len() < 24 {
            return Err(Vic3ErrorKind::InvalidHeader.into());
        }

        if !matches!(&data[..3], [b'S', b'A', b'V']) {
            return Err(Vic3ErrorKind::InvalidHeader.into());
        }

        let unknown = take::<2>(&data[3..5]);
        let kind_hex =
            std::str::from_utf8(&data[5..7]).map_err(|_| Vic3ErrorKind::InvalidHeader)?;
        let kind = u16::from_str_radix(kind_hex, 16).map_err(|_| Vic3ErrorKind::InvalidHeader)?;
        let random = take::<8>(&data[7..15]);

        let meta_hex =
            std::str::from_utf8(&data[15..23]).map_err(|_| Vic3ErrorKind::InvalidHeader)?;
        let meta_len =
            u64::from_str_radix(meta_hex, 16).map_err(|_| Vic3ErrorKind::InvalidHeader)?;

        let header_len = if data[23] == b'\r' && data.get(24) == Some(&b'\n') {
            25
        } else if data[23] == b'\n' {
            24
        } else {
            return Err(Vic3ErrorKind::InvalidHeader.into());
        };

        Ok(SaveHeader {
            unknown,
            kind: SaveHeaderKind::new(kind),
            random,
            meta_len,
            header_len,
        })
    }

    pub fn kind(&self) -> SaveHeaderKind {
        self.kind
    }

    pub fn set_kind(&mut self, kind: SaveHeaderKind) {
        self.kind = kind;
    }

    pub fn header_len(&self) -> usize {
        self.header_len
    }

    pub fn metadata_len(&self) -> u64 {
        self.meta_len
    }

    pub fn set_metadata_len(&mut self, len: u64) {
        self.meta_len = len
    }

    pub fn write<W>(&self, mut writer: W) -> std::io::Result<()>
    where
        W: Write,
    {
        writer.write_all(b"SAV")?;
        writer.write_all(&self.unknown)?;
        write!(writer, "{0:02x}", self.kind.value())?;
        writer.write_all(&self.random)?;
        write!(writer, "{0:08x}", self.meta_len)?;
        if self.header_len() == 25 {
            writer.write_all(b"\r")?;
        }
        writer.write_all(b"\n")?;
        Ok(())
    }
}
