use crate::{hex_color, LocalizedObj, LocalizedTag, SaveFileImpl};
use eu4game::SaveGameQuery;
use eu4save::{
    models::{CountryEvent, CountryTechnology},
    query::{CountryExpenseLedger, CountryIncomeLedger, CountryManaUsage},
    CountryTag, Eu4Date, PdsDate,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::JsValue;

#[derive(Serialize, Deserialize, Debug)]
pub struct CountryDetails {
    pub tag: CountryTag,
    pub base_tax: f32,
    pub development: f32,
    pub prestige: f32,
    pub stability: f32,
    pub treasury: f32,
    pub inflation: f32,
    pub corruption: f32,
    pub religion: String,
    pub primary_culture: String,
    pub technology: CountryTechnology,
    pub ruler: FrontendMonarch,
    pub loans: usize,
    pub debt: i32,
    pub income: CountryIncomeLedger,
    pub expenses: CountryExpenseLedger,
    pub total_expenses: CountryExpenseLedger,
    pub mana_usage: CountryManaUsage,
    pub building_count: HashMap<String, i32>,
    pub ideas: Vec<(String, i32)>,
    pub num_cities: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FrontendMonarch {
    pub name: String,
    pub adm: u16,
    pub dip: u16,
    pub mil: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailedHeir {
    name: String,
    country: LocalizedTag,
    birth: String,
    personalities: Vec<LocalizedObj>,
    adm: u16,
    dip: u16,
    mil: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GreatAdvisor {
    occupation: LocalizedObj,
    trigger_date: Option<Eu4Date>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CountryReligion {
    #[serde(flatten)]
    religion: LocalizedObj,
    color: String,
    provinces: usize,
    provinces_percent: f64,
    development: f32,
    development_percent: f64,
}

impl SaveFileImpl {
    pub fn get_country(&self, tag: JsValue) -> JsValue {
        if let Some(country_tag) = tag.as_string().and_then(|x| x.parse::<CountryTag>().ok()) {
            let details = self
                .query
                .save()
                .game
                .countries
                .get(&country_tag)
                .and_then(|country| {
                    let ruler = if let Some(ruler_id) = &country.monarch {
                        country
                            .history
                            .events
                            .iter()
                            .flat_map(|(_, v)| v.0.iter())
                            .filter_map(|x| x.as_monarch())
                            .find(|x| x.id.id == ruler_id.id)
                            .map(|x| FrontendMonarch {
                                name: x.name.clone(),
                                adm: x.adm,
                                dip: x.dip,
                                mil: x.mil,
                            })
                            .unwrap_or_else(|| FrontendMonarch {
                                name: "Interregnum".to_string(),
                                adm: 0,
                                dip: 0,
                                mil: 0,
                            })
                    } else {
                        country
                            .history
                            .events
                            .iter()
                            .flat_map(|(_, v)| v.0.iter())
                            .filter_map(|x| match x {
                                CountryEvent::Monarch(mon) => Some(mon),
                                _ => None,
                            })
                            .last()
                            .map(|x| FrontendMonarch {
                                name: x.name.clone(),
                                adm: x.adm,
                                dip: x.dip,
                                mil: x.mil,
                            })
                            .unwrap_or_else(|| FrontendMonarch {
                                name: "Interregnum".to_string(),
                                adm: 0,
                                dip: 0,
                                mil: 0,
                            })
                    };

                    let religion = match country.religion.clone() {
                        Some(x) => x,
                        None => return None,
                    };

                    let primary_culture = match country.primary_culture.clone() {
                        Some(x) => x,
                        None => return None,
                    };

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

                    let details = CountryDetails {
                        tag: country_tag,
                        ruler,
                        base_tax: country.base_tax,
                        development: country.development,
                        prestige: country.prestige,
                        stability: country.stability,
                        treasury: country.treasury,
                        inflation: country.inflation,
                        corruption: country.corruption,
                        technology: country.technology.clone(),
                        num_cities: country.num_of_cities,
                        ideas,
                        primary_culture,
                        religion,
                        loans,
                        debt,
                        income: self.query.country_income_breakdown(country),
                        expenses: self.query.country_expense_breakdown(country),
                        total_expenses: self.query.country_total_expense_breakdown(country),
                        mana_usage: self.query.country_mana_breakdown(country),
                        building_count: buildings,
                    };

                    Some(details)
                });

            JsValue::from_serde(&details).unwrap()
        } else {
            panic!("Country tags should only be strings");
        }
    }

    pub fn get_country_rulers(&self, tag: &str) -> Vec<RunningMonarch> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.save().game.countries.get(&tag).unwrap();
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

        for (date, events) in &country.history.events {
            for event in events.0.iter() {
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
                                adm: x.adm,
                                dip: x.dip,
                                mil: x.mil,
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
                                adm: heir.adm,
                                dip: heir.dip,
                                mil: heir.mil,
                            });
                        }
                    }
                    _ => {}
                }
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

    pub fn get_country_great_advisors(&self, tag: &str) -> Vec<GreatAdvisor> {
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.save().game.countries.get(&tag).unwrap();

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
        great_advisors
    }

    pub fn get_country_province_religion(&self, tag: &str) -> Vec<CountryReligion> {
        let tag = tag.parse::<CountryTag>().unwrap();

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
        }

        let mut province_counts: HashMap<_, ProvinceCount> = HashMap::new();
        for (prov, religion) in owned_provinces {
            let entry = province_counts.entry(religion).or_default();
            entry.count += 1;
            entry.development += prov.base_manpower + prov.base_production + prov.base_tax;
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
                religion: LocalizedObj {
                    id: String::from(religion_id),
                    name,
                },
                color: hex_color(color),
                provinces: tally.count,
                provinces_percent: (tally.count as f64) / (total_provinces as f64) * 100.0,
                development: tally.development,
                development_percent: f64::from(tally.development) / total_development * 100.0,
            })
        }

        result.sort_unstable_by(|a, b| a.religion.name.cmp(&b.religion.name));
        result
    }
}
