use campaign_analysis::wasm_store;
use eu4game::analysis::{Eu4Analysis, Eu4Answer, Eu4Detail, Eu4Query};
use eu4game::shared::Eu4Parser;
use eu4save::query::Query;
use tsify::Ts;
use wasm_bindgen::prelude::*;

/// Parse a complete save and return its campaign analysis snapshot. The
/// parsed save is released before the function returns.
#[wasm_bindgen]
pub fn parse_analysis(data: Vec<u8>) -> Result<Ts<AnalysisSnapshot>, JsValue> {
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
    AnalysisSnapshot::observation(&observation)
}

wasm_store! {
    /// The snapshots of one campaign in the analysis worker.
    pub struct Eu4AnalysisStore(Eu4Analysis) {
        game: "eu4",
        detail: Eu4Detail,
        query: Eu4Query,
        answer: Eu4Answer,
    }
}
