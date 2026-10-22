use campaign_analysis::wasm_store;
use eu5app::analysis::{Eu5Analysis, Eu5Answer, Eu5Detail, Eu5Query};

wasm_store! {
    /// The snapshots of one campaign in the analysis worker.
    pub struct Eu5AnalysisStore(Eu5Analysis) {
        game: "eu5",
        detail: Eu5Detail,
        query: Eu5Query,
        answer: Eu5Answer,
    }
}
