use crate::columns::{Columns, DecodeError};
use crate::snapshot::encode;
use crate::{Descriptor, Game, Observation, SnapshotDescriptor, snapshot_id};
use serde::Serialize;
use std::cell::OnceCell;
use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;

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

/// A snapshot in the store. It does not change.
#[derive(Debug)]
pub struct Snapshot<G: Game> {
    descriptor: SnapshotDescriptor,
    detail: G::Detail,
    layout: Rc<Layout>,
    payload: G::Payload,
}

impl<G: Game> Snapshot<G> {
    pub fn descriptor(&self) -> &SnapshotDescriptor {
        &self.descriptor
    }

    pub fn detail(&self) -> &G::Detail {
        &self.detail
    }

    pub fn layout(&self) -> &Layout {
        &self.layout
    }

    pub fn payload(&self) -> &G::Payload {
        &self.payload
    }

    /// The common fields and the game fields.
    pub fn described(&self) -> Descriptor<G::Detail> {
        Descriptor {
            common: self.descriptor.clone(),
            detail: self.detail.clone(),
        }
    }

    /// The binary form, as the parser gave it.
    pub fn encode(&self) -> Vec<u8> {
        encode::<G>(
            &self.descriptor,
            &self.detail,
            &self.layout.ids,
            &self.payload,
        )
    }

    /// The sum of a value over a fixed set of geographic IDs. If the layout
    /// does not have one of the IDs, or the set is empty, the sum is a gap.
    pub fn sum(&self, ids: &[u32], value: impl Fn(usize) -> f64) -> Option<f64> {
        if ids.is_empty() {
            return None;
        }
        let mut total = 0.0;
        for id in ids {
            total += value(self.layout.row(*id)?);
        }
        Some(total)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnalysisError {
    /// The request is from a generation that a clear or a new worker ended.
    Stale,
    WrongGame {
        game: &'static str,
        version: u32,
    },
    Decode(DecodeError),
    InvalidDescriptor,
    OtherCampaign,
    DateConflict {
        date: String,
    },
    Payload(String),
    IncompatibleLayout,
    MemoryFull,
    Missing,
}

/// The error names that JavaScript reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub enum AnalysisErrorName {
    AnalysisStaleGeneration,
    AnalysisMemoryLimit,
    Error,
}

impl AnalysisErrorName {
    pub fn as_str(self) -> &'static str {
        match self {
            AnalysisErrorName::AnalysisStaleGeneration => "AnalysisStaleGeneration",
            AnalysisErrorName::AnalysisMemoryLimit => "AnalysisMemoryLimit",
            AnalysisErrorName::Error => "Error",
        }
    }
}

impl AnalysisError {
    pub fn name(&self) -> AnalysisErrorName {
        match self {
            AnalysisError::Stale => AnalysisErrorName::AnalysisStaleGeneration,
            AnalysisError::MemoryFull => AnalysisErrorName::AnalysisMemoryLimit,
            _ => AnalysisErrorName::Error,
        }
    }
}

impl From<DecodeError> for AnalysisError {
    fn from(error: DecodeError) -> Self {
        AnalysisError::Decode(error)
    }
}

impl fmt::Display for AnalysisError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AnalysisError::Stale => write!(f, "Campaign analysis was cleared during the import"),
            AnalysisError::WrongGame { game, version } => write!(
                f,
                "This store accepts {game} snapshots from extractor {version}"
            ),
            AnalysisError::Decode(error) => error.fmt(f),
            AnalysisError::InvalidDescriptor => write!(f, "Invalid snapshot descriptor"),
            AnalysisError::OtherCampaign => write!(f, "This analysis keeps another campaign"),
            AnalysisError::DateConflict { date } => write!(
                f,
                "A different save already occupies {date}. Separate alternate campaign branches before importing."
            ),
            AnalysisError::Payload(message) => write!(f, "{message}"),
            AnalysisError::IncompatibleLayout => write!(f, "Incompatible analytical map layout"),
            AnalysisError::MemoryFull => write!(
                f,
                "Campaign analysis is full. It has no memory for more snapshots."
            ),
            AnalysisError::Missing => write!(
                f,
                "This observation is no longer available. Import the original saves again."
            ),
        }
    }
}

impl std::error::Error for AnalysisError {}

#[derive(Debug, Clone, PartialEq)]
pub struct Appended<D> {
    pub descriptor: Descriptor<D>,
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
    /// The WASM memory of the worker. It does not shrink until the worker
    /// stops. Zero outside WASM.
    pub wasm_bytes: usize,
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
            .map(|snapshot| snapshot.descriptor.campaign_id.as_str())
    }

    /// Add a snapshot. All bytes of the store, with the bytes that it adds,
    /// must fit in `limit_bytes`.
    pub fn append(
        &mut self,
        observation: Observation<G>,
        limit_bytes: usize,
    ) -> Result<Appended<G::Detail>, AnalysisError> {
        let Observation {
            descriptor,
            detail,
            ids,
            payload,
        } = observation;
        if descriptor.game != G::GAME || descriptor.extractor_version != G::EXTRACTOR_VERSION {
            return Err(AnalysisError::WrongGame {
                game: G::GAME,
                version: G::EXTRACTOR_VERSION,
            });
        }
        if descriptor.content_hash.is_empty()
            || descriptor.campaign_id.is_empty()
            || descriptor.id
                != snapshot_id(
                    &descriptor.game,
                    descriptor.extractor_version,
                    &descriptor.content_hash,
                )
        {
            return Err(AnalysisError::InvalidDescriptor);
        }
        if self
            .campaign()
            .is_some_and(|campaign| campaign != descriptor.campaign_id)
        {
            return Err(AnalysisError::OtherCampaign);
        }
        if let Some(existing) = self.get(&descriptor.id) {
            return Ok(Appended {
                descriptor: existing.described(),
                duplicate: true,
            });
        }
        if self
            .snapshots
            .iter()
            .any(|snapshot| snapshot.descriptor.date_sort == descriptor.date_sort)
        {
            return Err(AnalysisError::DateConflict {
                date: descriptor.date,
            });
        }

        G::validate(ids.len(), &payload).map_err(AnalysisError::Payload)?;
        let shared = self.layouts.get(&descriptor.layout_key);
        if shared.is_some_and(|layout| layout.ids != ids) {
            return Err(AnalysisError::IncompatibleLayout);
        }
        let layout_bytes = if shared.is_some() {
            0
        } else {
            ids.len() * size_of::<u32>()
        };
        let added = payload.heap_bytes() + layout_bytes;
        if self.bytes + added > limit_bytes {
            return Err(AnalysisError::MemoryFull);
        }

        // Commit. Nothing below can fail.
        let layout = match shared {
            Some(layout) => Rc::clone(layout),
            None => {
                let layout = Rc::new(Layout {
                    key: descriptor.layout_key.clone(),
                    ids,
                    rows: OnceCell::new(),
                });
                self.layouts
                    .insert(descriptor.layout_key.clone(), Rc::clone(&layout));
                layout
            }
        };
        self.bytes += added;
        let at = self.snapshots.partition_point(|snapshot| {
            (snapshot.descriptor.date_sort, &snapshot.descriptor.id)
                < (descriptor.date_sort, &descriptor.id)
        });
        let snapshot = Snapshot {
            descriptor,
            detail,
            layout,
            payload,
        };
        let described = snapshot.described();
        self.snapshots.insert(at, snapshot);
        Ok(Appended {
            descriptor: described,
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
            .find(|snapshot| snapshot.descriptor.id == id)
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
            wasm_bytes: 0,
        }
    }
}
