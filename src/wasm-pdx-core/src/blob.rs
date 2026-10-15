use js_sys::Uint8Array;
use rawzip::ReaderAt;
use std::{cell::Cell, io};
use wasm_bindgen::{JsCast, JsValue};
use wasm_bindgen_futures::JsFuture;
use web_sys::{Blob, DomException, FileReaderSync};

/// The parser reads in small parts, and each read of a `Blob` has a high
/// cost. Thus, read the `Blob` in large windows.
const DEFAULT_WINDOW_LEN: usize = 8 * 1024 * 1024;

#[derive(Default)]
struct Window {
    start: u64,
    data: Vec<u8>,
}

enum Source {
    Streaming {
        blob: Blob,
        reader: FileReaderSync,
        window: Cell<Window>,
        window_len: usize,
    },
    Buffered(Uint8Array),
}

/// Reads a `Blob` (such as a `File`) at absolute offsets. The content is
/// never copied completely into wasm memory, which cannot shrink. Use it
/// only in a web worker.
pub struct BlobReader {
    size: u64,
    source: Source,
}

impl std::fmt::Debug for BlobReader {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BlobReader")
            .field("size", &self.size)
            .finish_non_exhaustive()
    }
}

impl BlobReader {
    /// Read the `Blob` in parts as the reads need them. Thus, the content
    /// is not in memory. Use this for large, uncompressed content.
    pub fn streaming(blob: Blob) -> io::Result<Self> {
        Self::streaming_with_window(blob, DEFAULT_WINDOW_LEN)
    }

    /// Like [`streaming`](Self::streaming), with windows of `window_len`
    /// bytes. Use a smaller window when only a small part of the `Blob` is
    /// read.
    pub fn streaming_with_window(blob: Blob, window_len: usize) -> io::Result<Self> {
        Ok(Self {
            size: blob.size() as u64,
            source: Source::Streaming {
                reader: FileReaderSync::new().map_err(read_error)?,
                blob,
                window: Cell::default(),
                window_len: window_len.max(1),
            },
        })
    }

    /// Read the complete `Blob` at once into memory that JS owns. One read
    /// is faster than many reads, so use this for compressed content.
    pub async fn buffered(blob: &Blob) -> io::Result<Self> {
        // An async read is faster than a `FileReaderSync` read.
        let data = JsFuture::from(blob.array_buffer())
            .await
            .map_err(read_error)?;
        let data = Uint8Array::new(&data);
        Ok(Self {
            size: u64::from(data.length()),
            source: Source::Buffered(data),
        })
    }

    pub fn size(&self) -> u64 {
        self.size
    }
}

/// Read the first `len` bytes of a `Blob`, or all of it when it is shorter.
pub fn read_blob_start(blob: &Blob, len: u64) -> io::Result<Vec<u8>> {
    let len = (blob.size() as u64).min(len);
    let reader = FileReaderSync::new().map_err(read_error)?;
    let mut buf = vec![0u8; len as usize];
    read_exact(&reader, blob, &mut buf, 0)?;
    Ok(buf)
}

fn read_exact(reader: &FileReaderSync, blob: &Blob, buf: &mut [u8], offset: u64) -> io::Result<()> {
    let end = offset + buf.len() as u64;
    let part = blob
        .slice_with_f64_and_f64(offset as f64, end as f64)
        .map_err(read_error)?;
    let data = reader.read_as_array_buffer(&part).map_err(read_error)?;
    let data = Uint8Array::new(&data);
    if data.length() as usize != buf.len() {
        return Err(io::ErrorKind::UnexpectedEof.into());
    }
    data.copy_to(buf);
    Ok(())
}

impl ReaderAt for BlobReader {
    fn read_at(&self, buf: &mut [u8], offset: u64) -> io::Result<usize> {
        let available = self.size.saturating_sub(offset);
        let len = usize::try_from(available).map_or(buf.len(), |x| x.min(buf.len()));
        if len == 0 {
            return Ok(0);
        }

        let (blob, reader, window, window_len) = match &self.source {
            Source::Buffered(data) => {
                let end = offset + len as u64;
                data.subarray(offset as u32, end as u32)
                    .copy_to(&mut buf[..len]);
                return Ok(len);
            }
            Source::Streaming {
                blob,
                reader,
                window,
                window_len,
            } => (blob, reader, window, *window_len),
        };

        if len >= window_len {
            read_exact(reader, blob, &mut buf[..len], offset)?;
            return Ok(len);
        }

        // Take the window out of the cell, as reads do not nest.
        let mut current = window.take();
        let current_end = current.start + current.data.len() as u64;
        if !(current.start..current_end).contains(&offset) {
            let fill = usize::try_from(available).map_or(window_len, |x| x.min(window_len));
            current.data.resize(fill, 0);
            current.start = offset;
            if let Err(e) = read_exact(reader, blob, &mut current.data, offset) {
                current.data.clear();
                window.set(current);
                return Err(e);
            }
        }

        let skip = (offset - current.start) as usize;
        let n = len.min(current.data.len() - skip);
        buf[..n].copy_from_slice(&current.data[skip..skip + n]);
        window.set(current);
        Ok(n)
    }
}

fn read_error(error: JsValue) -> io::Error {
    // A `File` is a snapshot. The browser stops reads after the file on
    // disk changes.
    match error.dyn_ref::<DomException>() {
        Some(e) if e.name() == "NotReadableError" => {
            io::Error::other("the save file changed on disk while it was read")
        }
        Some(e) => io::Error::other(format!("{}: {}", e.name(), e.message())),
        None => io::Error::other(format!("{error:?}")),
    }
}
