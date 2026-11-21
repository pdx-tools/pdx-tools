use crate::Game;
use serde::{Deserialize, Serialize};

/// The fields that each game gives for a snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDescriptor {
    /// Opaque. Equal content from the same game gives the same ID.
    pub id: String,
    pub game: String,
    /// The exact campaign identity from the full parse.
    pub campaign_id: String,
    pub content_hash: String,
    /// The save date as `YYYY-MM-DD`.
    pub date: String,
    /// The save date as `YYYYMMDD`, for sorting.
    pub date_sort: i32,
    pub game_version: String,
    /// Snapshots with equal geographic IDs have the same layout key.
    pub layout_key: String,
    /// The kinds of data in the payload, such as "observations" or "map".
    pub artifacts: Vec<String>,
}

/// The in-game date of a save. The game calendar has no leap days. The year
/// is from -99999 to 99999, so the date has one `YYYYMMDD` sort key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SaveDate {
    year: i32,
    month: u8,
    day: u8,
}
impl SaveDate {
    pub const fn new(year: i32, month: u8, day: u8) -> Option<Self> {
        const DAYS: [u8; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let valid_day = month >= 1 && month <= 12 && day >= 1 && day <= DAYS[month as usize - 1];
        if year >= -99_999 && year <= 99_999 && valid_day {
            Some(Self { year, month, day })
        } else {
            None
        }
    }
    /// The date of a `YYYYMMDD` sort key. The month and day of a year before
    /// 0 count up from the year, as they do after it.
    pub fn from_sort_key(key: i32) -> Option<Self> {
        let rest = key.rem_euclid(10000);
        let month = u8::try_from(rest / 100).ok()?;
        let day = u8::try_from(rest % 100).ok()?;
        Self::new(key.div_euclid(10000), month, day)
    }
    /// The date as `YYYYMMDD`, which sorts in date order.
    pub const fn sort_key(self) -> i32 {
        self.year * 10000 + self.month as i32 * 100 + self.day as i32
    }
    pub const fn year(self) -> i32 {
        self.year
    }
    pub const fn month(self) -> u8 {
        self.month
    }
    pub const fn day(self) -> u8 {
        self.day
    }
}
/// The date as `YYYY-MM-DD`.
impl std::fmt::Display for SaveDate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

/// The values of a save that identify its snapshot.
#[derive(Debug, Clone)]
pub struct SnapshotSource {
    pub campaign_id: String,
    pub content_hash: String,
    pub date: SaveDate,
    pub game_version: String,
}

impl SnapshotDescriptor {
    /// The descriptor of a snapshot of game `G`.
    pub fn new<G: Game>(source: SnapshotSource, layout_key: String) -> Self {
        Self {
            id: snapshot_id(G::GAME, &source.content_hash),
            game: G::GAME.to_owned(),
            campaign_id: source.campaign_id,
            content_hash: source.content_hash,
            date: source.date.to_string(),
            date_sort: source.date.sort_key(),
            game_version: source.game_version,
            layout_key,
            artifacts: G::ARTIFACTS.iter().map(|kind| (*kind).to_owned()).collect(),
        }
    }
    /// The save date, if the two date fields agree.
    pub fn save_date(&self) -> Option<SaveDate> {
        SaveDate::from_sort_key(self.date_sort).filter(|date| date.to_string() == self.date)
    }
}

/// Equal content from the same game gives the same snapshot.
pub fn snapshot_id(game: &str, content_hash: &str) -> String {
    format!("{game}:{content_hash}")
}

/// The common fields and the game fields of a snapshot. JavaScript reads
/// them in one object. In TypeScript this is `Descriptor<D>`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Descriptor<D> {
    #[serde(flatten)]
    pub common: SnapshotDescriptor,
    #[serde(flatten)]
    pub detail: D,
}
