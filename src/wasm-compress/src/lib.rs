use std::io::{Cursor, Read, Write};
use wasm_bindgen::prelude::*;
use zip_next as zip;

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

impl<'a, R> Read for ProgressReader<'a, R>
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

fn _recompress(
    data: &[u8],
    f: Option<&js_sys::Function>,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let reader = Cursor::new(data);
    if let Ok(mut zip) = zip::ZipArchive::new(reader) {
        let mut inflated_size: u64 = 0;
        let mut total_size: usize = 0;
        for i in 0..zip.len() {
            let file = zip.by_index(i)?;
            inflated_size += file.compressed_size();
            total_size += file.size() as usize;
        }

        let out: Vec<u8> = Vec::with_capacity((inflated_size + zip.offset()) as usize);
        let mut writer = Cursor::new(out);
        writer.write_all(&data[..zip.offset() as usize])?;
        let mut out_zip = zip::ZipWriter::new(writer);

        let mut current_size = 0;
        for i in 0..zip.len() {
            let file = zip.by_index(i)?;
            let file_size = file.size() as usize;
            let options = zip::write::FileOptions::default()
                .compression_level(Some(7))
                .compression_method(zip::CompressionMethod::Zstd);

            out_zip
                .start_file(String::from(file.name()), options)
                .unwrap();
            let mut reader = ProgressReader::start_at(file, total_size, current_size, f);
            std::io::copy(&mut reader, &mut out_zip)?;
            current_size += file_size;
        }

        Ok(out_zip.finish().unwrap().into_inner())
    } else {
        let out = Cursor::new(Vec::with_capacity(data.len() / 10));
        let inner = Cursor::new(data);
        let mut reader = ProgressReader::new(inner, data.len(), f);
        let mut encoder = zstd::Encoder::new(out, 7).unwrap();
        std::io::copy(&mut reader, &mut encoder)?;
        Ok(encoder.finish()?.into_inner())
    }
}

pub fn recompress(data: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    _recompress(data, None)
}

#[wasm_bindgen]
pub fn compress(data: &[u8], f: &js_sys::Function) -> Result<Vec<u8>, JsValue> {
    _recompress(data, Some(f)).map_err(|e| JsValue::from_str(e.to_string().as_str()))
}

#[wasm_bindgen]
pub fn recompressed_meta(data: &[u8]) -> String {
    let reader = Cursor::new(data);
    if zip::ZipArchive::new(reader).is_ok() {
        String::from(r#"{"content_type":"application/zip"}"#)
    } else {
        String::from(r#"{"content_type":"application/zstd"}"#)
    }
}
