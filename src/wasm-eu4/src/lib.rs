use eu4game::{game::Game, shared::Eu4Parser};
use eu4save::{
    models::{Eu4Save, GameplayOptions},
    query::Query,
    CountryTag, Encoding, Eu4File, FailedResolveStrategy,
};
use savefile::{
    AchievementsScore, CountryAdvisors, CountryCasualties, CountryCulture, CountryDetails,
    CountryInfo, CountryLeader, CountryReligion, CountryStateDetails, Estate, HealthData,
    IdeaGroup, LocalizedCountryExpense, LocalizedCountryIncome, LocalizedLedger, LocalizedTag,
    MapCursorPayload, MapPayload, MapPayloadKind, MapQuickTipPayload, Monitor,
    OwnedDevelopmentStates, PlayerHistory, ProvinceDetails, Reparse, RootTree, RunningMonarch,
    SaveFileImpl, SaveMode, SingleCountryWarCasualties, TagFilterPayloadRaw, War, WarInfo,
};
use serde::Serialize;
use std::collections::HashMap;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

mod log;
mod savefile;
mod tokens;

pub use tokens::*;

#[wasm_bindgen(typescript_custom_section)]
const COUNTRY_TAG_TYPE: &'static str = r#"export type CountryTag = string;"#;
#[wasm_bindgen(typescript_custom_section)]
const EU4_DATE_TYPE: &'static str = r#"export type Eu4Date = string;"#;
#[wasm_bindgen(typescript_custom_section)]
const PROVINCE_ID_TYPE: &'static str = r#"export type ProvinceId = number;"#;

/// Looks like bindgen doesn't include generics in the typescript signature
/// so we create concrete types for all the return types
macro_rules! wasm_wrapper {
    ($name:ident,$ty:ty) => {
        #[derive(Tsify, Serialize)]
        #[tsify(into_wasm_abi)]
        #[serde(transparent)]
        pub struct $name($ty);
        impl Into<$name> for $ty {
            fn into(self) -> $name {
                $name(self)
            }
        }
    };
}

wasm_wrapper!(CountryReligions, Vec<CountryReligion>);
wasm_wrapper!(CountryCultures, Vec<CountryCulture>);
wasm_wrapper!(StringList, Vec<String>);
wasm_wrapper!(I32List, Vec<i32>);
wasm_wrapper!(CountriesIncome, HashMap<CountryTag, LocalizedCountryIncome>);
wasm_wrapper!(CountriesExpenses, HashMap<CountryTag, LocalizedCountryExpense>);
wasm_wrapper!(Estates, Vec<Estate<'static>>);
wasm_wrapper!(OwnedDevelopmentStatesList, Vec<OwnedDevelopmentStates>);
wasm_wrapper!(CountriesCasualties, Vec<CountryCasualties>);
wasm_wrapper!(LocalizedTags, Vec<LocalizedTag>);
wasm_wrapper!(CountryStateDetailsList, Vec<CountryStateDetails>);
wasm_wrapper!(CountryTags, Vec<CountryTag>);
wasm_wrapper!(CountryInfoList, Vec<CountryInfo>);
wasm_wrapper!(RunningMonarchs, Vec<RunningMonarch>);
wasm_wrapper!(CountryLeaders, Vec<CountryLeader>);
wasm_wrapper!(
    SingleCountryWarCasualtiesList,
    Vec<SingleCountryWarCasualties>
);
wasm_wrapper!(Wars, Vec<War>);
wasm_wrapper!(PlayerHistories, Vec<PlayerHistory>);
wasm_wrapper!(IdeaGroups, Vec<IdeaGroup>);
wasm_wrapper!(MetaRef, &'static eu4save::models::Meta);
wasm_wrapper!(OptionalCountryTag, Option<CountryTag>);
wasm_wrapper!(StaticMap, HashMap<&'static str, &'static str>);

#[wasm_bindgen]
pub struct SaveFile(SaveFileImpl);

#[wasm_bindgen]
impl SaveFile {
    pub fn reparse(&mut self, frequency: String, save_data: Vec<u8>) -> Result<Reparse, JsValue> {
        self.0.reparse(&frequency, save_data).map_err(js_err)
    }

    pub fn get_meta_raw(&self) -> MetaRef {
        MetaRef(unsafe { std::mem::transmute(self.0.get_meta_raw()) })
    }

    pub fn gameplay_options(&self) -> GameplayOptions {
        self.0.gameplay_options().clone()
    }

    pub fn savefile_warnings(&self) -> StringList {
        self.0.savefile_warnings().into()
    }

    pub fn get_annual_income_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        self.0.get_annual_income_ledger(payload)
    }

    pub fn get_annual_nation_size_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        self.0.get_annual_nation_size_ledger(payload)
    }

    pub fn get_annual_score_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        self.0.get_annual_score_ledger(payload)
    }

    pub fn get_annual_inflation_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        self.0.get_annual_inflation_ledger(payload)
    }

    pub fn get_achievements(&self) -> AchievementsScore {
        self.0.get_achievements()
    }

    pub fn get_starting_country(&self) -> OptionalCountryTag {
        self.0.get_starting_country().into()
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

    pub fn get_players(&self) -> StaticMap {
        StaticMap(unsafe { std::mem::transmute(self.0.get_players()) })
    }

    pub fn get_player_histories(&self) -> PlayerHistories {
        self.0.get_player_histories().into()
    }

    pub fn get_lucky_countries(&self) -> LocalizedTags {
        self.0.get_lucky_countries().into()
    }

    pub fn get_alive_countries(&self) -> CountryTags {
        self.0.get_alive_countries().into()
    }

    pub fn localize_country(&self, tag: String) -> String {
        self.0.localize_country(tag)
    }

    pub fn get_dlc_ids(&self) -> I32List {
        self.0.get_dlc_ids().into()
    }

    pub fn playthrough_id(&self) -> String {
        self.0.playthrough_id()
    }

    pub fn save_encoding(&self) -> Encoding {
        self.0.save_encoding()
    }

    pub fn save_mode(&self) -> SaveMode {
        self.0.save_mode()
    }

    pub fn get_health(&self, payload: TagFilterPayloadRaw) -> HealthData {
        self.0.get_health(payload)
    }

    pub fn get_countries(&self) -> CountryInfoList {
        self.0.get_countries().into()
    }

    pub fn get_country(&self, tag: String) -> CountryDetails {
        self.0.get_country(tag)
    }

    pub fn get_countries_income(&self, payload: TagFilterPayloadRaw) -> CountriesIncome {
        self.0.get_countries_income(payload).into()
    }

    pub fn get_countries_expenses(&self, payload: TagFilterPayloadRaw) -> CountriesExpenses {
        self.0.get_countries_expenses(payload).into()
    }

    pub fn get_countries_total_expenses(&self, payload: TagFilterPayloadRaw) -> CountriesExpenses {
        self.0.get_countries_total_expenses(payload).into()
    }

    pub fn geographical_development(&self, payload: TagFilterPayloadRaw) -> RootTree {
        self.0.geographical_development(payload)
    }

    pub fn get_province_details(&self, province_id: u16) -> Option<ProvinceDetails> {
        self.0.get_province_details(province_id)
    }

    pub fn owned_development_states(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> OwnedDevelopmentStatesList {
        self.0.owned_development_states(payload).into()
    }

    pub fn get_country_rulers(&self, tag: &str) -> RunningMonarchs {
        self.0.get_country_rulers(tag).into()
    }

    pub fn get_country_advisors(&self, tag: &str) -> CountryAdvisors {
        self.0.get_country_advisors(tag)
    }

    pub fn get_country_province_religion(&self, tag: &str) -> CountryReligions {
        self.0.get_country_province_religion(tag).into()
    }

    pub fn get_country_province_culture(&self, tag: &str) -> CountryCultures {
        self.0.get_country_province_culture(tag).into()
    }

    pub fn get_country_leaders(&self, tag: &str) -> CountryLeaders {
        self.0.get_country_leaders(tag).into()
    }

    pub fn get_country_states(&self, tag: &str) -> CountryStateDetailsList {
        self.0.get_country_states(tag).into()
    }

    pub fn get_country_estates(&self, tag: &str) -> Estates {
        let result = self.0.get_country_estates(tag);
        let trans: Vec<Estate<'static>> = unsafe { std::mem::transmute(result) };
        trans.into()
    }

    pub fn get_nation_idea_groups(&self, payload: TagFilterPayloadRaw) -> IdeaGroups {
        self.0.get_nation_idea_groups(payload).into()
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

    pub fn map_colors(&self, payload: MapPayload) -> Result<Vec<u8>, JsValue> {
        Ok(self.0.map_colors(payload))
    }

    pub fn map_cursor(
        &self,
        payload: MapCursorPayload,
    ) -> Result<savefile::TimelapseIter, JsValue> {
        Ok(self.0.map_cursor(payload))
    }

    pub fn map_quick_tip(
        &self,
        province_id: i32,
        payload: MapPayloadKind,
        days: Option<i32>,
    ) -> Option<MapQuickTipPayload> {
        self.0.map_quick_tip(province_id, payload, days)
    }

    pub fn initial_map_position(&self) -> js_sys::Uint16Array {
        let (x, y) = self.0.initial_map_position();
        js_sys::Uint16Array::from(&[x, y][..])
    }

    pub fn map_position_of_tag(&self, tag: &str) -> js_sys::Uint16Array {
        let (x, y) = self.0.map_position_of_tag(tag);
        js_sys::Uint16Array::from(&[x, y][..])
    }

    pub fn matching_countries(&self, payload: TagFilterPayloadRaw) -> LocalizedTags {
        self.0.matching_countries(payload).into()
    }

    pub fn countries_war_losses(&self, payload: TagFilterPayloadRaw) -> CountriesCasualties {
        self.0.countries_war_losses(payload).into()
    }

    pub fn wars(&self, payload: TagFilterPayloadRaw) -> Wars {
        self.0.wars(payload).into()
    }

    pub fn get_country_casualties(&self, tag: &str) -> SingleCountryWarCasualtiesList {
        self.0.get_country_casualties(tag).into()
    }

    pub fn get_war(&self, war_name: String) -> WarInfo {
        self.0.get_war(&war_name)
    }

    pub fn monitoring_data(&self) -> Monitor {
        self.0.monitoring_data()
    }
}

fn js_err(err: impl std::error::Error) -> JsValue {
    JsValue::from(err.to_string())
}

#[wasm_bindgen]
pub struct SaveFileParsed(Eu4Save, Encoding);

#[wasm_bindgen]
pub fn parse_meta(data: &[u8]) -> Result<eu4save::models::Meta, JsValue> {
    let tokens = tokens::get_tokens();
    eu4game::shared::parse_meta(data, tokens).map_err(js_err)
}

#[wasm_bindgen]
pub fn parse_save(
    save_data: Vec<u8>,
    game_data: Vec<u8>,
    province_id_to_color_index: Vec<u16>,
) -> Result<SaveFile, JsValue> {
    let tokens = tokens::get_tokens();
    let mut parser = Eu4Parser::new();
    let out = parser
        .parse_with(&save_data, tokens)
        .or_else(|_| parser.with_debug(true).parse_with(&save_data, tokens))
        .map_err(js_err)?;

    let save = SaveFileParsed(out.save, out.encoding);
    game_save(save, game_data, province_id_to_color_index)
}

pub fn game_save(
    save: SaveFileParsed,
    game_data: Vec<u8>,
    province_id_to_color_index: Vec<u16>,
) -> Result<SaveFile, JsValue> {
    let game_data = zstd::bulk::decompress(&game_data, 1024 * 1024)
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))?;
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
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsValue> {
    let mut zip_sink = Vec::new();
    Eu4File::from_slice(data)
        .and_then(|file| file.parse(&mut zip_sink))
        .and_then(|file| {
            file.as_binary()
                .unwrap()
                .melter()
                .on_failed_resolve(FailedResolveStrategy::Ignore)
                .melt(tokens::get_tokens())
        })
        .map(|x| js_sys::Uint8Array::from(x.data()))
        .map_err(|e| JsValue::from_str(e.to_string().as_str()))
}
