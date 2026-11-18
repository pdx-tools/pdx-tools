use crate::{
    AnalysisError, Appended, Game, Observation, Query, QueryOutcome, QueryReply, QueryRequest,
    Snapshot, Store, StoreMemory, View,
};

/// The store of an analysis worker and its generation.
///
/// The main thread owns the generation. A clear or a new worker changes it,
/// so the session refuses an append from an import that started before, and
/// a query from before gets a stale outcome.
#[derive(Debug)]
pub struct Session<G: Game> {
    store: Store<G>,
    generation: u32,
}

impl<G: Game> Default for Session<G> {
    fn default() -> Self {
        Self {
            store: Store::new(),
            generation: 0,
        }
    }
}

impl<G: Game> Session<G> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn store(&self) -> &Store<G> {
        &self.store
    }

    /// The first call to a new worker.
    pub fn open(&mut self, generation: u32) {
        self.generation = generation;
    }

    /// Store the binary form of a snapshot from an import that started in
    /// `generation`.
    pub fn append(
        &mut self,
        generation: u32,
        data: &[u8],
        limit_bytes: usize,
    ) -> Result<Appended<G::Detail>, AnalysisError> {
        if generation != self.generation {
            return Err(AnalysisError::Stale);
        }
        let observation = Observation::<G>::decode(data)?;
        self.store.append(observation, limit_bytes)
    }

    /// Start `generation`, and release all snapshots. The store keeps one
    /// campaign, so this clears that campaign.
    pub fn clear(&mut self, generation: u32) {
        self.generation = generation;
        self.store.clear();
    }

    pub fn query(
        &self,
        request: QueryRequest<G::Query>,
    ) -> QueryReply<<G::Query as Query<G>>::Answer> {
        if request.generation != self.generation {
            return QueryReply {
                generation: self.generation,
                snapshot_ids: Vec::new(),
                outcome: QueryOutcome::Stale,
            };
        }
        let view = View::select(&self.store, &request.campaign_id, &request.selection);
        QueryReply {
            generation: self.generation,
            snapshot_ids: view.ids(),
            outcome: QueryOutcome::Ok {
                answer: request.query.answer(&view),
            },
        }
    }

    pub fn snapshot(&self, id: &str) -> Result<&Snapshot<G>, AnalysisError> {
        self.store.get(id).ok_or(AnalysisError::Missing)
    }

    pub fn memory(&self) -> StoreMemory {
        self.store.memory()
    }
}
