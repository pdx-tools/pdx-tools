use std::io::{Cursor, Read, Write};
use wasm_bindgen::prelude::*;

fn new_brotli<W: Write>(writer: W) -> brotli::CompressorWriter<W> {
    brotli::CompressorWriter::new(writer, 4096, 9, 22)
}

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
        let out = Vec::with_capacity(data.len() / 2);

        let compressor = new_brotli(out);
        let mut archive = tar::Builder::new(compressor);

        if zip.offset() != 0 {
            let mut header = tar::Header::new_gnu();
            header.set_path("__leading_data")?;
            header.set_size(zip.offset());
            header.set_mtime(0);
            header.set_cksum();
            archive.append(&header, &data[..zip.offset() as usize])?;
        }

        let mut total_size = 0;
        for index in 0..zip.len() {
            let file = zip.by_index(index)?;
            total_size += file.size() as usize;
        }

        let mut current_size = 0;
        for index in 0..zip.len() {
            let file = zip.by_index(index)?;
            let file_size = file.size() as usize;
            let mut header = tar::Header::new_gnu();
            header.set_path(file.name())?;
            header.set_size(file.size());
            header.set_mtime(0);
            header.set_cksum();

            let reader = ProgressReader::start_at(file, total_size, current_size, f);
            archive.append(&header, reader)?;
            current_size += file_size;
        }

        archive.finish()?;
        let data = archive.into_inner()?.into_inner();
        Ok(data)
    } else {
        let inner = Cursor::new(data);
        let mut reader = ProgressReader::new(inner, data.len(), f);
        let out = Vec::with_capacity(data.len() / 10);
        let cursor = Cursor::new(out);
        let mut compressor = new_brotli(cursor);
        std::io::copy(&mut reader, &mut compressor)?;
        let data = compressor.into_inner().into_inner();
        Ok(data)
    }
}

pub fn recompress(data: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    _recompress(data, None)
}

#[wasm_bindgen]
pub fn brotli_compress(data: &[u8], f: &js_sys::Function) -> Result<Vec<u8>, JsValue> {
    _recompress(data, Some(f)).map_err(|e| JsValue::from_str(e.to_string().as_str()))
}

#[wasm_bindgen]
pub fn recompressed_meta(data: &[u8]) -> String {
    let reader = Cursor::new(data);
    if zip::ZipArchive::new(reader).is_ok() {
        String::from(r#"{"content_type":"application/x-tar", "content_encoding": "br"}"#)
    } else {
        String::from(r#"{"content_type":"text/plain", "content_encoding": "br"}"#)
    }
}
