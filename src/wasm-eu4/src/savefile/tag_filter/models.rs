#![allow(nonstandard_style)]
#![allow(clippy::empty_docs)]
use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Debug, Tsify, Serialize, Deserialize, PartialEq, Clone, Copy)]
pub enum TagsState {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "alive")]
    Alive,
    #[serde(rename = "dead")]
    Dead,
    #[serde(rename = "none")]
    None,
}

#[derive(Debug, Tsify, Serialize, Deserialize, PartialEq, Clone, Copy)]
pub enum AiTagsState {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "alive")]
    Alive,
    #[serde(rename = "great")]
    Great,
    #[serde(rename = "dead")]
    Dead,
    #[serde(rename = "none")]
    None,
}

#[derive(Debug, Tsify, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[tsify(from_wasm_abi)]
pub struct TagFilterPayloadRaw {
    pub players: TagsState,
    pub ai: AiTagsState,
    pub subcontinents: Vec<String>,
    pub include: Vec<String>,
    pub exclude: Vec<String>,
    pub include_subjects: bool,
}
