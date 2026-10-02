use hoi4app::{Hoi4World, ProvinceDetails, ProvinceId};
use hoi4save::{
    CountryTag, Encoding, FailedResolveStrategy, Hoi4Error, Hoi4File, MeltOptions, models::Hoi4Save,
};
use std::{collections::HashMap, io::Cursor};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

mod log;
mod tokens;
pub use tokens::*;

use crate::models::{CountryDetails, Hoi4Metadata, LandedCountries};
mod models;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;

#[derive(Debug)]
pub struct SaveFileImpl {
    save: Hoi4Save,
    encoding: Encoding,
    world: Option<Hoi4World>,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> Result<Ts<Hoi4Metadata>, JsError> {
        Ok(self.0.metadata().into_ts()?)
    }

    pub fn country_details(&self, tag: String) -> Result<Ts<CountryDetails>, JsError> {
        Ok(self.0.country_details(tag).into_ts()?)
    }

    /// Load the game data of the asset bundle (game.zip) so that the save
    /// can describe and color the map.
    pub fn load_game_bundle(&mut self, data: &[u8]) -> Result<(), JsError> {
        let game = hoi4app::read_game_bundle(data)
            .map_err(|e| JsError::new(&format!("Failed to open game bundle: {e}")))?;
        self.0.world = Some(Hoi4World::new(&self.0.save, game));
        Ok(())
    }

    /// The location arrays that color the map by owner and controller
    pub fn location_arrays(&self) -> Result<js_sys::Uint32Array, JsError> {
        let arrays = self.0.world()?.political_location_arrays();
        Ok(js_sys::Uint32Array::from(arrays.as_data()))
    }

    /// The flags of each location with the provinces of `tag` highlighted
    pub fn location_flags(&self, tag: Option<String>) -> Result<js_sys::Uint32Array, JsError> {
        let tag = tag.map(|x| x.parse::<CountryTag>()).transpose()?;
        let flags: Vec<u32> = self
            .0
            .world()?
            .location_flags(tag)
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

    /// A province in the capital of the country
    pub fn capital_province(&self, tag: String) -> Result<Option<u32>, JsError> {
        let tag = tag.parse::<CountryTag>()?;
        Ok(self.0.world()?.capital_province(tag).map(ProvinceId::value))
    }
}

impl SaveFileImpl {
    fn world(&self) -> Result<&Hoi4World, JsError> {
        self.world
            .as_ref()
            .ok_or_else(|| JsError::new("game bundle is not loaded"))
    }

    pub fn metadata(&self) -> Hoi4Metadata {
        let mut countries: Vec<_> = self.save.countries.iter().map(|(tag, _)| *tag).collect();
        countries.sort_unstable();
        Hoi4Metadata {
            date: self.save.date,
            is_meltable: self.is_meltable(),
            player: self.save.player.clone(),
            countries,
            version: self.save.version.clone(),
            bundle_version: self
                .save
                .version
                .as_deref()
                .and_then(hoi4app::bundle_version),
        }
    }

    fn is_meltable(&self) -> bool {
        matches!(self.encoding, Encoding::Binary)
    }

    pub fn country_details(&self, tag: String) -> CountryDetails {
        let tag = tag.parse::<CountryTag>().unwrap();
        let (_, country) = self.save.countries.iter().find(|(t, _)| *t == tag).unwrap();

        let variable_groups = country.variables.iter().filter_map(|(k, v)| {
            k.rsplit_once("^").and_then(|(cat, ind)| {
                if ind == "num" {
                    None
                } else {
                    ind.parse::<usize>().ok().map(|ind| (cat, ind, *v))
                }
            })
        });

        let mut variable_group = HashMap::new();
        for (group, index, value) in variable_groups {
            let elems: &mut Vec<_> = variable_group.entry(group).or_default();
            elems.push((index, value));
        }

        let variable_categories: HashMap<_, _> = variable_group
            .into_iter()
            .map(|(group, mut values)| {
                values.sort_unstable_by_key(|(ind, _)| *ind);
                let result: Vec<_> = values.into_iter().map(|(_, value)| value).collect();
                (String::from(group), result)
            })
            .collect();

        CountryDetails {
            stability: country.stability,
            war_support: country.war_support,
            variable_categories,
            variables: country.variables.clone(),
        }
    }
}

fn _parse_save(data: &[u8]) -> Result<SaveFile, Hoi4Error> {
    let file = Hoi4File::from_slice(data)?;
    let save = file.parse_save(tokens::get_tokens())?;
    Ok(SaveFile(SaveFileImpl {
        save,
        encoding: file.encoding(),
        world: None,
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsError> {
    let s = _parse_save(data)?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, Hoi4Error> {
    let file = Hoi4File::from_slice(data)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    file.melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(JsError::from)
}
