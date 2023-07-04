use anyhow::{bail, Context};
use applib::parser::{ParseResult, ParsedFile, SavePatch};
use clap::Args;
use csv::{Reader, StringRecord};
use eu4save::{models::GameDifficulty, Encoding};
use serde::{de, Deserialize, Deserializer, Serialize};
use std::{
    collections::HashMap,
    fmt,
    io::{self, Cursor, Read},
    path::PathBuf,
    process::ExitCode,
};
use walkdir::WalkDir;

/// Produces a delta to apply to database from reparsed saves
#[derive(Args)]
pub struct ReprocessArgs {
    /// Path to database export (csv)
    #[arg(long)]
    reference: Option<PathBuf>,

    /// Files and directories to parse
    #[arg(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl ReprocessArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let mut saves = Vec::new();
        let existing_records = if let Some(reference) = self.reference.as_ref() {
            let rdr = csv::Reader::from_path(reference)
                .with_context(|| format!("unable to open: {}", reference.display()))?;
            extract_existing_records(rdr)?
        } else {
            HashMap::new()
        };

        let files = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file());

        for file in files {
            let path = file.path();

            let save_data = std::fs::read(path)
                .with_context(|| format!("unable to read: {}", path.display()))?;
            let save = applib::parser::parse_save_data(&save_data)?;

            let save = match save {
                ParseResult::InvalidPatch(_) => bail!("unable parse patch"),
                ParseResult::Parsed(x) => *x,
            };

            let save_id = String::from(path.file_name().unwrap().to_str().unwrap());
            if let Some(existing) = existing_records.get(&save_id) {
                let diff = diff_saves(existing, &save);

                if diff.has_change() {
                    saves.push(ReprocessEntry {
                        save_id,
                        save: diff,
                    });
                }
            } else if existing_records.is_empty() {
                let update = UpdateSave::from(save);
                saves.push(ReprocessEntry {
                    save_id,
                    save: update,
                });
            };
        }

        let stdout = io::stdout();
        let mut locked = stdout.lock();
        serde_json::to_writer(&mut locked, &saves)?;
        Ok(ExitCode::SUCCESS)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReprocessEntry {
    pub save_id: String,
    pub save: UpdateSave,
}

#[derive(Debug, Serialize, PartialEq, Default)]
struct UpdateSave {
    #[serde(skip_serializing_if = "Option::is_none")]
    patch: Option<SavePatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    encoding: Option<Encoding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    playthrough_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    game_difficulty: Option<GameDifficulty>,
    #[serde(skip_serializing_if = "Option::is_none")]
    campaign_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    campaign_length: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_ironman: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_multiplayer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_observer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_names: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_tag_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_start_tag: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_start_tag_name: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    achievements: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dlc_ids: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    checksum: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch_shorthand: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    hash: Option<String>,
}

impl From<ParsedFile> for UpdateSave {
    fn from(x: ParsedFile) -> Self {
        UpdateSave {
            patch: Some(x.patch),
            encoding: Some(x.encoding),
            playthrough_id: Some(x.playthrough_id),
            game_difficulty: Some(x.game_difficulty),
            campaign_id: Some(x.campaign_id),
            campaign_length: Some(x.campaign_length),
            is_ironman: Some(x.is_ironman),
            is_multiplayer: Some(x.is_multiplayer),
            is_observer: Some(x.is_observer),
            player_names: Some(x.player_names),
            player_tag: Some(x.player_tag),
            player_tag_name: Some(x.player_tag_name),
            player_start_tag: Some(x.player_start_tag),
            player_start_tag_name: Some(x.player_start_tag_name),
            date: Some(x.date),
            days: Some(x.days),
            score_date: Some(x.score_date),
            score_days: Some(x.score_days),
            achievements: Some(x.achievements.unwrap_or_default()),
            dlc_ids: Some(x.dlc_ids),
            checksum: Some(x.checksum),
            patch_shorthand: Some(x.patch_shorthand),
            hash: Some(x.hash),
        }
    }
}

impl UpdateSave {
    fn has_change(&self) -> bool {
        self.patch.is_some()
            || self.encoding.is_some()
            || self.playthrough_id.is_some()
            || self.game_difficulty.is_some()
            || self.campaign_id.is_some()
            || self.campaign_length.is_some()
            || self.is_ironman.is_some()
            || self.is_multiplayer.is_some()
            || self.is_observer.is_some()
            || self.player_names.is_some()
            || self.player_tag.is_some()
            || self.player_tag_name.is_some()
            || self.player_start_tag.is_some()
            || self.player_start_tag_name.is_some()
            || self.date.is_some()
            || self.days.is_some()
            || self.score_date.is_some()
            || self.score_days.is_some()
            || self.achievements.is_some()
            || self.dlc_ids.is_some()
            || self.checksum.is_some()
            || self.patch_shorthand.is_some()
            || self.hash.is_some()
    }
}

#[derive(Debug, Deserialize)]
struct FlatSave<'a> {
    id: &'a str,
    // created_on: &'a str,
    // locked: &'a str,
    // filename: &'a str,
    // user_id: &'a str,
    encoding: Encoding,
    hash: &'a str,
    date: &'a str,
    days: i32,
    score_days: Option<i32>,
    player: &'a str,
    displayed_country_name: Option<&'a str>,
    campaign_id: &'a str,
    campaign_length: i32,
    #[serde(deserialize_with = "deserialize_postgres_bool")]
    ironman: bool,
    #[serde(deserialize_with = "deserialize_postgres_bool")]
    multiplayer: bool,
    #[serde(deserialize_with = "deserialize_postgres_bool")]
    observer: bool,
    dlc: &'a str,
    checksum: &'a str,
    achieve_ids: &'a str,
    players: &'a str,
    player_start_tag: &'a str,
    player_start_tag_name: &'a str,
    #[serde(deserialize_with = "deserialize_game_difficulty")]
    game_difficulty: GameDifficulty,
    // aar: &'a str,
    playthrough_id: &'a str,
    // save_slot: bool,
    save_version_first: u16,
    save_version_second: u16,
    save_version_third: u16,
    save_version_fourth: u16,
}

pub(crate) fn deserialize_postgres_bool<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: Deserializer<'de>,
{
    struct BoolVisitor;

    impl<'de> de::Visitor<'de> for BoolVisitor {
        type Value = bool;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a postgres boolean")
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(v == "t")
        }
    }

    deserializer.deserialize_any(BoolVisitor)
}

pub(crate) fn deserialize_game_difficulty<'de, D>(
    deserializer: D,
) -> Result<GameDifficulty, D::Error>
where
    D: Deserializer<'de>,
{
    struct GameDifficultyVisitor;

    impl<'de> de::Visitor<'de> for GameDifficultyVisitor {
        type Value = GameDifficulty;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("game difficulty")
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            match v {
                "very_easy" => Ok(GameDifficulty::VeryEasy),
                "easy" => Ok(GameDifficulty::Easy),
                "normal" => Ok(GameDifficulty::Normal),
                "hard" => Ok(GameDifficulty::Hard),
                "very_hard" => Ok(GameDifficulty::VeryHard),
                _ => Err(de::Error::custom("unrecognized difficulty")),
            }
        }
    }

    deserializer.deserialize_any(GameDifficultyVisitor)
}

fn diff_saves(a: &ParsedFile, b: &ParsedFile) -> UpdateSave {
    let a_achievements = a.achievements.clone().unwrap_or_default();
    let b_achievements = b.achievements.clone().unwrap_or_default();

    UpdateSave {
        patch: a.patch.ne(&b.patch).then_some(b.patch),
        encoding: a.encoding.ne(&b.encoding).then(|| b.encoding.clone()),
        playthrough_id: a
            .playthrough_id
            .ne(&b.playthrough_id)
            .then(|| b.playthrough_id.clone()),
        game_difficulty: a
            .game_difficulty
            .ne(&b.game_difficulty)
            .then_some(b.game_difficulty),
        campaign_id: a
            .campaign_id
            .ne(&b.campaign_id)
            .then(|| b.campaign_id.clone()),
        campaign_length: a
            .campaign_length
            .ne(&b.campaign_length)
            .then_some(b.campaign_length),
        is_ironman: a.is_ironman.ne(&b.is_ironman).then_some(b.is_ironman),
        is_multiplayer: a
            .is_multiplayer
            .ne(&b.is_multiplayer)
            .then_some(b.is_multiplayer),
        is_observer: a.is_observer.ne(&b.is_observer).then_some(b.is_observer),
        player_names: a
            .player_names
            .ne(&b.player_names)
            .then(|| b.player_names.clone()),
        player_tag: a.player_tag.ne(&b.player_tag).then(|| b.player_tag.clone()),
        player_tag_name: a
            .player_tag_name
            .ne(&b.player_tag_name)
            .then(|| b.player_tag_name.clone()),
        player_start_tag: a
            .player_start_tag
            .ne(&b.player_start_tag)
            .then(|| b.player_start_tag.clone()),
        player_start_tag_name: a
            .player_start_tag_name
            .ne(&b.player_start_tag_name)
            .then(|| b.player_start_tag_name.clone()),
        date: a.date.ne(&b.date).then(|| b.date.clone()),
        days: a.days.ne(&b.days).then_some(b.days),
        score_date: a.score_date.ne(&b.score_date).then(|| b.score_date.clone()),
        score_days: a.score_days.ne(&b.score_days).then_some(b.score_days),
        achievements: a_achievements.ne(&b_achievements).then_some(b_achievements),
        dlc_ids: a.dlc_ids.ne(&b.dlc_ids).then(|| b.dlc_ids.clone()),
        checksum: a.checksum.ne(&b.checksum).then(|| b.checksum.clone()),
        patch_shorthand: a
            .patch_shorthand
            .ne(&b.patch_shorthand)
            .then(|| b.patch_shorthand.clone()),
        hash: a.hash.ne(&b.hash).then(|| b.hash.clone()),
    }
}

fn postgres_split(x: &str) -> Option<Vec<String>> {
    if x.is_empty() {
        None
    } else if x == "{}" {
        Some(Vec::new())
    } else {
        let inner_csv = x[1..x.len() - 1].replace("\"\"", "\"");
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false)
            .from_reader(Cursor::new(inner_csv));
        let mut record = StringRecord::new();
        rdr.read_record(&mut record).ok()?;
        Some(record.iter().map(String::from).collect())
    }
}

fn enhance_flat(x: &FlatSave) -> anyhow::Result<ParsedFile> {
    let patch_shorthand = format!("{}.{}", x.save_version_first, x.save_version_second);

    let achievements = postgres_split(x.achieve_ids)
        .unwrap_or_default()
        .into_iter()
        .map(|y| y.parse())
        .collect::<Result<Vec<_>, _>>()
        .with_context(|| format!("unable to parse achievements: {}", x.achieve_ids))?;

    let dlc = postgres_split(x.dlc).unwrap_or_default();
    let dlc_ids = dlc
        .into_iter()
        .map(|y| y.parse())
        .collect::<Result<Vec<_>, _>>()
        .with_context(|| format!("unable to parse dlc: {}", x.dlc))?;

    let score_days = x.score_days.unwrap_or(0);
    let score_date = applib::eu4_days_to_date(score_days);
    Ok(ParsedFile {
        patch: SavePatch {
            first: x.save_version_first,
            second: x.save_version_second,
            third: x.save_version_third,
            fourth: x.save_version_fourth,
        },
        encoding: x.encoding,
        playthrough_id: x
            .playthrough_id
            .ne("")
            .then(|| String::from(x.playthrough_id)),
        game_difficulty: x.game_difficulty,
        campaign_id: String::from(x.campaign_id),
        campaign_length: x.campaign_length,
        is_ironman: x.ironman,
        is_multiplayer: x.multiplayer,
        is_observer: x.observer,
        player_names: postgres_split(x.players).context("expected at least one player")?,
        player_tag: String::from(x.player),
        player_tag_name: String::from(x.displayed_country_name.unwrap_or("")),
        player_start_tag: x
            .player_start_tag
            .ne("")
            .then(|| String::from(x.player_start_tag)),
        player_start_tag_name: x
            .player_start_tag_name
            .ne("")
            .then(|| String::from(x.player_start_tag_name)),
        date: String::from(x.date),
        days: x.days,
        score_days,
        score_date,
        achievements: Some(achievements),
        dlc_ids,
        checksum: String::from(x.checksum),
        patch_shorthand,
        hash: String::from(x.hash),
    })
}

fn extract_existing_records<T: Read>(
    mut rdr: Reader<T>,
) -> anyhow::Result<HashMap<String, ParsedFile>> {
    let mut existing_records: HashMap<String, ParsedFile> = HashMap::new();
    let mut raw_record = csv::StringRecord::new();
    let headers = rdr.headers().context("unable to get csv header")?.clone();
    while rdr.read_record(&mut raw_record)? {
        let record: FlatSave = raw_record.deserialize(Some(&headers))?;
        existing_records.insert(String::from(record.id), enhance_flat(&record)?);
    }

    Ok(existing_records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn extract_data_from_csv() {
        let data = r#"id,created_on,locked,filename,user_id,encoding,hash,date,days,player,displayed_country_name,campaign_id,campaign_length,ironman,multiplayer,observer,dlc,save_version_first,save_version_second,save_version_third,save_version_fourth,checksum,achieve_ids,players,player_start_tag,player_start_tag_name,game_difficulty,aar,playthrough_id,score_days
ihrVduP0vXMgILyvAgs2G,2021-11-25 22:02:26.501926+00,f,poopdaddy_melted (2).eu4,asEKwa3mQHqJ,text,vAkePWFf1SgmS9C1D+VkYU2AaxLkOtOXvcAnq4Opn2I=,1488-04-14,15849,FRA,France,750255a3-9ded-40d1-9ce3-acc26ff59f7c,2709,f,f,f,"{10,18,21,27,33,39,46,55,60,66,72,77,84,90,95,101,106,110}",1,32,1,0,875c3cb01d8a0bed892b7f6247c4bd51,,{redx209},FRA,France,hard,,7Qc5xbeBXFwV7SBALg3+5B7eXGAymyXauRkztRR0bX0=,"#;

        let rdr = csv::Reader::from_reader(Cursor::new(data));
        let result = extract_existing_records(rdr).unwrap();

        let parsed = result.get("ihrVduP0vXMgILyvAgs2G").unwrap();
        assert_eq!(parsed.score_days, 0);
    }

    #[test]
    fn compute_patch() {
        let data = r#"id,created_on,locked,filename,user_id,encoding,hash,date,days,player,displayed_country_name,campaign_id,campaign_length,ironman,multiplayer,observer,dlc,checksum,achieve_ids,players,player_start_tag,player_start_tag_name,game_difficulty,aar,playthrough_id,save_slot,save_version_first,save_version_second,save_version_third,save_version_fourth,score_days
FcdKVa_EYzoHip7swnUrr,2020-05-25 12:20:56.962656+00,f,ita2.eu4,_r6Wq70gZyz3,binzip,WIYzie1JiPRNKDZq3wFOYBJ5WGIyyKbZH3lLxiBgX7o=,1528-07-01,30527,ITA,Italy,0aca73ce-79df-41e7-b3e8-d2e1f02e44b8,9559,t,f,f,"{10,18,21,27,33,39,46,55,60,66,72,77,84,90,95}",aa9b1d852ca27f98300b2fd390d67760,{18},{comagoosie},MLO,Milan,normal,"First time playing Milan (well probably since EU3)! Definitely fun mechanics with the Ambrosian Republic and some special events like Caterina Sforza. Only had one coalition war which took a lot of wind out of my sails but maybe only delayed me by a decade. To me, achieving the Italian ambition as Milan is much easier than others as you seem to start out with more options for expansion.",p7ofaCpn4/pSq1iAhFAMe36q5OABZF/fWg5drlrlfII=,f,1,29,6,0,30527"#;

        let rdr = csv::Reader::from_reader(Cursor::new(data));
        let result = extract_existing_records(rdr).unwrap();
        let parsed = result.get("FcdKVa_EYzoHip7swnUrr").unwrap();

        let parsed2 = ParsedFile {
            achievements: Some(vec![18, 19]),
            ..parsed.clone()
        };

        let update = diff_saves(&parsed, &parsed2);

        assert_eq!(
            &update,
            &UpdateSave {
                achievements: Some(vec![18, 19]),
                ..UpdateSave::default()
            }
        );

        let v = serde_json::to_string(&update).unwrap();
        assert_eq!("{\"achievements\":[18,19]}", v);
    }

    #[test]
    fn test_postgres_split() {
        assert_eq!(postgres_split(""), None);
        assert_eq!(postgres_split("{}"), Some(vec![]));
        assert_eq!(postgres_split("{18}"), Some(vec![String::from("18")]));
        assert_eq!(
            postgres_split("{18,19}"),
            Some(vec![String::from("18"), String::from("19")])
        );
        assert_eq!(
            postgres_split(r#"{""Dope Lemon""}"#),
            Some(vec![String::from("Dope Lemon")])
        );

        assert_eq!(
            postgres_split(r#"{""Dope Lemon"",abc}"#),
            Some(vec![String::from("Dope Lemon"), String::from("abc")])
        );

        assert_eq!(
            postgres_split(r#"{""Holly, Steppe Terror"",abc}"#),
            Some(vec![
                String::from("Holly, Steppe Terror"),
                String::from("abc")
            ])
        );

        assert_eq!(
            postgres_split(r#"{def,""Holly, Steppe Terror"",abc}"#),
            Some(vec![
                String::from("def"),
                String::from("Holly, Steppe Terror"),
                String::from("abc")
            ])
        );
    }
}
