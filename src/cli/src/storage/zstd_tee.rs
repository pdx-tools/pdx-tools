use anyhow::Context;
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

/// Writes to a raw file and to a zstd compressed one
pub struct ZstdTee {
    compressor: zstd::stream::write::AutoFinishEncoder<'static, File>,
    raw: BufWriter<File>,
}

impl ZstdTee {
    pub fn create<P: AsRef<Path>>(p: P) -> anyhow::Result<Self> {
        let path = p.as_ref();
        let current_name = path
            .file_name()
            .with_context(|| format!("missing file name: {}", path.display()))?;

        let current_name = current_name.to_str().context("utf-8 conversion")?;
        let out_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = path.with_file_name(format!("{}-raw.bin", current_name));

        let out_file = File::create(&out_name)
            .with_context(|| format!("creating file: {}", out_name.as_path().display()))?;

        let compressor = zstd::Encoder::new(out_file, 16)
            .context("invalid zstd settings")?
            .auto_finish();
        let file = File::create(&raw_name)
            .with_context(|| format!("creating file: {}", raw_name.as_path().display()))?;
        let buf = BufWriter::new(file);
        Ok(Self {
            compressor,
            raw: buf,
        })
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
