use bumpalo_serde::ArenaDeserialize;
use eu5save::{
    BasicTokenResolver, Eu5BinaryDeserialization, Eu5File, Eu5Melt, Eu5TextMelt, MeltOptions,
    ReaderAt, SaveDataKind,
    models::{Gamestate, ZipPrelude},
};
use highway::HighwayHash;
use jomini::binary::TokenResolver;
use rstest::rstest;
use serde::Deserialize;
use std::{
    io::{BufWriter, Read, Seek, Write},
    sync::LazyLock,
};

mod utils;

#[derive(Debug, PartialEq, Deserialize)]
struct TestGamestate {
    metadata: TestMetadata,
}

#[derive(Debug, PartialEq, Deserialize)]
struct TestMetadata {
    playthrough_id: String,
}

fn hash_read(mut reader: impl std::io::Read) -> String {
    with_hasher(|writer| {
        std::io::copy(&mut reader, writer).unwrap();
    })
}

fn with_hasher(mut func: impl FnMut(&mut highway::HighwayHasher)) -> String {
    let hasher = highway::HighwayHasher::new(highway::Key::default());
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    func(writer.get_mut());
    let result = writer.into_inner().unwrap().finalize256();
    format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        result[0], result[1], result[2], result[3]
    )
}

fn create_test_resolver() -> BasicTokenResolver {
    // Create a resolver with specific token mappings needed for the test
    let tokens = b"0x9de metadata\n0x96e playthrough_id\n";
    BasicTokenResolver::from_text_lines(tokens.as_slice()).expect("failed to create resolver")
}

fn text_api_assertions<R: ReaderAt>(data: &[u8], mut save: Eu5File<R>) {
    assert_eq!(save.header().header_len(), 24);
    assert_eq!(save.header().metadata_len(), 321394);
    assert_eq!(save.header().kind(), eu5save::SaveHeaderKind::Text);
    assert!(save.header().kind().is_text());

    let expected_metadata = TestGamestate {
        metadata: TestMetadata {
            playthrough_id: String::from("7f9ee4fa-1ab6-4c05-87f4-e11700302fdf"),
        },
    };

    let melted_hash = {
        // We know this is uncompressed text:
        let eu5save::JominiFileKind::Uncompressed(SaveDataKind::Text(txt)) = save.kind_mut() else {
            panic!("expected uncompressed text save");
        };

        with_hasher(|hasher| {
            (&*txt).melt(hasher).unwrap();
        })
    };

    // verify the metadata is extracted as expected
    let meta_kind = save.meta().unwrap();

    // Extract the text metadata
    let eu5save::SaveMetadataKind::Text(mut text_meta) = meta_kind else {
        panic!("expected text metadata");
    };

    // Verify we can read the raw metadata bytes
    let mut buf = Vec::new();
    text_meta.read_to_end(&mut buf).unwrap();
    assert!(buf.starts_with(b"metadata={"));
    assert!(buf.ends_with(b"}\n"));
    let meta_hash = hash_read(buf.as_slice());
    let input_hash =
        hash_read(&data[save.header().header_len()..][..save.header().metadata_len() as usize]);
    assert_eq!(meta_hash, input_hash);

    // Verify we can melt the metadata
    let meta_kind = save.meta().unwrap();
    let eu5save::SaveMetadataKind::Text(mut text_meta) = meta_kind else {
        panic!("expected text metadata");
    };

    let melted_meta_hash = with_hasher(|hasher| {
        Eu5TextMelt::melt(&mut text_meta, hasher).unwrap();
    });

    // The melted metadata should match the input metadata bytes
    let expected_meta_hash =
        hash_read(&data[..save.header().header_len() + save.header().metadata_len() as usize]);
    assert_eq!(melted_meta_hash, expected_meta_hash);

    // Verify that one can deserialize the metadata
    let eu5save::SaveMetadataKind::Text(mut text_meta) = save.meta().unwrap() else {
        panic!("expected text metadata");
    };

    let metadata: TestGamestate = text_meta.deserializer().deserialize().unwrap();
    assert_eq!(metadata, expected_metadata);

    let eu5save::JominiFileKind::Uncompressed(SaveDataKind::Text(txt)) = save.kind() else {
        panic!("expected uncompressed text save");
    };

    // We can deserialize plaintext without the need for a resolver
    let metadata: TestGamestate = txt.deserializer().deserialize().unwrap();
    assert_eq!(metadata, expected_metadata);

    // Next we verify that the gamestate can be read, melted, and deserialized.
    let eu5save::SaveContentKind::Text(mut txt_gamestate) = save.gamestate().unwrap() else {
        panic!("expected text gamestate");
    };

    let gamestate_hash = hash_read(&mut txt_gamestate);
    let eu5save::SaveContentKind::Text(mut txt_gamestate) = save.gamestate().unwrap() else {
        panic!("expected text gamestate");
    };
    let gamestate_metadata: TestGamestate = txt_gamestate.deserializer().deserialize().unwrap();
    assert_eq!(gamestate_metadata, expected_metadata);

    let kind_hash = hash_read(&mut txt.body().cursor());

    assert_eq!(gamestate_hash, kind_hash);
    assert_eq!(
        kind_hash,
        "0x26aa929f22223bad98ab51f252bfd199b2cb7f9615ecb75f3faeda11589dcb3e"
    );

    // The melted output of a text uncompressed save should match input bytes.
    // (And if it matches input bytes then we know that melted output will have
    // the same parsing behavior).
    let input_hash = hash_read(data);
    assert_eq!(input_hash, melted_hash);
    assert_eq!(
        input_hash,
        "0x5435496fab3f477cc14d3702a3fb67d9be9f30c61865df503400dc4f3c7ed103"
    );
}

fn binary_api_assertions<R: ReaderAt>(mut save: Eu5File<R>, resolver: &BasicTokenResolver) {
    assert_eq!(save.header().header_len(), 24);
    assert!(save.header().kind().is_binary());

    let expected_metadata = TestGamestate {
        metadata: TestMetadata {
            playthrough_id: String::from("27a85fde-a436-485c-bf66-609af9fb64dc"),
        },
    };

    let melted_output = {
        // Melt the binary save to text and verify the result
        let eu5save::JominiFileKind::Zip(zip) = save.kind_mut() else {
            panic!("expected compressed binary save");
        };

        let mut melted_output = Vec::new();
        let melt_options = MeltOptions::default();
        (&*zip)
            .melt(melt_options, resolver, &mut melted_output)
            .unwrap();
        melted_output
    };

    // Verify the metadata is extracted as expected and is binary
    let eu5save::SaveMetadataKind::Binary(mut binary_meta) = save.meta().unwrap() else {
        panic!("expected binary metadata");
    };

    // Verify we can deserialize the metadata
    let metadata: TestGamestate = binary_meta.deserializer(resolver).deserialize().unwrap();
    assert_eq!(metadata, expected_metadata);

    // Verify that we can Read the metadata
    let eu5save::SaveMetadataKind::Binary(binary_meta) = save.meta().unwrap() else {
        panic!("expected binary metadata");
    };
    let mut reader = jomini::binary::TokenReader::new(binary_meta);
    assert!(reader.next().unwrap().is_some());

    // Verify we can melt the metadata
    let eu5save::SaveMetadataKind::Binary(mut binary_meta) = save.meta().unwrap() else {
        panic!("expected binary metadata");
    };
    let mut melted_metadata = Vec::new();
    let melt_options = MeltOptions::default();
    binary_meta
        .melt(melt_options, resolver, &mut melted_metadata)
        .unwrap();

    // Verify melted metadata can be re-parsed as text
    let melted_meta_save =
        Eu5File::from_slice(melted_metadata.as_slice()).expect("failed to parse melted metadata");
    assert!(melted_meta_save.header().kind().is_text());

    // Verify the melted metadata content starts with "metadata={"
    assert!(
        melted_metadata[melted_meta_save.header().header_len()..].starts_with(b"metadata={"),
        "melted metadata should start with 'metadata={{'"
    );

    let eu5save::SaveMetadataKind::Text(_) = melted_meta_save.meta().unwrap() else {
        panic!("melted metadata should be text format");
    };

    // Verify that we can deserialize the gamestate
    let eu5save::SaveContentKind::Binary(mut bin_gamestate) = save.gamestate().unwrap() else {
        panic!("expected binary gamestate");
    };

    let gamestate_metadata: TestGamestate =
        bin_gamestate.deserializer(resolver).deserialize().unwrap();
    assert_eq!(gamestate_metadata, expected_metadata);

    // Verify that we can Read the gamestate
    let eu5save::SaveContentKind::Binary(bin_gamestate) = save.gamestate().unwrap() else {
        panic!("expected binary gamestate");
    };
    let mut reader = jomini::binary::TokenReader::new(bin_gamestate);
    while reader.next().unwrap().is_some() {}

    // Parse the melted output as a new Eu5File and verify it's text
    let melted_save =
        Eu5File::from_slice(melted_output.as_slice()).expect("failed to parse melted save");

    assert!(melted_save.header().kind().is_text());
    let eu5save::JominiFileKind::Uncompressed(SaveDataKind::Text(_)) = melted_save.kind() else {
        panic!("expected melted save to be uncompressed text");
    };

    // Verify the melted body starts with "metadata={"
    assert!(
        melted_output[melted_save.header().header_len()..].starts_with(b"metadata={"),
        "melted output should start with 'metadata={{'"
    );
}

#[test]
fn test_txt_api() {
    let file = utils::request_file("debug-1.0.zip");
    let data = utils::inflate(file);
    let save = Eu5File::from_slice(data.as_slice()).unwrap();
    text_api_assertions(data.as_slice(), save);

    // Write inflated data to a temporary file
    let mut temp_file = tempfile::NamedTempFile::new().expect("failed to create temp file");
    temp_file
        .write_all(&data)
        .expect("failed to write temp file");

    let file = temp_file.reopen().expect("failed to reopen temp file");
    let save = Eu5File::from_file(file).expect("failed to parse save from file");
    text_api_assertions(data.as_slice(), save);
}

#[test]
fn test_binary_api() {
    let resolver = create_test_resolver();
    let mut file = utils::request_file("ironman-1.0.eu5");
    let mut data = Vec::new();
    file.read_to_end(&mut data).expect("failed to read file");
    file.seek(std::io::SeekFrom::Start(0))
        .expect("failed to seek file");
    let save = Eu5File::from_file(file).expect("failed to parse save from file");
    binary_api_assertions(save, &resolver);

    let save = Eu5File::from_slice(data.as_slice()).expect("failed to parse save from slice");
    binary_api_assertions(save, &resolver);
}

static TOKENS: LazyLock<BasicTokenResolver> = LazyLock::new(|| {
    let file_data = std::fs::read("assets/eu5.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice()).unwrap();
    if resolver.is_empty() {
        eprintln!("EU5 binary tokens not loaded");
    } else {
        eprintln!("EU5 binary tokens loaded");
    }
    resolver
});

fn can_deserialize_meta(file: &Eu5File<impl ReaderAt>) {
    let resolver = &*TOKENS;
    let bump = bumpalo::Bump::new();
    match file.meta().unwrap() {
        eu5save::SaveMetadataKind::Text(mut txt) => {
            ZipPrelude::deserialize_in_arena(&mut txt.deserializer(), &bump)
                .expect("failed to deserialize text metadata");
        }
        eu5save::SaveMetadataKind::Binary(mut bin) => {
            // Skip deserialization if we don't have tokens
            if resolver.is_empty() {
                return;
            }
            ZipPrelude::deserialize_in_arena(&mut bin.deserializer(resolver), &bump)
                .expect("failed to deserialize binary metadata");
        }
    }
}

fn can_deserialize_gamestate(file: &Eu5File<impl ReaderAt>) {
    let resolver = &*TOKENS;
    let bump = bumpalo::Bump::new();
    match file.gamestate().unwrap() {
        eu5save::SaveContentKind::Text(mut txt) => {
            Gamestate::deserialize_in_arena(&mut txt.deserializer(), &bump)
                .expect("failed to deserialize text gamestate");
        }
        eu5save::SaveContentKind::Binary(mut bin) => {
            // Skip deserialization if we don't have tokens
            if resolver.is_empty() {
                return;
            }
            Gamestate::deserialize_in_arena(&mut bin.deserializer(resolver), &bump)
                .expect("failed to deserialize binary gamestate");
        }
    }
}

#[rstest]
#[case("ironman-1.0.eu5")]
#[case("debug-1.0.zip")]
#[case("Clandeboye.eu5")]
#[case("mp_cas_1374_03_06.eu5")]
fn deserialization_regression_test(#[case] filename: &str) {
    let file = utils::request_file(filename);
    if filename.ends_with(".zip") {
        let data = utils::inflate(file);
        let save = Eu5File::from_slice(data.as_slice()).unwrap();
        can_deserialize_meta(&save);
        can_deserialize_gamestate(&save);
    } else {
        let save = Eu5File::from_file(file).unwrap();
        can_deserialize_meta(&save);
        can_deserialize_gamestate(&save);
    }
}
