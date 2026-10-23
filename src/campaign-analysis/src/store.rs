use crate::columns::{Columns, DecodeError};
use crate::snapshot::encode;
use crate::{Descriptor, Game, Observation, SnapshotDescriptor, snapshot_id};
use serde::Serialize;
use std::fmt;

/// A snapshot in the store. It does not change.
#[derive(Debug)]
pub struct Snapshot<G: Game> {
    descriptor: SnapshotDescriptor,
    detail: G::Detail,
    payload: G::Payload,
}

impl<G: Game> Snapshot<G> {
    pub fn descriptor(&self) -> &SnapshotDescriptor {
        &self.descriptor
    }

    pub fn detail(&self) -> &G::Detail {
        &self.detail
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
        encode::<G>(&self.descriptor, &self.detail, &self.payload)
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
    Table(crate::TableError),
    InvalidDescriptor,
    OtherCampaign,
    DateConflict {
        date: String,
    },
    Payload(crate::PayloadError),
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

impl From<crate::TableError> for AnalysisError {
    fn from(error: crate::TableError) -> Self {
        Self::Table(error)
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
            AnalysisError::Table(error) => error.fmt(f),
            AnalysisError::InvalidDescriptor => write!(f, "Invalid snapshot descriptor"),
            AnalysisError::OtherCampaign => write!(f, "This analysis keeps another campaign"),
            AnalysisError::DateConflict { date } => write!(
                f,
                "A different save already occupies {date}. Separate alternate campaign branches before importing."
            ),
            AnalysisError::Payload(message) => write!(f, "Invalid payload: {message}"),
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

impl std::error::Error for AnalysisError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Decode(error) => Some(error),
            Self::Table(error) => Some(error),
            Self::Payload(error) => Some(error),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Appended<D> {
    pub descriptor: Descriptor<D>,
    pub duplicate: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct StoreMemory {
    /// Retained column data and shared key data. The admission limit uses
    /// this count. Registry overhead and spare capacity are excluded.
    pub buffer_bytes: usize,
    /// Diagnostic column and key capacity. The limit does not use this count.
    /// Registry overhead is excluded.
    pub allocated_bytes: usize,
    pub allocated_column_bytes: usize,
    pub allocated_key_bytes: usize,
    pub snapshots: usize,
    /// The number of shared key indexes, including analytical tables.
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
    shared: G::Shared,
    bytes: usize,
}

impl<G: Game> Default for Store<G> {
    fn default() -> Self {
        Self {
            snapshots: Vec::new(),
            shared: G::Shared::default(),
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

    /// Add a snapshot if retained data fits in `limit_bytes`. Count column
    /// data and shared key data once. The snapshot is already in memory.
    /// Temporary data, spare capacity, and registry overhead are excluded.
    pub fn append(
        &mut self,
        observation: Observation<G>,
        limit_bytes: usize,
    ) -> Result<Appended<G::Detail>, AnalysisError> {
        let Observation {
            descriptor,
            detail,
            mut payload,
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
        let at = self
            .snapshots
            .partition_point(|snapshot| snapshot.descriptor.date_sort < descriptor.date_sort);
        if self
            .snapshots
            .get(at)
            .is_some_and(|snapshot| snapshot.descriptor.date_sort == descriptor.date_sort)
        {
            return Err(AnalysisError::DateConflict {
                date: descriptor.date,
            });
        }
        let prepared = G::prepare(&mut payload, &descriptor.layout_key, &self.shared)?;
        let added = payload
            .heap_bytes()
            .checked_add(G::added_bytes(&prepared))
            .ok_or(AnalysisError::MemoryFull)?;
        let total = self
            .bytes
            .checked_add(added)
            .filter(|total| *total <= limit_bytes)
            .ok_or(AnalysisError::MemoryFull)?;

        // Commit has no recoverable errors.
        G::commit(&mut self.shared, prepared);
        self.bytes = total;
        let snapshot = Snapshot {
            descriptor,
            detail,
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
        let shared = G::shared_memory(&self.shared);
        let columns = self
            .snapshots
            .iter()
            .map(|snapshot| snapshot.payload.allocated_bytes())
            .sum::<usize>();
        StoreMemory {
            buffer_bytes: self.bytes,
            snapshots: self.snapshots.len(),
            allocated_bytes: columns + shared.allocated_bytes,
            allocated_column_bytes: columns,
            allocated_key_bytes: shared.allocated_bytes,
            layouts: shared.indexes,
            index_bytes: shared.lookup_bytes,
            wasm_bytes: 0,
        }
    }
}
