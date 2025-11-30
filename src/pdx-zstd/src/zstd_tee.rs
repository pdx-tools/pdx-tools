use crate::{Encoder, Error, Result};
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub struct ZstdFiles {
    name: String,
    out_path: PathBuf,
    raw_path: PathBuf,
}

impl ZstdFiles {
    pub fn from_path<P: AsRef<Path>>(p: P) -> Result<Self> {
        let path = p.as_ref();
        let extensionless = path.with_extension("");
        let current_name = extensionless.file_name().ok_or_else(|| {
            Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("missing file name: {}", path.display()),
            ))
        })?;

        let current_name = current_name.to_str().ok_or_else(|| {
            Error::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "utf-8 conversion failed",
            ))
        })?;
        let out_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = extensionless.with_file_name(format!("{}-raw.bin", current_name));
        Ok(ZstdFiles {
            name: String::from(current_name),
            out_path: out_name,
            raw_path: raw_name,
        })
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn out_path(&self) -> &Path {
        &self.out_path
    }

    pub fn raw_path(&self) -> &Path {
        &self.raw_path
    }
}

pub struct ZstdTee {
    compressor: Option<Encoder<File>>,
    raw: BufWriter<File>,
}

impl ZstdTee {
    pub fn from_zstd_files(files: ZstdFiles) -> Result<Self> {
        let out_name = files.out_path();
        let raw_name = files.raw_path();
        let out_file = File::create(out_name).map_err(|e| {
            Error::Io(std::io::Error::new(
                e.kind(),
                format!("creating file: {}: {}", out_name.display(), e),
            ))
        })?;

        let compressor = Encoder::new(out_file, 16)?;
        let file = File::create(raw_name).map_err(|e| {
            Error::Io(std::io::Error::new(
                e.kind(),
                format!("creating file: {}: {}", raw_name.display(), e),
            ))
        })?;
        let buf = BufWriter::new(file);
        Ok(Self {
            compressor: Some(compressor),
            raw: buf,
        })
    }

    pub fn create<P: AsRef<Path>>(p: P) -> Result<Self> {
        let files = ZstdFiles::from_path(p)?;
        Self::from_zstd_files(files)
    }

    pub fn finish(mut self) -> Result<()> {
        if let Some(compressor) = self.compressor.take() {
            compressor.finish()?;
        }
        self.raw.flush()?;
        Ok(())
    }
}

impl std::fmt::Debug for ZstdTee {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ZstdTee").finish()
    }
}

impl Write for ZstdTee {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if let Some(ref mut compressor) = self.compressor {
            compressor.write_all(buf)?;
        }
        self.raw.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        if let Some(ref mut compressor) = self.compressor {
            compressor.flush()?;
        }
        self.raw.flush()?;
        Ok(())
    }
}

impl Drop for ZstdTee {
    fn drop(&mut self) {
        if let Some(compressor) = self.compressor.take() {
            let _ = compressor.finish();
        }
        let _ = self.raw.flush();
    }
}
