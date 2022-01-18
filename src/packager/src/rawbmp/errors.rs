use core::fmt;

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct BmpError {
    kind: BmpErrorKind,
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub enum BmpErrorKind {
    UnrecognizedMagic,
    UnsupportedDib,
    EarlyEof,
}

impl BmpError {
    pub(crate) fn eof() -> Self {
        BmpError {
            kind: BmpErrorKind::EarlyEof,
        }
    }

    pub(crate) fn unrecognized_magic() -> Self {
        BmpError {
            kind: BmpErrorKind::UnrecognizedMagic,
        }
    }

    pub(crate) fn unsupported_dib() -> Self {
        BmpError {
            kind: BmpErrorKind::UnsupportedDib,
        }
    }
}

impl std::error::Error for BmpError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        None
    }
}

impl fmt::Display for BmpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.kind {
            BmpErrorKind::EarlyEof => write!(f, "early eof encountered"),
            BmpErrorKind::UnrecognizedMagic => write!(f, "unrecognized bmp magic header"),
            BmpErrorKind::UnsupportedDib => write!(f, "an unsupported dib header encountered"),
        }
    }
}
