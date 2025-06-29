use crate::utils;
use jomini::binary::TokenResolver;
use std::{error::Error, io::{BufWriter, Cursor, Read}, sync::LazyLock};
use vic3save::{savefile::Vic3Save, BasicTokenResolver, MeltOptions, Vic3File};
use highway::HighwayHash;

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
    let mut file = Vic3File::from_file(file)?;
    let save: Vic3Save = file.parse_save(&*TOKENS)?;

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
    let mut file = Vic3File::from_file(file)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new();
    file.melt(options, &*TOKENS, &mut out)?;

    assert!(zip_data == out.into_inner(), "melted file should match snapshot");
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
    assert_eq!(file.encoding(), vic3save::Encoding::BinaryZip);
    let save: Vic3Save = file.parse_save(&*TOKENS)?;

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
    file.melt(MeltOptions::new(), &*TOKENS, &mut writer)?;
    let hash = writer.into_inner().unwrap().finalize256();
    let hex = format!(
        "0x{:016x}{:016x}{:016x}{:016x}",
        hash[0], hash[1], hash[2], hash[3]
    );
    assert_eq!(hex, "0xfa4a5b195b5ea97467df8e74ca9093833cf2745527a666f05116cb684bdcb0d7");
    Ok(())
}
