use crate::{Error, Result};
use std::fmt;
use std::io::{Read, Write};

pub fn decode_all(data: &[u8]) -> Result<Vec<u8>> {
    zstd::stream::decode_all(data).map_err(|e| Error::Zstd(Box::new(e)))
}

pub fn copy_decode<W: Write>(data: &[u8], writer: &mut W) -> Result<()> {
    zstd::stream::copy_decode(data, writer).map_err(|e| Error::Zstd(Box::new(e)))
}

pub fn encode_all(data: &[u8], level: i32) -> Result<Vec<u8>> {
    zstd::stream::encode_all(data, level).map_err(|e| Error::Zstd(Box::new(e)))
}

pub fn decode_to(input: &[u8], dst: &mut [u8]) -> Result<()> {
    let count = zstd::bulk::decompress_to_buffer(input, dst)?;
    if count != dst.len() {
        return Err(Error::Zstd(Box::new(std::io::Error::new(
            std::io::ErrorKind::UnexpectedEof,
            "decompressed data is smaller than expected",
        ))));
    }
    Ok(())
}

pub struct Decoder<R> {
    inner: zstd::Decoder<'static, std::io::BufReader<R>>,
}

impl<R: Read> fmt::Debug for Decoder<R> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Decoder zstd_c").finish()
    }
}

impl<R: Read> Decoder<R> {
    pub fn new(reader: R) -> Result<Self> {
        let decoder = zstd::Decoder::new(reader).map_err(|e| Error::Zstd(Box::new(e)))?;
        Ok(Self { inner: decoder })
    }
}

impl<'a> Decoder<&'a [u8]> {
    pub fn from_slice(data: &'a [u8]) -> Result<Decoder<&'a [u8]>> {
        Self::new(data)
    }
}

impl<R: Read> Read for Decoder<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.inner.read(buf)
    }
}

pub struct Encoder<W: Write> {
    inner: zstd::Encoder<'static, W>,
}

impl<W: Write> fmt::Debug for Encoder<W> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Encoder zstd_c").finish()
    }
}

impl<W: Write> Encoder<W> {
    pub fn new(writer: W, level: i32) -> Result<Self> {
        let encoder = zstd::Encoder::new(writer, level).map_err(|e| Error::Zstd(Box::new(e)))?;
        Ok(Self { inner: encoder })
    }

    pub fn finish(self) -> Result<W> {
        self.inner.finish().map_err(|e| Error::Zstd(Box::new(e)))
    }
}

impl<W: Write> Write for Encoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.inner.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}
