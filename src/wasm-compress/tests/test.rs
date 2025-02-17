use rawzip::CompressionMethod;
use std::io::Read;
use wasm_compress::download_transformation;

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
    let archive = rawzip::ZipArchive::from_slice(compressed.as_slice()).unwrap();
    let mut entries = archive.entries();
    let entry = entries.next_entry().unwrap().unwrap();
    assert_eq!(entry.file_raw_path(), b"test.txt");
    assert_eq!(entry.compression_method(), CompressionMethod::Zstd);
    let file = archive.get_entry(entry.wayfinder()).unwrap();
    let actual = zstd::decode_all(file.data()).unwrap();
    assert_eq!(actual.as_slice(), b"aaaaaaaaaa\n");
    assert!(entries.next_entry().unwrap().is_none());

    let original = download_transformation(compressed).unwrap();
    let archive = rawzip::ZipArchive::from_slice(original.as_slice()).unwrap();
    let mut entries = archive.entries();
    let entry = entries.next_entry().unwrap().unwrap();
    assert_eq!(entry.file_raw_path(), b"test.txt");
    assert_eq!(entry.compression_method(), CompressionMethod::Deflate);
    let file = archive.get_entry(entry.wayfinder()).unwrap();
    let mut buf = Vec::new();
    flate2::bufread::DeflateDecoder::new(file.data())
        .read_to_end(&mut buf)
        .unwrap();
    assert_eq!(buf.as_slice(), b"aaaaaaaaaa\n");
    assert!(entries.next_entry().unwrap().is_none());
}
