//! Keeps the compact observations of the saves of one campaign and answers
//! typed queries across their dates.
//!
//! Each game declares its snapshot with [`Game`] and its queries with
//! [`queries!`]. A parser gives the binary form of a snapshot
//! ([`Observation::encode`]). JavaScript moves those bytes to the analysis
//! worker and does not read them. The worker keeps them in a [`Session`].

mod columns;
mod descriptor;
mod query;
mod session;
mod snapshot;
mod store;
#[cfg(feature = "wasm")]
pub mod wasm;

pub use columns::{Columns, DecodeError, Decoder, Encoder};
pub use descriptor::{
    Descriptor, DescriptorFields, SaveDate, SnapshotDescriptor, SnapshotSource, snapshot_id,
};
pub use query::{
    History, HistoryRow, Query, QueryOutcome, QueryReply, QueryRequest, Selection, View,
};
pub use session::Session;
pub use snapshot::Observation;
pub use store::{AnalysisError, AnalysisErrorName, Appended, Layout, Snapshot, Store, StoreMemory};

use std::fmt;

/// The snapshot rules of one game and one extractor version.
pub trait Game: Sized + 'static {
    const GAME: &'static str;
    /// Changes when the payload or its calculations change.
    const EXTRACTOR_VERSION: u32;
    /// The kinds of data in the payload, such as "observations" or "map".
    const ARTIFACTS: &'static [&'static str];
    /// The descriptor fields of this game.
    type Detail: DescriptorFields;
    /// The columns of a snapshot, without the geographic IDs of its layout.
    type Payload: Columns + fmt::Debug;
    type Query: Query<Self>;

    /// Refuse a payload that does not have `rows` rows.
    fn validate(rows: usize, payload: &Self::Payload) -> Result<(), String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A game-neutral payload: one value for each geographic ID.
    #[derive(Debug)]
    struct TestGame;

    #[derive(Debug, Clone, PartialEq)]
    struct Values {
        values: Vec<f64>,
    }
    columns!(Values { values });

    #[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
    struct Tag {
        tag: u32,
    }
    impl DescriptorFields for Tag {}

    fn sum(view: &View<'_, TestGame>, ids: Vec<u32>) -> History {
        view.sum_over(&ids, |snapshot, row| snapshot.payload().values[row])
    }

    fn count(view: &View<'_, TestGame>) -> usize {
        view.snapshots().len()
    }

    queries! {
        enum TestQuery for TestGame => TestAnswer {
            Sum { ids: Vec<u32> } => History = sum,
            Count => usize = count,
        }
    }

    impl Game for TestGame {
        const GAME: &'static str = "test";
        const EXTRACTOR_VERSION: u32 = 3;
        const ARTIFACTS: &'static [&'static str] = &["observations"];
        type Detail = Tag;
        type Payload = Values;
        type Query = TestQuery;

        fn validate(rows: usize, payload: &Values) -> Result<(), String> {
            if payload.values.len() == rows {
                Ok(())
            } else {
                Err(String::from("Incomplete columns"))
            }
        }
    }

    // One snapshot keeps 8 bytes of IDs and 16 bytes of values.
    const IDS: usize = 8;
    const VALUES: usize = 16;

    fn descriptor(hash: &str, date_sort: i32, layout: &str) -> SnapshotDescriptor {
        SnapshotDescriptor::new::<TestGame>(
            SnapshotSource {
                campaign_id: String::from("campaign"),
                content_hash: String::from(hash),
                date: SaveDate {
                    year: date_sort / 10000,
                    month: (date_sort / 100 % 100) as u8,
                    day: (date_sort % 100) as u8,
                },
                game_version: String::from("1.0"),
            },
            String::from(layout),
        )
    }

    fn observation(descriptor: SnapshotDescriptor, ids: &[u32]) -> Observation<TestGame> {
        Observation {
            descriptor,
            detail: Tag { tag: 7 },
            ids: ids.to_vec(),
            payload: Values {
                values: ids.iter().map(|id| f64::from(*id) * 10.0).collect(),
            },
        }
    }

    fn append(
        store: &mut Store<TestGame>,
        descriptor: SnapshotDescriptor,
        ids: &[u32],
        limit: usize,
    ) -> Result<Appended<Tag>, AnalysisError> {
        store.append(observation(descriptor, ids), limit)
    }

    fn hashes(store: &Store<TestGame>) -> Vec<&str> {
        store
            .snapshots()
            .iter()
            .map(|snapshot| snapshot.descriptor().content_hash.as_str())
            .collect()
    }

    #[test]
    fn makes_the_descriptor_from_the_game_and_the_save() {
        let descriptor = descriptor("hash", 14441111, "layout");
        assert_eq!(descriptor.id, "test:3:hash");
        assert_eq!(descriptor.date, "1444-11-11");
        assert_eq!(descriptor.date_sort, 14441111);
        assert_eq!(descriptor.artifacts, ["observations"]);
    }

    #[test]
    fn the_binary_form_gives_the_same_snapshot() {
        let original = observation(descriptor("a", 14441111, "layout"), &[42, 43]);
        let bytes = original.encode();
        let decoded = Observation::<TestGame>::decode(&bytes).unwrap();
        assert_eq!(decoded.descriptor, original.descriptor);
        assert_eq!(decoded.detail, Tag { tag: 7 });
        assert_eq!(decoded.ids, [42, 43]);
        assert_eq!(decoded.payload, original.payload);

        let mut store = Store::new();
        store.append(decoded, usize::MAX).unwrap();
        assert_eq!(store.snapshots()[0].encode(), bytes);
    }

    #[test]
    fn refuses_other_games_and_damaged_bytes() {
        let bytes = observation(descriptor("a", 14441111, "layout"), &[42]).encode();
        let mut other = descriptor("a", 14441111, "layout");
        other.extractor_version = 2;
        let other = observation(other, &[42]).encode();
        assert_eq!(
            Observation::<TestGame>::decode(&other).unwrap_err(),
            AnalysisError::WrongGame {
                game: "test",
                version: 3
            }
        );
        assert_eq!(
            Observation::<TestGame>::decode(b"nope").unwrap_err(),
            AnalysisError::Decode(DecodeError::NotASnapshot)
        );
        for len in 0..bytes.len() {
            Observation::<TestGame>::decode(&bytes[..len]).unwrap_err();
        }
    }

    #[test]
    fn appends_in_either_order_and_keeps_one_copy_of_equal_layouts() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("later", 13600401, "layout"),
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        assert_eq!(store.memory().buffer_bytes, IDS + VALUES);
        append(
            &mut store,
            descriptor("first", 13600101, "layout"),
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        assert_eq!(hashes(&store), ["first", "later"]);
        assert_eq!(
            store.memory(),
            StoreMemory {
                buffer_bytes: IDS + VALUES * 2,
                snapshots: 2,
                layouts: 1,
                index_bytes: 0,
                wasm_bytes: 0,
            }
        );
    }

    #[test]
    fn does_not_count_a_duplicate() {
        let mut store = Store::<TestGame>::new();
        let first = || descriptor("first", 13600101, "layout");
        append(&mut store, first(), &[42, 43], usize::MAX).unwrap();
        let before = store.memory();
        let result = append(&mut store, first(), &[42, 43], 0).unwrap();
        assert!(result.duplicate);
        assert_eq!(result.descriptor.detail, Tag { tag: 7 });
        assert_eq!(store.memory(), before);
    }

    #[test]
    fn refuses_each_invalid_append_and_leaves_the_store_unchanged() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("first", 13600101, "layout"),
            &[42, 43],
            usize::MAX,
        )
        .unwrap();
        let before = store.memory();
        // The limit has room for one more snapshot with a shared layout.
        let limit = before.buffer_bytes + VALUES;
        let next = || descriptor("x", 13600401, "layout");
        let refusals = [
            (
                descriptor("alternate", 13600101, "layout"),
                vec![42, 43],
                "already occupies",
            ),
            (
                SnapshotDescriptor {
                    game: String::from("other"),
                    ..next()
                },
                vec![42, 43],
                "accepts test snapshots from extractor 3",
            ),
            (
                SnapshotDescriptor {
                    id: String::from("x"),
                    ..next()
                },
                vec![42, 43],
                "Invalid snapshot descriptor",
            ),
            (
                SnapshotDescriptor {
                    campaign_id: String::new(),
                    ..next()
                },
                vec![42, 43],
                "Invalid snapshot descriptor",
            ),
            (
                SnapshotDescriptor {
                    campaign_id: String::from("second"),
                    ..next()
                },
                vec![42, 43],
                "another campaign",
            ),
            (next(), vec![42, 44], "Incompatible"),
            // A new layout adds its IDs, so it does not fit.
            (
                descriptor("x", 13600401, "other"),
                vec![42, 43],
                "Campaign analysis is full",
            ),
        ];
        for (row, ids, message) in refusals {
            let error = append(&mut store, row, &ids, limit).unwrap_err();
            assert!(error.to_string().contains(message), "{error}");
            assert_eq!(store.memory(), before);
        }
        let mut incomplete = observation(next(), &[42, 43]);
        incomplete.payload.values.pop();
        assert_eq!(
            store.append(incomplete, limit).unwrap_err(),
            AnalysisError::Payload(String::from("Incomplete columns"))
        );
        // A shared layout adds only the values, so this fits.
        append(&mut store, next(), &[42, 43], limit).unwrap();
        assert_eq!(store.memory().buffer_bytes, IDS + VALUES * 2);
    }

    fn session() -> Session<TestGame> {
        let mut session = Session::new();
        for (hash, date, ids) in [
            ("b", 14100101, &[42][..]),
            ("c", 14200101, &[42, 43][..]),
            ("a", 14000101, &[42, 43][..]),
        ] {
            let layout = format!("{ids:?}");
            let bytes = observation(descriptor(hash, date, &layout), ids).encode();
            session.append(0, &bytes, usize::MAX).unwrap();
        }
        session
    }

    fn request(query: TestQuery, selection: Selection) -> QueryRequest<TestQuery> {
        QueryRequest {
            generation: 0,
            campaign_id: String::from("campaign"),
            selection,
            query,
        }
    }

    fn answer(session: &Session<TestGame>, request: QueryRequest<TestQuery>) -> TestAnswer {
        match session.query(request).outcome {
            QueryOutcome::Ok { answer } => answer,
            QueryOutcome::Stale => panic!("stale"),
        }
    }

    #[test]
    fn answers_each_query_with_its_own_answer_kind_and_gaps() {
        let session = session();
        let sum =
            |ids: Vec<u32>| match answer(&session, request(TestQuery::Sum { ids }, Selection::All))
            {
                TestAnswer::Sum(history) => history
                    .rows
                    .into_iter()
                    .map(|row| (row.date_sort, row.value))
                    .collect::<Vec<_>>(),
                other => panic!("{other:?}"),
            };
        assert_eq!(
            sum(vec![42, 43]),
            [
                (14000101, Some(850.0)),
                (14100101, None),
                (14200101, Some(850.0))
            ]
        );
        assert_eq!(
            sum(vec![]),
            [(14000101, None), (14100101, None), (14200101, None)]
        );
        // Sorted IDs need no index.
        assert_eq!(session.memory().index_bytes, 0);
    }

    #[test]
    fn finds_the_rows_of_unsorted_ids() {
        let mut store = Store::<TestGame>::new();
        append(
            &mut store,
            descriptor("a", 14000101, "unsorted"),
            &[43, 7, 42],
            usize::MAX,
        )
        .unwrap();
        let layout = store.snapshots()[0].layout();
        assert_eq!(layout.rows(&[42, 43]), Some(vec![2, 0]));
        assert_eq!(layout.rows(&[42, 1]), None);
        assert!(store.memory().index_bytes > 0);
    }

    #[test]
    fn selects_one_campaign_in_date_order() {
        let session = session();
        let some = Selection::Ids {
            ids: vec![
                snapshot_id("test", 3, "c"),
                snapshot_id("test", 3, "a"),
                snapshot_id("test", 3, "missing"),
            ],
        };
        let reply = session.query(request(TestQuery::Count, some));
        assert_eq!(reply.snapshot_ids, ["test:3:a", "test:3:c"]);
        assert!(matches!(
            reply.outcome,
            QueryOutcome::Ok {
                answer: TestAnswer::Count(2)
            }
        ));
        let other = QueryRequest {
            campaign_id: String::from("other"),
            ..request(TestQuery::Count, Selection::All)
        };
        assert!(session.query(other).snapshot_ids.is_empty());
    }

    #[test]
    fn a_new_generation_refuses_old_appends_and_old_queries() {
        let mut session = session();
        let late = observation(descriptor("late", 15000101, "late"), &[1]).encode();
        // A clear of another campaign keeps the snapshots, but ends the generation.
        session.clear(1, Some("other"));
        assert_eq!(session.memory().snapshots, 3);
        assert_eq!(
            session.append(0, &late, usize::MAX).unwrap_err(),
            AnalysisError::Stale
        );
        assert!(matches!(
            session
                .query(request(TestQuery::Count, Selection::All))
                .outcome,
            QueryOutcome::Stale
        ));
        session.clear(2, Some("campaign"));
        assert_eq!(session.memory().snapshots, 0);
        session.open(4);
        assert_eq!(
            AnalysisError::Stale.name().as_str(),
            "AnalysisStaleGeneration"
        );
        assert!(!session.append(4, &late, usize::MAX).unwrap().duplicate);
    }

    #[test]
    fn clear_releases_everything() {
        let mut session = session();
        session.clear(1, None);
        assert_eq!(
            session.memory(),
            StoreMemory {
                buffer_bytes: 0,
                snapshots: 0,
                layouts: 0,
                index_bytes: 0,
                wasm_bytes: 0,
            }
        );
        assert_eq!(session.store().campaign(), None);
        // Another save at the same date is accepted after a clear.
        let bytes = observation(descriptor("z", 14000101, "layout"), &[7]).encode();
        session.append(1, &bytes, usize::MAX).unwrap();
    }
}
