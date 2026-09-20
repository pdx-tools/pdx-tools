//! Re-encode save files between the compression the game writes and the
//! smaller, faster compression that the browser uploads.
//!
//! [`Compression`] encodes a save for upload and [`decompress`] restores it
//! for download. The two are inverses:
//!
//! - A Deflate ZIP archive is remuxed to a Zstd ZIP archive and back.
//! - Any other data is encoded as a Zstd stream and decoded again.

use std::io::{Cursor, Read, Write};

/// The Zstd level for the upload path, for zip entries and plain streams.
const ZSTD_LEVEL: i32 = 7;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] rawzip::Error),
    #[error(transparent)]
    Zstd(#[from] pdx_zstd::Error),
}

/// Reports the fraction of `total` bytes that have been read, from 0 to 1.
///
/// A report is sent when at least one percent of `total` has been read since
/// the last report, and when the reader reaches the end.
struct ProgressReader<'a, R, F> {
    reader: R,
    progress: &'a mut F,
    current: usize,
    total: usize,
    reported: usize,
}

impl<'a, R, F> ProgressReader<'a, R, F>
where
    R: Read,
    F: FnMut(f64),
{
    fn new(reader: R, progress: &'a mut F, current: usize, total: usize) -> Self {
        Self {
            reader,
            progress,
            current,
            total,
            reported: current,
        }
    }

    fn report(&mut self) {
        self.reported = self.current;
        let fraction = if self.total == 0 {
            1.0
        } else {
            (self.current as f64) / (self.total as f64)
        };
        (self.progress)(fraction.min(1.0));
    }
}

impl<R, F> Read for ProgressReader<'_, R, F>
where
    R: Read,
    F: FnMut(f64),
{
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let read = self.reader.read(buf)?;
        self.current += read;
        let done = read == 0 && !buf.is_empty();
        if done || self.current - self.reported >= self.total / 100 {
            self.report();
        }

        Ok(read)
    }
}

/// One file to remux from a source archive.
#[derive(Debug)]
struct SourceEntry {
    /// The entry name as the source archive stores it, so that the output
    /// archive stores the same bytes.
    name: Vec<u8>,
    wayfinder: rawzip::ZipArchiveEntryWayfinder,
}

/// What one pass over a central directory finds.
struct Scan {
    /// The length of the bytes before the first zip entry. Saves put a
    /// plaintext header here, and the game expects it to survive a round
    /// trip.
    prelude_len: usize,
    entries: Vec<SourceEntry>,
    /// The sum of the uncompressed entry sizes, for progress reports.
    uncompressed_size: usize,
}

/// Finds a zip archive in the data, or gives the data back when there is
/// none.
fn locate_zip(data: Vec<u8>) -> Result<rawzip::ZipSliceArchive<Vec<u8>>, Vec<u8>> {
    let locator = rawzip::ZipLocator::new().max_search_space(1024);
    locator.locate_in_slice(data).map_err(|(data, _)| data)
}

/// Reads the central directory once. Directory entries are dropped.
fn scan_entries(zip: &rawzip::ZipSliceArchive<Vec<u8>>) -> Result<Scan, Error> {
    let mut entries = Vec::new();
    let mut uncompressed_size = 0;
    let mut first_entry = zip.directory_offset();
    let mut iter = zip.entries();
    while let Some(entry) = iter.next_entry()? {
        first_entry = first_entry.min(entry.local_header_offset());
        if entry.is_dir() {
            continue;
        }

        uncompressed_size += entry.uncompressed_size_hint() as usize;
        entries.push(SourceEntry {
            name: entry.file_path().as_bytes().to_vec(),
            wayfinder: entry.wayfinder(),
        });
    }

    Ok(Scan {
        prelude_len: first_entry as usize,
        entries,
        uncompressed_size,
    })
}

/// Starts an output archive that keeps `prelude` before the first entry.
fn start_archive(
    prelude: &[u8],
    capacity: usize,
) -> Result<rawzip::ZipArchiveWriter<Cursor<Vec<u8>>>, Error> {
    let mut writer = Cursor::new(Vec::with_capacity(capacity));
    writer.write_all(prelude)?;
    Ok(rawzip::ZipArchiveWriter::builder()
        .with_offset(prelude.len() as u64)
        .build(writer))
}

#[derive(Debug)]
enum Source {
    Zip {
        zip: rawzip::ZipSliceArchive<Vec<u8>>,
        prelude: Vec<u8>,
        entries: Vec<SourceEntry>,
        uncompressed_size: usize,
    },
    Data(Vec<u8>),
}

/// The container that [`Compression::compress`] produces.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentType {
    Zip,
    Zstd,
}

impl ContentType {
    pub fn mime(self) -> &'static str {
        match self {
            ContentType::Zip => "application/zip",
            ContentType::Zstd => "application/zstd",
        }
    }
}

/// Re-encodes a save into a smaller, faster format for upload.
///
/// - Remux Deflate ZIP archives with Zstd.
/// - Otherwise, return the data compressed as a Zstd stream.
///
/// [`decompress`] restores the original encoding.
#[derive(Debug)]
pub struct Compression {
    source: Source,
}

impl Compression {
    /// Inspects the data and decides how it will be compressed. Fails when
    /// the data is a zip archive with an unreadable central directory.
    pub fn new(data: Vec<u8>) -> Result<Compression, Error> {
        let source = match locate_zip(data) {
            Ok(zip) => {
                let scan = scan_entries(&zip)?;
                Source::Zip {
                    prelude: zip.get_ref()[..scan.prelude_len].to_vec(),
                    zip,
                    entries: scan.entries,
                    uncompressed_size: scan.uncompressed_size,
                }
            }
            Err(data) => Source::Data(data),
        };
        Ok(Compression { source })
    }

    pub fn content_type(&self) -> ContentType {
        match &self.source {
            Source::Zip { .. } => ContentType::Zip,
            Source::Data(_) => ContentType::Zstd,
        }
    }

    pub fn compress(self) -> Result<Vec<u8>, Error> {
        self.compress_with_progress(|_| {})
    }

    /// Compress the data. `progress` receives the fraction of the data that
    /// has been encoded, from 0 to 1. For a zip archive the fraction is over
    /// the uncompressed entry sizes, not the size of the archive.
    pub fn compress_with_progress(self, mut progress: impl FnMut(f64)) -> Result<Vec<u8>, Error> {
        match self.source {
            Source::Zip {
                zip,
                prelude,
                entries,
                uncompressed_size,
            } => {
                let mut out_zip = start_archive(&prelude, zip.get_ref().len())?;

                let mut current = 0;
                for SourceEntry { name, wayfinder } in entries {
                    let (mut out_file, config) = out_zip
                        .new_file(rawzip::path::EntryPath::verbatim(name))
                        .compression_method(rawzip::CompressionMethod::ZSTD)
                        .start()?;
                    let enc = pdx_zstd::Encoder::new(&mut out_file, ZSTD_LEVEL)?;
                    let mut writer = config.wrap(enc);
                    let entry = zip.get_entry(wayfinder)?;
                    let reader = flate2::bufread::DeflateDecoder::new(entry.data());
                    let reader = entry.verifying_reader(reader);
                    let mut reader =
                        ProgressReader::new(reader, &mut progress, current, uncompressed_size);
                    let written = std::io::copy(&mut reader, &mut writer)?;
                    let (zstd_writer, output) = writer.finish()?;
                    zstd_writer.finish()?;
                    out_file.finish(output)?;
                    current += written as usize;
                }

                Ok(out_zip.finish()?.into_inner())
            }
            Source::Data(data) => {
                let out = Cursor::new(Vec::with_capacity(data.len() / 10));
                let mut reader = ProgressReader::new(data.as_slice(), &mut progress, 0, data.len());
                let mut encoder = pdx_zstd::Encoder::new(out, ZSTD_LEVEL)?;
                std::io::copy(&mut reader, &mut encoder)?;
                Ok(encoder.finish()?.into_inner())
            }
        }
    }
}

/// Re-encodes a save for upload. See [`Compression`].
pub fn compress(data: Vec<u8>) -> Result<Vec<u8>, Error> {
    Compression::new(data)?.compress()
}

/// Re-encodes a save for upload. See [`Compression::compress_with_progress`].
pub fn compress_with_progress(data: Vec<u8>, progress: impl FnMut(f64)) -> Result<Vec<u8>, Error> {
    Compression::new(data)?.compress_with_progress(progress)
}

/// Undoes [`compress`], so that the save file can be loaded into the game.
///
/// - Remux Zstd ZIP archives with Deflate.
/// - Decode Zstd streams.
/// - Return any other data unchanged.
pub fn decompress(data: Vec<u8>) -> Result<Vec<u8>, Error> {
    decompress_with_progress(data, |_| {})
}

/// Undoes [`compress`]. `progress` receives the fraction of the data that
/// has been decoded, from 0 to 1. For a zip archive the fraction is over the
/// uncompressed entry sizes, not the size of the archive.
pub fn decompress_with_progress(
    data: Vec<u8>,
    mut progress: impl FnMut(f64),
) -> Result<Vec<u8>, Error> {
    if pdx_zstd::is_zstd_compressed(&data) {
        let mut out = Vec::with_capacity(data.len() * 4);
        let reader = ProgressReader::new(data.as_slice(), &mut progress, 0, data.len());
        pdx_zstd::Decoder::new(reader)?.read_to_end(&mut out)?;
        return Ok(out);
    }

    let zip = match locate_zip(data) {
        Ok(zip) => zip,
        Err(data) => return Ok(data),
    };

    let scan = scan_entries(&zip)?;
    let prelude = &zip.get_ref()[..scan.prelude_len];
    let mut out_zip = start_archive(prelude, zip.get_ref().len() * 2)?;

    let mut current = 0;
    for SourceEntry { name, wayfinder } in scan.entries {
        let (mut out_file, config) = out_zip
            .new_file(rawzip::path::EntryPath::verbatim(name))
            .compression_method(rawzip::CompressionMethod::DEFLATE)
            .start()?;
        let writer =
            flate2::write::DeflateEncoder::new(&mut out_file, flate2::Compression::default());
        let mut writer = config.wrap(writer);
        let entry = zip.get_entry(wayfinder)?;
        let reader = pdx_zstd::Decoder::new(entry.data())?;
        let mut reader =
            ProgressReader::new(reader, &mut progress, current, scan.uncompressed_size);
        let written = std::io::copy(&mut reader, &mut writer)?;
        let (_, output) = writer.finish()?;
        out_file.finish(output)?;
        current += written as usize;
    }

    Ok(out_zip.finish()?.into_inner())
}
