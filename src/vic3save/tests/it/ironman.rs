use crate::utils;
use jomini::binary::TokenResolver;
use std::{error::Error, io::Cursor, sync::LazyLock};
use vic3save::{savefile::Vic3Save, BasicTokenResolver, MeltOptions, Vic3File};

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
