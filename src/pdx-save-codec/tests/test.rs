use pdx_save_codec::{Compression, ContentType, Integrity, check, compress, download};
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
    assert_eq!(download(compressed).unwrap(), data);
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

    let original = download(compressed).unwrap();
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

    let restored = download(compressed).unwrap();
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

    let restored = download(compressed).unwrap();
    let entries = read_zip(&restored, CompressionMethod::DEFLATE, inflate);
    assert_eq!(entries, [("dir/file".to_string(), b"content".to_vec())]);
}

#[test]
fn test_download_passes_through_uncompressed_data() {
    let data = b"not a zip, not zstd".to_vec();
    assert_eq!(download(data.clone()).unwrap(), data);
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
            pdx_save_codec::download_with_progress(compressed, |p| reports.push(p)).unwrap();
        assert_progress(&reports);
        assert_eq!(restored.len(), data.len());
    }
}

#[test]
fn test_download_passes_through_deflate_zip() {
    let data = deflate_zip(b"EU5txt\n", &[("gamestate", b"state"), ("meta", b"meta")]);
    assert_eq!(download(data.clone()).unwrap(), data);
}

#[test]
fn check_zip_saves() {
    let entries: &[(&str, &[u8])] = &[("meta", b"EU4bin meta"), ("gamestate", &[7u8; 50_000])];
    for prelude in [&b""[..], b"SAV0103aaaaaaaa00000000\n"] {
        let zip = deflate_zip(prelude, entries);
        assert_eq!(check(&zip), Integrity::Complete);
        let transcoded = compress(zip.clone()).unwrap();
        assert_eq!(check(&transcoded), Integrity::Complete);
        for len in [prelude.len() + 30, zip.len() / 2, zip.len() - 1] {
            assert_eq!(check(&zip[..len]), Integrity::Incomplete, "len {len}");
        }

        // The directory is whole, but the game wrote only some of an entry.
        let mut damaged = zip.clone();
        let at = prelude.len() + 70;
        damaged[at..at + 8].fill(0);
        assert_eq!(check(&damaged), Integrity::Incomplete);
    }
}

#[test]
fn check_zstd_streams() {
    let data: Vec<u8> = (0..200_000u32).flat_map(|x| x.to_le_bytes()).collect();
    let stream = compress(data).unwrap();
    assert_eq!(check(&stream), Integrity::Complete);
    assert_eq!(check(&stream[..stream.len() / 2]), Integrity::Incomplete);
}

#[test]
fn check_plain_saves() {
    use Integrity::*;
    let cases: &[(&[u8], Integrity)] = &[
        (b"EU4txt\ndate=1444.11.11\nchecksum=\"abc\"\n", Complete),
        (b"EU4txt\na={\n\tname=\"{ \\\" {\"\n}\n", Complete),
        (b"EU4txt\na={\n}\n}\n", Complete),
        (b"EU4txt\ncountries={\n\tSWE={\n", Incomplete),
        // Cut after a value and after a block inside an open block.
        (b"EU4txt\ncountries={\n\tname=\"abc\"", Incomplete),
        (b"EU4txt\ncountries={\n\tSWE={\n\t}", Incomplete),
        (b"EU4txt\nname=\"abc\"", Incomplete),
        (b"SAV01004da2282500000002\nmetadata={\n}\n", Complete),
        (
            b"SAV01004da2282500000002\nmetadata={\n\tdate=13",
            Incomplete,
        ),
        // The header promises more metadata than there is.
        (b"SAV01004da228250004e772\nmetadata={\n}\n", Incomplete),
        (b"EU4bin\x2d\x28\x01\x00\x03\x00\x04\x00", Complete),
        (b"EU4bin\x2d\x28\x01\x00\x03\x00", Incomplete),
        (b"EU4bin\x2d\x28\x01\x00\x0c\x00\x01", Incomplete),
        (b"SAV01014da2282500000002\n\x2d\x28", Complete),
        (b"SAV01014da2282500000002\n\x01", Incomplete),
        (b"SAV01014da228250004e772\n\x2d\x28", Incomplete),
        (b"SAV01034da2282500000002\n\x01\x02", Incomplete),
        (b"a text file", Unsupported),
        (b"", Unsupported),
    ];
    for (data, expected) in cases {
        assert_eq!(
            check(data),
            *expected,
            "{:?}",
            data.escape_ascii().to_string()
        );
    }
}

#[test]
fn check_fixture_zip() {
    let data = include_bytes!("test.zip");
    assert_eq!(check(data), Integrity::Complete);
}

#[test]
fn check_unsupported_method() {
    let mut data = deflate_zip(b"", &[("meta", b"EU4bin meta")]);
    assert_eq!(check(&data), Integrity::Complete);
    let directory = data.windows(4).position(|x| x == b"PK\x01\x02").unwrap();
    data[8] = 99;
    data[directory + 10] = 99;
    assert_eq!(check(&data), Integrity::Unsupported);
}
