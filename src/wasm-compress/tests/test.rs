use std::io::Cursor;
use zip::CompressionMethod;
use zip_next as zip;

#[test]
fn test_recompression_plaintext() {
    let data = b"hello world";
    let compressed = wasm_compress::recompress(&data[..]).unwrap();
    let actual = zstd::bulk::decompress(&compressed, 100).unwrap();
    assert_eq!(actual.as_slice(), &data[..]);
}

#[test]
fn test_recompression_zip() {
    let data = include_bytes!("test.zip");
    let compressed = wasm_compress::recompress(&data[..]).unwrap();
    let reader = Cursor::new(compressed);
    let mut archive = zip::ZipArchive::new(reader).unwrap();
    for i in 0..archive.len() {
        let file = archive.by_index(i).unwrap();
        assert_eq!(file.compression(), CompressionMethod::ZSTD);
    }
}
