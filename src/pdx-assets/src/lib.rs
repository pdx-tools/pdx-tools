mod asset_compilers;
mod bundler;
mod cli;
pub mod coat_of_arms;
pub mod de;
pub mod eu4;
pub mod eu5;
mod file_provider;
mod file_tracker;
pub mod http;
pub mod images;
pub mod steam;

pub use cli::*;
pub use file_provider::*;
pub use file_tracker::*;
pub use images::*;

use anyhow::{Result, anyhow};
use std::fmt;
use std::str::FromStr;

/// Supported Paradox games
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Game {
    Eu4,
    Eu5,
    Ck3,
    Hoi4,
    Imperator,
    Vic3,
}

impl Game {
    pub const ALL: [Game; 6] = [
        Game::Eu4,
        Game::Eu5,
        Game::Ck3,
        Game::Hoi4,
        Game::Imperator,
        Game::Vic3,
    ];

    pub fn steam_app_id(self) -> u32 {
        match self {
            Game::Eu4 => 236_850,
            Game::Eu5 => 3_450_310,
            Game::Ck3 => 1_158_310,
            Game::Hoi4 => 394_360,
            Game::Imperator => 859_580,
            Game::Vic3 => 529_340,
        }
    }

    /// Directory of the game in the Steam library
    pub fn steam_directory(self) -> &'static str {
        match self {
            Game::Eu4 => "Europa Universalis IV",
            Game::Eu5 => "Europa Universalis V",
            Game::Ck3 => "Crusader Kings III",
            Game::Hoi4 => "Hearts of Iron IV",
            Game::Imperator => "ImperatorRome",
            Game::Vic3 => "Victoria 3",
        }
    }

    /// Executable paths of an installation, relative to the game directory and
    /// without a file extension.
    fn executables(self) -> &'static [&'static str] {
        match self {
            Game::Eu4 => &["eu4"],
            Game::Eu5 => &["binaries/eu5"],
            Game::Ck3 => &["binaries/ck3"],
            Game::Hoi4 => &["hoi4"],
            Game::Imperator => &["binaries/imperator", "imperator"],
            Game::Vic3 => &["binaries/victoria3"],
        }
    }

    /// Is the game a part of the asset pipeline (bundle and compile)?
    pub fn has_asset_pipeline(self) -> bool {
        matches!(self, Game::Eu4 | Game::Eu5)
    }

    /// Is the provider an installation of this game?
    ///
    /// An installation always contains the game executable, thus this test
    /// applies to games that the asset pipeline does not know. Windows and
    /// Linux builds are both accepted, as the platform of a download is a
    /// SteamCMD option.
    pub fn is_installation<P: FileProvider + ?Sized>(self, provider: &P) -> bool {
        self.executables()
            .iter()
            .any(|exe| provider.file_exists(exe) || provider.file_exists(&format!("{}.exe", exe)))
    }

    /// Auto-detect game type from file provider
    pub fn detect<P: FileProvider + ?Sized>(provider: &P) -> Result<Self> {
        if let Some(game) = Game::ALL.iter().find(|game| game.is_installation(provider)) {
            return Ok(*game);
        }

        // Asset bundles hold game data only, so the executable is absent and a
        // known data file identifies the game.
        if provider.file_exists("game/in_game/map_data/named_locations/00_default.txt") {
            Ok(Game::Eu5)
        } else if provider.file_exists("common/country_tags/00_countries.txt") {
            Ok(Game::Eu4)
        } else {
            Err(anyhow!(
                "Could not auto-detect game type. Please specify --game with one of: {}",
                Game::names()
            ))
        }
    }

    fn names() -> String {
        Game::ALL
            .iter()
            .map(|game| game.to_string())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

impl fmt::Display for Game {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Game::Eu4 => "eu4",
            Game::Eu5 => "eu5",
            Game::Ck3 => "ck3",
            Game::Hoi4 => "hoi4",
            Game::Imperator => "imperator",
            Game::Vic3 => "vic3",
        };

        f.write_str(name)
    }
}

impl FromStr for Game {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        let input = s.to_lowercase();
        Game::ALL
            .iter()
            .find(|game| game.to_string() == input)
            .copied()
            .ok_or_else(|| {
                anyhow!(
                    "Unsupported game: '{}'. Must be one of: {}",
                    s,
                    Game::names()
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn install_with(files: &[&str]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for file in files {
            let path = dir.path().join(file);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, b"").unwrap();
        }
        dir
    }

    fn detect_dir(files: &[&str]) -> Result<Game> {
        let dir = install_with(files);
        Game::detect(&DirectoryProvider::new(dir.path()))
    }

    #[test]
    fn detects_installations_from_the_windows_executable() {
        assert_eq!(detect_dir(&["eu4.exe"]).unwrap(), Game::Eu4);
        assert_eq!(detect_dir(&["binaries/eu5.exe"]).unwrap(), Game::Eu5);
        assert_eq!(detect_dir(&["binaries/ck3.exe"]).unwrap(), Game::Ck3);
        assert_eq!(detect_dir(&["hoi4.exe"]).unwrap(), Game::Hoi4);
        assert_eq!(
            detect_dir(&["binaries/imperator.exe"]).unwrap(),
            Game::Imperator
        );
        assert_eq!(detect_dir(&["binaries/victoria3.exe"]).unwrap(), Game::Vic3);
    }

    #[test]
    fn detects_installations_from_the_linux_executable() {
        assert_eq!(detect_dir(&["eu4"]).unwrap(), Game::Eu4);
        assert_eq!(detect_dir(&["binaries/victoria3"]).unwrap(), Game::Vic3);
    }

    #[test]
    fn detects_asset_bundles_that_hold_no_executable() {
        assert_eq!(
            detect_dir(&["game/in_game/map_data/named_locations/00_default.txt"]).unwrap(),
            Game::Eu5
        );
        assert_eq!(
            detect_dir(&["common/country_tags/00_countries.txt"]).unwrap(),
            Game::Eu4
        );
    }

    #[test]
    fn unknown_directories_list_the_supported_games() {
        let err = detect_dir(&["readme.txt"]).unwrap_err().to_string();

        assert!(
            err.contains("eu4, eu5, ck3, hoi4, imperator, vic3"),
            "{}",
            err
        );
    }

    #[test]
    fn game_names_round_trip() {
        for game in Game::ALL {
            assert_eq!(game.to_string().parse::<Game>().unwrap(), game);
        }

        "stellaris".parse::<Game>().unwrap_err();
    }
}
