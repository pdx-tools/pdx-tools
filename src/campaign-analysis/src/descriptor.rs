use crate::Game;
use jomini::common::{Date, PdsDate};
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

/// A save date as `YYYYMMDD`, which sorts in date order: the year times
/// 10000, plus the month times 100, plus the day, also before year 0.
pub fn date_sort(date: Date) -> i32 {
    i32::from(date.year()) * 10000 + i32::from(date.month()) * 100 + i32::from(date.day())
}

/// The save date of a `YYYYMMDD` sort key. The month and day of a year
/// before 0 count up from the year, as they do after it.
pub fn date_from_sort(key: i32) -> Option<Date> {
    let year = i16::try_from(key.div_euclid(10000)).ok()?;
    let rest = key.rem_euclid(10000);
    Date::from_ymd_opt(
        year,
        u8::try_from(rest / 100).ok()?,
        u8::try_from(rest % 100).ok()?,
    )
}

/// The values of a save that identify its snapshot.
#[derive(Debug, Clone)]
pub struct SnapshotSource {
    pub campaign_id: String,
    pub content_hash: String,
    /// The in-game date. The game calendar has no leap days.
    pub date: Date,
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
            date: source.date.iso_8601().to_string(),
            date_sort: date_sort(source.date),
            game_version: source.game_version,
            layout_key,
            artifacts: G::ARTIFACTS.iter().map(|kind| (*kind).to_owned()).collect(),
        }
    }
    /// The save date, if the two date fields agree.
    pub fn save_date(&self) -> Option<Date> {
        date_from_sort(self.date_sort).filter(|date| date.iso_8601().to_string() == self.date)
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
