use crate::utils;
use jomini::binary::TokenResolver;
use std::{
    error::Error,
    io::{Cursor, Read},
    sync::LazyLock,
};
use vic3save::{savefile::Vic3Save, BasicTokenResolver, Vic3File};

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

    let data = utils::request("egalitarian2.v3");
    let file = Vic3File::from_slice(&data)?;
    let save: Vic3Save = file.deserialize_save(&*TOKENS)?;

    assert_eq!(save.meta_data.version, String::from("1.7.1"));
    Ok(())
}

#[test]
fn test_melt_snapshot() -> Result<(), Box<dyn Error>> {
    if TOKENS.is_empty() {
        return Ok(());
    }

    let zip_data = utils::request("egalitarian_melted3.zip");
    let reader = Cursor::new(&zip_data[..]);
    let mut zip = zip::ZipArchive::new(reader).unwrap();
    let mut zip_file = zip.by_index(0).unwrap();
    let mut buffer = Vec::with_capacity(0);
    zip_file.read_to_end(&mut buffer).unwrap();

    let data = utils::request("egalitarian2.v3");
    let file = Vic3File::from_slice(&data)?;
    let mut out = Cursor::new(Vec::new());
    file.melter().melt(&mut out, &*TOKENS)?;

    assert!(eq(out.get_ref(), &buffer), "melt snapshot failed");
    Ok(())
}

fn eq(a: &[u8], b: &[u8]) -> bool {
    for (ai, bi) in a.iter().zip(b.iter()) {
        if ai != bi {
            return false;
        }
    }

    a.len() == b.len()
}
