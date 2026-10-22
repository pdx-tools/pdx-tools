use crate::map_projection;
use campaign_analysis::{AppendError, History, Selection, StoreMemory};
use eu5app::analysis::{self, Eu5Analysis, Eu5SnapshotDescriptor};
use serde::Serialize;
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

#[derive(Debug, Serialize, Tsify)]
#[tsify(hashmap_as_object)]
#[serde(rename_all = "camelCase")]
pub struct Eu5AppendResult {
    pub descriptor: Eu5SnapshotDescriptor,
    pub duplicate: bool,
}

pub(crate) fn append_error(error: AppendError) -> JsValue {
    let js = js_sys::Error::new(&error.to_string());
    js.set_name(error.name());
    js.into()
}

/// The snapshots of one campaign in the analysis worker.
#[wasm_bindgen]
#[derive(Debug, Default)]
pub struct Eu5AnalysisStore {
    store: campaign_analysis::Store<Eu5Analysis>,
}

#[wasm_bindgen]
impl Eu5AnalysisStore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    /// Copy the payload of a reader worker into the store.
    pub fn append(
        &mut self,
        descriptor: Ts<Eu5SnapshotDescriptor>,
        payload: JsValue,
        limit_bytes: f64,
    ) -> Result<Ts<Eu5AppendResult>, JsValue> {
        let descriptor = descriptor.to_rust().map_err(JsError::from)?;
        let projection = js_sys::Reflect::get(&payload, &JsValue::from_str("projection"))?;
        let (layout_key, ids, columns) = map_projection::from_js(&projection)?;
        let appended = self
            .store
            .append(descriptor, layout_key, ids, columns, limit_bytes as usize)
            .map_err(append_error)?;
        let result = Eu5AppendResult {
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

    /// A new copy of the map projection of a snapshot, with its descriptor.
    pub fn frame(&self, id: &str) -> Result<JsValue, JsError> {
        let snapshot = self.store.get(id).ok_or_else(|| {
            JsError::new(
                "This observation is no longer available. Import the original saves again.",
            )
        })?;
        let result = js_sys::Object::new();
        let descriptor: JsValue = snapshot.descriptor.into_ts()?.into();
        let projection = map_projection::into_js(snapshot.payload.data(&snapshot.layout))?;
        for (name, value) in [("descriptor", descriptor), ("projection", projection)] {
            js_sys::Reflect::set(&result, &JsValue::from_str(name), &value)
                .map_err(|_| JsError::new("Could not create a map frame"))?;
        }
        Ok(result.into())
    }

    pub fn world_population(
        &self,
        campaign_id: &str,
        selection: Ts<Selection>,
    ) -> Result<Ts<History>, JsError> {
        let selection = selection.to_rust()?;
        Ok(analysis::world_population(&self.store, campaign_id, &selection).into_ts()?)
    }

    pub fn location_population(
        &self,
        campaign_id: &str,
        selection: Ts<Selection>,
        location_ids: Vec<u32>,
    ) -> Result<Ts<History>, JsError> {
        let selection = selection.to_rust()?;
        let history =
            analysis::location_population(&self.store, campaign_id, &selection, &location_ids);
        Ok(history.into_ts()?)
    }
}
