use crate::utils;
use serde::Deserialize;
use std::error::Error;
use vic3save::{JominiFileKind, SaveDataKind, Vic3Date, Vic3File};

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

    let data = utils::inflate(utils::request_file("chile-debug.zip"));

    let file = Vic3File::from_slice(&data)?;
    let JominiFileKind::Uncompressed(SaveDataKind::Text(text)) = file.kind() else {
        panic!("Expected text file");
    };

    let out: MyMetaHeader = text.deserializer().deserialize()?;

    let expected = MyMetaHeader {
        meta_data: MetaData {
            version: String::from("1.1.2"),
            game_date: Vic3Date::from_ymdh(1837, 9, 13, 0),
        },
    };

    assert_eq!(&out, &expected);

    Ok(())
}
