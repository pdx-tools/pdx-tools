use rawzip::CompressionMethod;

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
    while let Some(entry) = entries.next_entry().unwrap() {
        if entry.is_dir() {
            continue;
        }

        assert_eq!(entry.compression_method(), CompressionMethod::Zstd);
        let file = archive.get_entry(entry.wayfinder()).unwrap();
        let _ = zstd::decode_all(file.data()).unwrap();
    }
}
