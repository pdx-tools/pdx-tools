mod error;
#[cfg(not(target_arch = "wasm32"))]
pub mod zstd_tee;

pub use backend::{Decoder, Encoder};
pub use error::Error;
pub type Result<T> = std::result::Result<T, Error>;

#[cfg(feature = "zstd_c")]
#[path = "backend/zstd_c.rs"]
mod backend;

#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
#[path = "backend/zstd_rust.rs"]
mod backend;

const MAGIC_NUMBER: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

pub fn is_zstd_compressed(data: &[u8]) -> bool {
    data.get(..4) == Some(&MAGIC_NUMBER)
}

pub fn decode_all(data: &[u8]) -> Result<Vec<u8>> {
    backend::decode_all(data)
}

pub fn copy_decode(data: &[u8], writer: &mut impl std::io::Write) -> Result<()> {
    backend::copy_decode(data, writer)
}

pub fn encode_all(data: &[u8], level: i32) -> Result<Vec<u8>> {
    backend::encode_all(data, level)
}

pub fn decode_to(input: &[u8], dst: &mut [u8]) -> Result<()> {
    backend::decode_to(input, dst)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    const SAMPLE_DATA: &[u8] = b"Hello, World! This is test data for compression.";
    const EMPTY_DATA: &[u8] = b"";
    const LARGE_DATA: &[u8] = &[b'a'; 10000];

    #[test]
    fn test_encode_decode_all_roundtrip() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let decompressed = decode_all(&compressed).unwrap();
        assert_eq!(decompressed, SAMPLE_DATA);
    }

    #[test]
    fn test_decode_to_exact_size() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut dst = vec![0u8; SAMPLE_DATA.len()];
        decode_to(&compressed, &mut dst).unwrap();
        assert_eq!(dst, SAMPLE_DATA);
    }

    #[test]
    fn test_decode_to_wrong_size_fails() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut dst = vec![0u8; SAMPLE_DATA.len() - 1];
        assert!(decode_to(&compressed, &mut dst).is_err());
    }

    #[test]
    fn test_decode_to_buffer_too_large() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut dst = vec![0u8; SAMPLE_DATA.len() + 10];
        let result = decode_to(&compressed, &mut dst);
        // Should fail because decompressed data is smaller than buffer
        assert!(result.is_err());
    }

    #[test]
    fn test_decoder_streaming() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut decoder = Decoder::from_slice(&compressed).unwrap();
        let mut result = Vec::new();
        decoder.read_to_end(&mut result).unwrap();
        assert_eq!(result, SAMPLE_DATA);
    }

    #[test]
    fn test_decoder_chunked_reads() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut decoder = Decoder::from_slice(&compressed).unwrap();
        let mut result = Vec::new();
        std::io::copy(&mut decoder, &mut result).unwrap();
        assert_eq!(result, SAMPLE_DATA);
    }

    #[test]
    fn test_encoder_streaming() {
        let mut output = Vec::new();
        let mut encoder = Encoder::new(&mut output, 3).unwrap();
        encoder.write_all(SAMPLE_DATA).unwrap();
        encoder.finish().unwrap();

        let decompressed = decode_all(&output).unwrap();
        assert_eq!(decompressed, SAMPLE_DATA);
    }

    #[test]
    fn test_encoder_chunked_writes() {
        let mut output = Vec::new();
        let mut encoder = Encoder::new(&mut output, 3).unwrap();

        // Write in chunks
        for chunk in SAMPLE_DATA.chunks(10) {
            encoder.write_all(chunk).unwrap();
        }
        encoder.finish().unwrap();

        let decompressed = decode_all(&output).unwrap();
        assert_eq!(decompressed, SAMPLE_DATA);
    }

    #[test]
    fn test_empty_data() {
        let compressed = encode_all(EMPTY_DATA, 3).unwrap();
        let decompressed = decode_all(&compressed).unwrap();
        assert_eq!(decompressed, EMPTY_DATA);
    }

    #[test]
    fn test_large_data() {
        let compressed = encode_all(LARGE_DATA, 3).unwrap();
        let decompressed = decode_all(&compressed).unwrap();
        assert_eq!(decompressed, LARGE_DATA);
    }

    #[test]
    fn test_different_compression_levels() {
        for level in [1, 3, 9] {
            let compressed = encode_all(SAMPLE_DATA, level).unwrap();
            let decompressed = decode_all(&compressed).unwrap();
            assert_eq!(decompressed, SAMPLE_DATA, "Failed at level {}", level);
        }
    }

    #[test]
    fn test_zstd_magic_number_detection() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        assert!(is_zstd_compressed(&compressed));
        assert!(!is_zstd_compressed(SAMPLE_DATA));
        assert!(!is_zstd_compressed(&[0x28, 0xB5, 0x2F])); // Incomplete magic
        assert!(!is_zstd_compressed(&[])); // Empty
    }

    #[test]
    fn test_copy_decode() {
        let compressed = encode_all(SAMPLE_DATA, 3).unwrap();
        let mut output = Vec::new();
        copy_decode(&compressed, &mut output).unwrap();
        assert_eq!(output, SAMPLE_DATA);
    }

    #[test]
    fn test_copy_decode_large() {
        let compressed = encode_all(LARGE_DATA, 3).unwrap();
        let mut output = Vec::new();
        copy_decode(&compressed, &mut output).unwrap();
        assert_eq!(output, LARGE_DATA);
    }
}
