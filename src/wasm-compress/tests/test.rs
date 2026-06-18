use std::io::Write;
use wasm_compress::decode_zstd;

#[test]
fn test_decode_zstd_roundtrip() {
    let data = b"hello world";
    let mut encoder = pdx_zstd::Encoder::new(Vec::new(), 7).unwrap();
    encoder.write_all(data).unwrap();
    let compressed = encoder.finish().unwrap();
    let decoded = decode_zstd(&compressed).unwrap();
    assert_eq!(decoded.as_slice(), &data[..]);
}
