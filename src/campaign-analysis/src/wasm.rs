//! The JavaScript side of a [`Session`]. Use [`wasm_store!`](crate::wasm_store)
//! to declare the store class of a game.

use crate::{AnalysisError, Descriptor, Game, Observation, Session, Snapshot, StoreMemory};
use js_sys::{Object, Reflect, Uint8Array};
use serde::{Serialize, de::DeserializeOwned};
use wasm_bindgen::prelude::*;

#[doc(hidden)]
pub mod __private {
    pub use wasm_bindgen;
}

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &str = r#"
/** The binary form of a snapshot of game `G`. Only Rust reads it. */
export type SnapshotData<G extends string> = Uint8Array<ArrayBuffer> & { readonly __snapshot: G };
/** A snapshot from a parser, or from a store for a map frame. */
export interface EncodedSnapshot<G extends string, D> { descriptor: D; data: SnapshotData<G> }
export interface AppendReply<D> { descriptor: D; duplicate: boolean; memory: StoreMemory }
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppendReply<D> {
    descriptor: Descriptor<D>,
    duplicate: bool,
    memory: StoreMemory,
}

pub fn to_js<T: Serialize + ?Sized>(value: &T) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::new()
        .serialize_maps_as_objects(true)
        .serialize_missing_as_null(true);
    value
        .serialize(&serializer)
        .map_err(|error| JsError::new(&error.to_string()).into())
}

pub fn from_js<T: DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|error| JsError::new(&error.to_string()).into())
}

/// A JavaScript error with the name of the analysis error.
pub fn error(error: AnalysisError) -> JsValue {
    let js = js_sys::Error::new(&error.to_string());
    js.set_name(error.name().as_str());
    js.into()
}

fn encoded(descriptor: JsValue, data: &[u8]) -> Result<JsValue, JsValue> {
    let result = Object::new();
    Reflect::set(&result, &"descriptor".into(), &descriptor)?;
    Reflect::set(&result, &"data".into(), &Uint8Array::from(data).into())?;
    Ok(result.into())
}

/// The descriptor and the binary form of a parsed save.
pub fn observation<G: Game>(observation: &Observation<G>) -> Result<JsValue, JsValue> {
    let descriptor = Descriptor {
        common: observation.descriptor.clone(),
        detail: observation.detail.clone(),
    };
    encoded(to_js(&descriptor)?, &observation.encode())
}

/// The descriptor and the binary form of a stored snapshot.
pub fn snapshot<G: Game>(snapshot: &Snapshot<G>) -> Result<JsValue, JsValue> {
    encoded(to_js(&snapshot.described())?, &snapshot.encode())
}

fn wasm_bytes() -> usize {
    wasm_bindgen::memory()
        .unchecked_into::<js_sys::WebAssembly::Memory>()
        .buffer()
        .unchecked_into::<js_sys::ArrayBuffer>()
        .byte_length() as usize
}

pub fn memory<G: Game>(session: &Session<G>) -> Result<JsValue, JsValue> {
    to_js(&StoreMemory {
        wasm_bytes: wasm_bytes(),
        ..session.memory()
    })
}

pub fn append<G: Game>(
    session: &mut Session<G>,
    generation: u32,
    data: &[u8],
    limit_bytes: f64,
) -> Result<JsValue, JsValue> {
    // A limit above the largest size, such as Infinity, saturates.
    let appended = session
        .append(generation, data, limit_bytes as usize)
        .map_err(error)?;
    to_js(&AppendReply {
        descriptor: appended.descriptor,
        duplicate: appended.duplicate,
        memory: StoreMemory {
            wasm_bytes: wasm_bytes(),
            ..session.memory()
        },
    })
}

pub fn query<G: Game>(session: &Session<G>, request: JsValue) -> Result<JsValue, JsValue> {
    to_js(&session.query(from_js(request)?))
}

pub fn frame<G: Game>(session: &Session<G>, id: &str) -> Result<JsValue, JsValue> {
    snapshot(session.snapshot(id).map_err(error)?)
}

/// Declare the `#[wasm_bindgen]` store class of a game. The literals are the
/// TypeScript types of the binary snapshot, the append reply, the query
/// request, the query reply and the stored snapshot.
///
/// ```ignore
/// campaign_analysis::wasm_store! {
///     pub struct Eu4AnalysisStore(Eu4Analysis) {
///         data: "SnapshotData<\"eu4\">",
///         appended: "AppendReply<Eu4SnapshotDescriptor>",
///         request: "QueryRequest<Eu4Query>",
///         reply: "QueryReply<Eu4Answer>",
///         snapshot: "EncodedSnapshot<\"eu4\", Eu4SnapshotDescriptor>",
///     }
/// }
/// ```
#[macro_export]
macro_rules! wasm_store {
    (
        $(#[$meta:meta])*
        $vis:vis struct $name:ident($game:ty) {
            data: $data:literal,
            appended: $appended:literal,
            request: $request:literal,
            reply: $reply:literal,
            snapshot: $snapshot:literal $(,)?
        }
    ) => {
        $(#[$meta])*
        #[$crate::wasm::__private::wasm_bindgen::prelude::wasm_bindgen(
            wasm_bindgen = $crate::wasm::__private::wasm_bindgen
        )]
        #[derive(Debug, Default)]
        $vis struct $name {
            session: $crate::Session<$game>,
        }

        #[$crate::wasm::__private::wasm_bindgen::prelude::wasm_bindgen(
            wasm_bindgen = $crate::wasm::__private::wasm_bindgen
        )]
        impl $name {
            #[wasm_bindgen(constructor)]
            pub fn new() -> Self {
                Self::default()
            }

            /// The first call to a new worker.
            pub fn open(&mut self, generation: u32) {
                self.session.open(generation);
            }

            /// Store the binary form of a snapshot from an import that
            /// started in `generation`. The error names are
            /// `AnalysisErrorName` values.
            #[wasm_bindgen(unchecked_return_type = $appended)]
            pub fn append(
                &mut self,
                generation: u32,
                #[wasm_bindgen(unchecked_param_type = $data)] data: &[u8],
                limit_bytes: f64,
            ) -> Result<
                $crate::wasm::__private::wasm_bindgen::JsValue,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::append(&mut self.session, generation, data, limit_bytes)
            }

            /// Start `generation`, and release the snapshots of the
            /// campaign, or of any campaign.
            #[wasm_bindgen(unchecked_return_type = "StoreMemory")]
            pub fn clear(
                &mut self,
                generation: u32,
                campaign_id: Option<String>,
            ) -> Result<
                $crate::wasm::__private::wasm_bindgen::JsValue,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                self.session.clear(generation, campaign_id.as_deref());
                $crate::wasm::memory(&self.session)
            }

            #[wasm_bindgen(unchecked_return_type = $reply)]
            pub fn query(
                &self,
                #[wasm_bindgen(unchecked_param_type = $request)]
                request: $crate::wasm::__private::wasm_bindgen::JsValue,
            ) -> Result<
                $crate::wasm::__private::wasm_bindgen::JsValue,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::query(&self.session, request)
            }

            /// A new copy of a stored snapshot, with its descriptor.
            #[wasm_bindgen(unchecked_return_type = $snapshot)]
            pub fn snapshot(
                &self,
                id: &str,
            ) -> Result<
                $crate::wasm::__private::wasm_bindgen::JsValue,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::frame(&self.session, id)
            }

            #[wasm_bindgen(unchecked_return_type = "StoreMemory")]
            pub fn memory(
                &self,
            ) -> Result<
                $crate::wasm::__private::wasm_bindgen::JsValue,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::memory(&self.session)
            }
        }
    };
}
