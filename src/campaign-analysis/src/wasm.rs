//! The JavaScript side of a [`Session`]. Use [`wasm_store!`](crate::wasm_store)
//! to declare the store class of a game and its TypeScript types.

use crate::{
    AnalysisError, Descriptor, Game, Observation, Query, QueryReply, QueryRequest, Session,
    Snapshot, StoreMemory,
};
use serde::{Serialize, Serializer};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

#[doc(hidden)]
pub mod __private {
    pub use tsify;
    pub use wasm_bindgen;
}

#[wasm_bindgen(typescript_custom_section)]
const TYPES: &str = r#"
/** The binary form of a snapshot of game `G`. Only Rust reads it. */
export type SnapshotData<G extends string> = Uint8Array<ArrayBuffer> & { readonly __snapshot: G };
/** The common fields of a snapshot and the fields of its game, in one object. */
export type Descriptor<D> = SnapshotDescriptor & D;
"#;

/// What an append stored, and the memory of the store after it.
#[derive(Debug, Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct AppendReply<D> {
    pub descriptor: Descriptor<D>,
    pub duplicate: bool,
    pub memory: StoreMemory,
}

/// A snapshot from a parser, or from a store for a map frame.
#[derive(Debug, Serialize, Tsify)]
pub struct EncodedSnapshot<D> {
    pub descriptor: Descriptor<D>,
    /// JavaScript gets a copy as a `Uint8Array`, which it can transfer.
    /// `wasm_store!` declares `AnalysisSnapshotData` for its game.
    #[serde(serialize_with = "bytes")]
    #[tsify(type = "AnalysisSnapshotData")]
    pub data: Vec<u8>,
}

fn bytes<S: Serializer>(data: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_bytes(data)
}

/// Give a value to JavaScript as its TypeScript type.
pub fn ts<T: Tsify + Serialize>(value: T) -> Result<Ts<T>, JsValue> {
    value
        .into_ts()
        .map_err(|error| JsError::new(&error.to_string()).into())
}

/// A JavaScript error with the name of the analysis error.
pub fn error(error: AnalysisError) -> JsValue {
    let js = js_sys::Error::new(&error.to_string());
    js.set_name(error.name().as_str());
    js.into()
}

/// True when two strings are equal, in a constant.
pub const fn same_str(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut i = 0;
    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

fn wasm_bytes() -> usize {
    wasm_bindgen::memory()
        .unchecked_into::<js_sys::WebAssembly::Memory>()
        .buffer()
        .unchecked_into::<js_sys::ArrayBuffer>()
        .byte_length() as usize
}

pub fn memory<G: Game>(session: &Session<G>) -> StoreMemory {
    StoreMemory {
        wasm_bytes: wasm_bytes(),
        ..session.memory()
    }
}

pub fn append<G: Game>(
    session: &mut Session<G>,
    generation: u32,
    data: &[u8],
    limit_bytes: f64,
) -> Result<AppendReply<G::Detail>, JsValue> {
    // A limit above the largest size, such as Infinity, saturates.
    let appended = session
        .append(generation, data, limit_bytes as usize)
        .map_err(error)?;
    Ok(AppendReply {
        descriptor: appended.descriptor,
        duplicate: appended.duplicate,
        memory: memory(session),
    })
}

pub fn query<G: Game>(
    session: &Session<G>,
    request: QueryRequest<G::Query>,
) -> QueryReply<<G::Query as Query<G>>::Answer> {
    session.query(request)
}

/// The descriptor and the binary form of a parsed save.
pub fn observation<G: Game>(observation: &Observation<G>) -> EncodedSnapshot<G::Detail> {
    EncodedSnapshot {
        descriptor: Descriptor {
            common: observation.descriptor.clone(),
            detail: observation.detail.clone(),
        },
        data: observation.encode(),
    }
}

/// The descriptor and the binary form of a stored snapshot.
pub fn snapshot<G: Game>(snapshot: &Snapshot<G>) -> EncodedSnapshot<G::Detail> {
    EncodedSnapshot {
        descriptor: snapshot.described(),
        data: snapshot.encode(),
    }
}

/// Declare the `#[wasm_bindgen]` store class of a game, and its TypeScript
/// types: `AnalysisSnapshotData`, `AnalysisDescriptor`, `AnalysisSnapshot`,
/// `AnalysisAppendReply`, `AnalysisQueryRequest` and `AnalysisQueryReply`.
/// A WASM module has one store, so these names do not change.
///
/// The detail, query and answer must be the associated types of the game.
/// The macro needs their names, because tsify writes the type names that it
/// reads, and it cannot resolve an associated type. A wrong name does not
/// compile. The calling crate needs `serde`, `tsify` and `wasm-bindgen`.
///
/// ```ignore
/// campaign_analysis::wasm_store! {
///     pub struct Eu4AnalysisStore(Eu4Analysis) {
///         game: "eu4",
///         detail: Eu4Detail,
///         query: Eu4Query,
///         answer: Eu4Answer,
///     }
/// }
/// ```
#[macro_export]
macro_rules! wasm_store {
    (
        $(#[$meta:meta])*
        $vis:vis struct $name:ident($game:ty) {
            game: $tag:literal,
            detail: $detail:ident,
            query: $query:ident,
            answer: $answer:ident $(,)?
        }
    ) => {
        const _: () = assert!(
            $crate::wasm::same_str(<$game as $crate::Game>::GAME, $tag),
            "The game of wasm_store! must be the GAME of its game type",
        );
        const _: fn(<$game as $crate::Game>::Detail) -> $detail = |detail| detail;
        const _: fn(<$game as $crate::Game>::Query) -> $query = |query| query;
        const _: fn(
            <<$game as $crate::Game>::Query as $crate::Query<$game>>::Answer,
        ) -> $answer = |answer| answer;

        #[wasm_bindgen::prelude::wasm_bindgen(typescript_custom_section)]
        const ANALYSIS_SNAPSHOT_DATA: &str = concat!(
            "/** The binary form of a snapshot of this game. */\n",
            "export type AnalysisSnapshotData = SnapshotData<\"",
            $tag,
            "\">;",
        );

        /// The descriptor of a snapshot of this game.
        #[allow(dead_code)]
        #[derive(serde::Serialize, tsify::Tsify)]
        #[tsify(hashmap_as_object)]
        #[serde(transparent)]
        pub struct AnalysisDescriptor(pub $crate::Descriptor<$detail>);

        /// A snapshot of this game, from a parser or from the store.
        #[derive(serde::Serialize, tsify::Tsify)]
        #[tsify(hashmap_as_object)]
        #[serde(transparent)]
        pub struct AnalysisSnapshot(pub $crate::wasm::EncodedSnapshot<$detail>);

        impl AnalysisSnapshot {
            /// The snapshot of a parsed save, for JavaScript.
            pub fn observation(
                observation: &$crate::Observation<$game>,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<Self>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::ts(Self($crate::wasm::observation(observation)))
            }
        }

        #[derive(serde::Serialize, tsify::Tsify)]
        #[tsify(hashmap_as_object)]
        #[serde(transparent)]
        pub struct AnalysisAppendReply(pub $crate::wasm::AppendReply<$detail>);

        #[derive(serde::Deserialize, tsify::Tsify)]
        #[serde(transparent)]
        pub struct AnalysisQueryRequest(pub $crate::QueryRequest<$query>);

        #[derive(serde::Serialize, tsify::Tsify)]
        #[tsify(hashmap_as_object)]
        #[serde(transparent)]
        pub struct AnalysisQueryReply(pub $crate::QueryReply<$answer>);

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
            pub fn append(
                &mut self,
                generation: u32,
                #[wasm_bindgen(unchecked_param_type = "AnalysisSnapshotData")] data: &[u8],
                limit_bytes: f64,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<AnalysisAppendReply>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                let reply = $crate::wasm::append(&mut self.session, generation, data, limit_bytes)?;
                $crate::wasm::ts(AnalysisAppendReply(reply))
            }

            /// Start `generation`, and release all snapshots.
            pub fn clear(
                &mut self,
                generation: u32,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<$crate::StoreMemory>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                self.session.clear(generation);
                $crate::wasm::ts($crate::wasm::memory(&self.session))
            }

            pub fn query(
                &self,
                request: $crate::wasm::__private::tsify::Ts<AnalysisQueryRequest>,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<AnalysisQueryReply>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                let AnalysisQueryRequest(request) = request.to_rust().map_err(|error| {
                    $crate::wasm::__private::wasm_bindgen::JsValue::from(
                        $crate::wasm::__private::wasm_bindgen::JsError::new(&error.to_string()),
                    )
                })?;
                $crate::wasm::ts(AnalysisQueryReply($crate::wasm::query(&self.session, request)))
            }

            /// A new copy of a stored snapshot, with its descriptor.
            pub fn snapshot(
                &self,
                id: &str,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<AnalysisSnapshot>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                let snapshot = self.session.snapshot(id).map_err($crate::wasm::error)?;
                $crate::wasm::ts(AnalysisSnapshot($crate::wasm::snapshot(snapshot)))
            }

            pub fn memory(
                &self,
            ) -> Result<
                $crate::wasm::__private::tsify::Ts<$crate::StoreMemory>,
                $crate::wasm::__private::wasm_bindgen::JsValue,
            > {
                $crate::wasm::ts($crate::wasm::memory(&self.session))
            }
        }
    };
}
