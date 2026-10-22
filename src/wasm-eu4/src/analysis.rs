use campaign_analysis::{AppendError, History, Selection, Store, StoreMemory};
use eu4game::analysis::{Eu4Analysis, Eu4SnapshotDescriptor, ProvinceColumns};
use eu4game::shared::Eu4Parser;
use eu4save::query::Query;
use serde::Serialize;
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceImportMetadata {
    pub content_hash: String,
    pub extractor_version: u32,
    pub campaign_id: String,
    pub date: String,
    pub date_sort: i32,
    pub game_version: String,
    pub layout_key: String,
}

/// Parse a complete save and return its campaign analysis observations. The
/// parsed save is released before the function returns.
#[wasm_bindgen]
pub fn parse_analysis(data: Vec<u8>) -> Result<JsValue, JsError> {
    let tokens = crate::tokens::get_tokens();
    let mut parser = Eu4Parser::new();
    parser.with_hash(true);
    let out = parser
        .parse_with(&data, tokens)
        .or_else(|_| parser.with_debug(true).parse_with(&data, tokens))?;
    drop(data);
    let content_hash = out
        .hash
        .ok_or_else(|| JsError::new("The save parser gave no content hash"))?;
    let observed = eu4game::analysis::extract(&Query::from_save(out.save));
    let metadata = ProvinceImportMetadata {
        content_hash,
        extractor_version: observed.extractor_version,
        campaign_id: observed.campaign_id,
        date: observed.date,
        date_sort: observed.date_sort,
        game_version: observed.game_version,
        layout_key: observed.layout_key.clone(),
    };

    let provinces = js_sys::Object::new();
    let result = js_sys::Object::new();
    let set = |target: &js_sys::Object, name: &str, value: JsValue| {
        js_sys::Reflect::set(target, &JsValue::from_str(name), &value)
            .map(|_| ())
            .map_err(|_| JsError::new("Could not create province observations"))
    };
    set(&provinces, "layoutKey", observed.layout_key.into())?;
    set(
        &provinces,
        "provinceIds",
        js_sys::Uint32Array::from(observed.province_ids.as_slice()).into(),
    )?;
    set(
        &provinces,
        "development",
        js_sys::Float32Array::from(observed.development.as_slice()).into(),
    )?;
    set(
        &provinces,
        "owned",
        js_sys::Uint8Array::from(observed.owned.as_slice()).into(),
    )?;
    set(&result, "observation", metadata.into_ts()?.into())?;
    set(&result, "provinces", provinces.into())?;
    Ok(result.into())
}

#[derive(Debug, Serialize, Tsify)]
#[tsify(hashmap_as_object)]
#[serde(rename_all = "camelCase")]
pub struct Eu4AppendResult {
    pub descriptor: Eu4SnapshotDescriptor,
    pub duplicate: bool,
}

fn append_error(error: AppendError) -> JsValue {
    let js = js_sys::Error::new(&error.to_string());
    js.set_name(error.name());
    js.into()
}

fn field<T: JsCast>(object: &JsValue, name: &str) -> Result<T, JsError> {
    js_sys::Reflect::get(object, &JsValue::from_str(name))
        .ok()
        .and_then(|value| value.dyn_into::<T>().ok())
        .ok_or_else(|| JsError::new("Incomplete province observations"))
}

/// The snapshots of one campaign in the analysis worker.
#[wasm_bindgen]
#[derive(Debug, Default)]
pub struct Eu4AnalysisStore {
    store: Store<Eu4Analysis>,
}

#[wasm_bindgen]
impl Eu4AnalysisStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Copy the payload of a reader worker into the store.
    pub fn append(
        &mut self,
        descriptor: Ts<Eu4SnapshotDescriptor>,
        payload: JsValue,
        limit_bytes: f64,
    ) -> Result<Ts<Eu4AppendResult>, JsValue> {
        let descriptor = descriptor.to_rust().map_err(JsError::from)?;
        let provinces = js_sys::Reflect::get(&payload, &JsValue::from_str("provinces"))?;
        let layout_key: String = field::<js_sys::JsString>(&provinces, "layoutKey")?.into();
        let ids = field::<js_sys::Uint32Array>(&provinces, "provinceIds")?.to_vec();
        let columns = ProvinceColumns {
            development: field::<js_sys::Float32Array>(&provinces, "development")?.to_vec(),
            owned: field::<js_sys::Uint8Array>(&provinces, "owned")?.to_vec(),
        };
        let appended = self
            .store
            .append(descriptor, layout_key, ids, columns, limit_bytes as usize)
            .map_err(append_error)?;
        let result = Eu4AppendResult {
            descriptor: appended.descriptor,
            duplicate: appended.duplicate,
        };
        Ok(result.into_ts().map_err(JsError::from)?)
    }

    pub fn clear(&mut self) {
        self.store.clear();
    }

    pub fn campaign(&self) -> Option<String> {
        self.store.campaign().map(String::from)
    }

    pub fn memory(&self) -> Result<Ts<StoreMemory>, JsError> {
        Ok(self.store.memory().into_ts()?)
    }

    /// The IDs of the selected snapshots in date order.
    pub fn select(
        &self,
        campaign_id: &str,
        selection: Ts<Selection>,
    ) -> Result<Vec<String>, JsError> {
        let selection = selection.to_rust()?;
        let selected = self.store.select(campaign_id, &selection);
        Ok(selected
            .into_iter()
            .map(|snapshot| snapshot.common().id.clone())
            .collect())
    }

    pub fn world_development(
        &self,
        campaign_id: &str,
        selection: Ts<Selection>,
    ) -> Result<Ts<History>, JsError> {
        let selection = selection.to_rust()?;
        let history = eu4game::analysis::world_development(&self.store, campaign_id, &selection);
        Ok(history.into_ts()?)
    }

    pub fn province_development(
        &self,
        campaign_id: &str,
        selection: Ts<Selection>,
        province_ids: Vec<u32>,
    ) -> Result<Ts<History>, JsError> {
        let selection = selection.to_rust()?;
        let history = eu4game::analysis::fixed_province_development(
            &self.store,
            campaign_id,
            &selection,
            &province_ids,
        );
        Ok(history.into_ts()?)
    }
}
