use crate::{
    models::{
        CountriesCasualties, CountriesExpenses, CountriesIncome, CountryCultures, CountryInfoList,
        CountryLeaders, CountryStateDetailsList, CountryTags, Estates, GreatPowers, IdeaGroups,
        LocalizedTags, MetaRef, OptionalCountryTag, OwnedDevelopmentStatesList, PlayerHistories,
        ProvinceList, RunningMonarchs, SingleCountryWarCasualtiesList, StaticMap, StringList, Wars,
    },
    savefile::{CountryHistory, CountryInstitution, CountryMana, SaveInfo},
};
use eu4game::{game::Game, shared::Eu4Parser};
use eu4save::{
    Encoding, Eu4File, FailedResolveStrategy, MeltOptions,
    models::{Eu4Save, Meta},
    query::Query,
};
use models::{CountriesManaExpenditure, CountryDevEfficiencies};
use savefile::{
    AchievementsScore, CountryAdvisors, CountryDetails, CountryReligions, Estate,
    FileObservationFrequency, HealthData, LocalizedLedger, MapCursorPayload, MapPayload,
    MapPayloadKind, MapQuickTipPayload, Monitor, ProvinceDetails, ProvinceDevDensity, Reparse,
    RootTree, SaveFileImpl, TagFilterPayloadRaw, WarInfo,
};
use std::{collections::HashMap, io::Cursor};
use tsify::{Ts, Tsify};
use wasm_bindgen::prelude::*;

fn into_ts<T>(value: T) -> Result<Ts<T>, JsError>
where
    T: serde::Serialize + Tsify,
{
    value.into_ts().map_err(JsError::from)
}

fn option_into_ts<T>(value: Option<T>) -> Result<Option<Ts<T>>, JsError>
where
    T: serde::Serialize + Tsify,
{
    value.map(into_ts).transpose()
}

mod log;
mod models;
mod savefile;
mod tokens;

pub use tokens::*;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;
#[wasm_bindgen(typescript_custom_section)]
const EU4_DATE_TYPE: &'static str = r#"export type Eu4Date = string;"#;
#[wasm_bindgen(typescript_custom_section)]
const PROVINCE_ID_TYPE: &'static str = r#"export type ProvinceId = number;"#;

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn reparse(
        &mut self,
        frequency: Ts<FileObservationFrequency>,
        save_data: Vec<u8>,
    ) -> Result<Ts<Reparse>, JsError> {
        let frequency = frequency.to_rust()?;
        into_ts(
            self.0
                .reparse(frequency, save_data)
                .map_err(JsError::from)?,
        )
    }

    pub fn get_meta_raw(&self) -> Result<Ts<MetaRef>, JsError> {
        into_ts(MetaRef(unsafe {
            std::mem::transmute::<&Meta, &Meta>(self.0.get_meta_raw())
        }))
    }

    pub fn savefile_warnings(&self) -> Result<Ts<StringList>, JsError> {
        into_ts(self.0.savefile_warnings().into())
    }

    pub fn get_annual_income_ledger(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<LocalizedLedger>, JsError> {
        into_ts(self.0.get_annual_income_ledger(payload.to_rust()?))
    }

    pub fn get_annual_nation_size_ledger(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<LocalizedLedger>, JsError> {
        into_ts(self.0.get_annual_nation_size_ledger(payload.to_rust()?))
    }

    pub fn get_annual_score_ledger(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<LocalizedLedger>, JsError> {
        into_ts(self.0.get_annual_score_ledger(payload.to_rust()?))
    }

    pub fn get_annual_inflation_ledger(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<LocalizedLedger>, JsError> {
        into_ts(self.0.get_annual_inflation_ledger(payload.to_rust()?))
    }

    pub fn get_achievements(&self) -> Result<Ts<AchievementsScore>, JsError> {
        into_ts(self.0.get_achievements())
    }

    pub fn get_starting_country(&self) -> Result<Ts<OptionalCountryTag>, JsError> {
        into_ts(self.0.get_starting_country().into())
    }

    pub fn get_start_date(&self) -> String {
        self.0.get_start_date()
    }

    pub fn get_total_days(&self) -> i32 {
        self.0.get_total_days()
    }

    pub fn days_to_date(&self, days: f64) -> String {
        self.0.days_to_date(days)
    }

    pub fn date_to_days(&self, date: &str) -> Option<f64> {
        self.0.date_to_days(date).map(|x| x as f64)
    }

    pub fn get_players(&self) -> Result<Ts<StaticMap>, JsError> {
        into_ts(StaticMap(unsafe {
            std::mem::transmute::<HashMap<&str, &str>, HashMap<&str, &str>>(self.0.get_players())
        }))
    }

    pub fn get_player_histories(&self) -> Result<Ts<PlayerHistories>, JsError> {
        into_ts(self.0.get_player_histories().into())
    }

    pub fn get_lucky_countries(&self) -> Result<Ts<LocalizedTags>, JsError> {
        into_ts(self.0.get_lucky_countries().into())
    }

    pub fn get_great_powers(&self) -> Result<Ts<GreatPowers>, JsError> {
        into_ts(self.0.get_great_powers().into())
    }

    pub fn get_alive_countries(&self) -> Result<Ts<CountryTags>, JsError> {
        into_ts(self.0.get_alive_countries().into())
    }

    pub fn localize_country(&self, tag: String) -> String {
        self.0.localize_country(tag)
    }

    pub fn save_info(&self) -> Result<Ts<SaveInfo>, JsError> {
        into_ts(self.0.save_info())
    }

    pub fn get_provinces(&self) -> Result<Ts<ProvinceList>, JsError> {
        into_ts(self.0.get_provinces().into())
    }

    pub fn get_health(&self, payload: Ts<TagFilterPayloadRaw>) -> Result<Ts<HealthData>, JsError> {
        into_ts(self.0.get_health(payload.to_rust()?))
    }

    pub fn get_countries(&self) -> Result<Ts<CountryInfoList>, JsError> {
        into_ts(self.0.get_countries().into())
    }

    pub fn get_country(&self, tag: String) -> Result<Ts<CountryDetails>, JsError> {
        into_ts(self.0.get_country(tag))
    }

    pub fn get_country_mana(&self, tag: &str) -> Result<Ts<CountryMana>, JsError> {
        into_ts(self.0.country_mana(tag))
    }

    pub fn get_countries_income(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountriesIncome>, JsError> {
        into_ts(self.0.get_countries_income(payload.to_rust()?).into())
    }

    pub fn get_countries_expenses(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountriesExpenses>, JsError> {
        into_ts(self.0.get_countries_expenses(payload.to_rust()?).into())
    }

    pub fn get_countries_total_expenses(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountriesExpenses>, JsError> {
        into_ts(
            self.0
                .get_countries_total_expenses(payload.to_rust()?)
                .into(),
        )
    }

    pub fn get_dev_efficiency(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountryDevEfficiencies>, JsError> {
        into_ts(self.0.get_dev_efficiency(payload.to_rust()?).into())
    }

    pub fn get_countries_mana(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountriesManaExpenditure>, JsError> {
        into_ts(self.0.get_countries_mana(payload.to_rust()?).into())
    }

    pub fn get_province_development_density(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<ProvinceDevDensity>, JsError> {
        into_ts(self.0.get_province_development_density(payload.to_rust()?))
    }

    pub fn geographical_development(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<RootTree>, JsError> {
        into_ts(self.0.geographical_development(payload.to_rust()?))
    }

    pub fn get_province_details(
        &self,
        province_id: u16,
    ) -> Result<Option<Ts<ProvinceDetails>>, JsError> {
        option_into_ts(self.0.get_province_details(province_id))
    }

    pub fn owned_development_states(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<OwnedDevelopmentStatesList>, JsError> {
        into_ts(self.0.owned_development_states(payload.to_rust()?).into())
    }

    pub fn get_country_rulers(&self, tag: &str) -> Result<Ts<RunningMonarchs>, JsError> {
        into_ts(self.0.get_country_rulers(tag).into())
    }

    pub fn get_country_advisors(&self, tag: &str) -> Result<Ts<CountryAdvisors>, JsError> {
        into_ts(self.0.get_country_advisors(tag))
    }

    pub fn get_country_history(&self, tag: &str) -> Result<Option<Ts<CountryHistory>>, JsError> {
        option_into_ts(self.0.country_history(tag))
    }

    pub fn get_country_institutions(
        &self,
        tag: &str,
        country_development_modifier: f64,
        expand_infrastructure_cost: i32,
        overrides: JsValue,
    ) -> Result<Ts<CountryInstitution>, JsError> {
        into_ts(self.0.institution_provinces(
            tag,
            country_development_modifier,
            expand_infrastructure_cost,
            overrides,
        ))
    }

    pub fn get_country_province_religion(
        &self,
        tag: &str,
    ) -> Result<Ts<CountryReligions>, JsError> {
        into_ts(self.0.get_country_province_religion(tag))
    }

    pub fn get_country_province_culture(&self, tag: &str) -> Result<Ts<CountryCultures>, JsError> {
        into_ts(self.0.get_country_province_culture(tag).into())
    }

    pub fn get_country_leaders(&self, tag: &str) -> Result<Ts<CountryLeaders>, JsError> {
        into_ts(self.0.get_country_leaders(tag).into())
    }

    pub fn get_country_states(&self, tag: &str) -> Result<Ts<CountryStateDetailsList>, JsError> {
        into_ts(self.0.get_country_states(tag).into())
    }

    pub fn get_country_estates(&self, tag: &str) -> Result<Ts<Estates>, JsError> {
        let result = self.0.get_country_estates(tag);
        let trans: Vec<Estate<'static>> = unsafe { std::mem::transmute(result) };
        into_ts(trans.into())
    }

    pub fn get_nation_idea_groups(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<IdeaGroups>, JsError> {
        into_ts(self.0.get_nation_idea_groups(payload.to_rust()?).into())
    }

    pub fn province_nation_owner_color(
        &self,
        only_players: bool,
        incl_subjects: bool,
        paint_subject_in_overlord_hue: bool,
    ) -> Vec<u8> {
        self.0.province_nation_owner_color(
            only_players,
            incl_subjects,
            paint_subject_in_overlord_hue,
        )
    }

    pub fn province_nation_controller_color(
        &self,
        only_players: bool,
        incl_subjects: bool,
        paint_subject_in_overlord_hue: bool,
    ) -> Vec<u8> {
        self.0.province_nation_controller_color(
            only_players,
            incl_subjects,
            paint_subject_in_overlord_hue,
        )
    }

    pub fn map_colors(&self, payload: Ts<MapPayload>) -> Result<Vec<u8>, JsError> {
        Ok(self.0.map_colors(payload.to_rust()?))
    }

    pub fn map_cursor(
        &self,
        payload: Ts<MapCursorPayload>,
    ) -> Result<savefile::TimelapseIter, JsError> {
        Ok(self.0.map_cursor(payload.to_rust()?))
    }

    pub fn map_quick_tip(
        &self,
        province_id: i32,
        payload: Ts<MapPayloadKind>,
        days: Option<i32>,
    ) -> Result<Option<Ts<MapQuickTipPayload>>, JsError> {
        option_into_ts(self.0.map_quick_tip(province_id, payload.to_rust()?, days))
    }

    pub fn initial_map_position(&self) -> js_sys::Uint16Array {
        let (x, y) = self.0.initial_map_position();
        js_sys::Uint16Array::from(&[x, y][..])
    }

    pub fn map_position_of_tag(&self, tag: &str) -> js_sys::Uint16Array {
        let (x, y) = self.0.map_position_of_tag(tag);
        js_sys::Uint16Array::from(&[x, y][..])
    }

    pub fn matching_countries(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<LocalizedTags>, JsError> {
        into_ts(self.0.matching_countries(payload.to_rust()?).into())
    }

    pub fn countries_war_losses(
        &self,
        payload: Ts<TagFilterPayloadRaw>,
    ) -> Result<Ts<CountriesCasualties>, JsError> {
        into_ts(self.0.countries_war_losses(payload.to_rust()?).into())
    }

    pub fn wars(&self, payload: Ts<TagFilterPayloadRaw>) -> Result<Ts<Wars>, JsError> {
        into_ts(self.0.wars(payload.to_rust()?).into())
    }

    pub fn get_country_casualties(
        &self,
        tag: &str,
    ) -> Result<Ts<SingleCountryWarCasualtiesList>, JsError> {
        into_ts(self.0.get_country_casualties(tag).into())
    }

    pub fn get_war(&self, war_name: String) -> Result<Option<Ts<WarInfo>>, JsError> {
        option_into_ts(self.0.get_war(&war_name))
    }

    pub fn monitoring_data(&self) -> Result<Ts<Monitor>, JsError> {
        into_ts(self.0.monitoring_data())
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveFileParsed(Eu4Save, Encoding);

#[wasm_bindgen]
pub fn parse_meta(data: &[u8]) -> Result<eu4save::models::Meta, JsError> {
    wasm_pdx_core::console_error_panic_hook::set_once();
    let tokens = tokens::get_tokens();
    eu4game::shared::parse_meta(data, tokens).map_err(JsError::from)
}

#[wasm_bindgen]
pub fn parse_save(
    save_data: Vec<u8>,
    game_data: Vec<u8>,
    province_id_to_color_index: Vec<u16>,
) -> Result<SaveFile, JsError> {
    let tokens = tokens::get_tokens();
    let mut parser = Eu4Parser::new();
    let out = parser
        .parse_with(&save_data, tokens)
        .or_else(|_| parser.with_debug(true).parse_with(&save_data, tokens))?;

    let save = SaveFileParsed(out.save, out.encoding);
    game_save(save, game_data, province_id_to_color_index)
}

pub fn game_save(
    save: SaveFileParsed,
    game_data: Vec<u8>,
    province_id_to_color_index: Vec<u16>,
) -> Result<SaveFile, JsError> {
    let game_data = pdx_zstd::decode_all(&game_data)?;
    let game = Game::from_flatbuffer(&game_data);
    // Cast away the lifetime so that we can store it in a wasm-bindgen compatible struct
    let game: Game<'static> = unsafe { std::mem::transmute(game) };

    let query = Query::from_save(save.0);
    let province_owners = query.province_owners();
    let nation_events = query.nation_events(&province_owners);
    let player_histories = query.player_histories(&nation_events);
    let tag_resolver = query.tag_resolver(&nation_events);
    let war_participants = query.resolved_war_participants(&tag_resolver);
    let religion_lookup = query.religion_lookup();
    Ok(SaveFile(SaveFileImpl {
        query,
        game,
        _game_data: game_data,
        encoding: save.1,
        province_owners,
        nation_events,
        tag_resolver,
        war_participants,
        player_histories,
        religion_lookup,
        province_id_to_color_index,
    }))
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    if pdx_zstd::is_zstd_compressed(data) {
        let inflated = pdx_zstd::decode_all(data)
            .map_err(|e| JsError::new(&format!("Decompression error: {}", e)))?;
        _melt(&inflated)
    } else {
        _melt(data)
    }
}

fn _melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    let mut output = Cursor::new(Vec::new());
    Eu4File::from_slice(data)
        .and_then(|file| {
            file.melt(
                MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore),
                tokens::get_tokens(),
                &mut output,
            )
        })
        .map(|_| js_sys::Uint8Array::from(output.get_ref().as_slice()))
        .map_err(JsError::from)
}
