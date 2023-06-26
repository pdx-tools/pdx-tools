use std::io::Cursor;
use zip::CompressionMethod;
use zip_next as zip;

fn compress(data: Vec<u8>) -> Vec<u8> {
    let c = wasm_compress::init_compression(data);
    let out = c.compress_cb(None).unwrap();
    out
}

#[test]
fn test_recompression_plaintext() {
    let data = b"hello world";
    let compressed = compress(data.to_vec());
    let actual = zstd::bulk::decompress(&compressed, 100).unwrap();
    assert_eq!(actual.as_slice(), &data[..]);
}

#[test]
fn test_recompression_zip() {
    let data = include_bytes!("test.zip");
    let compressed = compress(data.to_vec());
    let reader = Cursor::new(compressed);
    let mut archive = zip::ZipArchive::new(reader).unwrap();
    for i in 0..archive.len() {
        let file = archive.by_index(i).unwrap();
        assert_eq!(file.compression(), CompressionMethod::ZSTD);
    }
}
