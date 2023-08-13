use crate::tokens;
use eu4game::{
    achievements::AchievementHunter,
    game::Game,
    shared::{playthrough_id, Eu4Parser},
    Eu4GameError, SaveGameQuery,
};
use eu4save::{
    eu4_start_date,
    models::{
        Country, CountryEvent, CountryTechnology, GameplayOptions, Leader, Province, ProvinceEvent,
        ProvinceEventValue, WarEvent,
    },
    query::{
        CountryExpenseLedger, CountryIncomeLedger, LedgerPoint, NationEventKind, NationEvents,
        Query,
    },
    CountryTag, Encoding, Eu4Date, PdsDate, ProvinceId, TagResolver,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

mod country_details;
mod map;
mod tag_filter;

pub use country_details::*;
pub use map::*;
pub use tag_filter::*;

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct LocalizedObj {
    pub id: String,
    pub name: String,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct LocalizedTag {
    pub tag: CountryTag,
    pub name: String,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct GfxObj {
    pub id: String,
    pub name: String,
    pub gfx: String,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct CountryInfo {
    pub tag: String,
    pub name: String,
    pub is_human: bool,
    pub is_alive: bool,
    pub existed: bool,
    pub color: String,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
#[tsify(into_wasm_abi)]
pub struct ProvinceDetails {
    pub id: ProvinceId,
    pub name: String,
    pub owner: Option<LocalizedTag>,
    pub controller: Option<LocalizedTag>,
    pub cores: Vec<LocalizedTag>,
    pub claims: Vec<LocalizedTag>,
    pub religion: Option<String>,
    pub culture: Option<String>,
    pub base_tax: f32,
    pub base_production: f32,
    pub base_manpower: f32,
    pub devastation: f32,
    pub trade_goods: Option<String>,
    pub latent_trade_goods: Vec<String>,
    pub buildings: Vec<GfxObj>,
    pub map_area: Option<MapAreaDetails>,
    pub is_in_trade_company: bool,
    pub improvements: Vec<ProvinceCountryImprovement>,
    pub history: Vec<ProvinceHistoryEvent>,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
pub struct MapAreaDetails {
    pub area_id: String,
    pub area_name: String,
    pub states: Vec<CountryState>,
    pub investments: Vec<TradeCompanyInvestments>,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
pub struct CountryState {
    pub country: LocalizedTag,
    pub prosperity: f32,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
pub struct ProvinceCountryImprovement {
    pub country: LocalizedTag,
    pub improvements: i32,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
pub struct TradeCompanyInvestments {
    pub country: LocalizedTag,
    pub investments: Vec<LocalizedObj>,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
pub struct ProvinceHistoryEvent {
    pub date: String,
    pub data: ProvinceHistoryEventKind,
}

#[derive(Tsify, Serialize, Deserialize, Debug)]
#[serde(tag = "kind")]
pub enum ProvinceHistoryEventKind {
    Owner(LocalizedTag),
    Constructed(GfxObj),
    Demolished(GfxObj),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LedgerDatum {
    pub name: String,
    pub tag: String,
    pub x: u16,
    pub y: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LedgerData {
    pub data: Vec<LedgerDatum>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AnnualLedgers {
    pub score: LedgerData,
    pub inflation: LedgerData,
    pub income: LedgerData,
    pub size: LedgerData,
}

#[derive(Tsify, Debug, Serialize)]
pub struct GameVersion {
    pub first: u16,
    pub second: u16,
    pub third: u16,
    pub fourth: u16,
}

#[derive(Tsify, Debug, Serialize)]
pub enum AchievementCompatibility {
    Compatible,
    Incompatible,
}

#[derive(Tsify, Debug, Serialize)]
pub struct CompletedAchievement {
    pub id: i32,
    pub name: String,
}

#[derive(Tsify, Debug, Serialize)]
#[tsify(into_wasm_abi)]
pub struct AchievementsScore {
    pub kind: AchievementCompatibility,
    pub patch: GameVersion,
    pub score: i32,
    pub achievements: Vec<CompletedAchievement>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BuildingHistory<'a> {
    pub building: &'a str,
    pub year: i32,
    pub count: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NationSizeHistory {
    pub tag: CountryTag,
    pub year: u16,
    pub count: i32,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct War {
    pub name: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub days: i32,
    pub attackers: WarSide,
    pub defenders: WarSide,
    pub battles: i32,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct WarSide {
    pub original: CountryTag,
    pub original_name: String,
    pub members: Vec<CountryTag>,
    pub losses: [u32; 21],
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
#[tsify(into_wasm_abi)]
pub struct WarInfo {
    pub battles: Vec<BattleInfo>,
    pub attacker_participants: Vec<WarParticipant>,
    pub defender_participants: Vec<WarParticipant>,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct BattleInfo {
    pub name: String,
    pub date: String,
    pub location: u16,
    pub attacker_won: bool,
    pub attacker: BattleSide,
    pub defender: BattleSide,
    pub winner_alliance: f32,
    pub loser_alliance: f32,
    pub losses: i32,
    pub forces: u32,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct BattleSide {
    pub cavalry: u32,
    pub infantry: u32,
    pub artillery: u32,
    pub heavy_ship: u32,
    pub light_ship: u32,
    pub galley: u32,
    pub transport: u32,
    pub losses: i32,
    pub country: CountryTag,
    pub country_name: String,
    pub commander: Option<String>,
    pub commander_stats: Option<String>,
}

impl BattleSide {
    pub fn forces(&self) -> u32 {
        self.infantry
            + self.cavalry
            + self.artillery
            + self.heavy_ship
            + self.light_ship
            + self.galley
            + self.transport
    }
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct WarParticipant {
    pub tag: CountryTag,
    pub name: String,
    pub losses: [u32; 21],
    pub participation: f32,
    pub participation_percent: f64,
    pub joined: Option<String>,
    pub exited: Option<String>,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct SingleCountryWarCasualties {
    pub war: String,
    pub losses: [u32; 21],
    pub participation: f32,
    pub participation_percent: f64,
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct PlayerHistory {
    pub name: String,
    pub latest: CountryTag,
    pub annexed: Option<Eu4Date>,
    pub is_human: bool,
    pub transitions: Vec<TagTransition>,
    pub player_names: Vec<String>,
}

#[derive(Tsify, Serialize, Deserialize, Clone, Debug)]
pub struct TagTransition {
    pub name: String,
    pub tag: CountryTag,
    pub date: Eu4Date,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct LocalizedCountryIncome {
    income: CountryIncomeLedger,
    name: String,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct LocalizedCountryExpense {
    expenses: CountryExpenseLedger,
    name: String,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct CountryCasualties {
    tag: CountryTag,
    name: String,
    losses: [u32; 21],
}

#[derive(Tsify, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[tsify(into_wasm_abi)]
pub enum SaveMode {
    Normal,
    Multiplayer,
    IronmanOk,
    IronmanNo,
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct OptionalLedgerPoint {
    pub tag: CountryTag,
    pub year: u16,
    pub value: Option<i32>,
}

#[derive(Tsify, Debug, Clone, Serialize)]
#[tsify(into_wasm_abi)]
pub struct LocalizedLedger {
    pub points: Vec<OptionalLedgerPoint>,
    pub localization: Vec<LocalizedTag>,
}

#[derive(Tsify, Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub enum Reparse {
    TooSoon { date: Eu4Date },
    Updated,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct Monitor {
    date: Eu4Date,
    countries: Vec<country_details::CountryDetails>,
}

#[derive(Tsify, Serialize, Clone, Debug)]
struct HealthDatum {
    color: u8,
    value: f32,
}

#[derive(Tsify, Serialize, Clone, Debug)]
struct LeaderDatum {
    color: u8,
    value: f32,
    fire: u16,
    shock: u16,
    manuever: u16,
    siege: u16,
}

#[derive(Tsify, Serialize, Clone, Debug)]
struct HealthTechnology {
    color: u8,
    value: f32,
    adm: u8,
    dip: u8,
    mil: u8,
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct CountryHealth {
    tag: CountryTag,
    name: String,

    // economy
    core_income: HealthDatum,
    treasury_balance: HealthDatum,
    development: HealthDatum,
    buildings: HealthDatum,
    inflation: HealthDatum,

    // army
    best_general: LeaderDatum,
    army_tradition: HealthDatum,
    manpower_balance: HealthDatum,
    standard_regiments: HealthDatum,
    professionalism: HealthDatum,

    // navy
    best_admiral: LeaderDatum,
    navy_tradition: HealthDatum,
    ships: HealthDatum,

    // other
    stability: HealthDatum,
    technology: HealthTechnology,
    ideas: HealthDatum,
    corruption: HealthDatum,
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[tsify(into_wasm_abi)]
pub struct HealthData {
    data: Vec<CountryHealth>,
}

#[derive(Tsify, Serialize, Clone, Debug, Default)]
pub struct ProvinceDevelopment {
    tax: f32,
    production: f32,
    manpower: f32,
}

impl ProvinceDevelopment {
    fn total(&self) -> f32 {
        self.tax + self.production + self.manpower
    }
}

impl std::ops::AddAssign<&Province> for ProvinceDevelopment {
    fn add_assign(&mut self, rhs: &Province) {
        self.tax += rhs.base_tax;
        self.production += rhs.base_production;
        self.manpower += rhs.base_manpower;
    }
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OwnedDevelopmentStates {
    country: LocalizedTag,
    full_cores: ProvinceDevelopment,
    half_states: ProvinceDevelopment,
    territories: ProvinceDevelopment,
    no_core: ProvinceDevelopment,
    tc: ProvinceDevelopment,
}

impl OwnedDevelopmentStates {
    fn total(&self) -> f32 {
        self.full_cores.total()
            + self.half_states.total()
            + self.territories.total()
            + self.no_core.total()
            + self.tc.total()
    }
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IdeaGroup {
    group_rank: usize,
    group_name: String,
    completed_ideas: u8,
}

#[derive(Tsify, Serialize)]
struct ProvinceIdDevelopment {
    name: String,
    id: ProvinceId,
    tax: f32,
    production: f32,
    manpower: f32,
    value: f32,
}

#[derive(Tsify, Default, Serialize)]
struct AreaDevelopmentValue {
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<ProvinceIdDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct AreaDevelopment {
    name: String,
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<ProvinceIdDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct RegionDevelopmentValue {
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<AreaDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct RegionDevelopment {
    name: String,
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<AreaDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct SuperRegionDevelopmentValue {
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<RegionDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct SuperRegionDevelopment {
    name: String,
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<RegionDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
struct ContinentDevelopment {
    name: String,
    value: f32,
    tax: f32,
    production: f32,
    manpower: f32,
    children: Vec<SuperRegionDevelopment>,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
pub struct RootTree {
    name: &'static str,
    children: Vec<ContinentDevelopment>,
    world_tax: f32,
    world_production: f32,
    world_manpower: f32,
    filtered_tax: f32,
    filtered_production: f32,
    filtered_manpower: f32,
    uncolonized_tax: f32,
    uncolonized_production: f32,
    uncolonized_manpower: f32,
}

// Struct created to help compiler debugging as the wasm_bindgen macro can cause opaque errors.
pub struct SaveFileImpl {
    pub query: Query,

    // We need this field so that our referenced data isn't reclaimed
    pub _game_data: Vec<u8>,
    pub game: Game<'static>,
    pub encoding: Encoding,
    pub nation_events: Vec<NationEvents>,
    pub tag_resolver: TagResolver,
    pub war_participants: Vec<eu4save::query::ResolvedWarParticipants>,
    pub player_histories: Vec<eu4save::query::PlayerHistory>,
    pub province_owners: eu4save::query::ProvinceOwners,
    pub religion_lookup: eu4save::query::ReligionLookup,
    pub province_id_to_color_index: Vec<u16>,
}

impl SaveFileImpl {
    pub fn reparse(
        &mut self,
        frequency: &str,
        save_data: Vec<u8>,
    ) -> Result<Reparse, Eu4GameError> {
        let tokens = tokens::get_tokens();

        let meta = eu4game::shared::parse_meta(&save_data, tokens)?;

        let prev_date = self.query.save().meta.date;
        if frequency == "yearly" && meta.date.year() == prev_date.year()
            || frequency == "monthly" && meta.date.month() == prev_date.month()
            || meta.date == prev_date
        {
            return Ok(Reparse::TooSoon { date: meta.date });
        }

        let save = Eu4Parser::new().parse_with(&save_data, tokens)?.save;
        self.query = Query::from_save(save);
        self.province_owners = self.query.province_owners();
        self.nation_events = self.query.nation_events(&self.province_owners);
        self.player_histories = self.query.player_histories(&self.nation_events);
        self.tag_resolver = self.query.tag_resolver(&self.nation_events);
        self.war_participants = self.query.resolved_war_participants(&self.tag_resolver);
        self.religion_lookup = self.query.religion_lookup();

        Ok(Reparse::Updated)
    }

    pub fn get_meta_raw(&self) -> &'_ eu4save::models::Meta {
        &self.query.save().meta
    }

    pub fn gameplay_options(&self) -> &'_ GameplayOptions {
        &self.query.save().game.gameplay_settings.options
    }

    pub fn savefile_warnings(&self) -> Vec<String> {
        let mut warnings = Vec::new();
        if self.query.save().game.provinces.len() != self.game.total_provinces() {
            warnings.push(String::from("Vanilla province data not detected so the map may not be representative of the save."))
        }

        warnings
    }

    fn filter_stored_tags(
        &self,
        payload: TagFilterPayloadRaw,
        limit: usize,
    ) -> HashSet<CountryTag> {
        let payload = TagFilterPayload::from(payload);
        let tags = self.matching_tags(&payload);
        if tags.len() > limit {
            let mut new_payload = payload;
            if self.player_histories.len() == 1 {
                new_payload.ai = AiTagsState::Great;
            } else {
                new_payload.ai = AiTagsState::None;
            };

            let ntags = self.matching_tags(&new_payload);
            let inter: HashSet<CountryTag> = tags.intersection(&ntags).cloned().collect();

            if inter.is_empty() {
                tags.into_iter()
                    .enumerate()
                    .filter(|(i, _x)| *i < limit)
                    .map(|(_i, x)| x)
                    .collect()
            } else {
                inter
            }
        } else {
            tags
        }
    }

    fn localize_ledger_points(&self, iter: impl Iterator<Item = LedgerPoint>) -> LocalizedLedger {
        let sgq = SaveGameQuery::new(&self.query, &self.game);
        let mut points: Vec<_> = iter
            .map(|x| OptionalLedgerPoint {
                tag: x.tag,
                year: x.year,
                value: Some(x.value),
            })
            .collect();

        points.sort_unstable_by(|a, b| a.year.cmp(&b.year).then_with(|| a.tag.cmp(&b.tag)));

        // Necessary to mark the next year after a last known value as null else
        // g2plot will interpolate between two years which we want to avoid
        let mut result = Vec::with_capacity(points.capacity());
        for window in points.windows(2) {
            let x = window.get(0).unwrap();
            let y = window.get(1).unwrap();

            result.push(x.clone());
            if x.tag == y.tag {
                for i in x.year + 1..y.year {
                    result.push(OptionalLedgerPoint {
                        tag: x.tag,
                        year: i,
                        value: None,
                    })
                }
            }
        }

        if let Some(last) = points.last() {
            result.push(last.clone())
        }

        let tag_set: HashSet<_> = result.iter().map(|x| x.tag).collect();
        let tag_names: HashMap<_, _> = tag_set
            .iter()
            .map(|tag| (tag, sgq.localize_country(tag)))
            .collect();

        result.sort_unstable_by(|a, b| {
            a.year
                .cmp(&b.year)
                .then_with(|| tag_names.get(&a.tag).cmp(&tag_names.get(&b.tag)))
        });

        let localization = tag_names
            .into_iter()
            .map(|(tag, name)| LocalizedTag { tag: *tag, name })
            .collect();

        LocalizedLedger {
            points: result,
            localization,
        }
    }

    pub fn get_annual_income_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        let tags = self.filter_stored_tags(payload, 30);
        let ledger = tags
            .into_iter()
            .filter_map(|x| self.nation_events.iter().find(|events| events.stored == x))
            .flat_map(|x| self.query.income_statistics_ledger(x));

        self.localize_ledger_points(ledger)
    }

    pub fn get_annual_nation_size_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        let tags = self.filter_stored_tags(payload, 30);
        let ledger = tags
            .into_iter()
            .filter_map(|x| self.nation_events.iter().find(|events| events.stored == x))
            .flat_map(|x| self.query.nation_size_statistics_ledger(x));

        self.localize_ledger_points(ledger)
    }

    pub fn get_annual_score_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        let tags = self.filter_stored_tags(payload, 30);
        let ledger = tags
            .into_iter()
            .filter_map(|x| self.nation_events.iter().find(|events| events.stored == x))
            .flat_map(|x| self.query.score_statistics_ledger(x));

        self.localize_ledger_points(ledger)
    }

    pub fn get_annual_inflation_ledger(&self, payload: TagFilterPayloadRaw) -> LocalizedLedger {
        let tags = self.filter_stored_tags(payload, 30);
        let ledger = tags
            .into_iter()
            .filter_map(|x| self.nation_events.iter().find(|events| events.stored == x))
            .flat_map(|x| self.query.inflation_statistics_ledger(x));

        self.localize_ledger_points(ledger)
    }

    pub fn get_achievements(&self) -> AchievementsScore {
        let achieves = AchievementHunter::create(
            self.encoding,
            &self.query,
            &self.game,
            &self.player_histories,
        );
        let version = &self.query.save().meta.savegame_version;
        let patch = GameVersion {
            first: version.first,
            second: version.second,
            third: version.third,
            fourth: version.fourth,
        };

        let score = eu4_start_date().days_until(&self.query.save().meta.date);

        match achieves {
            Some(results) => {
                let list = eu4game::achievements::achievements();
                let completed: Vec<_> = results
                    .achievements()
                    .into_iter()
                    .filter(|x| x.completed())
                    .filter_map(|x| list.iter().find(|y| x.id == y.id))
                    .map(|x| CompletedAchievement {
                        id: x.id,
                        name: x.name.clone(),
                    })
                    .collect();

                AchievementsScore {
                    kind: AchievementCompatibility::Compatible,
                    patch,
                    score,
                    achievements: completed,
                }
            }
            None => AchievementsScore {
                kind: AchievementCompatibility::Incompatible,
                patch,
                score,
                achievements: Vec::with_capacity(0),
            },
        }
    }

    pub fn playthrough_id(&self) -> String {
        playthrough_id(&self.query)
    }

    pub fn get_countries(&self) -> Vec<CountryInfo> {
        let blank: CountryTag = "---".parse().unwrap();
        let mut results: Vec<_> = self
            .query
            .countries()
            .filter(|x| x.tag != blank)
            .map(|x| {
                let name = self
                    .game
                    .localize_country(&x.tag)
                    .or_else(|| x.country.name.clone())
                    .unwrap_or_else(|| x.tag.to_string());

                let color = country_hex_color(x.country);
                CountryInfo {
                    tag: x.tag.to_string(),
                    name,
                    color,
                    is_alive: x.country.num_of_cities > 0,
                    is_human: x.country.human,
                    existed: x.country.monarch.is_some(),
                }
            })
            .collect();

        results.sort_unstable_by(|a, b| a.name.cmp(&b.name));
        results
    }

    pub fn get_countries_income(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> HashMap<CountryTag, LocalizedCountryIncome> {
        let payload = TagFilterPayload::from(payload);
        let filter = self.matching_tags(&payload);
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);

        self.query
            .countries()
            .filter(|x| filter.contains(&x.tag))
            .map(|x| {
                (
                    x.tag,
                    LocalizedCountryIncome {
                        income: self.query.country_income_breakdown(x.country),
                        name: save_game_query.localize_country(&x.tag),
                    },
                )
            })
            .collect()
    }

    pub fn get_countries_expenses(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> HashMap<CountryTag, LocalizedCountryExpense> {
        let payload = TagFilterPayload::from(payload);
        let filter = self.matching_tags(&payload);
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        self.query
            .countries()
            .filter(|x| filter.contains(&x.tag))
            .map(|x| {
                (
                    x.tag,
                    LocalizedCountryExpense {
                        expenses: self.query.country_expense_breakdown(x.country),
                        name: save_game_query.localize_country(&x.tag),
                    },
                )
            })
            .collect()
    }

    pub fn get_countries_total_expenses(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> HashMap<CountryTag, LocalizedCountryExpense> {
        let payload = TagFilterPayload::from(payload);
        let filter = self.matching_tags(&payload);
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        self.query
            .countries()
            .filter(|x| filter.contains(&x.tag))
            .map(|x| {
                (
                    x.tag,
                    LocalizedCountryExpense {
                        expenses: self.query.country_total_expense_breakdown(x.country),
                        name: save_game_query.localize_country(&x.tag),
                    },
                )
            })
            .collect()
    }

    pub fn geographical_development(&self, payload: TagFilterPayloadRaw) -> RootTree {
        let payload = TagFilterPayload::from(payload);
        let filter = self.matching_tags(&payload);

        let prov_area = self.game.province_area_lookup();

        let area_region: HashMap<_, _> = self
            .game
            .regions()
            .flat_map(|(region, areas)| areas.map(move |x| (x, region)))
            .collect();

        let region_superregion: HashMap<_, _> = self
            .game
            .superregions()
            .flat_map(|(superregion, regions)| regions.map(move |x| (x, superregion)))
            .collect();

        let (world_tax, world_production, world_manpower) =
            self.query.save().game.provinces.values().fold(
                (0f32, 0f32, 0f32),
                |(tax, production, manpower), prov| {
                    (
                        prov.base_tax + tax,
                        prov.base_production + production,
                        prov.base_manpower + manpower,
                    )
                },
            );

        let (uncolonized_tax, uncolonized_production, uncolonized_manpower) = self
            .query
            .save()
            .game
            .provinces
            .values()
            .filter(|prov| prov.owner.is_none())
            .fold((0f32, 0f32, 0f32), |(tax, production, manpower), prov| {
                (
                    prov.base_tax + tax,
                    prov.base_production + production,
                    prov.base_manpower + manpower,
                )
            });

        let mut continents = Vec::new();
        for (continent, provs) in self.game.continents() {
            let provs = provs
                .filter_map(|id| {
                    let Some(prov) = self.query.save().game.provinces.get(&id) else { return None };
                    let owned = prov
                        .owner
                        .as_ref()
                        .map_or(false, |owner| filter.contains(owner));

                    if !owned {
                        return None;
                    }

                    Some(ProvinceIdDevelopment {
                        name: prov.name.clone(),
                        id,
                        tax: prov.base_tax,
                        production: prov.base_production,
                        manpower: prov.base_manpower,
                        value: prov.base_tax + prov.base_production + prov.base_manpower,
                    })
                })
                .filter_map(|prov| prov_area.get(&prov.id).map(|area| (area, prov)));

            let mut areas: HashMap<_, AreaDevelopmentValue> = HashMap::new();
            for (area_name, prov) in provs {
                let area = areas.entry(area_name).or_default();
                area.value += prov.value;
                area.tax += prov.tax;
                area.production += prov.production;
                area.manpower += prov.manpower;
                area.children.push(prov)
            }

            let mut regions: HashMap<_, RegionDevelopmentValue> = HashMap::new();
            for (area_name, area) in areas {
                match area_region.get(area_name) {
                    Some(region_name) => {
                        let region = regions.entry(region_name).or_default();
                        region.value += area.value;
                        region.tax += area.tax;
                        region.production += area.production;
                        region.manpower += area.manpower;
                        region.children.push(AreaDevelopment {
                            name: String::from(self.game.localize(area_name).unwrap_or(*area_name)),
                            children: area.children,
                            value: area.value,
                            tax: area.tax,
                            production: area.production,
                            manpower: area.manpower,
                        });
                    }
                    None => continue,
                }
            }

            let mut superregion: HashMap<_, SuperRegionDevelopmentValue> = HashMap::new();
            for (region_name, region) in regions {
                match region_superregion.get(region_name) {
                    Some(superregion_name) => {
                        let superregion = superregion.entry(superregion_name).or_default();
                        superregion.value += region.value;
                        superregion.tax += region.tax;
                        superregion.production += region.production;
                        superregion.manpower += region.manpower;
                        superregion.children.push(RegionDevelopment {
                            name: String::from(
                                self.game.localize(region_name).unwrap_or(*region_name),
                            ),
                            children: region.children,
                            value: region.value,
                            tax: region.tax,
                            production: region.production,
                            manpower: region.manpower,
                        });
                    }
                    None => continue,
                }
            }

            let continent_children: Vec<_> = superregion
                .into_iter()
                .map(|(superregion_name, superregion)| SuperRegionDevelopment {
                    name: String::from(
                        self.game
                            .localize(superregion_name)
                            .unwrap_or(*superregion_name),
                    ),
                    value: superregion.value,
                    tax: superregion.tax,
                    production: superregion.production,
                    manpower: superregion.manpower,
                    children: superregion.children,
                })
                .collect();

            let continent_value: f32 = continent_children.iter().map(|x| x.value).sum();
            let continent_tax: f32 = continent_children.iter().map(|x| x.tax).sum();
            let continent_production: f32 = continent_children.iter().map(|x| x.production).sum();
            let continent_manpower: f32 = continent_children.iter().map(|x| x.manpower).sum();

            if !continent_children.is_empty() {
                continents.push(ContinentDevelopment {
                    name: String::from(self.game.localize(continent).unwrap_or(continent)),
                    value: continent_value,
                    children: continent_children,
                    tax: continent_tax,
                    production: continent_production,
                    manpower: continent_manpower,
                });
            }
        }

        let (filtered_tax, filtered_production, filtered_manpower) =
            continents
                .iter()
                .fold((0f32, 0f32, 0f32), |(tax, production, manpower), c| {
                    (
                        c.tax + tax,
                        c.production + production,
                        c.manpower + manpower,
                    )
                });

        RootTree {
            name: "root",
            children: continents,
            world_tax,
            world_production,
            world_manpower,
            filtered_tax,
            filtered_production,
            filtered_manpower,
            uncolonized_tax,
            uncolonized_production,
            uncolonized_manpower,
        }
    }

    pub fn get_players(&self) -> HashMap<&str, &str> {
        self.query
            .save()
            .game
            .players_countries
            .chunks_exact(2)
            .into_iter()
            .map(|d| (d[1].as_str(), d[0].as_str()))
            .collect()
    }

    pub fn get_player_histories(&self) -> Vec<PlayerHistory> {
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        self.query
            .player_histories(&self.nation_events)
            .iter()
            .map(|x| PlayerHistory {
                name: save_game_query.localize_country(&x.history.latest),
                latest: x.history.latest,
                player_names: x.player_names.clone(),
                annexed: x.history.events.last().and_then(|event| match event.kind {
                    NationEventKind::Annexed => Some(event.date),
                    _ => None,
                }),
                is_human: self
                    .query
                    .country(&x.history.stored)
                    .map(|x| x.human)
                    .unwrap_or(false),
                transitions: std::iter::once((
                    self.query.save().game.start_date,
                    x.history.initial,
                ))
                .chain(x.history.events.iter().filter_map(|x| match x.kind {
                    NationEventKind::TagSwitch(to) => Some((x.date, to)),
                    _ => None,
                }))
                .map(|(date, tag)| TagTransition {
                    name: save_game_query.localize_country(&tag),
                    tag,
                    date,
                })
                .collect(),
            })
            .collect()
    }

    pub fn get_lucky_countries(&self) -> Vec<LocalizedTag> {
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        let mut v: Vec<_> = self
            .query
            .save()
            .game
            .countries
            .iter()
            .filter_map(|(tag, country)| {
                country.luck.then(|| LocalizedTag {
                    tag: *tag,
                    name: save_game_query.localize_country(&tag),
                })
            })
            .collect();
        v.sort_unstable_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub fn get_alive_countries(&self) -> Vec<CountryTag> {
        self.query
            .save()
            .game
            .countries
            .iter()
            .filter(|(_tag, c)| c.num_of_cities > 0)
            .map(|(tag, _)| tag)
            .copied()
            .collect()
    }

    pub fn get_starting_country(&self) -> Option<CountryTag> {
        self.query.starting_country(&self.player_histories)
    }

    pub fn localize_country(&self, tag: String) -> String {
        if let Some(tag) = tag.parse::<CountryTag>().ok() {
            let save_game_query = SaveGameQuery::new(&self.query, &self.game);
            save_game_query.localize_country(&tag)
        } else {
            panic!("Country tags should only be strings");
        }
    }

    fn localize_tag(&self, tag: CountryTag) -> LocalizedTag {
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        let name = save_game_query.localize_country(&tag);
        LocalizedTag { tag, name }
    }

    pub fn get_dlc_ids(&self) -> Vec<i32> {
        self.query
            .save()
            .meta
            .dlc_enabled
            .iter()
            .filter_map(|x| eu4save::dlc_id(x.as_str()))
            .collect()
    }

    pub fn get_start_date(&self) -> String {
        self.query.save().game.start_date.iso_8601().to_string()
    }

    pub fn get_total_days(&self) -> i32 {
        self.query
            .save()
            .game
            .start_date
            .days_until(&self.query.save().meta.date)
    }

    pub fn days_to_date(&self, days: f64) -> String {
        let days = days.trunc() as i32;
        self.query
            .save()
            .game
            .start_date
            .add_days(days)
            .iso_8601()
            .to_string()
    }

    pub fn date_to_days(&self, date: &str) -> Option<i32> {
        let date = Eu4Date::parse(date.replace('-', ".")).ok()?;
        let days = self.query.save().game.start_date.days_until(&date);
        if days < 0 {
            None
        } else {
            Some(days)
        }
    }

    pub fn save_encoding(&self) -> Encoding {
        self.encoding
    }

    pub fn save_mode(&self) -> SaveMode {
        if self.query.save().meta.multiplayer {
            return SaveMode::Multiplayer;
        }

        if !self.query.save().meta.is_ironman {
            return SaveMode::Normal;
        }

        let hunter = AchievementHunter::new(self.encoding, &self.query, &self.game);
        if hunter.is_some() {
            SaveMode::IronmanOk
        } else {
            SaveMode::IronmanNo
        }
    }

    pub fn get_health(&self, payload: TagFilterPayloadRaw) -> HealthData {
        struct CountryHealthDatum {
            tag: CountryTag,
            name: String,

            // economy
            core_income: f32,
            treasury_balance: f32,
            development: f32,
            buildings: usize,
            inflation: f32,

            // army
            best_general: Option<Leader>,
            army_tradition: f32,
            manpower_balance: f32,
            standard_regiments: usize,
            professionalism: f32,

            // navy
            best_admiral: Option<Leader>,
            navy_tradition: f32,
            ships: usize,

            // other
            stability: f32,
            technology: CountryTechnology,
            ideas: i32,
            corruption: f32,
        }

        let sgq = SaveGameQuery::new(&self.query, &self.game);
        let tags = self.filter_stored_tags(payload, 30);
        let countries: Vec<_> = self
            .query
            .save()
            .game
            .countries
            .iter()
            .filter(|(tag, country)| country.num_of_cities > 0 && tags.contains(tag))
            .map(|(tag, country)| {
                let income = self.query.country_income_breakdown(country);
                let core_income = income.taxation + income.production + income.trade + income.gold;

                let loan_total = country.loans.iter().map(|x| x.amount).sum::<i32>() as f32;
                let treasury_balance = country.treasury - loan_total;

                let buildings = self
                    .query
                    .save()
                    .game
                    .provinces
                    .values()
                    .filter(|x| x.owner.as_ref().map_or(false, |o| o == tag))
                    .map(|x| x.buildings.len())
                    .sum::<usize>();

                let (best_general, best_admiral) = country_details::country_best_leaders(country);
                let ships = country.navies.iter().flat_map(|x| x.ships.iter()).count();

                let (regiment_count, regiment_strength) = country
                    .armies
                    .iter()
                    .flat_map(|x| x.regiments.iter())
                    .fold((0, 0.), |(count, strength), reg| {
                        (count + 1, reg.strength + strength)
                    });
                let manpower_deficiet = (regiment_count as f32) - regiment_strength;
                let manpower_balance = (country.manpower - manpower_deficiet) * 1000.0;

                let ideas = country
                    .active_idea_groups
                    .iter()
                    .map(|(_name, count)| i32::from(*count))
                    .sum::<i32>();

                CountryHealthDatum {
                    tag: *tag,
                    name: sgq.localize_country(tag),
                    core_income,
                    treasury_balance,
                    development: country.development,
                    buildings,
                    inflation: country.inflation,
                    best_general: best_general.cloned(),
                    army_tradition: country.army_tradition,
                    manpower_balance,
                    standard_regiments: regiment_count,
                    professionalism: country.army_professionalism,
                    best_admiral: best_admiral.cloned(),
                    navy_tradition: country.navy_tradition,
                    ships,
                    stability: country.stability,
                    technology: country.technology.clone(),
                    ideas,
                    corruption: country.corruption,
                }
            })
            .collect();

        let max_income = countries.iter().map(|x| x.core_income).fold(0., f32::max);
        let max_treasury_balance = countries
            .iter()
            .map(|x| x.treasury_balance)
            .fold(0., f32::max);
        let min_treasury_balance = countries
            .iter()
            .map(|x| x.treasury_balance)
            .fold(0., f32::min);

        let max_development = countries.iter().map(|x| x.development).fold(100., f32::max);
        let max_buildings = countries.iter().map(|x| x.buildings).fold(0, usize::max);
        let max_inflation = countries.iter().map(|x| x.inflation).fold(20., f32::max);

        let best_general = countries
            .iter()
            .filter_map(|x| x.best_general.as_ref())
            .map(|x| x.fire + x.shock + x.manuever + x.siege)
            .fold(10, u16::max) as f32;

        let max_manpower_balance = countries
            .iter()
            .map(|x| x.manpower_balance)
            .fold(0., f32::max);

        let min_manpower_balance = countries
            .iter()
            .map(|x| x.manpower_balance)
            .fold(0., f32::min);

        let max_standard_regiments = countries
            .iter()
            .map(|x| x.standard_regiments)
            .fold(0, usize::max);

        let best_admiral = countries
            .iter()
            .filter_map(|x| x.best_admiral.as_ref())
            .map(|x| x.fire + x.shock + x.manuever)
            .fold(10, u16::max) as f32;
        let max_ships = countries.iter().map(|x| x.ships).fold(0, usize::max);

        let max_tech = countries
            .iter()
            .map(|x| x.technology.adm_tech + x.technology.dip_tech + x.technology.mil_tech)
            .fold(0, u8::max);

        let max_ideas = countries.iter().map(|x| x.ideas).fold(0, i32::max);
        let max_corruption = countries.iter().map(|x| x.inflation).fold(15., f32::max);

        // 0 is dark red / 15 is dark blue
        let blue_max = 15.0;
        let blue_min = 7.0;
        let health: Vec<_> = countries
            .into_iter()
            .map(|country| {
                let treasury_balance_color = if country.treasury_balance > 0. {
                    country.treasury_balance * (blue_max - blue_min) / (max_treasury_balance)
                        + blue_min
                } else {
                    blue_min - (country.treasury_balance * blue_min / min_treasury_balance)
                };

                let manpower_balance_color = if country.manpower_balance > 0. {
                    country.manpower_balance * (blue_max - blue_min) / (max_manpower_balance)
                        + blue_min
                } else {
                    blue_min - (country.manpower_balance * blue_min / min_manpower_balance)
                };

                let tech_total = (country.technology.adm_tech
                    + country.technology.dip_tech
                    + country.technology.mil_tech) as f32;

                CountryHealth {
                    tag: country.tag,
                    name: country.name,
                    core_income: HealthDatum {
                        value: country.core_income,
                        color: (country.core_income * blue_max / max_income) as u8,
                    },
                    treasury_balance: HealthDatum {
                        value: country.treasury_balance,
                        color: treasury_balance_color as u8,
                    },
                    development: HealthDatum {
                        value: country.development,
                        color: (country.development * blue_max / max_development) as u8,
                    },
                    buildings: HealthDatum {
                        value: country.buildings as f32,
                        color: (country.buildings as f32 * blue_max / max_buildings as f32) as u8,
                    },
                    inflation: HealthDatum {
                        value: country.inflation,
                        color: (blue_max - (country.inflation * blue_max / max_inflation)) as u8,
                    },
                    best_general: country
                        .best_general
                        .map(|x| {
                            let total = (x.fire + x.shock + x.manuever + x.siege) as f32;
                            LeaderDatum {
                                value: total,
                                fire: x.fire,
                                shock: x.shock,
                                manuever: x.manuever,
                                siege: x.siege,
                                color: ((12. - (best_general - total).min(12.)) * (blue_max / 12.))
                                    as u8,
                            }
                        })
                        .unwrap_or_else(|| LeaderDatum {
                            value: 0.,
                            fire: 0,
                            shock: 0,
                            manuever: 0,
                            siege: 0,
                            color: 0,
                        }),

                    army_tradition: HealthDatum {
                        value: country.army_tradition,
                        color: (country.army_tradition * blue_max / 100.) as u8,
                    },

                    manpower_balance: HealthDatum {
                        value: country.manpower_balance,
                        color: manpower_balance_color as u8,
                    },

                    standard_regiments: HealthDatum {
                        value: country.standard_regiments as f32,
                        color: (country.standard_regiments as f32 * blue_max
                            / max_standard_regiments as f32) as u8,
                    },

                    professionalism: HealthDatum {
                        value: country.professionalism,
                        color: (country.professionalism * blue_max) as u8,
                    },

                    best_admiral: country
                        .best_admiral
                        .map(|x| {
                            let total = (x.fire + x.shock + x.manuever) as f32;
                            LeaderDatum {
                                value: total,
                                fire: x.fire,
                                shock: x.shock,
                                manuever: x.manuever,
                                siege: x.siege,
                                color: ((9. - (best_admiral - total).min(9.)) * (blue_max / 9.))
                                    as u8,
                            }
                        })
                        .unwrap_or_else(|| LeaderDatum {
                            value: 0.,
                            fire: 0,
                            shock: 0,
                            manuever: 0,
                            siege: 0,
                            color: 0,
                        }),

                    navy_tradition: HealthDatum {
                        value: country.navy_tradition,
                        color: (country.navy_tradition * blue_max / 100.) as u8,
                    },

                    ships: HealthDatum {
                        value: country.ships as f32,
                        color: (country.ships as f32 * blue_max / max_ships as f32) as u8,
                    },

                    stability: HealthDatum {
                        value: country.stability,
                        color: ((country.stability - -3.) * blue_max / (3. - -3.)) as u8,
                    },

                    ideas: HealthDatum {
                        value: country.ideas as f32,
                        color: ((12. - ((max_ideas - country.ideas).min(12) as f32))
                            * (blue_max / 12.)) as u8,
                    },

                    technology: HealthTechnology {
                        value: tech_total,
                        adm: country.technology.adm_tech,
                        dip: country.technology.dip_tech,
                        mil: country.technology.mil_tech,
                        color: ((12. - ((max_tech as f32) - tech_total).min(12.))
                            * (blue_max / 12.)) as u8,
                    },

                    corruption: HealthDatum {
                        value: country.corruption,
                        color: (blue_max - (country.corruption * blue_max / max_corruption)) as u8,
                    },
                }
            })
            .collect();

        HealthData { data: health }
    }

    pub fn get_province_details(&self, province_id: u16) -> Option<ProvinceDetails> {
        let id = ProvinceId::from(i32::from(province_id));
        let can_select = self
            .game
            .get_province(&id)
            .map(|x| x.is_habitable())
            .unwrap_or(false);

        if !can_select {
            return None;
        }

        let province = self.query.save().game.provinces.get(&id).unwrap();
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);

        let map_area = self
            .game
            .province_area(&id)
            .and_then(|area| {
                self.query
                    .save()
                    .game
                    .map_area_data
                    .get(area)
                    .map(|data| (area, data))
            })
            .map(|(area_id, area)| MapAreaDetails {
                area_id: String::from(area_id),
                area_name: self
                    .game
                    .localize(area_id)
                    .map(String::from)
                    .unwrap_or_else(|| area_id.to_string()),
                states: area
                    .state
                    .as_ref()
                    .map(|state| {
                        state
                            .country_states
                            .iter()
                            .map(|country_state| CountryState {
                                country: LocalizedTag {
                                    tag: country_state.country,
                                    name: save_game_query.localize_country(&country_state.country),
                                },
                                prosperity: country_state.prosperity,
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default(),
                investments: area
                    .investments
                    .iter()
                    .map(|investment| TradeCompanyInvestments {
                        country: LocalizedTag {
                            tag: investment.tag,
                            name: save_game_query.localize_country(&investment.tag),
                        },
                        investments: investment
                            .investments
                            .iter()
                            .map(|building| LocalizedObj {
                                id: building.clone(),
                                name: self.game.localize_trade_company(building),
                            })
                            .collect(),
                    })
                    .collect::<Vec<_>>(),
            });

        let owner = province.owner.as_ref().map(|tag| LocalizedTag {
            tag: *tag,
            name: save_game_query.localize_country(tag),
        });

        let controller = province
            .occupying_rebel_faction
            .as_ref()
            .and_then(|x| {
                self.query
                    .save()
                    .game
                    .rebel_factions
                    .iter()
                    .find_map(|reb| {
                        if reb.id.id == x.id {
                            Some(LocalizedTag {
                                tag: "REB".parse::<CountryTag>().unwrap(),
                                name: reb.name.clone(),
                            })
                        } else {
                            None
                        }
                    })
            })
            .or_else(|| {
                province.controller.as_ref().map(|tag| LocalizedTag {
                    tag: *tag,
                    name: save_game_query.localize_country(tag),
                })
            });

        let cores = province
            .cores
            .iter()
            .map(|tag| LocalizedTag {
                tag: *tag,
                name: save_game_query.localize_country(tag),
            })
            .collect();

        let claims = province
            .claims
            .iter()
            .map(|tag| LocalizedTag {
                tag: *tag,
                name: save_game_query.localize_country(tag),
            })
            .collect();

        let buildings = province
            .buildings
            .iter()
            .filter(|(_, &built)| built)
            .map(|(building, _)| building)
            .map(|building| GfxObj {
                id: building.clone(),
                name: self
                    .game
                    .localize_building(building)
                    .map(String::from)
                    .unwrap_or_else(|| building.clone()),
                gfx: String::from("westerngfx"),
            })
            .collect();

        let building_set = self.query.built_buildings();
        let mut history = Vec::new();
        for (date, event) in province.history.events.iter() {
            match event {
                ProvinceEvent::Owner(x) => {
                    history.push(ProvinceHistoryEvent {
                        date: date.iso_8601().to_string(),
                        data: ProvinceHistoryEventKind::Owner(LocalizedTag {
                            tag: *x,
                            name: save_game_query.localize_country(x),
                        }),
                    });
                }
                ProvinceEvent::KV((key, ProvinceEventValue::Bool(value))) => {
                    if building_set.contains(key) {
                        let name = self
                            .game
                            .localize_building(key)
                            .map(String::from)
                            .unwrap_or_else(|| key.clone());
                        if *value {
                            history.push(ProvinceHistoryEvent {
                                date: date.iso_8601().to_string(),
                                data: ProvinceHistoryEventKind::Constructed(GfxObj {
                                    id: key.clone(),
                                    name,
                                    gfx: String::from("westerngfx"),
                                }),
                            });
                        } else {
                            history.push(ProvinceHistoryEvent {
                                date: date.iso_8601().to_string(),
                                data: ProvinceHistoryEventKind::Demolished(GfxObj {
                                    id: key.clone(),
                                    name,
                                    gfx: String::from("westerngfx"),
                                }),
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        let improvements = province
            .country_improve_count
            .iter()
            .map(|(tag, &amount)| ProvinceCountryImprovement {
                country: LocalizedTag {
                    tag: *tag,
                    name: save_game_query.localize_country(tag),
                },
                improvements: amount,
            })
            .collect::<Vec<_>>();

        let religion = province
            .religion
            .as_ref()
            .map(|x| {
                self.game
                    .religion(x)
                    .map(|religion| religion.name)
                    .unwrap_or_else(|| x.as_str())
            })
            .map(String::from);

        Some(ProvinceDetails {
            id,
            name: province.name.clone(),
            owner,
            controller,
            cores,
            claims,
            base_tax: province.base_tax,
            base_production: province.base_production,
            base_manpower: province.base_manpower,
            religion,
            culture: province.culture.clone(),
            devastation: province.devastation,
            trade_goods: province.trade_goods.clone(),
            latent_trade_goods: province.latent_trade_goods.clone(),
            buildings,
            is_in_trade_company: province.active_trade_company,
            improvements,
            history,
            map_area,
        })
    }

    pub fn owned_development_states(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> Vec<OwnedDevelopmentStates> {
        let filter = self.filter_stored_tags(payload, 12);
        let mut devs: HashMap<CountryTag, CountryDevelopment> = HashMap::new();
        let prov_area = self.game.province_area_lookup();
        let provs = self
            .query
            .save()
            .game
            .provinces
            .iter()
            .filter_map(|(id, prov)| prov.owner.as_ref().map(|owner| (id, owner, prov)))
            .filter(|(_id, owner, _)| filter.contains(owner));

        let states: HashSet<_> = self
            .query
            .save()
            .game
            .map_area_data
            .iter()
            .flat_map(|(area, data)| data.state.as_ref().map(|state| (area, state)))
            .flat_map(move |(area, data)| {
                data.country_states
                    .iter()
                    .map(move |x| (area.as_str(), &x.country))
            })
            .filter(|(_area, owner)| filter.contains(owner))
            .collect();

        for (id, owner, prov) in provs {
            let dev = devs.entry(*owner).or_default();
            let owner_has_stated = prov_area
                .get(id)
                .map_or(false, |area| states.contains(&(area, owner)));

            let has_any_core = prov.cores.contains(owner);
            if owner_has_stated && prov.territorial_core.contains(owner) {
                dev.half_states += prov;
            } else if owner_has_stated && has_any_core {
                dev.full_cores += prov;
            } else if !has_any_core {
                dev.no_core += prov;
            } else if prov.active_trade_company {
                dev.tc += prov;
            } else {
                dev.territories += prov;
            }
        }

        #[derive(Clone, Debug, Default)]
        pub struct CountryDevelopment {
            full_cores: ProvinceDevelopment,
            half_states: ProvinceDevelopment,
            territories: ProvinceDevelopment,
            no_core: ProvinceDevelopment,
            tc: ProvinceDevelopment,
        }

        let mut results: Vec<_> = devs
            .into_iter()
            .map(|(tag, dev)| OwnedDevelopmentStates {
                country: self.localize_tag(tag),
                full_cores: dev.full_cores,
                half_states: dev.half_states,
                territories: dev.territories,
                no_core: dev.no_core,
                tc: dev.tc,
            })
            .collect();

        results.sort_unstable_by(|a, b| a.total().total_cmp(&b.total()).reverse());
        results
    }

    pub fn get_nation_idea_groups(&self, payload: TagFilterPayloadRaw) -> Vec<IdeaGroup> {
        let payload = TagFilterPayload::from(payload);
        let tags = self.matching_tags(&payload);
        self.query
            .save()
            .game
            .countries
            .iter()
            .filter(|(tag, _)| tags.contains(tag))
            .flat_map(|(_tag, country)| {
                country
                    .active_idea_groups
                    .iter()
                    .enumerate()
                    .skip(1)
                    .map(|(idx, (idea, count))| IdeaGroup {
                        group_rank: idx,
                        group_name: String::from(&idea[..idea.len() - "_idea".len() - 1]),
                        completed_ideas: *count,
                    })
            })
            .collect()
    }

    fn all_players(&self) -> Vec<CountryTag> {
        let mut players = Vec::new();
        for entry in self.query.save().game.players_countries.chunks_exact(2) {
            let country_tag = match entry[1].parse::<CountryTag>() {
                Ok(x) => x,
                _ => continue,
            };

            players.push(country_tag);
        }

        players
    }

    pub fn province_nation_color<F: Fn(&Province) -> Option<&CountryTag>>(
        &self,
        only_players: bool,
        incl_subjects: bool,
        paint_subject_in_overlord_hue: bool,
        f: F,
    ) -> Vec<u8> {
        let mut desired_countries: HashSet<CountryTag> = HashSet::new();
        let mut country_colors: HashMap<&CountryTag, [u8; 3]> = HashMap::new();
        let player_countries = self.all_players();

        for (tag, country) in &self.query.save().game.countries {
            let c = &country.colors.map_color;
            country_colors
                .entry(tag)
                .or_insert_with(|| [c[0], c[1], c[2]]);

            if incl_subjects {
                for x in &country.subjects {
                    let country = self.query.country(x).unwrap();
                    let c = &country.colors.map_color;
                    country_colors.insert(x, [c[0], c[1], c[2]]);
                }
            }
        }

        if !only_players {
            desired_countries.extend(self.query.countries().map(|x| x.tag));
        } else {
            desired_countries.extend(player_countries.iter());
            if incl_subjects {
                for tag in &player_countries {
                    desired_countries.extend(self.query.country(tag).unwrap().subjects.iter());
                }
            }
        }

        if paint_subject_in_overlord_hue {
            let mut lighten_subjects = HashMap::new();
            for tag in &desired_countries {
                if let Some(color) = country_colors.get(tag) {
                    for sub in &self.query.country(tag).unwrap().subjects {
                        let data = [
                            color[0].saturating_add((255.0 * 0.1) as u8),
                            color[1].saturating_add((255.0 * 0.1) as u8),
                            color[2].saturating_add((255.0 * 0.1) as u8),
                        ];
                        lighten_subjects.insert(sub, data);
                    }
                }
            }
            country_colors.extend(lighten_subjects.drain());
        }

        let highest_province_id = self
            .query
            .save()
            .game
            .provinces
            .keys()
            .max()
            .unwrap()
            .as_u16();

        let mut result = vec![0u8; (usize::from(highest_province_id) + 1) * 3];
        for (id, prov) in &self.query.save().game.provinces {
            let offset = usize::from(id.as_u16() * 3);
            if let Some(owner) = prov.owner.as_ref() {
                let mut color = [106, 108, 128];
                if desired_countries.contains(owner) {
                    if let Some(x) = f(prov) {
                        if let Some(data) = country_colors.get(x) {
                            color.copy_from_slice(data);
                        }
                    }
                }
                result[offset..offset + 3].copy_from_slice(&color[..]);
            } else {
                let terrain = self
                    .game
                    .get_province(id)
                    .map_or(schemas::eu4::Terrain::Wasteland, |x| x.terrain);
                match terrain {
                    schemas::eu4::Terrain::Ocean => {
                        result[offset] = 138;
                        result[offset + 1] = 180;
                        result[offset + 2] = 248;
                    }
                    schemas::eu4::Terrain::Wasteland => {
                        result[offset] = 51;
                        result[offset + 1] = 51;
                        result[offset + 2] = 51;
                    }
                    _ => {
                        result[offset] = 106;
                        result[offset + 1] = 108;
                        result[offset + 2] = 128;
                    }
                }
            }
        }

        result
    }

    pub fn province_nation_owner_color(
        &self,
        only_players: bool,
        incl_subjects: bool,
        paint_subject_in_overlord_hue: bool,
    ) -> Vec<u8> {
        self.province_nation_color(
            only_players,
            incl_subjects,
            paint_subject_in_overlord_hue,
            |x| x.owner.as_ref(),
        )
    }

    pub fn province_nation_controller_color(
        &self,
        only_players: bool,
        incl_subjects: bool,
        paint_subject_in_overlord_hue: bool,
    ) -> Vec<u8> {
        self.province_nation_color(
            only_players,
            incl_subjects,
            paint_subject_in_overlord_hue,
            |x| x.controller.as_ref(),
        )
    }

    pub fn countries_war_losses(&self, payload: TagFilterPayloadRaw) -> Vec<CountryCasualties> {
        let payload = TagFilterPayload::from(payload);
        let countries = self.matching_tags(&payload);
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);

        self.query
            .save()
            .game
            .countries
            .iter()
            .filter(|(tag, _)| countries.contains(tag))
            .map(|(tag, c)| CountryCasualties {
                tag: *tag,
                name: save_game_query.localize_country(tag),
                losses: SaveFileImpl::create_losses(&c.losses.members),
            })
            .collect()
    }

    fn create_losses(data: &[i32]) -> [u32; 21] {
        let mut values = [0u32; 21];
        const LOSSES_MAX: i32 = i32::MAX / 1000;
        const LOSSES_MIN: i32 = -LOSSES_MAX;
        for (&x, y) in data.iter().zip(values.iter_mut()) {
            *y += match x {
                0.. => x as u32,
                LOSSES_MIN..=-1 => (x + 2 * LOSSES_MAX) as u32,
                _ => x.unsigned_abs(),
            };
        }
        values
    }

    fn active_wars(&self, wars: &mut Vec<War>, tags: &HashSet<CountryTag>) {
        let mut attackers = HashSet::new();
        let mut defenders = HashSet::new();
        let mut attackers_date = Vec::new();
        let mut defenders_date = Vec::new();
        let blank = "---".parse().unwrap();
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        for war in &self.query.save().game.active_wars {
            if war.name.is_empty() || war.original_attacker == blank {
                continue;
            }

            defenders_date.clear();
            attackers_date.clear();
            attackers.clear();
            defenders.clear();
            let mut battles = 0;
            let mut start_date = None;

            for (date, event) in war.history.events.iter() {
                if matches!(&start_date, Some(x) if x > date) {
                    start_date = Some(*date)
                }

                if start_date.is_none() {
                    start_date = Some(*date)
                }

                match event {
                    WarEvent::AddAttacker(x) => {
                        attackers.insert(x);
                        attackers_date.push((*date, *x));
                    }
                    WarEvent::AddDefender(x) => {
                        defenders.insert(x);
                        defenders_date.push((*date, *x));
                    }
                    WarEvent::Battle(_) => battles += 1,
                    _ => {}
                }
            }

            if matches!(start_date, Some(x) if x < self.query.save().game.start_date) {
                continue;
            }

            let mut attacker_losses = [0u32; 21];
            let mut defender_losses = [0u32; 21];
            for participant in &war.participants {
                let losses = SaveFileImpl::create_losses(&participant.losses.members);
                if attackers.contains(&participant.tag) {
                    for (&x, y) in losses.iter().zip(attacker_losses.iter_mut()) {
                        *y += x;
                    }
                } else if defenders.contains(&participant.tag) {
                    for (&x, y) in losses.iter().zip(defender_losses.iter_mut()) {
                        *y += x;
                    }
                }
            }

            let start = start_date.unwrap_or_else(eu4save::eu4_start_date);
            let filter_war = std::iter::once(&(start, war.original_attacker))
                .chain(std::iter::once(&(start, war.original_defender)))
                .chain(attackers_date.iter())
                .chain(defenders_date.iter())
                .map(|(date, tag)| {
                    self.tag_resolver
                        .resolve(*tag, *date)
                        .map(|x| x.current)
                        .unwrap_or(*tag)
                })
                .any(|tag| tags.contains(&tag));

            if !filter_war {
                continue;
            }

            let war = War {
                name: war.name.clone(),
                start_date: start.iso_8601().to_string(),
                end_date: None,
                days: start.days_until(&self.query.save().meta.date),
                battles,
                attackers: WarSide {
                    original: war.original_attacker,
                    original_name: save_game_query.localize_country(&war.original_attacker),
                    losses: attacker_losses,
                    members: attackers.iter().map(|&&x| x).collect(),
                },
                defenders: WarSide {
                    original: war.original_defender,
                    original_name: save_game_query.localize_country(&war.original_defender),
                    losses: defender_losses,
                    members: defenders.iter().map(|&&x| x).collect(),
                },
            };

            wars.push(war);
        }
    }

    fn previous_wars(&self, wars: &mut Vec<War>, tags: &HashSet<CountryTag>) {
        let mut attackers = HashSet::new();
        let mut defenders = HashSet::new();
        let mut attackers_date = Vec::new();
        let mut defenders_date = Vec::new();
        let blank = "---".parse().unwrap();
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        for war in &self.query.save().game.previous_wars {
            if war.name.is_empty() || war.original_attacker == blank {
                continue;
            }

            attackers.clear();
            defenders.clear();
            attackers_date.clear();
            defenders_date.clear();
            let mut battles = 0;
            let mut start_date = None;
            let mut end_date = None;

            for (date, event) in war.history.events.iter() {
                if matches!(&start_date, Some(x) if x > date) {
                    start_date = Some(*date)
                }

                if start_date.is_none() {
                    start_date = Some(*date)
                }

                if matches!(&end_date, Some(x) if x < date) {
                    end_date = Some(*date)
                }

                if end_date.is_none() {
                    end_date = Some(*date)
                }

                match event {
                    WarEvent::AddAttacker(x) => {
                        attackers.insert(x);
                        attackers_date.push((*date, *x));
                    }
                    WarEvent::AddDefender(x) => {
                        defenders.insert(x);
                        defenders_date.push((*date, *x));
                    }
                    WarEvent::Battle(_) => battles += 1,
                    _ => {}
                }
            }

            if matches!(start_date, Some(x) if x < self.query.save().game.start_date) {
                continue;
            }

            let mut attacker_losses = [0u32; 21];
            let mut defender_losses = [0u32; 21];
            for participant in &war.participants {
                let losses = SaveFileImpl::create_losses(&participant.losses.members);
                if attackers.contains(&participant.tag) {
                    for (&x, y) in losses.iter().zip(attacker_losses.iter_mut()) {
                        *y += x;
                    }
                } else if defenders.contains(&participant.tag) {
                    for (&x, y) in losses.iter().zip(defender_losses.iter_mut()) {
                        *y += x;
                    }
                }
            }

            let start = start_date.unwrap_or_else(eu4save::eu4_start_date);
            let filter_war = std::iter::once(&(start, war.original_attacker))
                .chain(std::iter::once(&(start, war.original_defender)))
                .chain(attackers_date.iter())
                .chain(defenders_date.iter())
                .map(|(date, tag)| {
                    self.tag_resolver
                        .resolve(*tag, *date)
                        .map(|x| x.current)
                        .unwrap_or(*tag)
                })
                .any(|tag| tags.contains(&tag));

            if !filter_war {
                continue;
            }

            let war = War {
                name: war.name.clone(),
                start_date: start.iso_8601().to_string(),
                end_date: end_date.map(|x| x.iso_8601().to_string()),
                days: start.days_until(&end_date.unwrap_or(self.query.save().meta.date)),
                battles,
                attackers: WarSide {
                    original: war.original_attacker,
                    original_name: save_game_query.localize_country(&war.original_attacker),
                    losses: attacker_losses,
                    members: attackers.iter().map(|&&x| x).collect(),
                },
                defenders: WarSide {
                    original: war.original_defender,
                    original_name: save_game_query.localize_country(&war.original_defender),
                    losses: defender_losses,
                    members: defenders.iter().map(|&&x| x).collect(),
                },
            };

            wars.push(war);
        }
    }

    pub fn wars(&self, payload: TagFilterPayloadRaw) -> Vec<War> {
        let filter = TagFilterPayload::from(payload);
        let tags = self.matching_tags(&filter);
        let previous_wars = &self.query.save().game.previous_wars;
        let active_wars = &self.query.save().game.active_wars;
        let mut result = Vec::with_capacity(previous_wars.len() + active_wars.len());
        self.previous_wars(&mut result, &tags);
        self.active_wars(&mut result, &tags);
        result
    }

    pub fn get_commander_stats<'a>(
        &'a self,
        date: Eu4Date,
        tags: impl Iterator<Item = &'a CountryTag>,
        commander: &str,
    ) -> String {
        for tag in tags {
            let country = match self.query.country(tag) {
                Some(c) => c,
                None => continue,
            };

            let events = country
                .history
                .events
                .iter()
                .rev()
                .skip_while(|(d, _)| d > &date)
                .map(|(_, event)| event);

            let merc_leaders = country
                .mercenary_companies
                .iter()
                .flat_map(|x| x.leader.as_ref());
            for merc in merc_leaders {
                if merc.name == commander {
                    return format!(
                        "({} / {} / {} / {})",
                        merc.fire, merc.shock, merc.manuever, merc.siege
                    );
                }
            }

            for event in events {
                match event {
                    CountryEvent::Leader(x) if x.name == commander => {
                        return format!(
                            "({} / {} / {} / {})",
                            x.fire, x.shock, x.manuever, x.siege
                        );
                    }
                    CountryEvent::Heir(x) | CountryEvent::Queen(x) | CountryEvent::Monarch(x) => {
                        if let Some(l) = &x.leader {
                            if l.name == commander {
                                return format!(
                                    "({} / {} / {} / {})",
                                    l.fire, l.shock, l.manuever, l.siege
                                );
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        String::from("(? / ? / ? / ?)")
    }

    pub fn get_country_casualties(&self, tag: &str) -> Vec<SingleCountryWarCasualties> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let previous_wars = self.query.save().game.previous_wars.iter().filter_map(|x| {
            x.participants.iter().find(|p| p.tag == tag).map(|p| {
                let start = x.history.events.first().map(|(date, _)| *date);
                let end = x.history.events.last().map(|(date, _)| *date);
                let total_participation: f64 =
                    x.participants.iter().map(|o| f64::from(o.value)).sum();
                (x, p, f64::from(p.value) / total_participation, start, end)
            })
        });

        let mut result = Vec::new();
        for (war, participant, participation_percent, start, end) in previous_wars {
            result.push(SingleCountryWarCasualties {
                war: war.name.clone(),
                losses: SaveFileImpl::create_losses(&participant.losses.members),
                participation: participant.value,
                participation_percent,
                start: start.map(|x| x.iso_8601().to_string()),
                end: end.map(|x| x.iso_8601().to_string()),
            });
        }

        result
    }

    pub fn get_war(&self, name: &str) -> WarInfo {
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        let active_war = self
            .query
            .save()
            .game
            .active_wars
            .iter()
            .find(|x| x.name == name);

        let previous_war = self
            .query
            .save()
            .game
            .previous_wars
            .iter()
            .find(|x| x.name == name);

        let war_history = active_war
            .map(|x| &x.history)
            .or_else(|| previous_war.map(|x| &x.history))
            .unwrap();

        let participants: HashMap<CountryTag, CountryTag> = self
            .war_participants
            .iter()
            .find(|x| x.war == name)
            .map(|x| x.participants.iter().map(|x| (x.tag, x.stored)).collect())
            .unwrap_or_default();

        let mut total_attackers = HashSet::new();
        let mut attackers = HashSet::new();
        let mut defenders = HashSet::new();
        let mut battles = Vec::new();
        let mut commanders = HashMap::new();
        let mut joined = HashMap::new();
        let mut exited = HashMap::new();

        let mut start_date = None;
        let mut end_date = None;

        for (date, event) in &war_history.events {
            if matches!(&start_date, Some(x) if x > date) {
                start_date = Some(*date)
            }

            if start_date.is_none() {
                start_date = Some(*date)
            }

            if matches!(&end_date, Some(x) if x < date) {
                end_date = Some(*date)
            }

            if end_date.is_none() {
                end_date = Some(*date)
            }

            match event {
                WarEvent::AddAttacker(x) => {
                    attackers.insert(participants.get(x).unwrap_or(x));
                    joined.insert(x, date);
                    total_attackers.insert(x);
                }
                WarEvent::AddDefender(x) => {
                    joined.insert(x, date);
                    defenders.insert(participants.get(x).unwrap_or(x));
                }
                WarEvent::RemoveAttacker(x) => {
                    exited.insert(x, date);
                    attackers.remove(participants.get(x).unwrap_or(x));
                }
                WarEvent::RemoveDefender(x) => {
                    exited.insert(x, date);
                    defenders.remove(participants.get(x).unwrap_or(x));
                }
                WarEvent::Battle(b) => {
                    let attacker_commander_stats = match b.attacker.commander.as_ref() {
                        Some(name) => {
                            let stats = commanders.entry(name).or_insert_with(|| {
                                self.get_commander_stats(
                                    *date,
                                    attackers.iter().copied(),
                                    name.as_str(),
                                )
                            });
                            Some(stats.clone())
                        }
                        None => None,
                    };

                    let defender_commander_stats = match b.defender.commander.as_ref() {
                        Some(name) => {
                            let stats = commanders.entry(name).or_insert_with(|| {
                                self.get_commander_stats(
                                    *date,
                                    defenders.iter().copied(),
                                    name.as_str(),
                                )
                            });
                            Some(stats.clone())
                        }
                        None => None,
                    };

                    let attacker = BattleSide {
                        infantry: b.attacker.infantry,
                        cavalry: b.attacker.cavalry,
                        artillery: b.attacker.artillery,
                        heavy_ship: b.attacker.heavy_ship,
                        light_ship: b.attacker.light_ship,
                        galley: b.attacker.galley,
                        transport: b.attacker.transport,
                        losses: b.attacker.losses,
                        country: b.attacker.country,
                        country_name: save_game_query.localize_country(&b.attacker.country),
                        commander: b.attacker.commander.clone(),
                        commander_stats: attacker_commander_stats,
                    };

                    let defender = BattleSide {
                        infantry: b.defender.infantry,
                        cavalry: b.defender.cavalry,
                        artillery: b.defender.artillery,
                        heavy_ship: b.defender.heavy_ship,
                        light_ship: b.defender.light_ship,
                        galley: b.defender.galley,
                        transport: b.defender.transport,
                        losses: b.defender.losses,
                        country: b.defender.country,
                        country_name: save_game_query.localize_country(&b.defender.country),
                        commander: b.defender.commander.clone(),
                        commander_stats: defender_commander_stats,
                    };

                    let x = BattleInfo {
                        name: b.name.clone(),
                        date: date.iso_8601().to_string(),
                        location: b.location.as_u16(),
                        loser_alliance: b.loser_alliance,
                        winner_alliance: b.winner_alliance,
                        attacker_won: b.attacker_won,
                        forces: attacker.forces() + defender.forces(),
                        losses: attacker.losses + defender.losses,
                        attacker,
                        defender,
                    };
                    battles.push(x)
                }
            }
        }

        let mut attacker_participants = Vec::new();
        let mut defender_participants = Vec::new();
        if let Some(war) = active_war {
            let mut total_attacker_participation: f64 = 0.0;
            let mut total_defender_participation: f64 = 0.0;
            for participant in &war.participants {
                if total_attackers.contains(&participant.tag) {
                    total_attacker_participation += f64::from(participant.value);
                } else {
                    total_defender_participation += f64::from(participant.value);
                }
            }

            for participant in &war.participants {
                let exit = exited
                    .get(&participant.tag)
                    .and_then(|x| match &end_date {
                        Some(e) if e > x => Some(x),
                        _ => None,
                    })
                    .map(|x| x.iso_8601().to_string());

                let join = joined
                    .get(&participant.tag)
                    .and_then(|x| match &start_date {
                        Some(e) if e < x => Some(x),
                        _ => None,
                    })
                    .map(|x| x.iso_8601().to_string());

                if total_attackers.contains(&participant.tag) {
                    attacker_participants.push(WarParticipant {
                        tag: participant.tag,
                        name: save_game_query.localize_country(&participant.tag),
                        participation: participant.value,
                        participation_percent: f64::from(participant.value)
                            / total_attacker_participation,
                        losses: SaveFileImpl::create_losses(&participant.losses.members),
                        joined: join,
                        exited: exit,
                    });
                } else {
                    defender_participants.push(WarParticipant {
                        tag: participant.tag,
                        name: save_game_query.localize_country(&participant.tag),
                        participation: participant.value,
                        participation_percent: f64::from(participant.value)
                            / total_defender_participation,
                        losses: SaveFileImpl::create_losses(&participant.losses.members),
                        joined: join,
                        exited: exit,
                    });
                }
            }
        }

        if let Some(war) = previous_war {
            let mut total_attacker_participation: f64 = 0.0;
            let mut total_defender_participation: f64 = 0.0;
            for participant in &war.participants {
                if total_attackers.contains(&participant.tag) {
                    total_attacker_participation += f64::from(participant.value);
                } else {
                    total_defender_participation += f64::from(participant.value);
                }
            }

            for participant in &war.participants {
                let exit = exited
                    .get(&participant.tag)
                    .and_then(|x| match &end_date {
                        Some(e) if e > x => Some(x),
                        _ => None,
                    })
                    .map(|x| x.iso_8601().to_string());

                let join = joined
                    .get(&participant.tag)
                    .and_then(|x| match &start_date {
                        Some(e) if e < x => Some(x),
                        _ => None,
                    })
                    .map(|x| x.iso_8601().to_string());

                if total_attackers.contains(&participant.tag) {
                    attacker_participants.push(WarParticipant {
                        tag: participant.tag,
                        name: save_game_query.localize_country(&participant.tag),
                        participation: participant.value,
                        participation_percent: f64::from(participant.value)
                            / total_attacker_participation,
                        losses: SaveFileImpl::create_losses(&participant.losses.members),
                        joined: join,
                        exited: exit,
                    });
                } else {
                    defender_participants.push(WarParticipant {
                        tag: participant.tag,
                        name: save_game_query.localize_country(&participant.tag),
                        participation: participant.value,
                        participation_percent: f64::from(participant.value)
                            / total_defender_participation,
                        losses: SaveFileImpl::create_losses(&participant.losses.members),
                        joined: join,
                        exited: exit,
                    });
                }
            }
        }

        WarInfo {
            battles,
            attacker_participants,
            defender_participants,
        }
    }

    pub fn monitoring_data(&self) -> Monitor {
        let players: HashSet<_> = self.all_players().drain(..).collect();
        let country_data = players
            .iter()
            .filter_map(|x| self.query.save_country(x))
            .map(|c| self.get_country_details(c))
            .collect();

        Monitor {
            date: self.query.save().meta.date,
            countries: country_data,
        }
    }
}

fn country_hex_color(country: &Country) -> String {
    let colors = &country.colors.country_color;
    hex_color([colors[0], colors[1], colors[2]])
}

pub fn hex_color(colors: [u8; 3]) -> String {
    if colors[0] > 230 && colors[1] > 230 && colors[2] > 230 {
        format!(
            "#{:02x}{:02x}{:02x}",
            255 - colors[0],
            255 - colors[1],
            255 - colors[2]
        )
    } else {
        format!("#{:02x}{:02x}{:02x}", colors[0], colors[1], colors[2])
    }
}
