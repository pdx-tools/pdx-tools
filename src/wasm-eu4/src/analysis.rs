use campaign_analysis::wasm_store;
use eu4game::analysis::Eu4Analysis;
use eu4game::shared::Eu4Parser;
use eu4save::query::Query;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &str = r#"
export type Eu4SnapshotDescriptor = SnapshotDescriptor & { game: "eu4" };
export type Eu4Snapshot = EncodedSnapshot<"eu4", Eu4SnapshotDescriptor>;
"#;

/// Parse a complete save and return its campaign analysis snapshot. The
/// parsed save is released before the function returns.
#[wasm_bindgen(unchecked_return_type = "Eu4Snapshot")]
pub fn parse_analysis(data: Vec<u8>) -> Result<JsValue, JsValue> {
    let tokens = crate::tokens::get_tokens();
    let mut parser = Eu4Parser::new();
    parser.with_hash(true);
    let out = parser
        .parse_with(&data, tokens)
        .or_else(|_| parser.with_debug(true).parse_with(&data, tokens))
        .map_err(|error| JsError::new(&error.to_string()))?;
    drop(data);
    let content_hash = out
        .hash
        .ok_or_else(|| JsError::new("The save parser gave no content hash"))?;
    let observation = eu4game::analysis::extract(&Query::from_save(out.save), content_hash);
    campaign_analysis::wasm::observation(&observation)
}

wasm_store! {
    /// The snapshots of one campaign in the analysis worker.
    pub struct Eu4AnalysisStore(Eu4Analysis) {
        data: "SnapshotData<\"eu4\">",
        appended: "AppendReply<Eu4SnapshotDescriptor>",
        request: "QueryRequest<Eu4Query>",
        reply: "QueryReply<Eu4Answer>",
        snapshot: "Eu4Snapshot",
    }
}
