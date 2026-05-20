use crate::presentation::{Present, present_dto};
use eu5save::models::{CountryIdx, GoodName, LocationIdx};
use serde::{Deserialize, Serialize};

present_dto! {
    pub(crate) workspace OverlayBodyConfigSource<'a> => pub OverlayBodyConfig {
        left_table: OverlayTableSource<'a> => OverlayTable,
        right_table: OverlayTableSource<'a> => OverlayTable,
        max_rows: Option<u32>,
    }
}

present_dto! {
    pub(crate) workspace OverlayTableSource<'a> => pub OverlayTable {
        title: Option<String>,
        headers: Vec<String>,
        rows: Vec<Vec<TableCellSource<'a>>> => Vec<Vec<TableCell>>,
    }
}

#[derive(Debug, Clone)]
pub(crate) enum TableCellSource<'a> {
    Text(String),
    Country(CountryIdx),
    Good(GoodName<'a>),
    Location(LocationIdx),
    Integer(i64),
    Float { value: f64, decimals: u8 },
}

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

impl<'a> Present for TableCellSource<'a> {
    type Output = TableCell;

    fn present(self, ctx: &crate::presentation::LocalizationContext<'_, '_>) -> Self::Output {
        match self {
            TableCellSource::Text(text) => TableCell::Text(text),
            TableCellSource::Country(idx) => TableCell::Text(idx.present(ctx).name),
            TableCellSource::Good(good) => TableCell::Text(good.present(ctx).name),
            TableCellSource::Location(idx) => TableCell::Text(idx.present(ctx).name),
            TableCellSource::Integer(value) => TableCell::Integer(value),
            TableCellSource::Float { value, decimals } => TableCell::Float { value, decimals },
        }
    }
}
