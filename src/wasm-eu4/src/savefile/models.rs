#![allow(nonstandard_style)]
use eu4save::{
    models::{
        ActiveWar, CountryTechnology, Leader, LeaderKind, NationalFocus, PreviousWar, Province,
        WarHistory,
    },
    query::{CountryExpenseLedger, CountryIncomeLedger, CountryManaUsage, Inheritance},
    CountryTag, Eu4Date, ProvinceId,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tsify::Tsify;

use super::TagFilterPayloadRaw;

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
    pub income: CountryIncomeLedger,
    pub name: String,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct LocalizedCountryExpense {
    pub expenses: CountryExpenseLedger,
    pub name: String,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct CountryCasualties {
    pub tag: CountryTag,
    pub name: String,
    pub losses: [u32; 21],
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
    pub date: Eu4Date,
    pub countries: Vec<CountryDetails>,
}

#[derive(Tsify, Serialize, Clone, Debug)]
pub struct HealthDatum {
    pub color: u8,
    pub value: f32,
}

#[derive(Tsify, Serialize, Clone, Debug)]
pub struct LeaderDatum {
    pub color: u8,
    pub value: f32,
    pub fire: u16,
    pub shock: u16,
    pub maneuver: u16,
    pub siege: u16,
}

#[derive(Tsify, Serialize, Clone, Debug)]
pub struct HealthTechnology {
    pub color: u8,
    pub value: f32,
    pub adm: u8,
    pub dip: u8,
    pub mil: u8,
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CountryHealth {
    pub tag: CountryTag,
    pub name: String,

    // economy
    pub core_income: HealthDatum,
    pub treasury_balance: HealthDatum,
    pub development: HealthDatum,
    pub buildings: HealthDatum,
    pub inflation: HealthDatum,

    // army
    pub best_general: LeaderDatum,
    pub army_tradition: HealthDatum,
    pub manpower_balance: HealthDatum,
    pub standard_regiments: HealthDatum,
    pub professionalism: HealthDatum,

    // navy
    pub best_admiral: LeaderDatum,
    pub navy_tradition: HealthDatum,
    pub ships: HealthDatum,

    // other
    pub stability: HealthDatum,
    pub technology: HealthTechnology,
    pub ideas: HealthDatum,
    pub corruption: HealthDatum,
}

#[derive(Tsify, Serialize, Clone, Debug)]
#[tsify(into_wasm_abi)]
pub struct HealthData {
    pub data: Vec<CountryHealth>,
}

#[derive(Tsify, Serialize, Clone, Debug, Default)]
pub struct ProvinceDevelopment {
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
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
    pub country: LocalizedTag,
    pub full_cores: ProvinceDevelopment,
    pub half_states: ProvinceDevelopment,
    pub territories: ProvinceDevelopment,
    pub no_core: ProvinceDevelopment,
    pub tc: ProvinceDevelopment,
}

impl OwnedDevelopmentStates {
    pub fn total(&self) -> f32 {
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
    pub group_rank: usize,
    pub group_name: String,
    pub completed_ideas: u8,
}

#[derive(Tsify, Serialize)]
pub struct ProvinceIdDevelopment {
    pub name: String,
    pub id: ProvinceId,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub value: f32,
}

#[derive(Tsify, Default, Serialize)]
pub struct AreaDevelopmentValue {
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<ProvinceIdDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct AreaDevelopment {
    pub name: String,
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<ProvinceIdDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct RegionDevelopmentValue {
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<AreaDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct RegionDevelopment {
    pub name: String,
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<AreaDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct SuperRegionDevelopmentValue {
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<RegionDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct SuperRegionDevelopment {
    pub name: String,
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<RegionDevelopment>,
}

#[derive(Tsify, Default, Serialize)]
pub struct ContinentDevelopment {
    pub name: String,
    pub value: f32,
    pub tax: f32,
    pub production: f32,
    pub manpower: f32,
    pub children: Vec<SuperRegionDevelopment>,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
pub enum FileObservationFrequency {
    EverySave,
    Daily,
    Monthly,
    Yearly,
}

#[derive(Tsify, Serialize)]
#[tsify(into_wasm_abi)]
pub struct RootTree {
    pub name: &'static str,
    pub children: Vec<ContinentDevelopment>,
    pub world_tax: f32,
    pub world_production: f32,
    pub world_manpower: f32,
    pub filtered_tax: f32,
    pub filtered_production: f32,
    pub filtered_manpower: f32,
    pub uncolonized_tax: f32,
    pub uncolonized_production: f32,
    pub uncolonized_manpower: f32,
}

// start of country details model

#[derive(Tsify, Serialize, Debug)]
#[tsify(into_wasm_abi)]
pub struct CountryDetails {
    pub id: usize,
    pub tag: CountryTag,
    pub name: String,
    pub base_tax: f32,
    pub development: f32,
    pub raw_development: f32,
    pub prestige: f32,
    pub stability: f32,
    pub treasury: f32,
    pub inflation: f32,
    pub corruption: f32,
    pub overextension: f32,
    pub innovativeness: f32,
    pub religion: String,
    pub primary_culture: String,
    pub adm_mana: i32,
    pub dip_mana: i32,
    pub mil_mana: i32,
    pub technology: CountryTechnology,
    pub ruler: CountryMonarch,
    pub loans: usize,
    pub debt: i32,
    pub income: CountryIncomeLedger,
    pub expenses: CountryExpenseLedger,
    pub total_expenses: CountryExpenseLedger,
    pub mana_usage: CountryManaUsage,
    pub building_count: HashMap<String, i32>,
    pub ideas: Vec<(String, i32)>,
    pub num_cities: i32,
    pub inheritance: Inheritance,
    pub best_general: Option<Leader>,
    pub best_admiral: Option<Leader>,
    pub diplomacy: Vec<DiplomacyEntry>,
    pub infantry_units: LandUnitStrength,
    pub cavalry_units: LandUnitStrength,
    pub artillery_units: LandUnitStrength,
    pub mercenary_units: usize,
    pub heavy_ship_units: usize,
    pub light_ship_units: usize,
    pub galley_units: usize,
    pub transport_units: usize,
    pub manpower: f32,
    pub max_manpower: f32,
    pub professionalism: f32,
    pub army_tradition: f32,
    pub navy_tradition: f32,
    pub power_projection: f32,
    pub religious_unity: f32,
    pub mercantilism: f32,
    pub absolutism: f32,
    pub splendor: f32,
    pub merchants: usize,
    pub diplomats: usize,
    pub colonists: usize,
    pub missionaries: usize,
    pub government_strength: GovernmentStrength,
    pub national_focus: NationalFocus,
}

#[derive(Tsify, Serialize, Debug)]
#[serde(tag = "kind")]
pub enum GovernmentStrength {
    Legitimacy { value: f32 },
    Republic { value: f32 },
    Meritocracy { value: f32 },
    Devotion { value: f32 },
    Horde { value: f32 },
    Native,
}

#[derive(Tsify, Serialize, Debug)]
pub struct CountryMonarch {
    pub name: String,
    pub ascended: Eu4Date,
    pub reign_years: i32,
    pub age: i32,
    pub culture: String,
    pub religion: String,
    pub personalities: Vec<LocalizedObj>,
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
}

#[derive(Tsify, Debug, Serialize, Default)]
pub struct LandUnitStrength {
    pub count: usize,
    pub strength: f32,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct RunningMonarch {
    pub name: String,
    pub country: LocalizedTag,
    pub start: String,
    pub end: Option<String>,
    pub personalities: Vec<LocalizedObj>,
    pub failed_heirs: Vec<FailedHeir>,
    pub reign: i32,
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
    pub avg_adm: f64,
    pub avg_dip: f64,
    pub avg_mil: f64,
    pub avg_dur_adm: f64,
    pub avg_dur_dip: f64,
    pub avg_dur_mil: f64,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct FailedHeir {
    pub name: String,
    pub country: LocalizedTag,
    pub birth: String,
    pub personalities: Vec<LocalizedObj>,
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct CountryAdvisors {
    pub radical_reforms: Option<Eu4Date>,
    pub great_advisors: Vec<GreatAdvisor>,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GreatAdvisor {
    pub occupation: LocalizedObj,
    pub trigger_date: Option<Eu4Date>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct CountryReligions {
    pub allowed_conversions: Vec<LocalizedObj>,
    pub religions: Vec<CountryReligion>,
    pub rebel: Option<RebelReligion>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct RebelReligion {
    pub religion: CountryReligion,
    pub until_plurality: f32,
    pub more_popular: Vec<CountryReligion>,
}

#[derive(Tsify, Debug, Serialize, Clone)]
pub struct CountryReligion {
    pub index: Option<usize>,
    pub id: String,
    pub name: String,
    pub color: String,
    pub provinces: usize,
    pub exploitable: usize,
    pub provinces_percent: f64,
    pub development: f32,
    pub development_percent: f64,
    pub negotiate_convert_on_dominant_religion: Option<bool>,
    pub force_convert_on_break: Option<bool>,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub enum CultureTolerance {
    Primary,
    Accepted,
    None,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct CountryCulture {
    pub id: String,
    pub name: String,
    pub group: Option<String>,
    pub tolerance: CultureTolerance,

    pub provinces: usize,
    pub provinces_percent: f64,
    pub development: f32,
    pub development_percent: f64,

    pub stated_provs: usize,
    pub stated_provs_percent: f64,
    pub stated_provs_development: f32,
    pub stated_provs_development_percent: f64,

    pub conversions: usize,
    pub conversions_development: f32,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct MonarchStats {
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct CountryLeader {
    pub id: u32,
    pub name: String,
    pub fire: u16,
    pub shock: u16,
    pub maneuver: u16,
    pub siege: u16,
    pub kind: LeaderKind,
    pub active: bool,
    pub activation: Option<Eu4Date>,
    pub personality: Option<LocalizedObj>,
    pub monarch_stats: Option<MonarchStats>,
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct DiplomacyEntry {
    pub first: LocalizedTag,
    pub second: LocalizedTag,
    pub start_date: Option<Eu4Date>,
    pub data: DiplomacyKind,
}

#[derive(Tsify, Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum DiplomacyKind {
    Dependency {
        subject_type: String,
    },
    JuniorPartner {
        pu_inheritance_value: u8,
    },
    Alliance,
    RoyalMarriage,
    Warning,
    TransferTrade,
    SteerTrade,
    Reparations {
        end_date: Option<Eu4Date>,
    },
    Subsidy {
        amount: f32,
        duration: u16,
        total: Option<f32>,
    },
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct ProgressDate {
    pub progress: f32,
    pub date: Eu4Date,
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct CountryStateDetails {
    pub state: LocalizedObj,
    pub capital_state: bool,
    pub provinces: Vec<ProvinceGc>,
    pub total_dev: f32,
    pub total_gc: f32,
    pub total_gc_if_centralized: f32,
    pub centralizing: Option<ProgressDate>,
    pub centralized: i32,
    pub prosperity: f32,
    pub prosperity_mode: Option<bool>,
    pub state_house: bool,
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct ProvinceGc {
    pub name: String,
    pub gc: f32,
    pub gc_if_centralized: f32,
}

#[derive(Tsify, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estate<'a> {
    pub kind: &'a str,
    pub loyalty: f32,
    pub territory: f32,
    pub completed_agendas: i32,
    pub privileges: Vec<(String, Eu4Date)>,
    pub influence_modifiers: Vec<InfluenceModifier>,
}

#[derive(Tsify, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfluenceModifier {
    pub value: f32,
    pub desc: String,
    pub date: Eu4Date,
}

#[derive(Tsify, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[tsify(from_wasm_abi)]
pub enum MapPayloadKind {
    Political,
    Religion,
    Development,
    Battles,
    Technology,
    Terrain,
}

#[derive(Tsify, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[tsify(from_wasm_abi)]
pub struct MapPayload {
    pub kind: MapPayloadKind,
    pub tag_filter: TagFilterPayloadRaw,
    pub paint_subject_in_overlord_hue: bool,
    pub date: Option<i32>,
}

#[derive(Tsify, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MapCursorPayloadKind {
    Political,
    Religion,
    Battles,
}

#[derive(Tsify, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum Interval {
    Year,
    Month,
    Week,
    Day,
}

#[derive(Tsify, Serialize, Deserialize)]
#[tsify(from_wasm_abi)]
pub struct MapCursorPayload {
    pub kind: MapCursorPayloadKind,
    pub interval: Interval,
    pub start: Option<i32>,
}

#[derive(Tsify, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub enum MapQuickTipPayload {
    #[serde(rename_all = "camelCase")]
    Political {
        owner: LocalizedTag,
        controller: LocalizedTag,
        province_id: ProvinceId,
        province_name: String,
    },

    #[serde(rename_all = "camelCase")]
    Religion {
        owner: LocalizedTag,
        controller: LocalizedTag,
        province_id: ProvinceId,
        province_name: String,
        religion_in_province: LocalizedObj,
        state_religion: LocalizedObj,
    },

    #[serde(rename_all = "camelCase")]
    Development {
        owner: LocalizedTag,
        controller: LocalizedTag,
        province_id: ProvinceId,
        province_name: String,
        base_tax: f32,
        base_production: f32,
        base_manpower: f32,
    },

    #[serde(rename_all = "camelCase")]
    Battles {
        province_id: ProvinceId,
        province_name: String,
        battles: usize,
        losses: i32,
    },

    #[serde(rename_all = "camelCase")]
    Technology {
        owner: LocalizedTag,
        controller: LocalizedTag,
        province_id: ProvinceId,
        province_name: String,
        adm_tech: u8,
        dip_tech: u8,
        mil_tech: u8,
    },
}

#[derive(Tsify, Debug, Clone, Serialize)]
#[tsify(into_wasm_abi)]
pub struct MapDate {
    pub days: i32,
    #[serde(rename(serialize = "text"))]
    pub date: Eu4Date,
}

#[derive(Tsify, Debug, Serialize)]
#[tsify(into_wasm_abi)]
pub struct CountryHistory {
    pub data: Vec<CountryHistoryYear>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct CountryHistoryYear {
    pub year: i16,
    pub events: Vec<CountryHistoryEvent>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct CountryHistoryEvent {
    pub date: Eu4Date,
    pub event: CountryHistoryEventKind,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CountryHistoryEventKind {
    Annexed,
    Appeared,
    Initial(LocalizedTag),
    TagSwitch(LocalizedTag),
    Capital { id: ProvinceId, name: String },
    AddAcceptedCulture(LocalizedObj),
    RemoveAcceptedCulture(LocalizedObj),
    PrimaryCulture(LocalizedObj),
    ChangeStateReligion(LocalizedObj),
    Flag { name: String },
    GreatAdvisor { occupation: LocalizedObj },
    Decision { decisions: Vec<DecisionCount> },
    Leader { leaders: Vec<CountryHistoryLeader> },
    Monarch(CountryHistoryMonarch),
    WarStart(WarStart),
    WarEnd(WarEnd),
    EnactedPolicy { name: String },
    Focus { focus: NationalFocus },
}

#[derive(Tsify, Debug, Serialize)]
pub struct CountryHistoryLeader {
    pub name: String,
    pub fire: u16,
    pub shock: u16,
    pub maneuver: u16,
    pub siege: u16,
    pub activation: Option<Eu4Date>,
    pub kind: LeaderKind,
    pub personality: Option<LocalizedObj>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct DecisionCount {
    pub decision: String,
    pub count: usize,
}

#[derive(Tsify, Serialize, Debug)]
pub struct CountryHistoryMonarch {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: MonarchKind,
    pub age: i32,
    pub culture: Option<LocalizedObj>,
    pub religion: Option<LocalizedObj>,
    pub personalities: Vec<LocalizedObj>,
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
    pub leader: Option<CountryHistoryLeader>,
    pub dynasty: Option<String>,
}

#[derive(Tsify, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum MonarchKind {
    Monarch,
    Heir,
    Queen,
    Consort,
}

#[derive(Tsify, Debug, Serialize)]
pub struct WarStart {
    pub war: String,
    pub war_start: Eu4Date,
    pub attackers: Vec<LocalizedTag>,
    pub defenders: Vec<LocalizedTag>,
    pub is_war_leader: bool,
    pub is_attacking: bool,
    pub is_active: bool,
    pub attacker_losses: [u32; 21],
    pub defender_losses: [u32; 21],
    pub our_losses: [u32; 21],
    pub our_participation: f32,
    pub our_participation_percent: f32,
}

#[derive(Tsify, Debug, Serialize)]
pub struct BattleGroundProvince {
    pub id: ProvinceId,
    pub name: String,
    pub battles: usize,
    pub total_casualties: i32,
}

#[derive(Tsify, Debug, Serialize)]
pub struct WarEnd {
    pub war: String,
    pub war_end: Option<Eu4Date>,
    pub is_attacking: bool,
    pub land_battles: WarBattles,
    pub naval_battles: WarBattles,
    pub attacker_losses: [u32; 21],
    pub defender_losses: [u32; 21],
    pub war_duration_days: i32,
    pub our_duration_days: i32,
    pub our_losses: [u32; 21],
    pub our_participation: f32,
    pub our_participation_percent: f32,
    pub province_gains: Vec<ProvinceConquer>,
    pub province_losses: Vec<ProvinceConquer>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct WarBattles {
    pub count: usize,
    pub won: usize,
    pub battle_ground: Option<BattleGroundProvince>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct GreatPower {
    pub country: LocalizedTag,
    pub score: f32,
}

pub(crate) struct WarOverview<'a> {
    pub(crate) history: &'a WarHistory,
    pub(crate) name: &'a str,
    pub(crate) participants: &'a [eu4save::models::WarParticipant],
    pub(crate) original_attacker: CountryTag,
    pub(crate) original_defender: CountryTag,
    pub(crate) is_active: bool,
}

impl<'a> From<&'a PreviousWar> for WarOverview<'a> {
    fn from(value: &'a PreviousWar) -> Self {
        Self {
            history: &value.history,
            name: value.name.as_str(),
            participants: value.participants.as_slice(),
            original_attacker: value.original_attacker,
            original_defender: value.original_defender,
            is_active: false,
        }
    }
}

impl<'a> From<&'a ActiveWar> for WarOverview<'a> {
    fn from(value: &'a ActiveWar) -> Self {
        Self {
            history: &value.history,
            name: value.name.as_str(),
            participants: value.participants.as_slice(),
            original_attacker: value.original_attacker,
            original_defender: value.original_defender,
            is_active: true,
        }
    }
}

#[derive(Tsify, Debug, Serialize)]
pub struct ProvinceConquer {
    pub province_id: ProvinceId,
    pub name: String,
    pub from: LocalizedTag,
    pub to: LocalizedTag,
    pub development: f32,
}

#[derive(Tsify, Debug, Serialize)]
pub struct InstitutionCost {
    pub province_id: ProvinceId,
    pub name: String,
    pub mana_cost: i32,
    pub additional_expand_infrastructure: i32,
    pub exploit_at: Option<i32>,
    pub current_dev: i32,
    pub final_dev: i32,
    pub current_institution_progress: f32,
    pub dev_cost_modifier: f64,
    pub dev_cost_modifier_heuristic: f64,
}

#[derive(Tsify, Debug, Serialize)]
#[tsify(into_wasm_abi)]
pub struct CountryInstitution {
    pub institutions_available: i32,
    pub institutions_embraced: i32,
    pub dev_push: Vec<InstitutionCost>,
}
