use hoi4save::{
    models::Hoi4Save, CountryTag, Encoding, FailedResolveStrategy, Hoi4Date, Hoi4Error, Hoi4File,
};
use serde::Serialize;
use std::collections::HashMap;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

mod log;
mod tokens;
pub use tokens::*;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Hoi4Metadata {
    date: Hoi4Date,
    is_meltable: bool,
    player: String,
    countries: Vec<CountryTag>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountryDetails {
    stability: f64,
    war_support: f64,
    variable_categories: HashMap<String, Vec<f64>>,
    variables: HashMap<String, f64>,
}

pub struct SaveFileImpl {
    save: Hoi4Save,
    encoding: Encoding,
}

#[wasm_bindgen]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn metadata(&self) -> Hoi4Metadata {
        self.0.metadata()
    }

    pub fn country_details(&self, tag: String) -> CountryDetails {
        self.0.country_details(tag)
    }
}

impl SaveFileImpl {
    pub fn metadata(&self) -> Hoi4Metadata {
        let mut countries: Vec<_> = self.save.countries.iter().map(|(tag, _)| *tag).collect();
        countries.sort_unstable();
        Hoi4Metadata {
            date: self.save.date,
            is_meltable: self.is_meltable(),
            player: self.save.player.clone(),
            countries,
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
    }))
}

#[wasm_bindgen]
pub fn parse_save(data: &[u8]) -> Result<SaveFile, JsValue> {
    let s = _parse_save(data).map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
    Ok(s)
}

fn _melt(data: &[u8]) -> Result<hoi4save::MeltedDocument, Hoi4Error> {
    let file = Hoi4File::from_slice(data)?;
    let parsed_file = file.parse()?;
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
