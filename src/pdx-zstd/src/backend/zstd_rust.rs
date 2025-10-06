use crate::{Error, Result};
use std::io::Cursor;
use std::io::{Read, Write};

pub fn decode_all(data: &[u8]) -> Result<Vec<u8>> {
    let cursor = Cursor::new(data);
    let mut decoder =
        ruzstd::decoding::StreamingDecoder::new(cursor).map_err(|e| Error::Zstd(Box::new(e)))?;
    let mut output = Vec::new();
    decoder.read_to_end(&mut output)?;
    Ok(output)
}

pub fn copy_decode<W: Write>(data: &[u8], writer: &mut W) -> Result<()> {
    let cursor = Cursor::new(data);
    let mut decoder =
        ruzstd::decoding::StreamingDecoder::new(cursor).map_err(|e| Error::Zstd(Box::new(e)))?;
    std::io::copy(&mut decoder, writer)?;
    Ok(())
}

pub fn encode_all(data: &[u8], level: i32) -> Result<Vec<u8>> {
    let cursor = Cursor::new(data);
    // ruzstd only supports a limited set of compression levels
    let compression_level = if level <= 3 {
        ruzstd::encoding::CompressionLevel::Uncompressed
    } else {
        ruzstd::encoding::CompressionLevel::Fastest
    };
    Ok(ruzstd::encoding::compress_to_vec(cursor, compression_level))
}

pub fn decode_to(input: &[u8], dst: &mut [u8]) -> Result<()> {
    let mut decoder =
        ruzstd::decoding::StreamingDecoder::new(input).map_err(|e| Error::Zstd(Box::new(e)))?;

    decoder.read_exact(dst)?;

    // Verify that all data has been consumed (buffer size matches decompressed size)
    let mut buf = [0u8; 1];
    let n = decoder.read(&mut buf)?;
    if n != 0 {
        return Err(Error::Zstd(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "decompressed data is larger than expected",
        ))));
    }

    Ok(())
}

pub struct Decoder<'a> {
    inner: Cursor<Vec<u8>>,
    phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a> Decoder<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self> {
        let cursor = Cursor::new(data);
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(cursor)
            .map_err(|e| Error::Zstd(Box::new(e)))?;
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed)?;
        Ok(Self {
            inner: Cursor::new(decompressed),
            phantom: std::marker::PhantomData,
        })
    }
}

impl<'a> Read for Decoder<'a> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.inner.read(buf)
    }
}

struct RuzstdEncoder<W: Write> {
    writer: W,
    buffer: Vec<u8>,
    level: i32,
}

impl<W: Write> RuzstdEncoder<W> {
    fn new(writer: W, level: i32) -> Self {
        Self {
            writer,
            buffer: Vec::new(),
            level,
        }
    }

    fn finish(mut self) -> std::io::Result<W> {
        let cursor = Cursor::new(&self.buffer);
        let compression_level = if self.level <= 3 {
            ruzstd::encoding::CompressionLevel::Uncompressed
        } else {
            ruzstd::encoding::CompressionLevel::Fastest
        };
        let compressed = ruzstd::encoding::compress_to_vec(cursor, compression_level);
        self.writer.write_all(&compressed)?;
        self.writer.flush()?;
        Ok(self.writer)
    }
}

impl<W: Write> Write for RuzstdEncoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

pub struct Encoder<W: Write> {
    inner: RuzstdEncoder<W>,
}

impl<W: Write> Encoder<W> {
    pub fn new(writer: W, level: i32) -> Result<Self> {
        Ok(Self {
            inner: RuzstdEncoder::new(writer, level),
        })
    }

    pub fn finish(self) -> Result<W> {
        Ok(self.inner.finish()?)
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
