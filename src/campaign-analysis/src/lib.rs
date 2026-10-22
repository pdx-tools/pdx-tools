//! Keeps the compact observations of the saves of one campaign and reads
//! values across their dates. Each game gives the payload format and the
//! rules that make the values.

use serde::{Deserialize, Serialize};
use std::cell::OnceCell;
use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

/// The fields that each game gives for a snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct SnapshotDescriptor {
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
    pub extractor_version: u32,
    pub artifacts: Vec<String>,
}

/// Equal content from the same extractor gives the same snapshot.
pub fn snapshot_id(game: &str, extractor_version: u32, content_hash: &str) -> String {
    format!("{game}:{extractor_version}:{content_hash}")
}

/// The snapshot rules of one game and one extractor version.
pub trait Game {
    const GAME: &'static str;
    const EXTRACTOR_VERSION: u32;
    type Descriptor: Clone + fmt::Debug;
    type Payload: fmt::Debug;

    fn common(descriptor: &Self::Descriptor) -> &SnapshotDescriptor;

    /// Refuse a payload that is incomplete or does not agree with its
    /// descriptor or with the IDs of its layout.
    fn validate(
        descriptor: &Self::Descriptor,
        layout_key: &str,
        ids: &[u32],
        payload: &Self::Payload,
    ) -> Result<(), String>;

    /// The bytes that the payload keeps, without the IDs of its layout.
    fn payload_bytes(payload: &Self::Payload) -> usize;
}

/// Geographic IDs in row order. Snapshots with equal IDs share one layout.
#[derive(Debug)]
pub struct Layout {
    key: String,
    ids: Vec<u32>,
    rows: OnceCell<HashMap<u32, usize>>,
}

// A map entry with small integer keys and values, with its overhead.
const INDEX_ENTRY_BYTES: usize = 16;

impl Layout {
    pub fn key(&self) -> &str {
        &self.key
    }

    pub fn ids(&self) -> &[u32] {
        &self.ids
    }

    /// The row of a geographic ID.
    pub fn row(&self, id: u32) -> Option<usize> {
        let rows = self.rows.get_or_init(|| {
            let mut rows = HashMap::with_capacity(self.ids.len());
            for (row, id) in self.ids.iter().enumerate() {
                rows.insert(*id, row);
            }
            rows
        });
        rows.get(&id).copied()
    }

    fn index_bytes(&self) -> usize {
        self.rows
            .get()
            .map_or(0, |rows| rows.capacity() * INDEX_ENTRY_BYTES)
    }
}

#[derive(Debug)]
pub struct Snapshot<G: Game> {
    pub descriptor: G::Descriptor,
    pub layout: Rc<Layout>,
    pub payload: G::Payload,
}

impl<G: Game> Snapshot<G> {
    pub fn common(&self) -> &SnapshotDescriptor {
        G::common(&self.descriptor)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppendError {
    WrongGame { game: &'static str, version: u32 },
    InvalidDescriptor,
    OtherCampaign,
    DateConflict { date: String },
    Payload(String),
    IncompatibleLayout,
    MemoryFull,
}

impl fmt::Display for AppendError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppendError::WrongGame { game, version } => write!(
                f,
                "This store accepts {game} snapshots from extractor {version}"
            ),
            AppendError::InvalidDescriptor => write!(f, "Invalid snapshot descriptor"),
            AppendError::OtherCampaign => write!(f, "This analysis keeps another campaign"),
            AppendError::DateConflict { date } => write!(
                f,
                "A different save already occupies {date}. Separate alternate campaign branches before importing."
            ),
            AppendError::Payload(message) => write!(f, "{message}"),
            AppendError::IncompatibleLayout => write!(f, "Incompatible analytical map layout"),
            AppendError::MemoryFull => write!(
                f,
                "Campaign analysis is full. It has no memory for more snapshots."
            ),
        }
    }
}

impl AppendError {
    /// The error name that the TypeScript client reads.
    pub fn name(&self) -> &'static str {
        match self {
            AppendError::MemoryFull => "AnalysisMemoryLimit",
            _ => "Error",
        }
    }
}

impl std::error::Error for AppendError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Appended<D> {
    pub descriptor: D,
    pub duplicate: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct StoreMemory {
    /// Strict: the bytes of the payloads and the layout IDs, each layout once.
    pub buffer_bytes: usize,
    pub snapshots: usize,
    pub layouts: usize,
    /// An estimate of the row indexes of the layouts. It is not part of the limit.
    pub index_bytes: usize,
}

/// The snapshots that a query reads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Selection {
    All,
    Ids { ids: Vec<String> },
}

/// One value for each snapshot that a query read. A missing value is null.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(missing_as_null))]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    pub id: String,
    pub content_hash: String,
    pub date: String,
    pub date_sort: i32,
    pub game_version: String,
    pub value: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(missing_as_null))]
pub struct History {
    pub rows: Vec<HistoryRow>,
}

/// Read one value from each snapshot, in the order given.
pub fn history<'a, G: Game + 'a>(
    snapshots: impl IntoIterator<Item = &'a Snapshot<G>>,
    read: impl Fn(&Snapshot<G>) -> Option<f64>,
) -> History {
    let rows = snapshots
        .into_iter()
        .map(|snapshot| {
            let common = snapshot.common();
            HistoryRow {
                id: common.id.clone(),
                content_hash: common.content_hash.clone(),
                date: common.date.clone(),
                date_sort: common.date_sort,
                game_version: common.game_version.clone(),
                value: read(snapshot),
            }
        })
        .collect();
    History { rows }
}

/// The sum of one value over a fixed set of geographic IDs. If the layout
/// does not have one of the IDs, or the set is empty, the sum is a gap.
pub fn sum_ids(layout: &Layout, ids: &[u32], value: impl Fn(usize) -> f64) -> Option<f64> {
    if ids.is_empty() {
        return None;
    }
    let mut total = 0.0;
    for id in ids {
        total += value(layout.row(*id)?);
    }
    Some(total)
}

/// Immutable snapshots of one campaign, in date order. An append never
/// copies earlier snapshots, and an append that fails changes nothing.
#[derive(Debug)]
pub struct Store<G: Game> {
    snapshots: Vec<Snapshot<G>>,
    layouts: HashMap<String, Rc<Layout>>,
    bytes: usize,
}

impl<G: Game> Default for Store<G> {
    fn default() -> Self {
        Self {
            snapshots: Vec::new(),
            layouts: HashMap::new(),
            bytes: 0,
        }
    }
}

impl<G: Game> Store<G> {
    pub fn new() -> Self {
        Self::default()
    }

    /// The campaign of the snapshots, if the store has any.
    pub fn campaign(&self) -> Option<&str> {
        self.snapshots
            .first()
            .map(|snapshot| snapshot.common().campaign_id.as_str())
    }

    /// Add a snapshot. All bytes of the store, with the bytes that it adds,
    /// must fit in `limit_bytes`.
    pub fn append(
        &mut self,
        descriptor: G::Descriptor,
        layout_key: String,
        ids: Vec<u32>,
        payload: G::Payload,
        limit_bytes: usize,
    ) -> Result<Appended<G::Descriptor>, AppendError> {
        let common = G::common(&descriptor);
        if common.game != G::GAME || common.extractor_version != G::EXTRACTOR_VERSION {
            return Err(AppendError::WrongGame {
                game: G::GAME,
                version: G::EXTRACTOR_VERSION,
            });
        }
        if common.content_hash.is_empty()
            || common.campaign_id.is_empty()
            || common.id
                != snapshot_id(&common.game, common.extractor_version, &common.content_hash)
        {
            return Err(AppendError::InvalidDescriptor);
        }
        if self
            .campaign()
            .is_some_and(|campaign| campaign != common.campaign_id)
        {
            return Err(AppendError::OtherCampaign);
        }
        if let Some(existing) = self
            .snapshots
            .iter()
            .find(|snapshot| snapshot.common().id == common.id)
        {
            return Ok(Appended {
                descriptor: existing.descriptor.clone(),
                duplicate: true,
            });
        }
        if self
            .snapshots
            .iter()
            .any(|snapshot| snapshot.common().date_sort == common.date_sort)
        {
            return Err(AppendError::DateConflict {
                date: common.date.clone(),
            });
        }

        G::validate(&descriptor, &layout_key, &ids, &payload).map_err(AppendError::Payload)?;
        let shared = self.layouts.get(&layout_key);
        if shared.is_some_and(|layout| layout.ids != ids) {
            return Err(AppendError::IncompatibleLayout);
        }
        let layout_bytes = if shared.is_some() {
            0
        } else {
            ids.len() * size_of::<u32>()
        };
        let added = G::payload_bytes(&payload) + layout_bytes;
        if self.bytes + added > limit_bytes {
            return Err(AppendError::MemoryFull);
        }

        // Commit. Nothing below can fail.
        let layout = match shared {
            Some(layout) => Rc::clone(layout),
            None => {
                let layout = Rc::new(Layout {
                    key: layout_key.clone(),
                    ids,
                    rows: OnceCell::new(),
                });
                self.layouts.insert(layout_key, Rc::clone(&layout));
                layout
            }
        };
        self.bytes += added;
        let key = (common.date_sort, common.id.clone());
        let at = self.snapshots.partition_point(|snapshot| {
            (snapshot.common().date_sort, &snapshot.common().id) < (key.0, &key.1)
        });
        self.snapshots.insert(
            at,
            Snapshot {
                descriptor: descriptor.clone(),
                layout,
                payload,
            },
        );
        Ok(Appended {
            descriptor,
            duplicate: false,
        })
    }

    /// The snapshots in date order.
    pub fn snapshots(&self) -> &[Snapshot<G>] {
        &self.snapshots
    }

    pub fn get(&self, id: &str) -> Option<&Snapshot<G>> {
        self.snapshots
            .iter()
            .find(|snapshot| snapshot.common().id == id)
    }

    /// The selected snapshots of a campaign in date order. The store keeps
    /// one campaign, so another campaign selects nothing.
    pub fn select(&self, campaign_id: &str, selection: &Selection) -> Vec<&Snapshot<G>> {
        if self.campaign() != Some(campaign_id) {
            return Vec::new();
        }
        match selection {
            Selection::All => self.snapshots.iter().collect(),
            Selection::Ids { ids } => self
                .snapshots
                .iter()
                .filter(|snapshot| ids.contains(&snapshot.common().id))
                .collect(),
        }
    }

    pub fn clear(&mut self) {
        *self = Self::default();
    }

    pub fn memory(&self) -> StoreMemory {
        StoreMemory {
            buffer_bytes: self.bytes,
            snapshots: self.snapshots.len(),
            layouts: self.layouts.len(),
            index_bytes: self
                .layouts
                .values()
                .map(|layout| layout.index_bytes())
                .sum(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A game-neutral payload: one value for each geographic ID.
    struct TestGame;

    impl Game for TestGame {
        const GAME: &'static str = "test";
        const EXTRACTOR_VERSION: u32 = 3;
        type Descriptor = SnapshotDescriptor;
        type Payload = Vec<f64>;

        fn common(descriptor: &SnapshotDescriptor) -> &SnapshotDescriptor {
            descriptor
        }

        fn validate(
            _descriptor: &SnapshotDescriptor,
            _layout_key: &str,
            ids: &[u32],
            payload: &Vec<f64>,
        ) -> Result<(), String> {
            if payload.len() == ids.len() {
                Ok(())
            } else {
                Err(String::from("Incomplete columns"))
            }
        }

        fn payload_bytes(payload: &Vec<f64>) -> usize {
            payload.len() * size_of::<f64>()
        }
    }

    // One snapshot keeps 8 bytes of IDs and 16 bytes of values.
    const IDS: usize = 8;
    const VALUES: usize = 16;

    fn descriptor(hash: &str, date_sort: i32) -> SnapshotDescriptor {
        SnapshotDescriptor {
            id: snapshot_id("test", 3, hash),
            game: String::from("test"),
            campaign_id: String::from("campaign"),
            content_hash: String::from(hash),
            date: date_sort.to_string(),
            date_sort,
            game_version: String::from("1.0"),
            extractor_version: 3,
            artifacts: vec![String::from("observations")],
        }
    }

    fn append(
        store: &mut Store<TestGame>,
        descriptor: SnapshotDescriptor,
        layout: &str,
        ids: &[u32],
        limit: usize,
    ) -> Result<Appended<SnapshotDescriptor>, AppendError> {
        let values = ids.iter().map(|id| f64::from(*id) * 10.0).collect();
        store.append(descriptor, layout.to_owned(), ids.to_vec(), values, limit)
    }

    fn hashes(store: &Store<TestGame>) -> Vec<&str> {
        store
            .snapshots()
            .iter()
            .map(|snapshot| snapshot.descriptor.content_hash.as_str())
            .collect()
    }

    #[test]
    fn appends_in_either_order_and_keeps_one_copy_of_equal_layouts() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("later", 13600401),
            "layout",
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        assert_eq!(store.memory().buffer_bytes, IDS + VALUES);
        append(
            &mut store,
            descriptor("first", 13600101),
            "layout",
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        assert_eq!(hashes(&store), ["first", "later"]);
        assert!(Rc::ptr_eq(
            &store.snapshots()[0].layout,
            &store.snapshots()[1].layout
        ));
        assert_eq!(
            store.memory(),
            StoreMemory {
                buffer_bytes: IDS + VALUES * 2,
                snapshots: 2,
                layouts: 1,
                index_bytes: 0,
            }
        );
    }

    #[test]
    fn does_not_count_a_duplicate() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("first", 13600101),
            "layout",
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        let before = store.memory();
        let result = append(
            &mut store,
            descriptor("first", 13600101),
            "layout",
            &[42, 43],
            0,
        )
        .unwrap();
        assert!(result.duplicate);
        assert_eq!(store.memory(), before);
    }

    #[test]
    fn refuses_each_invalid_append_and_leaves_the_store_unchanged() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("first", 13600101),
            "layout",
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        let before = store.memory();
        // The limit has room for one more snapshot with a shared layout.
        let limit = before.buffer_bytes + VALUES;
        let next = || descriptor("x", 13600401);
        let other_game = SnapshotDescriptor {
            game: String::from("other"),
            ..next()
        };
        let other_version = SnapshotDescriptor {
            extractor_version: 2,
            ..next()
        };
        let bad_id = SnapshotDescriptor {
            id: String::from("x"),
            ..next()
        };
        let no_campaign = SnapshotDescriptor {
            campaign_id: String::new(),
            ..next()
        };
        let other_campaign = SnapshotDescriptor {
            campaign_id: String::from("second"),
            ..next()
        };
        let refusals = [
            (
                descriptor("alternate", 13600101),
                "layout",
                vec![42, 43],
                "already occupies",
            ),
            (
                other_game,
                "layout",
                vec![42, 43],
                "accepts test snapshots from extractor 3",
            ),
            (other_version, "layout", vec![42, 43], "extractor 3"),
            (
                bad_id,
                "layout",
                vec![42, 43],
                "Invalid snapshot descriptor",
            ),
            (
                no_campaign,
                "layout",
                vec![42, 43],
                "Invalid snapshot descriptor",
            ),
            (other_campaign, "layout", vec![42, 43], "another campaign"),
            (next(), "layout", vec![42, 44], "Incompatible"),
            // A new layout adds its IDs, so it does not fit.
            (next(), "other", vec![42, 43], "Campaign analysis is full"),
        ];
        for (row, layout, ids, message) in refusals {
            let error = append(&mut store, row, layout, &ids, limit).unwrap_err();
            assert!(error.to_string().contains(message), "{error}");
            assert_eq!(store.memory(), before);
            assert_eq!(store.snapshots().len(), 1);
        }
        let incomplete = store.append(
            next(),
            String::from("layout"),
            vec![42, 43],
            vec![1.0],
            limit,
        );
        assert_eq!(
            incomplete.unwrap_err(),
            AppendError::Payload(String::from("Incomplete columns"))
        );
        assert_eq!(
            append(&mut store, next(), "other", &[42, 43], limit).unwrap_err(),
            AppendError::MemoryFull
        );
        // A shared layout adds only the values, so this fits.
        append(&mut store, next(), "layout", &[42, 43], limit).unwrap();
        assert_eq!(store.memory().buffer_bytes, IDS + VALUES * 2);
    }

    #[test]
    fn selects_one_campaign_in_date_order() {
        let mut store = Store::<TestGame>::new();
        for (hash, date) in [("b", 14100101), ("c", 14200101), ("a", 14000101)] {
            append(
                &mut store,
                descriptor(hash, date),
                "layout",
                &[42],
                usize::MAX,
            )
            .unwrap();
        }
        let ids = |selected: Vec<&Snapshot<TestGame>>| {
            selected
                .iter()
                .map(|snapshot| snapshot.descriptor.content_hash.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            ids(store.select("campaign", &Selection::All)),
            ["a", "b", "c"]
        );
        let some = Selection::Ids {
            ids: vec![
                snapshot_id("test", 3, "c"),
                snapshot_id("test", 3, "a"),
                snapshot_id("test", 3, "missing"),
            ],
        };
        assert_eq!(ids(store.select("campaign", &some)), ["a", "c"]);
        assert!(store.select("other", &Selection::All).is_empty());
    }

    #[test]
    fn reads_history_and_sums_fixed_ids_with_gaps() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("a", 14000101),
            "two",
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        append(
            &mut store,
            descriptor("b", 14100101),
            "one",
            &[42],
            usize::MAX,
        )
        .unwrap();
        let sum = |ids: &[u32]| {
            history(store.select("campaign", &Selection::All), |snapshot| {
                sum_ids(&snapshot.layout, ids, |row| snapshot.payload[row])
            })
            .rows
            .into_iter()
            .map(|row| (row.date_sort, row.value))
            .collect::<Vec<_>>()
        };
        assert_eq!(sum(&[42, 43]), [(14000101, Some(850.0)), (14100101, None)]);
        assert_eq!(
            sum(&[42]),
            [(14000101, Some(420.0)), (14100101, Some(420.0))]
        );
        assert_eq!(sum(&[]), [(14000101, None), (14100101, None)]);
        assert!(store.memory().index_bytes > 0);
    }

    #[test]
    fn clear_releases_everything() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("a", 14000101),
            "layout",
            &[42],
            usize::MAX,
        )
        .unwrap();
        store.clear();
        assert_eq!(
            store.memory(),
            StoreMemory {
                buffer_bytes: 0,
                snapshots: 0,
                layouts: 0,
                index_bytes: 0,
            }
        );
        assert_eq!(store.campaign(), None);
        // Another save at the same date is accepted after a clear.
        append(
            &mut store,
            descriptor("b", 14000101),
            "layout",
            &[7],
            usize::MAX,
        )
        .unwrap();
    }
}
