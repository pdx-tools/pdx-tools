use rawzip::CompressionMethod;
use std::io::Read;
use wasm_compress::download_transformation;

// Helper function to decompress zstd data using the appropriate implementation
fn decompress_zstd(data: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    #[cfg(feature = "zstd_c")]
    {
        Ok(zstd::bulk::decompress(data, data.len() * 10)?)
    }
    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    {
        let mut decoder = ruzstd::decoding::StreamingDecoder::new(data)?;
        let mut output = Vec::new();
        decoder.read_to_end(&mut output)?;
        Ok(output)
    }
}

fn compress(data: Vec<u8>) -> Vec<u8> {
    let c = wasm_compress::init_compression(data);

    c.compress_cb(None).unwrap()
}

#[test]
fn test_recompression_plaintext() {
    let data = b"hello world";
    let compressed = compress(data.to_vec());
    let actual = decompress_zstd(&compressed).unwrap();
    assert_eq!(actual.as_slice(), &data[..]);
}

#[test]
fn test_recompression_zip() {
    let data = include_bytes!("test.zip");
    let compressed = compress(data.to_vec());
    let archive = rawzip::ZipArchive::from_slice(compressed.as_slice()).unwrap();
    let mut entries = archive.entries();
    let entry = entries.next_entry().unwrap().unwrap();
    assert_eq!(entry.file_path().as_ref(), b"test.txt");
    assert_eq!(entry.compression_method(), CompressionMethod::Zstd);
    let file = archive.get_entry(entry.wayfinder()).unwrap();
    let actual = {
        #[cfg(feature = "zstd_c")]
        {
            zstd::decode_all(file.data()).unwrap()
        }
        #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
        {
            let mut decoder = ruzstd::decoding::StreamingDecoder::new(file.data()).unwrap();
            let mut output = Vec::new();
            decoder.read_to_end(&mut output).unwrap();
            output
        }
    };
    assert_eq!(actual.as_slice(), b"aaaaaaaaaa\n");
    assert!(entries.next_entry().unwrap().is_none());

    let original = download_transformation(compressed).unwrap();
    let archive = rawzip::ZipArchive::from_slice(original.as_slice()).unwrap();
    let mut entries = archive.entries();
    let entry = entries.next_entry().unwrap().unwrap();
    assert_eq!(entry.file_path().as_ref(), b"test.txt");
    assert_eq!(entry.compression_method(), CompressionMethod::Deflate);
    let file = archive.get_entry(entry.wayfinder()).unwrap();
    let mut buf = Vec::new();
    flate2::bufread::DeflateDecoder::new(file.data())
        .read_to_end(&mut buf)
        .unwrap();
    assert_eq!(buf.as_slice(), b"aaaaaaaaaa\n");
    assert!(entries.next_entry().unwrap().is_none());
}
