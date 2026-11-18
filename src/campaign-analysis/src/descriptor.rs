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

/// The in-game date of a save.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SaveDate {
    pub year: i32,
    pub month: u8,
    pub day: u8,
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
        let SaveDate { year, month, day } = source.date;
        Self {
            id: snapshot_id(G::GAME, &source.content_hash),
            game: G::GAME.to_owned(),
            campaign_id: source.campaign_id,
            content_hash: source.content_hash,
            date: format!("{year:04}-{month:02}-{day:02}"),
            date_sort: year * 10000 + i32::from(month) * 100 + i32::from(day),
            game_version: source.game_version,
            layout_key,
            artifacts: G::ARTIFACTS.iter().map(|kind| (*kind).to_owned()).collect(),
        }
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
