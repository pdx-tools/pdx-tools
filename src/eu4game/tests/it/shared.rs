use crate::utils;
use eu4game::shared::save_checksum;

#[test]
fn test_checksum() {
    let kandy_data = utils::request("kandy2.bin.eu4");
    let ita_data = utils::request("ita1.eu4");
    let hash1 = save_checksum(&kandy_data[..]);
    let hash2 = save_checksum(&kandy_data[..]);
    let hash3 = save_checksum(&ita_data);

    assert_eq!(hash1, hash2);
    assert!(hash1 != hash3);
    assert_eq!(44, hash1.len());
}
