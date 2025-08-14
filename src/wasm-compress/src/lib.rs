use serde::Serialize;
use std::io::{Cursor, Read, Write};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

struct ProgressReader<'a, R> {
    reader: R,
    current_size: usize,
    total_size: usize,
    progress: Option<&'a js_sys::Function>,
    read_cycle: usize,
}

impl<'a, R> ProgressReader<'a, R> {
    pub fn start_at(
        reader: R,
        total_size: usize,
        current_size: usize,
        progress: Option<&'a js_sys::Function>,
    ) -> Self {
        Self {
            reader,
            total_size,
            progress,
            current_size,
            read_cycle: 0,
        }
    }

    pub fn new(reader: R, total_size: usize, progress: Option<&'a js_sys::Function>) -> Self {
        Self {
            reader,
            total_size,
            progress,
            current_size: 0,
            read_cycle: 0,
        }
    }
}

impl<R> Read for ProgressReader<'_, R>
where
    R: Read,
{
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let read = self.reader.read(buf)?;
        self.read_cycle += 1;
        self.current_size += read;
        if self.read_cycle % 100 == 0 {
            if let Some(cb) = self.progress {
                let progress = (self.current_size as f64) / (self.total_size as f64);
                let this = JsValue::null();
                let arg = JsValue::from_f64(progress.min(1.0));
                let _ = cb.call1(&this, &arg);
            }
        }

        Ok(read)
    }
}

/// Re-encodes the data into a smaller, faster format.
///
/// - Remux Deflate ZIP archives with Zstd.
/// - Otherwise, return the data compressed as a Zstd stream.
#[wasm_bindgen]
pub fn init_compression(data: Vec<u8>) -> Compression {
    Compression::new(data)
}

#[wasm_bindgen]
pub struct Compression {
    content: Reader,
}

impl Compression {
    fn new(data: Vec<u8>) -> Compression {
        let locator = rawzip::ZipLocator::new().max_search_space(1024);
        match locator.locate_in_slice(data) {
            Ok(zip) => {
                let prelude = zip.as_bytes()[0..zip.base_offset() as usize].to_vec();
                Compression {
                    content: Reader::Zip { zip, prelude },
                }
            }
            Err((data, _)) => Compression {
                content: Reader::Data(data),
            },
        }
    }

    fn _compress_cb(self, f: Option<js_sys::Function>) -> Result<Vec<u8>, JsError> {
        match self.content {
            Reader::Zip { zip, prelude } => {
                let mut inflated_size: u64 = 0;
                let mut total_size: usize = 0;
                let mut entries = zip.entries();
                while let Some(entry) = entries.next_entry()? {
                    inflated_size += entry.compressed_size_hint();
                    total_size += entry.uncompressed_size_hint() as usize;
                }

                let out: Vec<u8> = Vec::with_capacity((inflated_size + zip.base_offset()) as usize);
                let mut writer = Cursor::new(out);
                writer.write_all(&prelude)?;
                let mut out_zip =
                    rawzip::ZipArchiveWriter::at_offset(zip.base_offset()).build(writer);

                let mut files = Vec::new();
                let mut entries = zip.entries();
                while let Some(entry) = entries.next_entry()? {
                    if entry.is_dir() {
                        continue;
                    }
                    let file_name = String::from(entry.file_path().try_normalize()?);
                    files.push((file_name, entry.wayfinder()));
                }

                let mut current_size = 0;
                for (name, wayfinder) in files {
                    let mut out_file = out_zip
                        .new_file(&name)
                        .compression_method(rawzip::CompressionMethod::Zstd)
                        .create()?;
                    let enc = pdx_zstd::Encoder::new(&mut out_file, 7)?;
                    let mut writer = rawzip::ZipDataWriter::new(enc);
                    let entry = zip.get_entry(wayfinder)?;
                    let reader = flate2::read::DeflateDecoder::new(entry.data());
                    let reader = entry.verifying_reader(reader);
                    let mut reader =
                        ProgressReader::start_at(reader, total_size, current_size, f.as_ref());
                    let written = std::io::copy(&mut reader, &mut writer)?;
                    debug_assert_eq!(written, wayfinder.uncompressed_size_hint());
                    let (zstd_writer, output) = writer.finish()?;
                    zstd_writer.finish()?;
                    out_file.finish(output)?;
                    current_size += wayfinder.uncompressed_size_hint() as usize;
                }

                Ok(out_zip.finish()?.into_inner())
            }
            Reader::Data(data) => {
                let out = Cursor::new(Vec::with_capacity(data.len() / 10));
                let inner = Cursor::new(data.as_slice());
                let mut reader = ProgressReader::new(inner, data.len(), f.as_ref());
                let mut encoder = pdx_zstd::Encoder::new(out, 7)?;
                std::io::copy(&mut reader, &mut encoder)?;
                Ok(encoder.finish()?.into_inner())
            }
        }
    }
}

#[wasm_bindgen]
impl Compression {
    pub fn content_type(&self) -> ContentType {
        match &self.content {
            Reader::Zip { .. } => ContentType::Zip,
            Reader::Data(_) => ContentType::Zstd,
        }
    }

    pub fn compress_cb(self, f: Option<js_sys::Function>) -> Result<Vec<u8>, JsError> {
        self._compress_cb(f)
    }
}

enum Reader {
    Zip {
        zip: rawzip::ZipSliceArchive<Vec<u8>>,
        prelude: Vec<u8>,
    },
    Data(Vec<u8>),
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
pub enum ContentType {
    #[serde(rename = "application/zip")]
    Zip,
    #[serde(rename = "application/zstd")]
    Zstd,
}

/// Undoes the compress function, so that the save file can be loaded into EU4.
///
/// - Remux Zstd ZIP archives with Deflate.
/// - Otherwise, decode the data with Zstd.
#[wasm_bindgen]
pub fn download_transformation(data: Vec<u8>) -> Result<Vec<u8>, JsError> {
    _download_transformation(data)
}

fn _download_transformation(data: Vec<u8>) -> Result<Vec<u8>, JsError> {
    // Check for zstd magic number and decode if found
    if pdx_zstd::is_zstd_compressed(&data) {
        Ok(pdx_zstd::decode_all(&data)?)
    } else if let Ok(zip) = rawzip::ZipArchive::from_slice(&data) {
        let out = Vec::with_capacity(data.len() * 2);
        let writer = Cursor::new(out);
        let mut out_zip = rawzip::ZipArchiveWriter::new(writer);
        let mut entries = zip.entries();
        while let Ok(Some(entry)) = entries.next_entry() {
            let name = entry.file_path().try_normalize()?;
            let mut out_file = out_zip
                .new_file(name.as_ref())
                .compression_method(rawzip::CompressionMethod::Deflate)
                .create()?;

            let writer =
                flate2::write::DeflateEncoder::new(&mut out_file, flate2::Compression::default());
            let mut writer = rawzip::ZipDataWriter::new(writer);

            let entry = zip.get_entry(entry.wayfinder())?;
            pdx_zstd::copy_decode(entry.data(), &mut writer)?;
            let (_, output) = writer.finish()?;
            out_file.finish(output)?;
        }

        Ok(out_zip.finish()?.into_inner())
    } else {
        Ok(data)
    }
}
