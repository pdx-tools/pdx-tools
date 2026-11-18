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

#[cfg(test)]
mod tests {
    use super::*;
    use tsify::Ts;
    use wasm_bindgen::{JsCast, JsError, JsValue};
    use wasm_bindgen_test::wasm_bindgen_test;

    #[wasm_bindgen_test]
    fn location_query_accepts_numeric_ids_and_returns_js_errors_for_invalid_ids() {
        let mut store = Eu5AnalysisStore::new();
        store.open(0);
        for id in [
            "0",
            "42",
            "65578",
            "4294967295",
            "-42",
            "-2147483648",
            "4294967296",
            "1.5",
        ] {
            let request = js_sys::JSON::parse(&format!(
                r#"{{"generation":0,"campaignId":"none","query":{{"kind":"locationPopulation","locationIds":[{id}]}}}}"#
            )).unwrap();
            let result = store.query(Ts::new_unchecked(request));
            if let Ok(number) = id.parse::<u32>() {
                assert!(result.is_ok(), "{number}");
            } else {
                let error: JsError = result.unwrap_err();
                assert!(JsValue::from(error).is_instance_of::<js_sys::Error>());
            }
        }
    }

    #[wasm_bindgen_test]
    fn analysis_js_errors_keep_their_names() {
        let error = campaign_analysis::wasm::error(campaign_analysis::AnalysisError::MemoryFull);
        let error = JsValue::from(error).unchecked_into::<js_sys::Error>();
        assert_eq!(error.name(), "AnalysisMemoryLimit");
        assert!(error.message().as_string().unwrap().contains("memory"));
    }
}
