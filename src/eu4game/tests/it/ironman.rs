use crate::utils;
use eu4game::shared::parse_save;
use eu4game::{achievements::AchievementHunter, game::Game, SaveGameQuery};
use eu4save::query::Query;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fs;
use walkdir::WalkDir;

#[test]
pub fn ironman_saves_detected() -> Result<(), Box<dyn Error>> {
    let mut playthrough_ids: HashMap<String, HashSet<String>> = HashMap::new();

    let files = WalkDir::new("../../assets/eu4-saves");
    let add_files = WalkDir::new("../../../eu4saves/assets/saves");

    let files = files
        .into_iter()
        .chain(add_files.into_iter())
        .filter_map(|x| x.ok())
        .filter(|x| x.path().is_file())
        .filter(|x| match x.path().to_str() {
            Some(x) if x.ends_with(".gz") || x.ends_with(".zip") => false,
            Some(_) => true,
            None => false,
        });

    for file in files {
        let path = file.path();
        println!("parsing {}", path.display());
        let data = fs::read(&path)?;
        let (save, _) = parse_save(&data)?;
        let query = Query::from_save(save);
        if let Some(playthrough_id) = eu4game::shared::playthrough_id(&query) {
            let e = playthrough_ids
                .entry(playthrough_id)
                .or_insert_with(HashSet::new);
            e.insert(path.file_stem().unwrap().to_string_lossy().to_string());
        }
    }

    for (key, values) in &playthrough_ids {
        if values.len() == 2
            && values.contains(&String::from("arda-persia"))
            && values.contains(&String::from("arda-shahansha"))
        {
            continue;
        }

        if values.len() == 2
            && values.contains(&String::from("ragusa.bin"))
            && values.contains(&String::from("ragusa2.bin"))
        {
            continue;
        }

        if values.len() == 2
            && values.contains(&String::from("tartartar"))
            && values.contains(&String::from("tartar-gold"))
        {
            continue;
        }

        if values.len() == 3
            && values.contains(&String::from("ita2_later"))
            && values.contains(&String::from("ita2_later13"))
            && values.contains(&String::from("ita2"))
        {
            continue;
        }

        if values.len() > 1 {
            panic!("content id collision: {}: {:?}", key, values);
        }
    }

    Ok(())
}

#[test]
fn test_je_maintiendrai() {
    let data = utils::request("Dutch_WC.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&69));
    assert!(completed_ids.contains(&48));
}

#[test]
fn test_never_say_nevers() {
    let data = utils::request("nevers.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&281));
}

#[test]
fn test_tale_test_with_voltaire_false_positive() {
    let data = utils::request("TaleOfTwo.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();

    // Make sure we don't regress on voltaire bug where a non-existant country counted as part of
    // the HRE
    assert!(!completed_ids.contains(&244));
    assert!(completed_ids.contains(&193));
}

#[test]
fn test_patch130_start() {
    // This one is weird as there is history that is one day in the future
    let data = utils::request("patch130.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let save_game_query = SaveGameQuery::new(&query, &game);
    assert_eq!(query.save().meta.player, "CLI".parse().unwrap());
    assert_eq!(
        save_game_query.localize_country(&"CLI".parse().unwrap()),
        String::from("Cilli")
    );
    AchievementHunter::new(encoding, &query, &game).unwrap();
}

#[test]
fn test_cilli() {
    let data = utils::request("cilli.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let save_game_query = SaveGameQuery::new(&query, &game);
    assert_eq!(
        save_game_query.localize_country(&"CLI".parse().unwrap()),
        String::from("Cilli")
    );
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&302));
}

#[test]
fn test_godtier() {
    let data = utils::request("switzer_godtier.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&300));
}

#[test]
fn test_true_heir_of_timur() {
    // Not only is this true heir of timur but the uploader used the intermediate tag of delhi to
    // further form the mughals, "annexed Delhi, flipped to Kashimiri, and formed Delhi to get a
    // bunch of free cores". So this save is especially important to ensure that start and end
    // country detection is working correctly.
    // https://www.reddit.com/r/eu4/comments/hnwnd2/sistan_true_heir_of_timur_in_1508/
    let data = utils::request("sis.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&277));
}

#[test]
fn test_luck_of_the_irish() {
    let data = utils::request("tryone.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&55));
}

#[test]
fn test_a_heros_welcome() {
    let data = utils::request("rummy3.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let achievement = achievements.a_heros_welcome();
    assert!(achievement.completed());
}

#[test]
fn test_rise_of_the_white_sheep() {
    let data = utils::request("aq.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let achievement = achievements.rise_of_the_white_sheep();
    assert!(achievement.completed());
}

#[test]
fn test_shahanshah() {
    let data = utils::request("arda-shahansha.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let achievement = achievements.shahanshah();
    assert!(achievement.completed());
}

#[test]
fn test_this_is_persia() {
    let data = utils::request("arda-persia.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let achievement = achievements.this_is_persia();
    assert!(achievement.completed());
}

#[test]
fn test_form_rome() {
    let data = utils::request("Basileus.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&10000));
}

#[test]
fn test_golden_horde() {
    let data = utils::request("tartar-gold.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&208));
}

#[test]
fn test_tatarstan() {
    let data = utils::request("tartartar.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&159));
}

#[test]
fn test_african_power() {
    let data = utils::request("King_of_Africa.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&42));
}

#[test]
fn test_african_power2() {
    let data = utils::request("kongo2.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&42));
}

#[test]
fn test_stern_des_sudens() {
    let data = utils::request("Stern_des_Sudens.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&304));
}

#[test]
fn test_terra_mariana() {
    let data = utils::request("riga-terra-mariana.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&160));
}

#[test]
fn patch_1_31_0_is_valid() {
    let data = utils::request("1.31.0.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.is_empty());
}

#[test]
fn patch_1_32_0_is_valid() {
    let data = utils::request("patch132.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.is_empty());
}

#[test]
fn test_eat_your_greens() {
    let data = utils::request("eat-your-greens.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&275));
}

#[test]
fn test_spaghetti_western() {
    let data = utils::request("Bologna.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&301));
}

#[test]
fn test_dracula() {
    let data = utils::request("dracula3.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&110));
}

#[test]
fn test_not_just_pizza() {
    let data = utils::request("naples.eu4");
    let (save, encoding) = parse_save(&data).unwrap();
    let game = Game::new(&save.meta.savegame_version);
    let query = Query::from_save(save);
    let achievements = AchievementHunter::new(encoding, &query, &game).unwrap();
    let completed_ids: Vec<i32> = achievements
        .achievements()
        .iter()
        .filter(|x| x.completed())
        .map(|x| x.id)
        .collect();
    assert!(completed_ids.contains(&198));
}
