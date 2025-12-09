// Path tracking for arena deserialization errors.
//
// Ported from serde_path_to_error v0.1.20 with modified path tracking to use a
// single buffer that amortizes allocations.

mod de;
mod path;
mod wrap;

pub use de::{Deserializer, deserialize};
pub use path::{Path, Segment, Segments};

use core::cell::Cell;
use core::fmt::{self, Display};
use serde::ser::StdError;

/// Original deserializer error together with the path at which it occurred.
#[derive(Clone, Debug)]
pub struct Error<E> {
    path: Path,
    original: E,
}

impl<E> Error<E> {
    pub fn new(path: Path, inner: E) -> Self {
        Error {
            path,
            original: inner,
        }
    }

    /// Element path at which this deserialization error occurred.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The Deserializer's underlying error that occurred.
    pub fn into_inner(self) -> E {
        self.original
    }

    /// Reference to the Deserializer's underlying error that occurred.
    pub fn inner(&self) -> &E {
        &self.original
    }
}

impl<E: Display> Display for Error<E> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        if !self.path.is_only_unknown() {
            write!(f, "{}: ", self.path)?;
        }
        write!(f, "{}", self.original)
    }
}

impl<E: StdError> StdError for Error<E> {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.original.source()
    }
}

/// State for bookkeeping across nested deserializer calls.
///
/// Uses a mutable byte vector for efficient path tracking that truncates on backtrack.
pub struct Track<'buf> {
    path_buf: core::cell::UnsafeCell<&'buf mut Vec<u8>>,
    path: Cell<Option<Path>>,
}

impl<'buf> Track<'buf> {
    /// Create a new tracker with a mutable byte vector for path tracking.
    pub fn new_with(buf: &'buf mut Vec<u8>) -> Self {
        Track {
            path_buf: core::cell::UnsafeCell::new(buf),
            path: Cell::new(None),
        }
    }

    /// Append bytes to the path buffer and return (start_position, length).
    ///
    /// Only pushes up to 255 bytes.
    ///
    /// # Safety
    ///
    /// This is safe to call from &self because the mutations follow a stack discipline:
    /// bytes pushed during deserialization are popped when unwinding back up the tree.
    pub fn push_bytes(&self, bytes: &[u8]) -> (usize, u8) {
        unsafe {
            let vec = &mut *self.path_buf.get();
            let start = vec.len();
            let bytes_to_push = bytes.len().min(u8::MAX as usize);
            let len = bytes_to_push as u8;
            vec.extend_from_slice(&bytes[..bytes_to_push]);
            (start, len)
        }
    }

    /// Remove `len` bytes from the end of the path buffer (used when unwinding).
    ///
    /// # Safety
    ///
    /// This is safe to call from &self because the mutations follow a stack discipline.
    pub fn pop_bytes(&self, len: u8) {
        unsafe {
            let vec = &mut *self.path_buf.get();
            let new_len = vec.len().saturating_sub(len as usize);
            vec.truncate(new_len);
        }
    }

    /// Get bytes from the path buffer at absolute position (start, len).
    ///
    /// Used during error path construction to read the bytes before they're popped.
    pub fn get_bytes(&self, start: usize, len: u8) -> &[u8] {
        unsafe {
            let vec = &*self.path_buf.get();
            let end = start + (len as usize);
            if end <= vec.len() {
                &vec[start..end]
            } else {
                &[] // Return empty slice if the bytes have been removed
            }
        }
    }

    /// Gets path at which the error occurred. Only meaningful after we know
    /// that an error has occurred. Returns an empty path otherwise.
    pub fn path(self) -> Path {
        self.path.into_inner().unwrap_or_else(Path::empty)
    }

    #[inline]
    pub(crate) fn trigger<'a, E>(&self, chain: &Chain<'a>, err: E) -> E {
        self.trigger_impl(chain);
        err
    }

    pub(crate) fn trigger_impl<'a>(&self, chain: &Chain<'a>) {
        self.path.set(Some(match self.path.take() {
            Some(already_set) => already_set,
            None => Path::from_chain(chain, self),
        }));
    }
}

#[derive(Clone)]
pub(crate) enum Chain<'a> {
    Root,
    Seq {
        parent: &'a Chain<'a>,
        index: usize,
    },
    Map {
        parent: &'a Chain<'a>,
        start: usize, // Absolute start position in path_buf
        len: u8,      // Length of this key
    },
    Enum {
        parent: &'a Chain<'a>,
        start: usize, // Absolute start position in path_buf
        len: u8,      // Length of this variant
    },
    Some {
        parent: &'a Chain<'a>,
    },
    NewtypeStruct {
        parent: &'a Chain<'a>,
    },
    NewtypeVariant {
        parent: &'a Chain<'a>,
    },
    NonStringKey {
        parent: &'a Chain<'a>,
    },
}
