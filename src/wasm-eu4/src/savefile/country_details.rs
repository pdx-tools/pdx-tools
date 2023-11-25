use eu4game::SaveGameQuery;
use eu4save::{
    models::{Country, CountryEvent, CountryTechnology, Leader, LeaderKind, Province},
    query::{
        CountryExpenseLedger, CountryIncomeLedger, CountryManaUsage, Inheritance, SaveCountry,
    },
    CountryTag, Eu4Date, PdsDate, ProvinceId,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tsify::Tsify;

use crate::savefile::hex_color;

use super::{LocalizedObj, LocalizedTag, SaveFileImpl};

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
    pub national_focus: Option<String>,
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
    name: String,
    ascended: Eu4Date,
    reign_years: i32,
    age: i32,
    culture: String,
    religion: String,
    personalities: Vec<LocalizedObj>,
    adm: u16,
    dip: u16,
    mil: u16,
}

#[derive(Tsify, Debug, Serialize, Default)]
pub struct LandUnitStrength {
    pub count: usize,
    pub strength: f32,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct RunningMonarch {
    name: String,
    country: LocalizedTag,
    start: String,
    end: Option<String>,
    personalities: Vec<LocalizedObj>,
    failed_heirs: Vec<FailedHeir>,
    reign: i32,
    adm: u16,
    dip: u16,
    mil: u16,
    avg_adm: f64,
    avg_dip: f64,
    avg_mil: f64,
    avg_dur_adm: f64,
    avg_dur_dip: f64,
    avg_dur_mil: f64,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct FailedHeir {
    name: String,
    country: LocalizedTag,
    birth: String,
    personalities: Vec<LocalizedObj>,
    adm: u16,
    dip: u16,
    mil: u16,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct CountryAdvisors {
    radical_reforms: Option<Eu4Date>,
    great_advisors: Vec<GreatAdvisor>,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GreatAdvisor {
    occupation: LocalizedObj,
    trigger_date: Option<Eu4Date>,
}

#[derive(Tsify, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[tsify(into_wasm_abi)]
pub struct CountryReligions {
    allowed_conversions: Vec<LocalizedObj>,
    religions: Vec<CountryReligion>,
    rebel: Option<RebelReligion>,
}

#[derive(Tsify, Debug, Serialize)]
pub struct RebelReligion {
    religion: CountryReligion,
    until_plurality: f32,
    more_popular: Vec<CountryReligion>,
}

#[derive(Tsify, Debug, Serialize, Clone)]
pub struct CountryReligion {
    index: Option<usize>,
    id: String,
    name: String,
    color: String,
    provinces: usize,
    exploitable: usize,
    provinces_percent: f64,
    development: f32,
    development_percent: f64,
    negotiate_convert_on_dominant_religion: Option<bool>,
    force_convert_on_break: Option<bool>,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub enum CultureTolerance {
    Primary,
    Accepted,
    None,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
pub struct CountryCulture {
    id: String,
    name: String,
    group: Option<String>,
    tolerance: CultureTolerance,

    provinces: usize,
    provinces_percent: f64,
    development: f32,
    development_percent: f64,

    stated_provs: usize,
    stated_provs_percent: f64,
    stated_provs_development: f32,
    stated_provs_development_percent: f64,

    conversions: usize,
    conversions_development: f32,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
struct MonarchStats {
    adm: u16,
    dip: u16,
    mil: u16,
}

#[derive(Tsify, Debug, Clone, Serialize, Deserialize)]
pub struct CountryLeader {
    id: u32,
    name: String,
    fire: u16,
    shock: u16,
    maneuver: u16,
    siege: u16,
    kind: LeaderKind,
    active: bool,
    activation: Option<Eu4Date>,
    personality: Option<LocalizedObj>,
    monarch_stats: Option<MonarchStats>,
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
    progress: f32,
    date: Eu4Date,
}

#[derive(Tsify, Debug, Clone, Serialize)]
pub struct CountryStateDetails {
    state: LocalizedObj,
    capital_state: bool,
    provinces: Vec<(String, f32)>,
    total_dev: f32,
    total_gc: f32,
    centralizing: Option<ProgressDate>,
    centralized: i32,
    prosperity: f32,
    prosperity_mode: Option<bool>,
    state_house: bool,
}

#[derive(Tsify, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Estate<'a> {
    kind: &'a str,
    loyalty: f32,
    territory: f32,
    completed_agendas: i32,
    privileges: Vec<(String, Eu4Date)>,
    influence_modifiers: Vec<InfluenceModifier>,
}

#[derive(Tsify, Serialize)]
#[serde(rename_all = "camelCase")]
struct InfluenceModifier {
    value: f32,
    desc: String,
    date: Eu4Date,
}

impl SaveFileImpl {
    pub fn get_country(&self, tag: String) -> CountryDetails {
        let country_tag = tag
            .parse::<CountryTag>()
            .expect("Country tags should only be strings");
        let save_country = self
            .query
            .save_country(&country_tag)
            .expect("Country to exist");
        self.get_country_details(save_country)
    }

    pub fn get_country_details(&self, save_country: SaveCountry) -> CountryDetails {
        let country_tag = save_country.tag;
        let country = save_country.country;
        let ruler = country
            .history
            .events
            .iter()
            .filter_map(|(date, event)| event.as_monarch().map(|x| (date, x)))
            .find(|(_date, x)| {
                country
                    .monarch
                    .as_ref()
                    .map_or(true, |ruler| ruler.id == x.id.id)
            })
            .map(|(ascended, x)| CountryMonarch {
                name: x.name.clone(),
                ascended: *ascended,
                reign_years: ascended.days_until(&self.query.save().meta.date) / 365,
                age: x.birth_date.days_until(&self.query.save().meta.date) / 365,
                culture: x
                    .culture
                    .as_ref()
                    .map(|x| self.game.localize(x).unwrap_or(x))
                    .map(String::from)
                    .unwrap_or_else(|| String::from("unknown")),
                religion: x
                    .religion
                    .clone()
                    .unwrap_or_else(|| String::from("unknown")),
                personalities: x
                    .personalities
                    .iter()
                    .map(|(personality, _)| LocalizedObj {
                        id: personality.clone(),
                        name: self.game.localize_personality(personality),
                    })
                    .collect(),
                adm: x.adm as u16,
                dip: x.dip as u16,
                mil: x.mil as u16,
            })
            .unwrap_or_else(|| CountryMonarch {
                name: "Interregnum".to_string(),
                ascended: Eu4Date::from_ymd(1, 1, 1),
                reign_years: 0,
                age: 0,
                personalities: Vec::new(),
                culture: String::from("unknown"),
                religion: String::from("unknown"),
                adm: 0,
                dip: 0,
                mil: 0,
            });

        let religion = country
            .religion
            .as_ref()
            .map(|x| {
                self.game
                    .religion(x)
                    .map(|r| String::from(r.name))
                    .unwrap_or_else(|| String::from(x))
            })
            .unwrap_or_else(|| String::from("noreligion"));

        let primary_culture = country
            .primary_culture
            .clone()
            .unwrap_or_else(|| String::from("noculture"));

        let mut building_count = HashMap::new();
        let prov_buildings = self
            .query
            .save()
            .game
            .provinces
            .values()
            .filter(|prov| prov.owner.as_ref().map_or(false, |x| x == &country_tag))
            .flat_map(|x| x.buildings.keys());
        for building in prov_buildings {
            *building_count.entry(building).or_default() += 1
        }

        let mut investment_count: HashMap<&String, i32> = HashMap::new();
        let investments = self
            .query
            .save()
            .game
            .map_area_data
            .values()
            .flat_map(|x| x.investments.iter())
            .filter(|x| x.tag == country_tag)
            .flat_map(|x| x.investments.iter());
        for investment in investments {
            *investment_count.entry(investment).or_default() += 1;
        }

        let invests = investment_count.iter().map(|(investment, count)| {
            let key = self.game.localize_trade_company(investment);
            let key = format!("TC {}", key);
            (key, *count)
        });

        let buildings: HashMap<_, _> = building_count
            .iter()
            .map(|(building, count)| {
                let key = self
                    .game
                    .localize_building(building)
                    .unwrap_or(building)
                    .to_string();
                (key, *count)
            })
            .chain(invests)
            .collect();

        let loans = country.loans.len();
        let debt = country.loans.iter().map(|x| x.amount).sum();
        let ideas = country
            .active_idea_groups
            .iter()
            .map(|(name, v)| (name.clone(), i32::from(*v)))
            .collect();

        let game_land_units: HashMap<_, _> =
            self.game.land_units().map(|x| (x.name, x.kind)).collect();
        let units = country
            .armies
            .iter()
            .filter(|x| x.mercenary_company.is_none())
            .flat_map(|x| x.regiments.iter())
            .filter_map(|x| game_land_units.get(x._type.as_str()).map(|unit| (unit, x)));

        let mut infantry = LandUnitStrength::default();
        let mut cavalry = LandUnitStrength::default();
        let mut artillery = LandUnitStrength::default();

        for (unit, regiment) in units {
            match unit {
                eu4game::game::LandUnitKind::Infantry => {
                    infantry.count += 1;
                    infantry.strength += regiment.strength;
                }
                eu4game::game::LandUnitKind::Cavalry => {
                    cavalry.count += 1;
                    cavalry.strength += regiment.strength;
                }
                eu4game::game::LandUnitKind::Artillery => {
                    artillery.count += 1;
                    artillery.strength += regiment.strength;
                }
            }
        }

        let mercenary_units: usize = country
            .armies
            .iter()
            .filter(|x| x.mercenary_company.is_some())
            .map(|x| x.regiments.len())
            .sum();

        let game_naval_units: HashMap<_, _> =
            self.game.naval_units().map(|x| (x.name, x.kind)).collect();
        let ships = country
            .navies
            .iter()
            .flat_map(|x| x.ships.iter())
            .filter_map(|x| game_naval_units.get(x._type.as_str()).map(|unit| (unit, x)));

        let mut heavy_ship = 0;
        let mut light_ship = 0;
        let mut galley = 0;
        let mut transport = 0;

        for (unit, _regiment) in ships {
            match unit {
                eu4game::game::NavalUnitKind::HeavyShip => heavy_ship += 1,
                eu4game::game::NavalUnitKind::LightShip => light_ship += 1,
                eu4game::game::NavalUnitKind::Galley => galley += 1,
                eu4game::game::NavalUnitKind::Transport => transport += 1,
            }
        }

        let (best_general, best_admiral) = country_best_leaders(country);

        let inheritance = self.query.inherit(&save_country);

        let diplomacy = &self.query.save().game.diplomacy;
        let mut diplomacy_entries = Vec::new();

        let dependencies = diplomacy
            .dependencies
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| {
                let kind = if x.subject_type == "personal_union" && x.first == country_tag {
                    DiplomacyKind::JuniorPartner {
                        pu_inheritance_value: self
                            .query
                            .save_country(&x.second)
                            .map(|x| self.query.inherit(&x).pu_inheritance_value)
                            .unwrap_or_default(),
                    }
                } else {
                    DiplomacyKind::Dependency {
                        subject_type: x.subject_type.clone(),
                    }
                };

                DiplomacyEntry {
                    first: self.localize_tag(x.first),
                    second: self.localize_tag(x.second),
                    start_date: x.start_date,
                    data: kind,
                }
            });

        diplomacy_entries.extend(dependencies);

        let alliances = diplomacy
            .alliances
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::Alliance,
            });
        diplomacy_entries.extend(alliances);

        let royal_marriages = diplomacy
            .royal_marriages
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::RoyalMarriage,
            });
        diplomacy_entries.extend(royal_marriages);

        let warnings = diplomacy
            .warnings
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::Warning,
            });
        diplomacy_entries.extend(warnings);

        let subsidies = diplomacy
            .subsidies
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::Subsidy {
                    amount: x.amount,
                    duration: x.duration,
                    total: x.start_date.map(|start| {
                        let end = self.query.save().meta.date;
                        let result = (i64::from(end.year()) * 12 + i64::from(end.month()))
                            - (i64::from(start.year()) * 12 + i64::from(start.month()));
                        result as f32 * x.amount
                    }),
                },
            });
        diplomacy_entries.extend(subsidies);

        let war_reparations = diplomacy
            .war_reparations
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::Reparations {
                    end_date: x.end_date,
                },
            });
        diplomacy_entries.extend(war_reparations);

        let transfer_trade_powers = diplomacy
            .transfer_trade_powers
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::TransferTrade,
            });
        diplomacy_entries.extend(transfer_trade_powers);

        let steer_trades = diplomacy
            .steer_trades
            .iter()
            .filter(|x| x.first == country_tag || x.second == country_tag)
            .map(|x| DiplomacyEntry {
                first: self.localize_tag(x.first),
                second: self.localize_tag(x.second),
                start_date: x.start_date,
                data: DiplomacyKind::SteerTrade,
            });
        diplomacy_entries.extend(steer_trades);

        let government_strength = match (
            country.legitimacy,
            country.republican_tradition,
            country.devotion,
            country.meritocracy,
            country.horde_unity,
        ) {
            (value, _, _, _, _) if value > 0.0 => GovernmentStrength::Legitimacy { value },
            (_, value, _, _, _) if value > 0.0 => GovernmentStrength::Republic { value },
            (_, _, value, _, _) if value > 0.0 => GovernmentStrength::Devotion { value },
            (_, _, _, value, _) if value > 0.0 => GovernmentStrength::Meritocracy { value },
            (_, _, _, _, value) if value > 0.0 => GovernmentStrength::Horde { value },
            _ => GovernmentStrength::Native,
        };

        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        CountryDetails {
            id: save_country.id,
            tag: country_tag,
            name: save_game_query.localize_country(&country_tag),
            ruler,
            base_tax: country.base_tax,
            development: country.development,
            raw_development: country.raw_development,
            prestige: country.prestige,
            stability: country.stability,
            treasury: country.treasury,
            inflation: country.inflation,
            corruption: country.corruption,
            overextension: country.overextension,
            innovativeness: country.innovativeness,
            technology: country.technology.clone(),
            num_cities: country.num_of_cities,
            ideas,
            primary_culture,
            religion,
            loans,
            debt,
            adm_mana: country.powers[0],
            dip_mana: country.powers[1],
            mil_mana: country.powers[2],
            income: self.query.country_income_breakdown(country),
            expenses: self.query.country_expense_breakdown(country),
            total_expenses: self.query.country_total_expense_breakdown(country),
            mana_usage: self.query.country_mana_breakdown(country),
            building_count: buildings,
            inheritance,
            diplomacy: diplomacy_entries,
            best_admiral: best_admiral.cloned(),
            best_general: best_general.cloned(),
            infantry_units: infantry,
            cavalry_units: cavalry,
            artillery_units: artillery,
            mercenary_units,
            heavy_ship_units: heavy_ship,
            light_ship_units: light_ship,
            galley_units: galley,
            transport_units: transport,
            manpower: country.manpower,
            max_manpower: country.max_manpower,
            professionalism: country.army_professionalism,
            army_tradition: country.army_tradition,
            navy_tradition: country.navy_tradition,
            power_projection: country.current_power_projection,
            religious_unity: country.religious_unity,
            mercantilism: country.mercantilism,
            absolutism: country.absolutism,
            splendor: country.splendor,
            merchants: country.merchants.envoys.len(),
            diplomats: country.diplomats.envoys.len(),
            colonists: country.colonists.envoys.len(),
            missionaries: country.missionaries.envoys.len(),
            government_strength,
            national_focus: country.national_focus.clone(),
        }
    }

    pub fn get_country_rulers(&self, tag: &str) -> Vec<RunningMonarch> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);

        let monarch_ids = country
            .previous_monarchs
            .iter()
            .map(|x| x.id)
            .chain(country.monarch.as_ref().map(|x| x.id).iter().copied())
            .collect::<HashSet<_>>();

        let mut prev: Option<(&Eu4Date, RunningMonarch)> = None;
        let mut failed_heirs = Vec::new();
        let mut result = Vec::new();

        let mut total_adm = 0;
        let mut total_dip = 0;
        let mut total_mil = 0;
        let mut total_month_adm = 0;
        let mut total_month_dip = 0;
        let mut total_month_mil = 0;
        let mut total_months = 0;

        for (date, event) in &country.history.events {
            // we exclude heirs and queens (before they've become monarch heirs and monarch consorts)
            match event {
                CountryEvent::Monarch(x)
                | CountryEvent::MonarchHeir(x)
                | CountryEvent::MonarchConsort(x) => {
                    if monarch_ids.contains(&x.id.id) {
                        if let Some((prev_start_date, prev_monarch)) = prev.take() {
                            let death_date = *date;

                            let months = (i32::from(death_date.year()) * 12
                                + i32::from(death_date.month()))
                                - (i32::from(prev_start_date.year()) * 12
                                    + i32::from(prev_start_date.month()));

                            if *date > self.query.save().game.start_date {
                                total_months += months;
                                total_adm += prev_monarch.adm;
                                total_dip += prev_monarch.dip;
                                total_mil += prev_monarch.mil;
                                total_month_adm += months * i32::from(prev_monarch.adm);
                                total_month_dip += months * i32::from(prev_monarch.dip);
                                total_month_mil += months * i32::from(prev_monarch.mil);

                                let add_monarch = RunningMonarch {
                                    reign: months,
                                    end: Some(date.iso_8601().to_string()),
                                    avg_adm: f64::from(total_adm)
                                        / f64::from(result.len() as u32 + 1),
                                    avg_dip: f64::from(total_dip)
                                        / f64::from(result.len() as u32 + 1),
                                    avg_mil: f64::from(total_mil)
                                        / f64::from(result.len() as u32 + 1),
                                    avg_dur_adm: f64::from(total_month_adm)
                                        / f64::from(total_months),
                                    avg_dur_dip: f64::from(total_month_dip)
                                        / f64::from(total_months),
                                    avg_dur_mil: f64::from(total_month_mil)
                                        / f64::from(total_months),
                                    ..prev_monarch
                                };
                                result.push(add_monarch);
                            }
                        }

                        let start_date = date.max(&self.query.save().game.start_date);

                        let tmp_monarch = RunningMonarch {
                            name: x.name.clone(),
                            start: start_date.iso_8601().to_string(),
                            country: LocalizedTag {
                                tag: x.country,
                                name: save_game_query.localize_country(&x.country),
                            },
                            end: None,
                            personalities: x
                                .personalities
                                .iter()
                                .map(|(personality, _)| LocalizedObj {
                                    id: personality.clone(),
                                    name: self.game.localize_personality(personality),
                                })
                                .collect(),
                            failed_heirs: failed_heirs.clone(),
                            adm: x.adm as u16,
                            dip: x.dip as u16,
                            mil: x.mil as u16,
                            avg_adm: 0.0,
                            avg_dip: 0.0,
                            avg_mil: 0.0,
                            avg_dur_adm: 0.0,
                            avg_dur_dip: 0.0,
                            avg_dur_mil: 0.0,
                            reign: 0,
                        };

                        prev = Some((date, tmp_monarch));
                        failed_heirs.clear();
                    }
                }
                CountryEvent::Heir(heir) => {
                    if !monarch_ids.contains(&heir.id.id) {
                        failed_heirs.push(FailedHeir {
                            name: heir.name.clone(),
                            country: LocalizedTag {
                                tag: heir.country,
                                name: save_game_query.localize_country(&heir.country),
                            },
                            birth: heir.birth_date.iso_8601().to_string(),
                            personalities: heir
                                .personalities
                                .iter()
                                .map(|(personality, _)| LocalizedObj {
                                    id: personality.clone(),
                                    name: self.game.localize_personality(personality),
                                })
                                .collect(),
                            adm: heir.adm as u16,
                            dip: heir.dip as u16,
                            mil: heir.mil as u16,
                        });
                    }
                }
                _ => {}
            }
        }

        if let Some((prev_start_date, prev_monarch)) = prev.take() {
            let date = self.query.save().meta.date;
            let months = (i32::from(date.year()) * 12 + i32::from(date.month()))
                - (i32::from(prev_start_date.year()) * 12 + i32::from(prev_start_date.month()));

            if date >= self.query.save().game.start_date {
                total_months += months;
                total_adm += prev_monarch.adm;
                total_dip += prev_monarch.dip;
                total_mil += prev_monarch.mil;
                total_month_adm += months * i32::from(prev_monarch.adm);
                total_month_dip += months * i32::from(prev_monarch.dip);
                total_month_mil += months * i32::from(prev_monarch.mil);

                let add_monarch = RunningMonarch {
                    reign: months,
                    end: None,
                    avg_adm: f64::from(total_adm) / f64::from(result.len() as u32 + 1),
                    avg_dip: f64::from(total_dip) / f64::from(result.len() as u32 + 1),
                    avg_mil: f64::from(total_mil) / f64::from(result.len() as u32 + 1),
                    avg_dur_adm: f64::from(total_month_adm) / f64::from(total_months),
                    avg_dur_dip: f64::from(total_month_dip) / f64::from(total_months),
                    avg_dur_mil: f64::from(total_month_mil) / f64::from(total_months),
                    ..prev_monarch
                };
                result.push(add_monarch);
            }
        }

        result
    }

    pub fn get_country_advisors(&self, tag: &str) -> CountryAdvisors {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();

        let radical_reforms = country
            .flags
            .iter()
            .find(|(flag, _)| flag == "radical_mercantilist_reforms")
            .map(|(_, date)| *date);

        let mut great_advisors = Vec::new();
        for advisor_id in self.game.advisor_ids() {
            let advisor_name = self.game.localize_advisor(advisor_id);
            let trigger_date = country.flags.iter().find_map(|(flag, date)| {
                if flag == advisor_id {
                    Some(*date)
                } else {
                    None
                }
            });

            great_advisors.push(GreatAdvisor {
                occupation: LocalizedObj {
                    id: String::from(advisor_id),
                    name: advisor_name,
                },
                trigger_date,
            })
        }

        great_advisors.sort_unstable_by(|a, b| a.occupation.name.cmp(&b.occupation.name));
        CountryAdvisors {
            radical_reforms,
            great_advisors,
        }
    }

    pub fn get_country_province_religion(&self, tag: &str) -> CountryReligions {
        let tag = tag.parse::<CountryTag>().unwrap();

        let state_religion = self
            .query
            .country(&tag)
            .and_then(|x| x.religion.as_ref())
            .and_then(|x| self.game.religion(x));

        let allowed_conversions = state_religion
            .as_ref()
            .map(|x| {
                x.allowed_conversions
                    .iter()
                    .filter_map(|r| self.game.religion(r))
                    .map(|r| LocalizedObj {
                        id: String::from(r.id),
                        name: String::from(r.name),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let owned_provinces = self
            .query
            .save()
            .game
            .provinces
            .values()
            .filter(|x| x.owner.as_ref().map_or(false, |owner| owner == &tag))
            .filter_map(|x| x.religion.as_ref().map(|r| (x, r)));

        #[derive(Default)]
        struct ProvinceCount {
            count: usize,
            development: f32,
            exploitable: usize,
        }

        let mut province_counts: HashMap<_, ProvinceCount> = HashMap::new();
        for (prov, religion) in owned_provinces {
            let entry = province_counts.entry(religion).or_default();
            entry.count += 1;
            entry.development += prov.base_manpower + prov.base_production + prov.base_tax;

            // Can't exploit production of inland provinces, but this hasn't been setup,
            // so just rely on either tax or manpower being above 2.
            let exploited_recently = prov.exploit_date.map_or(false, |x| {
                x.add_days(365 * 20) > self.query.save().meta.date
            });
            entry.exploitable +=
                if (prov.base_tax >= 2.0 || prov.base_manpower >= 2.0) && !exploited_recently {
                    1
                } else {
                    0
                }
        }

        let mut total_provinces = 0;
        let mut total_development = 0.0;
        for tally in province_counts.values() {
            total_provinces += tally.count;
            total_development += f64::from(tally.development);
        }

        let mut result = Vec::with_capacity(province_counts.len());
        for (religion_id, tally) in province_counts {
            let religion = self.game.religion(religion_id);
            let color = religion.as_ref().map(|x| x.color).unwrap_or_default();
            let name = religion
                .as_ref()
                .map(|x| String::from(x.name))
                .unwrap_or_else(|| String::from(religion_id));

            result.push(CountryReligion {
                index: religion.as_ref().map(|x| x.index),
                id: String::from(religion_id),
                name,
                color: hex_color(color),
                provinces: tally.count,
                provinces_percent: (tally.count as f64) / (total_provinces as f64) * 100.0,
                development: tally.development,
                development_percent: f64::from(tally.development) / total_development * 100.0,
                exploitable: tally.exploitable,
                force_convert_on_break: religion.as_ref().map(|x| x.force_convert_on_break),
                negotiate_convert_on_dominant_religion: religion
                    .as_ref()
                    .map(|x| x.negotiate_convert_on_dominant_religion),
            })
        }

        result.sort_unstable_by(|a, b| a.name.cmp(&b.name));

        let all_religions: HashSet<_> = result.iter().map(|x| &x.id).collect();
        let direct_religions: HashSet<_> = allowed_conversions.iter().map(|x| &x.id).collect();

        let rebel = all_religions
            .difference(&direct_religions)
            .filter(|x| {
                state_religion
                    .as_ref()
                    .map_or(false, |r| r.id != x.as_str())
            })
            .filter_map(|x| result.iter().find(|r| x == &&r.id))
            .max_by(|a, b| a.development.partial_cmp(&b.development).unwrap())
            .map(|leader| {
                let most_popular = result
                    .iter()
                    .max_by(|a, b| {
                        a.development
                            .partial_cmp(&b.development)
                            .unwrap()
                            .then_with(|| a.index.cmp(&b.index).reverse())
                    })
                    .unwrap();

                let more_popular = result
                    .iter()
                    .filter(|x| x.id != leader.id && (x.development > leader.development || (x.development == leader.development && x.index.map_or(true, |a| leader.index.map_or(true, |b| a < b)))))
                    .cloned()
                    .collect::<Vec<_>>();

                let plurality_offset = if matches!((leader.index, most_popular.index), (Some(x), Some(y)) if x <= y) {
                    0f32
                } else {
                    1f32
                };

                let until_plurality = most_popular.development - leader.development + plurality_offset;
                RebelReligion {
                    religion: leader.clone(),
                    until_plurality,
                    more_popular,
                }
            });

        CountryReligions {
            allowed_conversions,
            religions: result,
            rebel,
        }
    }

    pub fn get_country_province_culture(&self, tag: &str) -> Vec<CountryCulture> {
        let tag = tag.parse::<CountryTag>().unwrap();

        let mut culture_to_group = HashMap::new();
        for culture_group in self.game.culture_groups() {
            for culture in culture_group.list {
                culture_to_group.insert(culture, culture_group.key);
            }
        }

        let country = self.query.country(&tag);
        let accepted_cultures = if let Some(country) = country {
            let mut accepted_cultures = country.accepted_cultures.clone();
            if country.government_rank >= 3 {
                let cultural_union = country
                    .primary_culture
                    .as_ref()
                    .and_then(|culture: &String| culture_to_group.get(culture.as_str()))
                    .and_then(|group| self.game.culture_group_cultures(group))
                    .into_iter()
                    .flatten()
                    .map(String::from);
                accepted_cultures.extend(cultural_union);
            }
            accepted_cultures
        } else {
            Vec::new()
        };

        let primary_culture = country.and_then(|x| x.primary_culture.as_ref());

        let stated: HashSet<_> = self
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
            .filter(|(_area, &owner)| owner == tag)
            .filter_map(|(area, _)| self.game.area_provinces(area))
            .flatten()
            .collect::<HashSet<_>>();

        let owned_provinces = self
            .query
            .save()
            .game
            .provinces
            .iter()
            .filter(|(_, prov)| prov.owner.as_ref().map_or(false, |owner| owner == &tag))
            .filter_map(|(id, prov)| prov.culture.as_ref().map(|r| (id, prov, r)));

        #[derive(Default)]
        struct ProvinceCount {
            count: usize,
            development: f32,

            stated_core: usize,
            stated_core_development: f32,

            conversion: usize,
            conversion_development: f32,
        }

        let mut province_counts: HashMap<_, ProvinceCount> = HashMap::new();
        for (id, prov, culture) in owned_provinces {
            let entry = province_counts.entry(culture).or_default();
            let dev = prov.base_manpower + prov.base_production + prov.base_tax;
            entry.count += 1;
            entry.development += dev;

            // Only check if stated for culture shifting even though the wiki
            // says "Any accepted culture that has at least 50% of the
            // development of the country’s state cores". Per lambda.
            if stated.contains(id) {
                entry.stated_core += 1;
                entry.stated_core_development += dev;
            }

            if let Some(x) = prov.change_culture_construction.as_ref() {
                let entry = province_counts.entry(&x.culture).or_default();
                entry.conversion += 1;
                entry.conversion_development += dev;
            }
        }

        let mut total_provinces = 0;
        let mut total_development = 0.0;
        let mut total_stated_provs = 0;
        let mut total_stated_provs_development = 0.0;
        for tally in province_counts.values() {
            total_provinces += tally.count;
            total_development += f64::from(tally.development);
            total_stated_provs += tally.stated_core;
            total_stated_provs_development += f64::from(tally.stated_core_development);
        }

        let mut result = Vec::with_capacity(province_counts.len());
        for (culture_id, tally) in province_counts {
            let name = self
                .game
                .localize(culture_id)
                .map(String::from)
                .unwrap_or_else(|| culture_id.clone());

            let tolerance = if Some(culture_id) == primary_culture {
                CultureTolerance::Primary
            } else if accepted_cultures.contains(culture_id) {
                CultureTolerance::Accepted
            } else {
                CultureTolerance::None
            };

            result.push(CountryCulture {
                id: String::from(culture_id),
                name,
                group: culture_to_group
                    .get(culture_id.as_str())
                    .map(|&x| String::from(x)),
                tolerance,
                provinces: tally.count,
                provinces_percent: (tally.count as f64) / (total_provinces as f64) * 100.0,
                development: tally.development,
                development_percent: f64::from(tally.development) / total_development * 100.0,
                stated_provs: tally.stated_core,
                stated_provs_percent: (tally.stated_core as f64) / (total_stated_provs as f64)
                    * 100.0,
                stated_provs_development: tally.stated_core_development,
                stated_provs_development_percent: f64::from(tally.stated_core_development)
                    / total_stated_provs_development
                    * 100.0,
                conversions: tally.conversion,
                conversions_development: tally.conversion_development,
            })
        }

        result.sort_unstable_by(|a, b| a.name.cmp(&b.name));
        result
    }

    pub fn get_country_leaders(&self, tag: &str) -> Vec<CountryLeader> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();

        struct CountryLeaderRaw<'a> {
            leader: &'a Leader,
            monarch: Option<MonarchStats>,
        }

        let mut leaders: HashMap<u32, CountryLeaderRaw> = HashMap::new();
        for (_date, event) in &country.history.events {
            if let Some(monarch) = event.as_monarch() {
                if let Some(leader) = monarch.leader.as_ref() {
                    if let Some(id) = leader.id.as_ref() {
                        leaders.insert(
                            id.id,
                            CountryLeaderRaw {
                                leader,
                                monarch: Some(MonarchStats {
                                    adm: monarch.adm as u16,
                                    dip: monarch.dip as u16,
                                    mil: monarch.mil as u16,
                                }),
                            },
                        );
                    }
                }
            } else if let CountryEvent::Leader(leader) = event {
                if let Some(id) = leader.id.as_ref() {
                    leaders.insert(
                        id.id,
                        CountryLeaderRaw {
                            leader,
                            monarch: None,
                        },
                    );
                }
            }
        }

        let mut result: Vec<_> = leaders
            .into_iter()
            .map(|(id, x)| CountryLeader {
                id,
                name: x.leader.name.clone(),
                fire: x.leader.fire,
                shock: x.leader.shock,
                maneuver: x.leader.maneuver,
                siege: x.leader.siege,
                kind: x.leader.kind.clone(),
                active: x
                    .leader
                    .id
                    .as_ref()
                    .map(|x| country.leaders.iter().any(|y| x.id == y.id))
                    .unwrap_or(false),
                activation: x.leader.activation,
                personality: x
                    .leader
                    .personality
                    .as_ref()
                    .map(|personality| LocalizedObj {
                        id: personality.clone(),
                        name: self.game.localize_personality(personality),
                    }),
                monarch_stats: x.monarch,
            })
            .collect();

        // Sort so active is first and then activation date
        result.sort_unstable_by(|a, b| {
            b.active
                .cmp(&a.active)
                .then_with(|| b.activation.cmp(&b.activation))
                .then_with(|| a.name.cmp(&b.name))
        });

        result
    }

    pub fn get_country_states(&self, tag: &str) -> Vec<CountryStateDetails> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();
        let state_lookup = self.game.province_area_lookup();

        let owned_provinces = self
            .query
            .save()
            .game
            .provinces
            .iter()
            .filter(|(_, prov)| prov.owner.as_ref().map_or(false, |owner| owner == &tag))
            .filter_map(|(id, prov)| state_lookup.get(id).map(|state| (id, prov, state)));

        let mut province_states: HashMap<&str, Vec<(ProvinceId, &Province)>> = HashMap::new();
        for (id, prov, state) in owned_provinces {
            let provs = province_states.entry(state).or_default();
            provs.push((*id, prov));
        }

        let has_administrative_efficiency = country
            .active_idea_groups
            .iter()
            .any(|(idea_group, progress)| idea_group == "infrastructure_ideas" && *progress >= 5);
        let administrative_efficiency_modifier = if has_administrative_efficiency {
            0.1
        } else {
            0.0
        };

        let mut result: Vec<_> = province_states
            .iter()
            .map(|(state, provinces)| {
                let name = self.game.localize(state).unwrap_or(state);

                let total_dev = provinces
                    .iter()
                    .map(|(_, prov)| prov.base_manpower + prov.base_production + prov.base_tax)
                    .sum();

                let is_pirate = country
                    .government
                    .as_ref()
                    .map(|x| {
                        x.reform_stack
                            .reforms
                            .iter()
                            .any(|y| y == "pirate_republic_reform")
                    })
                    .unwrap_or_default();

                let is_capital_state = provinces.iter().any(|(id, _)| id == &country.capital);

                let state_house_gc_state_modifier = provinces
                    .iter()
                    .filter(|(_, prov)| prov.buildings.contains_key("state_house"))
                    .filter_map(|(_, prov)| prov.trade_goods.as_deref())
                    .map(|trade_good| match trade_good {
                        "gems" | "paper" | "glass" => 0.4,
                        _ => 0.2,
                    })
                    .fold(0.0, f32::max);

                let country_state = self
                    .query
                    .save()
                    .game
                    .map_area_data
                    .get(*state)
                    .and_then(|x| x.state.as_ref())
                    .and_then(|x| x.country_states.iter().find(|c| c.country == tag));

                // Some provinces in the state don't have the same num_centralize_state.
                // It appears EU4 takes the max one when calculating gov cost.
                let centralized = provinces
                    .iter()
                    .map(|(_, prov)| prov.num_centralize_state)
                    .max()
                    .unwrap_or(0);

                let provinces_gc: Vec<_> = provinces
                    .iter()
                    .map(|(_, prov)| {
                        let dev = prov.base_manpower + prov.base_production + prov.base_tax;
                        let mut flat = 0.0;
                        let mut gc_modifier = if country_state.is_some() {
                            if prov.territorial_core.contains(&tag) {
                                0.5
                            } else {
                                1.0
                            }
                        } else {
                            0.25
                        };

                        gc_modifier -= state_house_gc_state_modifier;

                        if is_pirate {
                            gc_modifier += 0.75;
                        }

                        if is_capital_state {
                            gc_modifier -= 1.0;
                        }

                        if prov.active_trade_company {
                            gc_modifier += 0.25;
                        }

                        if prov.buildings.contains_key("courthouse") {
                            gc_modifier -= 0.25;
                        }

                        if prov.buildings.contains_key("town_hall") {
                            gc_modifier -= 0.5;
                        }

                        if prov.buildings.contains_key("state_house") {
                            match prov.trade_goods.as_deref() {
                                Some("paper" | "glass" | "gems") => {
                                    gc_modifier -= 0.3;
                                    flat -= 20.0;
                                }
                                _ => {
                                    gc_modifier -= 0.15;
                                    flat -= 10.0;
                                }
                            }
                        }

                        gc_modifier -= 0.2 * centralized as f32;
                        gc_modifier += 0.1 * prov.expand_infrastructure as f32;
                        gc_modifier -= administrative_efficiency_modifier;

                        let base = (dev * gc_modifier).max(dev * 0.01);

                        flat += 15.0 * (prov.expand_infrastructure as f32);

                        (prov.name.clone(), (base + flat).max(0.0))
                    })
                    .collect();

                let total_gc = provinces_gc.iter().map(|(_, gc)| gc).sum();

                let centralizing = provinces
                    .iter()
                    .filter_map(|(_, prov)| {
                        prov.centralize_state_construction
                            .as_ref()
                            .map(|x| ProgressDate {
                                progress: x.progress,
                                date: x.date,
                            })
                    })
                    .next();

                let prosperity = country_state.map(|x| x.prosperity).unwrap_or_default();
                let has_devastation = provinces.iter().any(|(_, prov)| prov.devastation > 0.);
                let prosperity_mode = if country.stability > 0.0
                    && !has_devastation
                    && prosperity < 100.0
                    && country_state.is_some()
                {
                    Some(true)
                } else if country_state.is_some() && (country.stability < 0.0 || has_devastation) {
                    Some(false)
                } else {
                    None
                };

                CountryStateDetails {
                    state: LocalizedObj {
                        id: String::from(*state),
                        name: String::from(name),
                    },
                    capital_state: is_capital_state,
                    provinces: provinces_gc,
                    total_gc,
                    total_dev,
                    centralizing,
                    centralized,
                    prosperity,
                    prosperity_mode,
                    state_house: state_house_gc_state_modifier != 0.0,
                }
            })
            .collect();

        result.sort_unstable_by(|a, b| a.state.name.cmp(&b.state.name));
        result
    }

    pub fn get_country_estates(&self, tag: &str) -> Vec<Estate> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();

        let estates: Vec<_> = country
            .estates
            .iter()
            .map(|x| {
                let mut privileges: Vec<_> = x
                    .granted_privileges
                    .iter()
                    .map(|(privilege, date)| {
                        (
                            privilege
                                .trim_start_matches(&x._type)
                                .trim_start_matches('_')
                                .replace('_', " "),
                            *date,
                        )
                    })
                    .collect();

                privileges.sort_by(|(privilege, _), (bprivilege, _)| privilege.cmp(bprivilege));

                let mut influence_modifiers: Vec<_> = x
                    .influence_modifiers
                    .iter()
                    .map(|modifier| InfluenceModifier {
                        value: modifier.value,
                        desc: modifier
                            .desc
                            .trim_start_matches("EST_VAL_")
                            .replace('_', " "),
                        date: modifier.date,
                    })
                    .collect();

                influence_modifiers.sort_by_key(|x| x.date);

                Estate {
                    kind: x._type.trim_start_matches("estate_"),
                    loyalty: x.loyalty,
                    territory: x.territory,
                    privileges,
                    influence_modifiers,
                    completed_agendas: x.num_of_estate_agendas_completed,
                }
            })
            .collect();

        estates
    }
}

pub(crate) fn country_best_leaders(country: &Country) -> (Option<&Leader>, Option<&Leader>) {
    let active_leaders: HashSet<_> = country.leaders.iter().map(|x| x.id).collect();

    let (best_general, best_admiral) = country
        .history
        .events
        .iter()
        .filter_map(|(_, event)| event.as_leader())
        .filter(|leader| {
            leader
                .id
                .as_ref()
                .map_or(false, |x| active_leaders.contains(&x.id))
        })
        .fold((None, None), |(general, admiral), leader| {
            match leader.kind {
                eu4save::models::LeaderKind::General
                | eu4save::models::LeaderKind::Conquistador => {
                    if general.map_or(true, |b: &eu4save::models::Leader| {
                        leader.fire + leader.shock + leader.maneuver + leader.siege
                            > b.fire + b.shock + b.maneuver + b.siege
                    }) {
                        (Some(leader), admiral)
                    } else {
                        (general, admiral)
                    }
                }
                eu4save::models::LeaderKind::Admiral | eu4save::models::LeaderKind::Explorer => {
                    if admiral.map_or(true, |b: &eu4save::models::Leader| {
                        leader.fire + leader.shock + leader.maneuver > b.fire + b.shock + b.maneuver
                    }) {
                        (general, Some(leader))
                    } else {
                        (general, admiral)
                    }
                }
            }
        });

    (best_general, best_admiral)
}
