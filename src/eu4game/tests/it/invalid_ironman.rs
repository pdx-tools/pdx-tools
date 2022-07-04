use crate::utils;
use eu4game::{achievements::AchievementHunter, game::Game};
use eu4save::{models::SavegameVersion, query::Query};
use eu4save::{EnvTokens, Eu4File};
use std::error::Error;

#[test]
pub fn old_saves_are_invalid() -> Result<(), Box<dyn Error>> {
    let data = utils::request("Ruskies.eu4");
    let file = Eu4File::from_slice(&data)?;
    let save = file.deserializer().build_save(&EnvTokens)?;
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

    let achievements = AchievementHunter::new(file.encoding(), &query, &game);
    assert!(achievements.is_none());
    Ok(())
}
