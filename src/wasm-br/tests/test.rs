use std::io::{Cursor, Read};

#[test]
fn test_recompression_plaintext() {
    let data = b"hello world";
    let compressed = wasm_br::recompress(&data[..]).unwrap();

    let actual = Vec::new();
    let mut reader = Cursor::new(compressed);
    let mut writer = Cursor::new(actual);
    brotli::BrotliDecompress(&mut reader, &mut writer).unwrap();
    let actual = writer.into_inner();
    assert_eq!(actual.as_slice(), &data[..]);
}

#[test]
fn test_recompression_zip() {
    let data = include_bytes!("test.zip");
    let compressed = wasm_br::recompress(&data[..]).unwrap();

    let actual = Vec::new();
    let mut reader = Cursor::new(compressed);
    let mut writer = Cursor::new(actual);
    brotli::BrotliDecompress(&mut reader, &mut writer).unwrap();
    let actual = writer.into_inner();
    let mut tarred = tar::Archive::new(&actual[..]);
    let mut entries = tarred.entries().unwrap();
    let mut first = entries.next().unwrap().unwrap();
    assert_eq!(*first.path_bytes(), b"__leading_data"[..]);
    let mut buffer = Vec::new();
    first.read_to_end(&mut buffer).unwrap();
    assert_eq!(&buffer, b"hello\n");
}
