mod asset_compilers;
mod bundler;
mod cli;
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
}

impl Game {
    /// Auto-detect game type from file provider
    pub fn detect<P: FileProvider + ?Sized>(provider: &P) -> Result<Self> {
        if provider.file_exists("game/in_game/map_data/named_locations/00_default.txt") {
            Ok(Game::Eu5)
        } else if provider.file_exists("common/country_tags/00_countries.txt") {
            Ok(Game::Eu4)
        } else {
            Err(anyhow!(
                "Could not auto-detect game type. Please specify --game eu4 or --game eu5"
            ))
        }
    }
}

impl fmt::Display for Game {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Game::Eu4 => write!(f, "eu4"),
            Game::Eu5 => write!(f, "eu5"),
        }
    }
}

impl FromStr for Game {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "eu4" => Ok(Game::Eu4),
            "eu5" => Ok(Game::Eu5),
            _ => Err(anyhow!("Unsupported game: '{}'. Must be 'eu4' or 'eu5'", s)),
        }
    }
}
