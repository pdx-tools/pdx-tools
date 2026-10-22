use crate::{Game, Snapshot, Store};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

/// The snapshots that a query reads.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Selection {
    #[default]
    All,
    Ids {
        ids: Vec<String>,
    },
}

/// The selected snapshots of one campaign, in date order. Queries read
/// only these snapshots.
#[derive(Debug)]
pub struct View<'a, G: Game> {
    snapshots: Vec<&'a Snapshot<G>>,
}

impl<'a, G: Game> View<'a, G> {
    /// The store keeps one campaign, so another campaign selects nothing.
    pub fn select(store: &'a Store<G>, campaign_id: &str, selection: &Selection) -> Self {
        let snapshots = if store.campaign() != Some(campaign_id) {
            Vec::new()
        } else {
            match selection {
                Selection::All => store.snapshots().iter().collect(),
                Selection::Ids { ids } => store
                    .snapshots()
                    .iter()
                    .filter(|snapshot| ids.contains(&snapshot.descriptor().id))
                    .collect(),
            }
        };
        Self { snapshots }
    }

    pub fn snapshots(&self) -> &[&'a Snapshot<G>] {
        &self.snapshots
    }

    pub fn ids(&self) -> Vec<String> {
        self.snapshots
            .iter()
            .map(|snapshot| snapshot.descriptor().id.clone())
            .collect()
    }

    /// One value for each snapshot, in date order.
    pub fn series(&self, read: impl Fn(&Snapshot<G>) -> Option<f64>) -> History {
        let rows = self
            .snapshots
            .iter()
            .map(|snapshot| {
                let descriptor = snapshot.descriptor();
                HistoryRow {
                    id: descriptor.id.clone(),
                    content_hash: descriptor.content_hash.clone(),
                    date: descriptor.date.clone(),
                    date_sort: descriptor.date_sort,
                    game_version: descriptor.game_version.clone(),
                    value: read(snapshot),
                }
            })
            .collect();
        History { rows }
    }
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
pub struct History {
    pub rows: Vec<HistoryRow>,
}

/// The queries of a game. Use [`queries!`](crate::queries) to declare them.
pub trait Query<G: Game>: DeserializeOwned {
    type Answer: Serialize;
    fn answer(self, view: &View<'_, G>) -> Self::Answer;
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest<Q> {
    pub generation: u32,
    pub campaign_id: String,
    /// All snapshots of the campaign when not given.
    #[serde(default)]
    pub selection: Selection,
    pub query: Q,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct QueryReply<A> {
    /// The generation of the session that answered.
    pub generation: u32,
    /// The snapshots that the query read, in date order.
    pub snapshot_ids: Vec<String>,
    pub outcome: QueryOutcome<A>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum QueryOutcome<A> {
    Ok {
        answer: A,
    },
    /// The request is from another session generation.
    Stale,
}

/// Declare the queries of a game: a query enum, an answer enum with one
/// variant of the same name for each query, and the function that answers
/// each query. The answer of a query always has its kind, so TypeScript can
/// find the answer type of each query from the two enums.
///
/// ```ignore
/// campaign_analysis::queries! {
///     pub enum Eu4Query for Eu4Analysis => Eu4Answer {
///         WorldDevelopment => History = world_development,
///         ProvinceDevelopment { province_ids: Vec<u32> } => History = province_development,
///     }
/// }
/// ```
///
/// Each function takes the view and then the fields of its query.
#[macro_export]
macro_rules! queries {
    (
        $(#[$meta:meta])*
        $vis:vis enum $query:ident for $game:ty => $answer:ident {
            $(
                $(#[$variant_meta:meta])*
                $variant:ident $({ $($field:ident : $field_ty:ty),* $(,)? })? => $output:ty = $run:path
            ),* $(,)?
        }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, serde::Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
        $vis enum $query {
            $(
                $(#[$variant_meta])*
                $variant $({ $($field: $field_ty),* })?
            ),*
        }

        #[derive(Debug, Clone, serde::Serialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[serde(tag = "kind", content = "value", rename_all = "camelCase")]
        $vis enum $answer {
            $($variant($output)),*
        }

        impl $crate::Query<$game> for $query {
            type Answer = $answer;

            fn answer(self, view: &$crate::View<'_, $game>) -> $answer {
                match self {
                    $(
                        $query::$variant $({ $($field),* })? =>
                            $answer::$variant($run(view $($(, $field)*)?)),
                    )*
                }
            }
        }
    };
}
