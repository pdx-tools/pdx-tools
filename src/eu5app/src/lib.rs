mod game_data;
mod map;
mod session;
mod subject_color;

#[cfg(not(target_family = "wasm"))]
pub mod parsing;

pub use game_data::*;
pub use map::*;
pub use session::Eu5Session;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
#[serde(rename_all = "camelCase")]
pub enum TableCell {
    #[serde(rename = "text")]
    Text(String),
    #[serde(rename = "integer")]
    Integer(i64),
    #[serde(rename = "float")]
    Float { value: f64, decimals: u8 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayBodyConfig {
    pub left_table: OverlayTable,
    pub right_table: OverlayTable,
    pub max_rows: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayTable {
    pub title: Option<String>,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<TableCell>>,
}
