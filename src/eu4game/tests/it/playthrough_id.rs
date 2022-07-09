use crate::utils;
use eu4game::shared::parse_save;
use eu4save::query::Query;

#[test]
fn test_playthrough_id() {
    let data = utils::request("arda-shahansha.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();

    let playthrough_id1 = eu4game::shared::playthrough_id(&Query::from_save(save));

    let data = utils::request("arda-persia.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();
    let playthrough_id2 = eu4game::shared::playthrough_id(&Query::from_save(save));

    assert_eq!(playthrough_id1, playthrough_id2);
    assert_eq!(
        playthrough_id1.as_deref(),
        Some("QO8JMpQzsK9ZhSs/awsKQi7CyeP83ld/ZzvKbmk4tWs=")
    );
}

#[test]
fn test_playthrough_id2() {
    let data = utils::request("ragusa.bin.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();

    let playthrough_id1 = eu4game::shared::playthrough_id(&Query::from_save(save));

    let data = utils::request("ragusa2.bin.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();
    let playthrough_id2 = eu4game::shared::playthrough_id(&Query::from_save(save));

    assert_eq!(playthrough_id1, playthrough_id2);
}

#[test]
fn test_playthrough_id3() {
    let data = utils::request("ita2_later.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();

    let playthrough_id1 = eu4game::shared::playthrough_id(&Query::from_save(save));

    let data = utils::request("ita2_later13.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();
    let playthrough_id2 = eu4game::shared::playthrough_id(&Query::from_save(save));

    let data = utils::request("ita2.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();
    let playthrough_id3 = eu4game::shared::playthrough_id(&Query::from_save(save));

    assert_eq!(playthrough_id1, playthrough_id2);
    assert_eq!(playthrough_id1, playthrough_id3);
}

#[test]
fn test_playthrough_id4() {
    let data = utils::request("tartartar.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();

    let playthrough_id1 = eu4game::shared::playthrough_id(&Query::from_save(save));

    let data = utils::request("tartar-gold.eu4");
    let (save, _encoding) = parse_save(&data).unwrap();
    let playthrough_id2 = eu4game::shared::playthrough_id(&Query::from_save(save));

    assert_eq!(playthrough_id1, playthrough_id2);
}
