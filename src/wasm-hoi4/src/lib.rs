use hoi4app::{
    Hoi4Overview, Hoi4World, MapMatch, MapMode, ProvinceDetails, ProvinceId, save::SaveModel,
};
use hoi4save::{
    CountryTag, Encoding, FailedResolveStrategy, Hoi4Error, Hoi4File, MeltOptions,
    file::{Hoi4Modeller, Hoi4TextReader},
};
use rawzip::{RangeReader, ReaderAt};
use std::{collections::HashMap, io::Cursor};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;
use wasm_pdx_core::blob::BlobReader;

mod log;
mod tokens;
pub use tokens::*;

use crate::models::{CountryDetails, Hoi4Metadata, LandedCountries};
mod models;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;

#[derive(Debug)]
pub struct SaveFileImpl {
    save: SaveModel,
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

    /// Describe the save without game data, when no asset bundle matches the
    /// save. Countries are then named by their tags.
    pub fn load_without_game_bundle(&mut self) {
        self.0.world = Some(Hoi4World::new(&self.0.save, hoi4app::GameData::default()));
    }

    /// The location arrays that color the map in a map mode
    pub fn location_arrays(&self, mode: Ts<MapMode>) -> Result<js_sys::Uint32Array, JsError> {
        let arrays = self.0.world()?.location_arrays(mode.to_rust()?);
        Ok(js_sys::Uint32Array::from(arrays.as_data()))
    }

    /// The flags of each location: land outside `focus` is dimmed and land
    /// in `hover` is highlighted
    pub fn match_flags(
        &self,
        focus: Ts<MapMatch>,
        hover: Ts<MapMatch>,
    ) -> Result<js_sys::Uint32Array, JsError> {
        let flags: Vec<u32> = self
            .0
            .world()?
            .match_flags(&focus.to_rust()?, &hover.to_rust()?)
            .into_iter()
            .map(|x| x.bits())
            .collect();
        Ok(js_sys::Uint32Array::from(flags.as_slice()))
    }

    /// The countries, factions, occupations, wars, and events of the save
    pub fn overview(&self) -> Result<Ts<Hoi4Overview>, JsError> {
        Ok(self.0.world()?.overview(&self.0.save).into_ts()?)
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

/// The length of the "HOI4txt" and "HOI4bin" headers
const HEADER_LEN: u64 = 7;

/// Parse a save that the parser reads in parts
fn parse_reader<R: ReaderAt + 'static>(reader: R, size: u64) -> Result<SaveFile, Hoi4Error> {
    let mut header = [0u8; HEADER_LEN as usize];
    reader.read_exact_at(&mut header, 0)?;
    let encoding = Hoi4File::from_slice(&header)?.encoding();

    let body = RangeReader::new(reader, HEADER_LEN..size);
    let save: SaveModel = match encoding {
        Encoding::Plaintext => Hoi4TextReader::from_reader(body)
            .deserializer()
            .deserialize()?,
        Encoding::Binary => {
            Hoi4Modeller::from_reader(body, tokens::get_tokens(), Encoding::Binary).deserialize()?
        }
    };

    Ok(SaveFile(SaveFileImpl {
        save,
        encoding,
        world: None,
    }))
}

/// HOI4 saves are not compressed, so the parser reads the `Blob` in parts and
/// the save is never copied completely into wasm memory.
#[wasm_bindgen]
pub fn parse_save(save: web_sys::Blob) -> Result<SaveFile, JsError> {
    let reader = BlobReader::streaming(save)?;
    let size = reader.size();
    let s = parse_reader(reader, size)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Parse the save at HOI4_SAVE, when it is set.
    #[test]
    fn test_parse_save() {
        let Some(save_path) = std::env::var_os("HOI4_SAVE") else {
            return;
        };

        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        set_tokens(std::fs::read(root.join("assets/tokens/hoi4.bin")).unwrap());
        let data = std::fs::read(save_path).unwrap();
        let expected = Hoi4File::from_slice(&data)
            .unwrap()
            .parse_save(tokens::get_tokens())
            .unwrap();

        let size = data.len() as u64;
        let mut file = parse_reader(data, size).unwrap().0;
        assert_eq!(file.save.player, expected.player);
        assert_eq!(file.save.date, expected.date);
        assert_eq!(file.save.countries.len(), expected.countries.len());

        let bundle = std::fs::read(root.join("assets/game/hoi4/1.19/game.zip")).unwrap();
        let game = hoi4app::read_game_bundle(&bundle).unwrap();
        file.world = Some(Hoi4World::new(&file.save, game));
        let overview = file.world.as_ref().unwrap().overview(&file.save);
        if std::env::var_os("HOI4_OVERVIEW").is_some() {
            println!("{}", serde_json::to_string_pretty(&overview).unwrap());
        }
        assert!(overview.total_factories > 0);
    }
}
