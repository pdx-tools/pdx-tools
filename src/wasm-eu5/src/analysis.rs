use campaign_analysis::wasm_store;
use eu5app::analysis::Eu5Analysis;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &str = r#"
export type Eu5SnapshotDescriptor = SnapshotDescriptor & Eu5Detail & { game: "eu5" };
export type Eu5Snapshot = EncodedSnapshot<"eu5", Eu5SnapshotDescriptor>;
"#;

wasm_store! {
    /// The snapshots of one campaign in the analysis worker.
    pub struct Eu5AnalysisStore(Eu5Analysis) {
        data: "SnapshotData<\"eu5\">",
        appended: "AppendReply<Eu5SnapshotDescriptor>",
        request: "QueryRequest<Eu5Query>",
        reply: "QueryReply<Eu5Answer>",
        snapshot: "Eu5Snapshot",
    }
}
