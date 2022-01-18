use std::{
    fs::File,
    io::{BufWriter, Write},
    path::Path,
    process::{Child, Command, Stdio},
};

pub struct BrotliTee {
    brotli: Child,
    raw: BufWriter<File>,
}

impl BrotliTee {
    pub fn create<P: AsRef<Path>>(p: P) -> Self {
        let path = p.as_ref();
        let current_name = path.file_name().unwrap();
        let current_name = current_name.to_str().unwrap();
        let brotli_name = path.with_file_name(format!("{}.bin", current_name));
        let raw_name = path.with_file_name(format!("{}-raw.bin", current_name));

        let child = Command::new("brotli")
            .arg("--force")
            .arg("-o")
            .arg(brotli_name)
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();

        let file = File::create(raw_name).unwrap();
        let buf = BufWriter::new(file);
        Self {
            brotli: child,
            raw: buf,
        }
    }
}

impl Write for BrotliTee {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.brotli.stdin.as_mut().unwrap().write_all(buf)?;
        self.raw.write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.brotli.stdin.as_mut().unwrap().flush()?;
        self.raw.flush()?;
        Ok(())
    }
}
