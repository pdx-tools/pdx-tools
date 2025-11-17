use crate::utils;
use highway::HighwayHash;
use jomini::binary::TokenResolver;
use std::{
    error::Error,
    io::{BufWriter, Cursor, Read},
    sync::LazyLock,
};
use vic3save::{
    savefile::Vic3Save, BasicTokenResolver, DeserializeVic3, JominiFileKind, MeltOptions, Vic3File,
    Vic3Melt,
};

static TOKENS: LazyLock<BasicTokenResolver> = LazyLock::new(|| {
    let file_data = std::fs::read("assets/vic3.txt")
        .or_else(|_| std::fs::read("../../assets/tokens/vic3.txt"))
        .unwrap_or_default();
    BasicTokenResolver::from_text_lines(file_data.as_slice()).unwrap()
});

#[test]
fn test_parse_ironman() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let file = utils::request_file("egalitarian2.v3");
    let file = Vic3File::from_file(file)?;
    let save: Vic3Save = (&file).deserialize(&*TOKENS)?;

    assert_eq!(save.meta_data.version, String::from("1.7.1"));
    Ok(())
}

#[test]
fn test_melt_snapshot() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let zip_data = utils::inflate(utils::request_file("egalitarian_melted4.zip"));

    let file = utils::request_file("egalitarian2.v3");
    let file = Vic3File::from_file(file)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new();
    (&file).melt(options, &*TOKENS, &mut out)?;

    assert!(
        zip_data == out.into_inner(),
        "melted file should match snapshot"
    );
    Ok(())
}

#[test]
fn test_parse_ironman_slice() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let mut file = utils::request_file("america.v3");
    let mut content = Vec::new();
    file.read_to_end(&mut content)?;
    let file = Vic3File::from_slice(&content)?;
    assert_eq!(file.header().kind(), vic3save::SaveHeaderKind::SplitBinary);
    let save: Vic3Save = (&file).deserialize(&*TOKENS)?;

    assert_eq!(save.meta_data.version, String::from("1.9.2"));
    Ok(())
}

#[test]
fn test_melt_1_9_snapshot() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let mut file = utils::request_file("america.v3");
    let mut content = Vec::new();
    file.read_to_end(&mut content)?;
    let file = Vic3File::from_slice(&content)?;
    let hasher = highway::HighwayHasher::default();
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    (&file).melt(MeltOptions::new(), &*TOKENS, &mut writer)?;
    let hash = writer.into_inner().unwrap().finalize256();
    let hex = format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        hash[0], hash[1], hash[2], hash[3]
    );
    assert_eq!(
        hex,
        "0xfa4a5b195b5ea97467df8e74ca9093833cf2745527a666f05116cb684bdcb0d7"
    );
    Ok(())
}

#[test]
fn test_melt_1_9_meta_snapshot() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let mut file = utils::request_file("america.v3");
    let mut content = Vec::new();
    file.read_to_end(&mut content)?;
    let file = Vic3File::from_slice(&content)?;
    let JominiFileKind::Zip(vic3_zip) = file.kind() else {
        panic!("Expected a zip file kind");
    };
    let mut meta = vic3_zip.meta().unwrap();
    let hasher = highway::HighwayHasher::default();
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    meta.melt(MeltOptions::new(), &*TOKENS, &mut writer)?;
    let hash = writer.into_inner().unwrap().finalize256();
    let hex = format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        hash[0], hash[1], hash[2], hash[3]
    );
    assert_eq!(
        hex,
        "0xd6a26df3f2d8e7553083ff1c123a31af5104b6261bff21c6e96ac1fa937cbcb2"
    );
    Ok(())
}

#[test]
fn test_melt_inlined_meta_snapshot() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    // The header from a real save file. But was 70MB compressed, so I stripped
    // it to just the header (with a dummy zip file appended to it).
    let data = include_bytes!("../fixtures/inlined_meta.v3");

    let file = Vic3File::from_slice(&data[..])?;
    let JominiFileKind::Zip(vic3_zip) = file.kind() else {
        panic!("Expected a zip file kind");
    };
    let mut meta = vic3_zip.meta().unwrap();

    let hasher = highway::HighwayHasher::default();
    let mut writer = BufWriter::with_capacity(0x8000, hasher);
    meta.melt(MeltOptions::new(), &*TOKENS, &mut writer)?;
    let hash = writer.into_inner().unwrap().finalize256();
    let hex = format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        hash[0], hash[1], hash[2], hash[3]
    );
    assert_eq!(
        hex,
        "0x626295a0a9a7914a460fed197d4643addcdf2e24193eb56f1bf9f1c70399f0ee"
    );
    Ok(())
}
