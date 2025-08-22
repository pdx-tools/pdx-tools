#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
use std::io::Cursor;
use std::io::{Read, Write};

mod error;

pub use error::Error;
pub type Result<T> = std::result::Result<T, Error>;

const MAGIC_NUMBER: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

pub fn is_zstd_compressed(data: &[u8]) -> bool {
    data.get(..4) == Some(&MAGIC_NUMBER)
}

pub fn decode_all(data: &[u8]) -> Result<Vec<u8>> {
    #[cfg(feature = "zstd_c")]
    {
        zstd::stream::decode_all(data).map_err(|e| Error::Zstd(Box::new(e)))
    }
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    {
        let cursor = Cursor::new(data);
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(cursor)
            .map_err(|e| Error::Zstd(Box::new(e)))?;
        let mut output = Vec::new();
        decoder.read_to_end(&mut output)?;
        Ok(output)
    }
}

pub fn copy_decode<W: Write>(data: &[u8], writer: &mut W) -> Result<()> {
    #[cfg(feature = "zstd_c")]
    {
        zstd::stream::copy_decode(data, writer).map_err(|e| Error::Zstd(Box::new(e)))
    }
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    {
        let cursor = Cursor::new(data);
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(cursor)
            .map_err(|e| Error::Zstd(Box::new(e)))?;
        std::io::copy(&mut decoder, writer)?;
        Ok(())
    }
}

pub fn encode_all(data: &[u8], level: i32) -> Result<Vec<u8>> {
    #[cfg(feature = "zstd_c")]
    {
        zstd::stream::encode_all(data, level).map_err(|e| Error::Zstd(Box::new(e)))
    }
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    {
        let cursor = Cursor::new(data);
        // ruzstd only supports a limited set of compression levels
        let compression_level = if level <= 3 {
            ruzstd::encoding::CompressionLevel::Uncompressed
        } else {
            ruzstd::encoding::CompressionLevel::Fastest
        };
        Ok(ruzstd::encoding::compress_to_vec(cursor, compression_level))
    }
}

pub struct Decoder<'a> {
    #[cfg(feature = "zstd_c")]
    inner: zstd::Decoder<'static, std::io::BufReader<&'a [u8]>>,
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    inner: Cursor<Vec<u8>>,
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    phantom: std::marker::PhantomData<&'a ()>,
}

impl<'a> Decoder<'a> {
    pub fn from_slice(data: &'a [u8]) -> Result<Self> {
        #[cfg(feature = "zstd_c")]
        {
            let decoder = zstd::Decoder::new(data).map_err(|e| Error::Zstd(Box::new(e)))?;
            Ok(Self { inner: decoder })
        }
        #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
        {
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
}

impl<'a> Read for Decoder<'a> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.inner.read(buf)
    }
}

pub struct Encoder<W: Write> {
    inner: EncoderInner<W>,
}

enum EncoderInner<W: Write> {
    #[cfg(feature = "zstd_c")]
    ZstdC(zstd::Encoder<'static, W>),
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    ZstdRust(RuzstdEncoder<W>),
}

#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
struct RuzstdEncoder<W: Write> {
    writer: W,
    buffer: Vec<u8>,
    level: i32,
}

#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
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

#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
impl<W: Write> Write for RuzstdEncoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buffer.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<W: Write> Encoder<W> {
    pub fn new(writer: W, level: i32) -> Result<Self> {
        #[cfg(feature = "zstd_c")]
        {
            let encoder =
                zstd::Encoder::new(writer, level).map_err(|e| Error::Zstd(Box::new(e)))?;
            Ok(Self {
                inner: EncoderInner::ZstdC(encoder),
            })
        }
        #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
        {
            Ok(Self {
                inner: EncoderInner::ZstdRust(RuzstdEncoder::new(writer, level)),
            })
        }
    }

    pub fn finish(self) -> Result<W> {
        match self.inner {
            #[cfg(feature = "zstd_c")]
            EncoderInner::ZstdC(encoder) => encoder.finish().map_err(|e| Error::Zstd(Box::new(e))),
            #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
            EncoderInner::ZstdRust(encoder) => Ok(encoder.finish()?),
        }
    }
}

impl<W: Write> Write for Encoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        match &mut self.inner {
            #[cfg(feature = "zstd_c")]
            EncoderInner::ZstdC(encoder) => encoder.write(buf),
            #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
            EncoderInner::ZstdRust(encoder) => encoder.write(buf),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        match &mut self.inner {
            #[cfg(feature = "zstd_c")]
            EncoderInner::ZstdC(encoder) => encoder.flush(),
            #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
            EncoderInner::ZstdRust(encoder) => encoder.flush(),
        }
    }
}
