use hoi4save::{
    models::Hoi4Save, CountryTag, Encoding, FailedResolveStrategy, Hoi4Error, Hoi4File, MeltOptions,
};
use std::{collections::HashMap, io::Cursor};
use wasm_bindgen::prelude::*;

mod log;
mod tokens;
pub use tokens::*;

use crate::models::{CountryDetails, Hoi4Metadata};
mod models;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;

#[derive(Debug)]
pub struct SaveFileImpl {
    save: Hoi4Save,
    encoding: Encoding,
}

#[wasm_bindgen]
#[derive(Debug)]
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
