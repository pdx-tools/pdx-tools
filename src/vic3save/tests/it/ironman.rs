use crate::utils;
use std::{error::Error, io::{Cursor, Read}};
use vic3save::{savefile::Vic3Save, EnvTokens, Vic3File};

#[test]
fn test_parse_ironman() -> Result<(), Box<dyn Error>> {
    let data = utils::request("egalitarian.v3");
    let file = Vic3File::from_slice(&data)?;
    let save: Vic3Save = file.deserialize_save(&EnvTokens)?;

    assert_eq!(save.meta_data.version, String::from("1.6.2"));
    Ok(())
}

#[test]
fn test_melt_snapshot() -> Result<(), Box<dyn Error>> {
    let zip_data = utils::request("egalitarian_melted.zip");
    let reader = Cursor::new(&zip_data[..]);
    let mut zip = zip::ZipArchive::new(reader).unwrap();
    let mut zip_file = zip.by_index(0).unwrap();
    let mut buffer = Vec::with_capacity(0);
    zip_file.read_to_end(&mut buffer).unwrap();

    let data = utils::request("egalitarian.v3");
    let file = Vic3File::from_slice(&data)?;
    let mut zip_sink = Vec::new();
    let parsed = file.parse(&mut zip_sink)?;
    let bin = parsed.as_binary().unwrap();
    let out = bin.melter().melt(&EnvTokens)?;

    std::fs::write("/tmp/out", out.data()).unwrap();
    assert!(
        eq(out.data(), &buffer),
        "melt snapshot failed"
    );
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
