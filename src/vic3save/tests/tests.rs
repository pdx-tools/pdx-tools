use serde::Deserialize;
use std::{
    error::Error,
    io::{Cursor, Read},
};
use vic3save::{Vic3Date, Vic3File};
mod utils;

#[test]
fn can_parse_debug() -> Result<(), Box<dyn Error>> {
    #[derive(Debug, Deserialize, PartialEq)]
    struct MetaData {
        version: String,
        game_date: Vic3Date,
    }

    #[derive(Debug, Deserialize, PartialEq)]
    struct MyMetaHeader {
        meta_data: MetaData,
    }

    let data = utils::request("chile-debug.zip");
    let reader = Cursor::new(&data[..]);
    let mut zip = zip::ZipArchive::new(reader)?;
    let mut zip_file = zip.by_index(0)?;
    let mut buffer = Vec::with_capacity(0);
    zip_file.read_to_end(&mut buffer)?;

    let file = Vic3File::from_slice(&buffer)?;
    let meta = file.meta()?;
    let parsed_meta = meta.parse()?;
    let meta_text = parsed_meta.as_text().unwrap();
    let out: MyMetaHeader = meta_text.deserialize().unwrap();

    let expected = MyMetaHeader {
        meta_data: MetaData {
            version: String::from("1.1.2"),
            game_date: Vic3Date::from_ymdh(1837, 9, 13, 0),
        },
    };

    assert_eq!(&out, &expected);

    let mut dummy_sink = Vec::new();
    let parsed_file = file.parse(&mut dummy_sink)?;
    let text_parsed_file = parsed_file.as_text().unwrap();
    let out: MyMetaHeader = text_parsed_file.deserialize().unwrap();
    assert_eq!(&out, &expected);

    Ok(())
}
