use jomini::common::{Date, PdsDate};
use models::{
    Vic3CountryGraphData, Vic3CountryGraphDataResponse, Vic3GoodPrice, Vic3GraphData, Vic3Metadata,
};
use std::io::Cursor;
use vic3save::markets::{goods_price_based_on_buildings, Vic3GoodEstimationError};
use vic3save::savefile::Vic3Country;
use vic3save::stats::{Vic3CountryStatsRateIter, Vic3StatsGDPIter};
use vic3save::MeltOptions;
use vic3save::{savefile::Vic3Save, FailedResolveStrategy, Vic3Error, Vic3File};
use wasm_bindgen::prelude::*;

mod models;
mod tokens;
pub use tokens::*;

use crate::models::Vic3GraphResponse;
use crate::models::Vic3MarketResponse;

#[wasm_bindgen(typescript_custom_section)]
const VIC3_DATE_TYPE: &'static str = r#"export type Vic3Date = string;"#;

pub struct SaveFileImpl {
    save: Vic3Save,
    is_meltable: bool,
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
    pub fn get_countries_stats(&self) -> Vic3CountryGraphDataResponse {
        Vic3CountryGraphDataResponse {
            data: self.0.get_countries_stats(),
        }
    }

    pub fn get_country_stats(&self, tag: &str) -> Vic3GraphResponse {
        Vic3GraphResponse {
            data: self.0.get_country_stats(tag),
        }
    }
    pub fn get_country_goods_prices(&self, tag: &str) -> Result<Vic3MarketResponse, JsValue> {
        let prices = self
            .0
            .get_country_goods_prices(tag)
            .map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
        Ok(Vic3MarketResponse { prices })
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

    pub fn get_country_goods_prices(
        &self,
        tag: &str,
    ) -> Result<Vec<Vic3GoodPrice>, Vic3GoodEstimationError> {
        let country = self.save.get_country(tag).unwrap();
        let states = &country.states;

        let goods_prices = goods_price_based_on_buildings(
            self.save
                .building_manager
                .database
                .values()
                .filter_map(|x| x.as_ref())
                .filter(|b| states.contains(&b.state)),
        )?;
        let mut goods_prices_vec: Vec<_> = goods_prices
            .iter()
            .map(|(good, price)| Vic3GoodPrice {
                good: good.to_string(),
                price: *price,
            })
            .collect();
        goods_prices_vec.sort_by(|a, b| a.good.cmp(&b.good));
        Ok(goods_prices_vec)
    }

    pub fn get_countries_stats(&self) -> Vec<Vic3CountryGraphData> {
        self.save
            .country_manager
            .database
            .iter()
            .filter_map(|(_, c)| c.as_ref())
            .map(|country| Vic3CountryGraphData {
                tag: country.definition.clone(),
                stats: self.country_stats(country),
            })
            .collect()
    }

    pub fn get_country_stats(&self, tag: &str) -> Vec<Vic3GraphData> {
        let country = self.save.get_country(tag).unwrap();
        self.country_stats(country)
    }

    fn country_stats(&self, country: &Vic3Country) -> Vec<Vic3GraphData> {
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
        self.is_meltable
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let save = file.parse_save(tokens::get_tokens())?;

    Ok(SaveFile(SaveFileImpl {
        save,
        is_meltable: matches!(
            file.encoding(),
            vic3save::Encoding::Binary | vic3save::Encoding::BinaryZip
        ),
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    file.melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
