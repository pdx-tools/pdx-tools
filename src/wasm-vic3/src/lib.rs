use jomini::common::{Date, PdsDate};
use models::{
    Vic3CountryGraphData, Vic3CountryGraphDataResponse, Vic3GoodPrice, Vic3GraphData, Vic3Metadata,
};
use std::io::Cursor;
use tsify::{Ts, Tsify};
use vic3app::{ProvinceDetails, ProvinceId, Vic3MapSave, Vic3World};
use vic3save::markets::{Vic3GoodEstimationError, goods_price_based_on_buildings};
use vic3save::savefile::Vic3Country;
use vic3save::stats::{Vic3CountryStatsRateIter, Vic3StatsGDPIter};
use vic3save::{DeserializeVic3, MeltOptions, Vic3Melt};
use vic3save::{FailedResolveStrategy, Vic3Error, Vic3File, savefile::Vic3Save};
use wasm_bindgen::prelude::*;

mod models;
mod save_model;
mod tokens;
pub use tokens::*;

use crate::models::Vic3MarketResponse;
use crate::models::{LandedCountries, Vic3GraphResponse};

#[wasm_bindgen(typescript_custom_section)]
const VIC3_DATE_TYPE: &'static str = r#"export type Vic3Date = string;"#;

#[derive(Debug)]
pub struct SaveFileImpl {
    save: Vic3Save,
    map_save: Vic3MapSave,
    is_meltable: bool,
    world: Option<Vic3World>,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveFile(SaveFileImpl);

pub fn to_json_value<T: serde::ser::Serialize + ?Sized>(value: &T) -> JsValue {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer).unwrap()
}

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> Result<Ts<Vic3Metadata>, JsError> {
        Ok(self.0.metadata().into_ts()?)
    }
    pub fn get_countries_stats(&self) -> Result<Ts<Vic3CountryGraphDataResponse>, JsError> {
        Vic3CountryGraphDataResponse {
            data: self.0.get_countries_stats(),
        }
        .into_ts()
        .map_err(JsError::from)
    }

    pub fn get_country_stats(&self, tag: &str) -> Result<Ts<Vic3GraphResponse>, JsError> {
        Vic3GraphResponse {
            data: self.0.get_country_stats(tag),
        }
        .into_ts()
        .map_err(JsError::from)
    }
    pub fn get_country_goods_prices(&self, tag: &str) -> Result<Ts<Vic3MarketResponse>, JsError> {
        let prices = self.0.get_country_goods_prices(tag)?;
        Ok(Vic3MarketResponse { prices }.into_ts()?)
    }

    /// Load the game data of the asset bundle (game.zip) so that the save
    /// can describe and color the map.
    pub fn load_game_bundle(&mut self, data: &[u8]) -> Result<(), JsError> {
        let game = vic3app::read_game_bundle(data)
            .map_err(|e| JsError::new(&format!("Failed to open game bundle: {e}")))?;
        self.0.world = Some(Vic3World::new(&self.0.map_save, game));
        Ok(())
    }

    /// The location arrays that color the map by owner
    pub fn location_arrays(&self) -> Result<js_sys::Uint32Array, JsError> {
        let arrays = self.0.world()?.political_location_arrays();
        Ok(js_sys::Uint32Array::from(arrays.as_data()))
    }

    /// The flags of each location with the provinces of `tag` highlighted
    pub fn location_flags(&self, tag: Option<String>) -> Result<js_sys::Uint32Array, JsError> {
        let flags: Vec<u32> = self
            .0
            .world()?
            .location_flags(tag.as_deref())
            .into_iter()
            .map(|x| x.bits())
            .collect();
        Ok(js_sys::Uint32Array::from(flags.as_slice()))
    }

    pub fn province_details(
        &self,
        province_id: u32,
    ) -> Result<Option<Ts<ProvinceDetails>>, JsError> {
        let details = self.0.world()?.province(ProvinceId::new(province_id));
        Ok(details.map(|x| x.into_ts()).transpose()?)
    }

    /// The countries that own land, with their names and colors
    pub fn landed_countries(&self) -> Result<Ts<LandedCountries>, JsError> {
        let countries = self.0.world()?.landed_countries();
        Ok(LandedCountries { countries }.into_ts()?)
    }

    /// The capital province of the country
    pub fn capital_province(&self, tag: String) -> Result<Option<u32>, JsError> {
        Ok(self
            .0
            .world()?
            .capital_province(&tag)
            .map(ProvinceId::value))
    }
}

impl SaveFileImpl {
    fn world(&self) -> Result<&Vic3World, JsError> {
        self.world
            .as_ref()
            .ok_or_else(|| JsError::new("game bundle is not loaded"))
    }

    pub fn metadata(&self) -> Vic3Metadata {
        Vic3Metadata {
            date: self.save.meta_data.game_date,
            is_meltable: self.is_meltable(),
            last_played_tag: self.save.get_last_played_country().definition.clone(),
            available_tags: self.get_available_tags(),
            version: self.save.meta_data.version.clone(),
            bundle_version: vic3app::bundle_version(&self.save.meta_data.version),
        }
    }

    fn get_available_tags(&self) -> Vec<String> {
        self.save
            .country_manager
            .database
            .values()
            .filter_map(|country| country.as_ref())
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
            .values()
            .filter_map(|c| c.as_ref())
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
    let model: save_model::SaveModel = (&file).deserialize(tokens::get_tokens())?;
    let (save, map_save) = model.split();

    Ok(SaveFile(SaveFileImpl {
        save,
        map_save,
        is_meltable: file.header().kind().is_binary(),
        world: None,
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsError> {
    let s = _parse_save(data)?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, Vic3Error> {
    let file = Vic3File::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    (&file).melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(JsError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pdx_map::{GpuColor, LocationFlags};

    /// Parse the save at VIC3_SAVE and color the map with the bundle at
    /// VIC3_GAME_BUNDLE (a compiled game.zip), when both are set.
    #[test]
    fn test_map_of_save() {
        let (Some(save_path), Some(bundle_path)) = (
            std::env::var_os("VIC3_SAVE"),
            std::env::var_os("VIC3_GAME_BUNDLE"),
        ) else {
            return;
        };

        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        set_tokens(std::fs::read(root.join("assets/tokens/vic3.bin")).unwrap());
        let save = std::fs::read(save_path).unwrap();
        let mut file = _parse_save(&save).unwrap().0;
        let game = vic3app::read_game_bundle(&std::fs::read(bundle_path).unwrap()).unwrap();
        file.world = Some(Vic3World::new(&file.map_save, game));
        let world = file.world().unwrap();

        let tag = file.metadata().last_played_tag;
        let capital = world.capital_province(&tag).unwrap();
        let details = world.province(capital).unwrap();
        assert_eq!(details.owner.map(|x| x.tag), Some(tag.clone()));

        let flags = world.location_flags(Some(&tag));
        let highlighted = flags
            .iter()
            .filter(|x| x.contains(LocationFlags::HIGHLIGHTED))
            .count();
        assert!(highlighted > 0);

        let arrays = world.political_location_arrays();
        let buffers = arrays.buffers();
        let owned = buffers
            .primary_colors()
            .iter()
            .filter(|x| ![GpuColor::WATER, GpuColor::UNOWNED, GpuColor::IMPASSABLE].contains(x))
            .count();
        let colored = world
            .landed_countries()
            .iter()
            .filter(|x| x.color != vic3app_fallback_hex(&x.tag))
            .count();
        println!(
            "{tag}: capital {capital} in {:?}, {highlighted} highlighted, {owned} owned provinces, {} landed countries ({colored} with game colors)",
            details.region_name,
            world.landed_countries().len(),
        );
    }

    fn vic3app_fallback_hex(tag: &str) -> String {
        let [r, g, b] = vic3app::fallback_color(tag);
        format!("#{r:02x}{g:02x}{b:02x}")
    }
}
