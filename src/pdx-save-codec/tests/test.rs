use pdx_save_codec::{Compression, ContentType, compress, decompress};
use rawzip::CompressionMethod;
use std::io::{Read, Write};

/// A zip archive of deflate entries, as the game writes, with `prelude`
/// before the first entry.
fn deflate_zip(prelude: &[u8], entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = prelude.to_vec();
    let mut zip = rawzip::ZipArchiveWriter::builder()
        .with_offset(prelude.len() as u64)
        .build(&mut out);
    for (name, data) in entries {
        if name.ends_with('/') {
            zip.new_dir(name).create().unwrap();
            continue;
        }

        let (mut file, config) = zip
            .new_file(name)
            .compression_method(CompressionMethod::DEFLATE)
            .start()
            .unwrap();
        let encoder = flate2::write::DeflateEncoder::new(&mut file, flate2::Compression::default());
        let mut writer = config.wrap(encoder);
        writer.write_all(data).unwrap();
        let (_, output) = writer.finish().unwrap();
        file.finish(output).unwrap();
    }
    zip.finish().unwrap();
    out
}

/// Reads every entry of a zip archive and decodes it with `decode`.
fn read_zip(
    data: &[u8],
    method: CompressionMethod,
    decode: impl Fn(&[u8]) -> Vec<u8>,
) -> Vec<(String, Vec<u8>)> {
    let archive = rawzip::ZipArchive::from_slice(data).unwrap();
    let mut entries = archive.entries();
    let mut result = Vec::new();
    while let Some(entry) = entries.next_entry().unwrap() {
        assert_eq!(entry.compression_method(), method);
        let name = String::from(entry.file_path().try_normalize().unwrap());
        let file = archive.get_entry(entry.wayfinder()).unwrap();
        result.push((name, decode(file.data())));
    }
    result
}

fn inflate(data: &[u8]) -> Vec<u8> {
    let mut buf = Vec::new();
    flate2::bufread::DeflateDecoder::new(data)
        .read_to_end(&mut buf)
        .unwrap();
    buf
}

fn unzstd(data: &[u8]) -> Vec<u8> {
    pdx_zstd::decode_all(data).unwrap()
}

#[test]
fn test_recompression_plaintext() {
    let data = b"hello world";
    let compression = Compression::new(data.to_vec()).unwrap();
    assert_eq!(compression.content_type(), ContentType::Zstd);
    let compressed = compression.compress().unwrap();
    assert!(pdx_zstd::is_zstd_compressed(&compressed));
    assert_eq!(unzstd(&compressed), data);
    assert_eq!(decompress(compressed).unwrap(), data);
}

#[test]
fn test_recompression_zip() {
    let data = include_bytes!("test.zip");
    let compression = Compression::new(data.to_vec()).unwrap();
    assert_eq!(compression.content_type(), ContentType::Zip);
    let compressed = compression.compress().unwrap();
    let entries = read_zip(&compressed, CompressionMethod::ZSTD, unzstd);
    assert_eq!(
        entries,
        [("test.txt".to_string(), b"aaaaaaaaaa\n".to_vec())]
    );

    let original = decompress(compressed).unwrap();
    let entries = read_zip(&original, CompressionMethod::DEFLATE, inflate);
    assert_eq!(
        entries,
        [("test.txt".to_string(), b"aaaaaaaaaa\n".to_vec())]
    );
}

#[test]
fn test_zip_prelude_survives_round_trip() {
    let prelude = b"EU5txt\nmeta={}\n";
    let data = deflate_zip(prelude, &[("gamestate", b"state"), ("meta", b"meta")]);

    let compressed = compress(data.clone()).unwrap();
    assert!(compressed.starts_with(prelude));
    let entries = read_zip(&compressed, CompressionMethod::ZSTD, unzstd);
    assert_eq!(
        entries,
        [
            ("gamestate".to_string(), b"state".to_vec()),
            ("meta".to_string(), b"meta".to_vec()),
        ]
    );

    let restored = decompress(compressed).unwrap();
    assert!(restored.starts_with(prelude));
    let entries = read_zip(&restored, CompressionMethod::DEFLATE, inflate);
    assert_eq!(
        entries,
        [
            ("gamestate".to_string(), b"state".to_vec()),
            ("meta".to_string(), b"meta".to_vec()),
        ]
    );
}

#[test]
fn test_zip_directory_entries_are_dropped() {
    let data = deflate_zip(b"", &[("dir/", b""), ("dir/file", b"content")]);
    let compressed = compress(data).unwrap();
    let entries = read_zip(&compressed, CompressionMethod::ZSTD, unzstd);
    assert_eq!(entries, [("dir/file".to_string(), b"content".to_vec())]);

    let restored = decompress(compressed).unwrap();
    let entries = read_zip(&restored, CompressionMethod::DEFLATE, inflate);
    assert_eq!(entries, [("dir/file".to_string(), b"content".to_vec())]);
}

#[test]
fn test_decompress_passes_through_unknown_data() {
    let data = b"not a zip, not zstd".to_vec();
    assert_eq!(decompress(data.clone()).unwrap(), data);
}

fn assert_progress(reports: &[f64]) {
    assert!(reports.len() > 1, "expected several reports: {reports:?}");
    assert!(reports.windows(2).all(|w| w[0] <= w[1]), "{reports:?}");
    assert!(
        reports.iter().all(|p| (0.0..=1.0).contains(p)),
        "{reports:?}"
    );
    assert_eq!(reports.last(), Some(&1.0));
}

#[test]
fn test_progress_reports_end_at_one() {
    for data in [
        vec![b'a'; 1 << 20],
        deflate_zip(b"", &[("a", &[b'a'; 1 << 19]), ("b", &[b'b'; 1 << 19])]),
    ] {
        let mut reports = Vec::new();
        let compressed =
            pdx_save_codec::compress_with_progress(data.clone(), |p| reports.push(p)).unwrap();
        assert_progress(&reports);

        let mut reports = Vec::new();
        let restored =
            pdx_save_codec::decompress_with_progress(compressed, |p| reports.push(p)).unwrap();
        assert_progress(&reports);
        assert_eq!(restored.len(), data.len());
    }
}
