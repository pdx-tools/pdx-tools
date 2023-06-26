use serde::Serialize;
use std::io::{Cursor, Read, Write};
use tsify::Tsify;
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
        let reader = Cursor::new(&data);
        if let Ok(zip) = zip::ZipArchive::new(reader) {
            let offset = zip.offset();
            let prelude = zip.into_inner().get_ref()[0..offset as usize].to_vec();
            let zip = zip::ZipArchive::new(Cursor::new(data)).unwrap();
            Compression {
                content: Reader::Zip { zip, prelude },
            }
        } else {
            Compression {
                content: Reader::Data(data),
            }
        }
    }

    fn _compress_cb(
        self,
        f: Option<js_sys::Function>,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        match self.content {
            Reader::Zip { mut zip, prelude } => {
                let mut inflated_size: u64 = 0;
                let mut total_size: usize = 0;
                for i in 0..zip.len() {
                    let file = zip.by_index(i)?;
                    inflated_size += file.compressed_size();
                    total_size += file.size() as usize;
                }

                let out: Vec<u8> = Vec::with_capacity((inflated_size + zip.offset()) as usize);
                let mut writer = Cursor::new(out);
                writer.write_all(&prelude)?;
                let mut out_zip = zip::ZipWriter::new(writer);

                let mut current_size = 0;
                for i in 0..zip.len() {
                    let file = zip.by_index(i)?;
                    let file_size = file.size() as usize;
                    let options = zip::write::FileOptions::default()
                        .compression_level(Some(7))
                        .compression_method(zip::CompressionMethod::Zstd);

                    out_zip.start_file(String::from(file.name()), options)?;
                    let mut reader =
                        ProgressReader::start_at(file, total_size, current_size, f.as_ref());
                    std::io::copy(&mut reader, &mut out_zip)?;
                    current_size += file_size;
                }

                Ok(out_zip.finish()?.into_inner())
            }
            Reader::Data(data) => {
                let out = Cursor::new(Vec::with_capacity(data.len() / 10));
                let inner = Cursor::new(data.as_slice());
                let mut reader = ProgressReader::new(inner, data.len(), f.as_ref());
                let mut encoder = zstd::Encoder::new(out, 7).unwrap();
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

    pub fn compress_cb(self, f: Option<js_sys::Function>) -> Result<Vec<u8>, JsValue> {
        self._compress_cb(f)
            .map_err(|err| JsValue::from(err.to_string()))
    }
}

enum Reader {
    Zip {
        zip: zip::ZipArchive<Cursor<Vec<u8>>>,
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

#[wasm_bindgen]
pub fn download_transformation(data: Vec<u8>) -> Vec<u8> {
    if data.starts_with(&zstd::zstd_safe::MAGICNUMBER.to_le_bytes()) {
        zstd::stream::decode_all(data.as_slice()).unwrap_or_default()
    } else if let Ok(mut x) = zip::ZipArchive::new(Cursor::new(&data)) {
        let out = Vec::with_capacity(data.len() * 2);
        let writer = Cursor::new(out);
        let mut out_zip = zip::ZipWriter::new(writer);

        for i in 0..x.len() {
            let mut file = x.by_index(i).unwrap();
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            out_zip.start_file(file.name(), options).unwrap();
            std::io::copy(&mut file, &mut out_zip).unwrap();
        }
        out_zip.finish().unwrap().into_inner()
    } else {
        data
    }
}
