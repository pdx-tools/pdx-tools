use std::{
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

pub struct BrotliTee {
    brotli: brotli::CompressorWriter<BufWriter<File>>,
    raw: BufWriter<File>,
}

fn new_brotli<W: Write>(writer: W) -> brotli::CompressorWriter<W> {
    brotli::CompressorWriter::new(writer, 4096, 11, 24)
}

impl BrotliTee {
    pub fn create<P: AsRef<Path>>(p: P) -> Self {
        let path = p.as_ref();
        let current_name = path.file_name().unwrap();
        let current_name = current_name.to_str().unwrap();
        let brotli_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = path.with_file_name(format!("{}-raw.bin", current_name));

        let brotli_file = File::create(brotli_name).unwrap();
        let brotli = new_brotli(BufWriter::new(brotli_file));

        let file = File::create(raw_name).unwrap();
        let buf = BufWriter::new(file);
        Self { brotli, raw: buf }
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
