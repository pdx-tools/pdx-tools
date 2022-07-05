use anyhow::Context;
use std::{
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

/// Writes to a raw file and to a brotli compressed one
pub struct BrotliTee {
    brotli: brotli::CompressorWriter<BufWriter<File>>,
    raw: BufWriter<File>,
}

fn new_brotli<W: Write>(writer: W) -> brotli::CompressorWriter<W> {
    brotli::CompressorWriter::new(writer, 4096, 11, 24)
}

impl BrotliTee {
    pub fn create<P: AsRef<Path>>(p: P) -> anyhow::Result<Self> {
        let path = p.as_ref();
        let current_name = path
            .file_name()
            .with_context(|| format!("missing file name: {}", path.display()))?;

        let current_name = current_name.to_str().context("utf-8 conversion")?;
        let brotli_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = path.with_file_name(format!("{}-raw.bin", current_name));

        let brotli_file = File::create(&brotli_name)
            .with_context(|| format!("creating file: {}", brotli_name.as_path().display()))?;
        let brotli = new_brotli(BufWriter::new(brotli_file));

        let file = File::create(&raw_name)
            .with_context(|| format!("creating file: {}", raw_name.as_path().display()))?;
        let buf = BufWriter::new(file);
        Ok(Self { brotli, raw: buf })
    }
}

impl Write for BrotliTee {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.brotli.write_all(buf)?;
        self.raw.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.brotli.flush()?;
        self.raw.flush()?;
        Ok(())
    }
}
