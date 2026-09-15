use crate::Game;
use anyhow::{Context, Result};
use clap::Args;
use std::collections::BTreeMap;
use std::process::{Command, ExitCode, Stdio};

/// Print the latest Steam build ID of each branch of the given games
///
/// Runs one SteamCMD session that queries `app_info_print` for every game
/// and writes a JSON object keyed by game, then by branch name, to stdout:
/// `{"eu4":{"public":15918133,"1.36.2":14054290}}`
#[derive(Args, Debug)]
pub struct SteamBuildsArgs {
    /// Game to query (eu4, eu5, ck3, hoi4, imperator, or vic3). Repeat for
    /// more games. Defaults to all games
    #[clap(long = "game")]
    games: Vec<Game>,

    /// Steam username. If omitted, STEAM_USERNAME is used
    #[clap(long)]
    username: Option<String>,

    /// Print the SteamCMD invocation without running it
    #[clap(long)]
    dry_run: bool,
}

/// Build IDs keyed by game name, then by Steam branch name
pub type SteamBuilds = BTreeMap<String, BTreeMap<String, u64>>;

impl SteamBuildsArgs {
    pub fn run(&self) -> Result<ExitCode> {
        let games = if self.games.is_empty() {
            Game::ALL.to_vec()
        } else {
            self.games.clone()
        };
        let username = crate::steam_username(self.username.as_deref())?;
        let args = steamcmd_args(&username, &games);

        if self.dry_run {
            println!("steamcmd {}", args.join(" "));
            return Ok(ExitCode::SUCCESS);
        }

        // A fresh SteamCMD cache can print nothing the first time
        let mut builds = SteamBuilds::new();
        for _ in 0..2 {
            let output = Command::new("steamcmd")
                .args(&args)
                .stdin(Stdio::inherit())
                .stderr(Stdio::inherit())
                .output()
                .context("Failed to execute steamcmd. Is SteamCMD installed?")?;
            anyhow::ensure!(
                output.status.success(),
                "steamcmd exited with {}",
                output.status
            );

            builds = parse_steam_builds(&String::from_utf8_lossy(&output.stdout), &games);
            if !builds.is_empty() {
                break;
            }
            tracing::warn!("SteamCMD returned no build IDs; retrying");
        }

        anyhow::ensure!(!builds.is_empty(), "SteamCMD returned no build IDs");
        println!("{}", serde_json::to_string(&builds)?);
        Ok(ExitCode::SUCCESS)
    }
}

fn steamcmd_args(username: &str, games: &[Game]) -> Vec<String> {
    let mut args = vec![
        String::from("+login"),
        username.to_owned(),
        String::from("+app_info_update"),
        String::from("1"),
    ];
    for game in games {
        args.push(String::from("+app_info_print"));
        args.push(game.steam_app_id().to_string());
    }
    args.push(String::from("+quit"));
    args
}

/// Pull `depots.branches.<branch>.buildid` out of the `app_info_print`
/// output of each requested game. The output is one VDF dump per app,
/// mixed with SteamCMD log lines.
pub fn parse_steam_builds(output: &str, games: &[Game]) -> SteamBuilds {
    let apps = Vdf::parse(output);
    let mut builds = SteamBuilds::new();
    for game in games {
        let branches = apps
            .get(&game.steam_app_id().to_string())
            .and_then(|app| app.get("depots"))
            .and_then(|depots| depots.get("branches"))
            .and_then(Vdf::entries);
        let Some(branches) = branches else {
            continue;
        };

        let ids = branches
            .iter()
            .filter_map(|(name, branch)| {
                let build_id = branch.get("buildid")?.as_str()?.parse().ok()?;
                Some((name.clone(), build_id))
            })
            .collect::<BTreeMap<_, _>>();
        if !ids.is_empty() {
            builds.insert(game.to_string(), ids);
        }
    }
    builds
}

/// A subset of Valve's KeyValues text format: quoted keys with either a
/// quoted value or a braced block. Unquoted lines (SteamCMD log output) are
/// ignored.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Vdf {
    Str(String),
    Obj(Vec<(String, Vdf)>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Str(String),
    Open,
    Close,
}

impl Vdf {
    fn parse(text: &str) -> Vdf {
        let tokens = tokenize(text);
        let mut pos = 0;
        Vdf::Obj(parse_entries(&tokens, &mut pos))
    }

    fn entries(&self) -> Option<&[(String, Vdf)]> {
        match self {
            Vdf::Obj(entries) => Some(entries),
            Vdf::Str(_) => None,
        }
    }

    fn get(&self, key: &str) -> Option<&Vdf> {
        self.entries()?
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s),
            Vdf::Obj(_) => None,
        }
    }
}

fn parse_entries(tokens: &[Token], pos: &mut usize) -> Vec<(String, Vdf)> {
    let mut entries = Vec::new();
    while *pos < tokens.len() {
        match &tokens[*pos] {
            Token::Close => {
                *pos += 1;
                return entries;
            }
            Token::Open => {
                // A block without a key: skip its contents
                *pos += 1;
                parse_entries(tokens, pos);
            }
            Token::Str(key) => {
                *pos += 1;
                match tokens.get(*pos) {
                    Some(Token::Str(value)) => {
                        *pos += 1;
                        entries.push((key.clone(), Vdf::Str(value.clone())));
                    }
                    Some(Token::Open) => {
                        *pos += 1;
                        entries.push((key.clone(), Vdf::Obj(parse_entries(tokens, pos))));
                    }
                    _ => {}
                }
            }
        }
    }
    entries
}

fn tokenize(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line == "{" {
            tokens.push(Token::Open);
        } else if line == "}" {
            tokens.push(Token::Close);
        } else if line.starts_with('"') {
            tokenize_strings(line, &mut tokens);
        }
    }
    tokens
}

fn tokenize_strings(line: &str, tokens: &mut Vec<Token>) {
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '"' {
            continue;
        }

        let mut value = String::new();
        loop {
            match chars.next() {
                Some('\\') => {
                    if let Some(escaped) = chars.next() {
                        value.push(escaped);
                    }
                }
                Some('"') | None => break,
                Some(other) => value.push(other),
            }
        }
        tokens.push(Token::Str(value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OUTPUT: &str = r#"
Redirecting stderr to '/home/user/.steam/logs/stderr.txt'
Loading Steam API...OK
"236850"
{
	"common"
	{
		"name"		"Europa Universalis IV"
		"type"		"Game"
	}
	"depots"
	{
		"236851"
		{
			"manifests"
			{
				"public"		"123"
			}
		}
		"branches"
		{
			"public"
			{
				"buildid"		"15918133"
				"timeupdated"		"1712345678"
			}
			"1.36.2"
			{
				"buildid"		"14054290"
				"description"		"1.36.2 \"King of Kings\""
				"timeupdated"		"1700000000"
			}
		}
	}
}
"529340"
{
	"depots"
	{
		"branches"
		{
			"public"
			{
				"buildid"		"25000000"
			}
			"1.14-openbeta"
			{
				"buildid"		"25081502"
				"pwdrequired"		"0"
			}
		}
	}
}
"#;

    #[test]
    fn parses_branches_for_each_game() {
        let builds = parse_steam_builds(OUTPUT, &[Game::Eu4, Game::Vic3, Game::Ck3]);

        assert_eq!(builds.len(), 2);
        assert_eq!(builds["eu4"]["public"], 15_918_133);
        assert_eq!(builds["eu4"]["1.36.2"], 14_054_290);
        assert_eq!(builds["vic3"]["1.14-openbeta"], 25_081_502);
        assert_eq!(builds["vic3"]["public"], 25_000_000);
    }

    #[test]
    fn missing_output_yields_no_builds() {
        assert!(parse_steam_builds("Loading Steam API...OK\n", &[Game::Eu4]).is_empty());
    }

    #[test]
    fn steamcmd_args_query_each_game_once() {
        let args = steamcmd_args("steam-user", &[Game::Eu4, Game::Eu5]);
        assert_eq!(
            args,
            [
                "+login",
                "steam-user",
                "+app_info_update",
                "1",
                "+app_info_print",
                "236850",
                "+app_info_print",
                "3450310",
                "+quit"
            ]
        );
    }
}
