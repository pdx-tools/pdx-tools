use jomini::common::{Date, PdsDate};
use models::{Vic3GraphData, Vic3Metadata};
use vic3save::stats::{Vic3CountryStatsRateIter, Vic3StatsGDPIter};
use vic3save::{
    savefile::Vic3Save, FailedResolveStrategy, SaveHeader, SaveHeaderKind, Vic3Error, Vic3File,
};
use wasm_bindgen::prelude::*;

mod models;
mod tokens;
pub use tokens::*;

use crate::models::Vic3GraphResponse;

#[wasm_bindgen(typescript_custom_section)]
const VIC3_DATE_TYPE: &'static str = r#"export type Vic3Date = string;"#;

pub struct SaveFileImpl {
    save: Vic3Save,
    header: SaveHeader,
}

#[wasm_bindgen]
pub struct SaveFile(SaveFileImpl);

pub fn to_json_value<T: serde::ser::Serialize + ?Sized>(value: &T) -> JsValue {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer).unwrap()
}

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> Vic3Metadata {
        self.0.metadata()
    }
    pub fn get_country_stats(&self, tag: &str) -> Vic3GraphResponse {
        Vic3GraphResponse {
            data: self.0.get_country_stats(tag),
        }
    }
}

impl SaveFileImpl {
    pub fn metadata(&self) -> Vic3Metadata {
        Vic3Metadata {
            date: self.save.meta_data.game_date,
            is_meltable: self.is_meltable(),
            last_played_tag: self.save.get_last_played_country().definition.clone(),
            available_tags: self.get_available_tags(),
        }
    }

    fn get_available_tags(&self) -> Vec<String> {
        self.save
            .country_manager
            .database
            .iter()
            .filter_map(|(_, country)| country.as_ref())
            .map(|x| x.definition.clone())
            .collect()
    }

    pub fn get_country_stats(&self, tag: &str) -> Vec<Vic3GraphData> {
        let country = self.save.get_country(tag).unwrap();
        let gdp_line = || country.gdp.iter();
        let sol_line = country.avgsoltrend.iter();
        let pop_line = || country.pop_statistics.trend_population.iter();
        let gdpc_line = || {
            pop_line()
                .zip_aligned(gdp_line())
                .map(|(date, (pop, gdp))| (date, (gdp / (pop / 100_000.0))))
        };
        let gdpc_growth = Vic3StatsGDPIter::new(gdpc_line());
        let pop_growth = Vic3CountryStatsRateIter::new(pop_line(), 365);
        gdp_line()
            .zip_aligned(sol_line)
            .zip_aligned(gdpc_line())
            .zip_aligned(country.gdp.gdp_growth())
            .zip_aligned(gdpc_growth)
            // Unused for now but StatsRateIter ensure only 1 data point per year. Which makes the table of managable length
            .zip_aligned(pop_growth)
            .flat()
            .map(
                |(date, [gdp, sol, gdpc, gdp_growth, gdpc_growth, _pop_growth])| Vic3GraphData {
                    gdp: gdp / 1000000.0,
                    gdpc,
                    pop: gdp / gdpc,
                    date: Date::from_ymd(date.year(), date.month(), date.day())
                        .iso_8601()
                        .to_string(),
                    sol,
                    gdp_growth,
                    gdpc_growth,
                },
            )
            .collect()
    }

    fn is_meltable(&self) -> bool {
        matches!(
            self.header.kind(),
            SaveHeaderKind::Binary | SaveHeaderKind::SplitBinary | SaveHeaderKind::UnifiedBinary
        )
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let header = file.header();
    let save = file.deserialize_save(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        save,
        header: header.clone(),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<vic3save::MeltedDocument, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let mut zip_sink = Vec::new();
    let parsed_file = file.parse(&mut zip_sink)?;
    let binary = parsed_file.as_binary().unwrap();
    let out = binary
        .melter()
        .on_failed_resolve(FailedResolveStrategy::Ignore)
        .melt(tokens::get_tokens())?;
    Ok(out)
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.data()))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
