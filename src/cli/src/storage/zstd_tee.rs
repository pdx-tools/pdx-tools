use anyhow::Context;
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

pub struct ZstdFiles {
    name: String,
    out_path: PathBuf,
    raw_path: PathBuf,
}

impl ZstdFiles {
    pub fn from_path<P: AsRef<Path>>(p: P) -> anyhow::Result<Self> {
        let path = p.as_ref();
        let extensionless = path.with_extension("");
        let current_name = extensionless
            .file_name()
            .with_context(|| format!("missing file name: {}", path.display()))?;

        let current_name = current_name.to_str().context("utf-8 conversion")?;
        let out_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = extensionless.with_file_name(format!("{}-raw.bin", current_name));
        Ok(ZstdFiles {
            name: String::from(current_name),
            out_path: out_name,
            raw_path: raw_name,
        })
    }

    #[allow(dead_code)] // Only used in tokenize command
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

/// Writes to a raw file and to a zstd compressed one
pub struct ZstdTee {
    compressor: zstd::stream::write::AutoFinishEncoder<'static, File>,
    raw: BufWriter<File>,
}

impl ZstdTee {
    pub fn from_zstd_files(files: ZstdFiles) -> anyhow::Result<Self> {
        let out_name = files.out_path();
        let raw_name = files.raw_path();
        let out_file = File::create(out_name)
            .with_context(|| format!("creating file: {}", out_name.display()))?;

        let compressor = zstd::Encoder::new(out_file, 16)
            .context("invalid zstd settings")?
            .auto_finish();
        let file = File::create(raw_name)
            .with_context(|| format!("creating file: {}", raw_name.display()))?;
        let buf = BufWriter::new(file);
        Ok(Self {
            compressor,
            raw: buf,
        })
    }

    #[allow(dead_code)] // Not used in the tokenize command
    pub fn create<P: AsRef<Path>>(p: P) -> anyhow::Result<Self> {
        let files = ZstdFiles::from_path(p)?;
        Self::from_zstd_files(files)
    }
}

impl Write for ZstdTee {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.compressor.write_all(buf)?;
        self.raw.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.compressor.flush()?;
        self.raw.flush()?;
        Ok(())
    }
}
