use eu4game::{
    achievements::{AchievementHunter, WeightedScore},
    shared::parse_save,
};
use eu4save::{eu4_start_date, models::GameDifficulty, Encoding, PdsDate};
use memmap::Mmap;
use serde::Serialize;
use std::io;
use std::{fs::File, path::Path};

#[derive(Debug, Serialize)]
pub struct SavePatch {
    first: u16,
    second: u16,
    third: u16,
    fourth: u16,
}

#[derive(Debug, Serialize)]
pub struct InvalidPatch {
    patch_shorthand: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum ParseResult {
    InvalidPatch(InvalidPatch),
    Parsed(Box<ParsedFile>),
}

#[derive(Debug, Serialize)]
pub struct ParsedFile {
    patch: SavePatch,
    encoding: String,
    playthrough_id: Option<String>,
    game_difficulty: GameDifficulty,
    campaign_id: String,
    campaign_length: i32,
    is_ironman: bool,
    is_multiplayer: bool,
    is_observer: bool,
    player_names: Vec<String>,
    player_tag: String,
    player_tag_name: String,
    player_start_tag: Option<String>,
    player_start_tag_name: Option<String>,
    date: String,
    days: i32,
    achievements: Option<Vec<i32>>,
    dlc_ids: Vec<i32>,
    checksum: String,
    patch_shorthand: String,
    weighted_score: i32,
}

#[derive(thiserror::Error, Debug)]
pub enum ParseFileError {
    #[error("unable to open save file")]
    InvalidFile(io::Error),

    #[error("unable to memory map file")]
    Mmap(io::Error),

    #[error("unable to parse file")]
    Parse(#[from] eu4save::Eu4Error),
}
pub fn parse_path<P: AsRef<Path>>(fp: P) -> Result<ParseResult, ParseFileError> {
    let f = File::open(fp.as_ref()).map_err(ParseFileError::InvalidFile)?;
    parse_file(f)
}

pub fn parse_file(f: File) -> Result<ParseResult, ParseFileError> {
    let mmap = unsafe { Mmap::map(&f).map_err(ParseFileError::Mmap)? };
    let (save, encoding) = parse_save(&mmap[..])?;
    let out_encoding = match encoding {
        Encoding::BinZip => String::from("binzip"),
        Encoding::TextZip => String::from("textzip"),
        Encoding::Text => String::from("text"),
    };

    let patch_shorthand = format!(
        "{}.{}",
        save.meta.savegame_version.first, save.meta.savegame_version.second
    );

    let weighted_score = match WeightedScore::from_save(&save) {
        Some(x) => x,
        None => return Ok(ParseResult::InvalidPatch(InvalidPatch { patch_shorthand })),
    };

    let playthrough_id = eu4game::shared::playthrough_id(&save);
    let query = eu4save::query::Query::from_save(save);
    let game = eu4game::game::Game::new(&query.save().meta.savegame_version);
    let save_game_query = eu4game::SaveGameQuery::new(&query, &game);

    let province_owners = query.province_owners();
    let nation_events = query.nation_events(&province_owners);
    let player_histories = query.player_histories(&nation_events);
    let meta = &query.save().meta;
    let game_difficulty = query.save().game.gameplay_settings.options.difficulty;
    let player_names = query
        .players()
        .iter()
        .map(|x| x.name.clone())
        .collect::<Vec<_>>();
    let player_tag_name = save_game_query.localize_country(&query.save().meta.player);
    let player_start_tag = query
        .starting_country(&player_histories)
        .as_ref()
        .map(|x| x.to_string());
    let player_start_tag_name = query
        .starting_country(&player_histories)
        .map(|x| save_game_query.localize_country(&x));

    let days = eu4_start_date().days_until(&meta.date);
    let achievements =
        AchievementHunter::create(encoding, &query, &game, &player_histories).map(|x| {
            x.achievements()
                .into_iter()
                .filter(|x| x.completed())
                .map(|x| x.id)
                .collect::<Vec<_>>()
        });

    let dlc: Vec<_> = meta
        .dlc_enabled
        .iter()
        .filter_map(|x| eu4save::dlc_id(x.as_str()))
        .collect();

    Ok(ParseResult::Parsed(Box::new(ParsedFile {
        patch: SavePatch {
            first: meta.savegame_version.first,
            second: meta.savegame_version.second,
            third: meta.savegame_version.third,
            fourth: meta.savegame_version.fourth,
        },
        encoding: out_encoding,
        campaign_id: meta.campaign_id.clone(),
        campaign_length: meta.campaign_length,
        is_ironman: meta.is_ironman,
        is_multiplayer: meta.multiplayer,
        is_observer: !meta.not_observer,
        playthrough_id,
        game_difficulty,
        player_names,
        player_tag: meta.player.to_string(),
        player_tag_name,
        player_start_tag,
        player_start_tag_name,
        date: meta.date.iso_8601().to_string(),
        days,
        achievements,
        dlc_ids: dlc,
        checksum: meta.checksum.clone(),
        patch_shorthand,
        weighted_score: weighted_score.days,
    })))
}
