use crate::utils;
use eu4game::{achievements::AchievementHunter, game::Game};
use eu4save::{models::SavegameVersion, query::Query, Eu4Extractor};
use std::error::Error;
use std::io::Cursor;

#[test]
pub fn old_saves_are_invalid() -> Result<(), Box<dyn Error>> {
    let data = utils::request("Ruskies.eu4");
    let (save, encoding) = Eu4Extractor::extract_save(Cursor::new(&data[..]))?;
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    assert_eq!(
        &query.save().meta.savegame_version,
        &SavegameVersion {
            first: 1,
            second: 28,
            third: 3,
            fourth: 0,
            name: String::from("Spain"),
        }
    );

    let achievements = AchievementHunter::new(encoding, &query, &game);
    assert!(achievements.is_none());
    Ok(())
}
