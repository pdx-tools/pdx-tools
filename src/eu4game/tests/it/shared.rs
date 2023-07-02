use eu4game::shared::{Eu4Parser, Eu4SaveOutput};

use crate::utils;

#[test]
fn test_hash() {
    let kandy_data = utils::request("kandy2.bin.eu4");
    let ita_data = utils::request("ita1.eu4");
    let Eu4SaveOutput { hash: hash1, .. } =
        Eu4Parser::new().with_hash(true).parse(&kandy_data).unwrap();
    let Eu4SaveOutput { hash: hash2, .. } =
        Eu4Parser::new().with_hash(true).parse(&kandy_data).unwrap();
    let Eu4SaveOutput { hash: hash3, .. } =
        Eu4Parser::new().with_hash(true).parse(&ita_data).unwrap();

    assert_eq!(hash1.as_ref().unwrap(), hash2.as_ref().unwrap());
    assert!(hash1.as_ref().unwrap() != hash3.as_ref().unwrap());
    assert_eq!(44, hash1.as_ref().unwrap().len());
}
