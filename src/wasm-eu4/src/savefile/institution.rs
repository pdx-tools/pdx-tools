use super::{CountryInstitution, InstitutionCost, SaveFileImpl};
use eu4game::ProvinceExt;
use eu4save::{CountryTag, ProvinceId, models::Province};
use std::{collections::HashMap, ops};
use wasm_bindgen::JsValue;

// The minimum development required to be able to exploit a province
const MIN_EXPLOITABLE_DEV: i32 = 4;

const MIN_INSITUTION_POINTS: i32 = 601;

// province institution is out of 100 but points are out of 601
const INSTITUTION_SCALING: f64 = MIN_INSITUTION_POINTS as f64 / 100.0;

// Compute the province development that would cause an institution to spawn
// there, given the starting development and current progress.
fn end_dev(start_dev: i32, institution_progress: f64) -> i32 {
    let dev = start_dev as f64;

    // Add all numbers: x+1, x+2, ..., x+y until it surpasses 601.
    // Equation: (x+y)*(x+y+1)/2 - x*(x+1)/2 > 601
    // Replace x by start_dev and solve for y.
    // y = (sqrt(4 x^2 + 4 x + 4809) - 2 x - 1) / 2
    // https://www.wolframalpha.com/input?i=%28x%2By%29*%28x%2By%2B1%29%2F2+-+x%28x%2B1%29%2F2+%3E+601
    let progress_offset = 8.0 * INSTITUTION_SCALING * institution_progress;
    let radicand = 4.0 * dev * dev + 4.0 * dev - progress_offset + 4809.0;
    let y = (f64::sqrt(radicand) - 2.0 * dev - 1.0) * 0.5;
    (dev + f64::ceil(y)) as i32
}

// Compute the dev you should exploit at to minimize overflow in institution
// points, given the starting dev of the province and current progress.
fn exploit_at(start_dev: i32, institution_progress: f64) -> i32 {
    let progress_points = (INSTITUTION_SCALING * institution_progress).round() as i32;
    let final_dev = end_dev(start_dev, institution_progress);
    let institution_points = final_dev * (final_dev + 1) / 2 - start_dev * (start_dev + 1) / 2;
    let extra_points = institution_points + progress_points - MIN_INSITUTION_POINTS;
    start_dev
        .max(final_dev - extra_points)
        .max(MIN_EXPLOITABLE_DEV)
}

// Returns the base dev cost modifier (as a percent) given a current dev.
//  - [0-9] there is no increase per dev click
//  - [10-19]: each dev click increases dev cost by 3% (eg: f(11) -> 6%)
//  - [20-29]: each dev click increases dev cost by 6% (eg: f(21) -> 42%)
//  - etc with each 10 development increasing dev click cost by another 3%
fn base_dev_cost_modifier(dev: i32) -> Modifier {
    // Gaussian summation trick:
    let whole = (dev / 10) * 5 * ((dev - 10).max(0) / 10 * 3);

    // the remnants of the latest block
    let partial = ((dev % 10) + 1) * (dev / 10) * 3;
    Modifier::from_percent(whole + partial)
}

/// Returns the mana cost of increasing a province development by one given:
/// - The current development of the province
/// - The development cost modifier
/// - The development efficiency modifier
fn dev_cost(
    dev: i32,
    variables: ProvinceVariables,
    province: ProvinceModifiers,
    country: CountryModifiers,
) -> i32 {
    let dev_efficiency = province.dev_efficiency + country.dev_efficiency;
    let dev_base_cost = (50.0 * (1.0 - dev_efficiency.0)).floor().max(0.0);

    let base_cost_modifier = base_dev_cost_modifier(dev);
    let expand_infrastructure_modifier = country
        .expand_infrastructure_dev_cost_modifier
        .mul(variables.expand_infrastructure_times);
    let final_dev_cost_increase =
        base_cost_modifier + province.dev_cost_modifier + expand_infrastructure_modifier;
    let dev_cost_modifier = (1.0 + final_dev_cost_increase.0).max(0.1);

    (dev_base_cost * dev_cost_modifier).floor().min(999.0) as i32
}

#[derive(Debug, PartialEq, Clone, Copy, Eq, PartialOrd, Ord)]
struct ProvinceDevStrategy {
    mana_cost: i32,
    additional_expand_infrastructure: i32,
    exploit_at: Option<i32>,
    final_dev: i32,
}

fn institution_cost_engine(prov: InstitutionEngine) -> ProvinceDevStrategy {
    let exploited_at = match prov.exploitable {
        Exploit::At(x) => Some(x),
        _ => None,
    };

    let additional_expand_infrastructure =
        prov.current_expand_infrastructure - prov.original_expand_infrastructure;

    let strategy = ProvinceDevStrategy {
        mana_cost: prov.mana_cost,
        final_dev: prov.dev,
        additional_expand_infrastructure,
        exploit_at: exploited_at,
    };

    if prov.institution_progress >= 100.0 {
        return strategy;
    }

    let base = institution_cost_engine(prov.dev_click());
    let mut optimal = base;

    let expand_step = prov.dev % 15 == 0;
    let available_expands = (prov.dev / 15) - prov.current_expand_infrastructure;
    if expand_step && available_expands == 1 {
        optimal = optimal.min(institution_cost_engine(prov.expand_infrastructure()))
    }

    if matches!(prov.exploitable, Exploit::Available) {
        let right_after_expand = expand_step && available_expands == 0;
        let optimal_exploit = exploit_at(prov.dev, prov.institution_progress);
        if right_after_expand || prov.dev == optimal_exploit {
            optimal = optimal.min(institution_cost_engine(prov.exploit()))
        }
    }

    optimal
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Exploit {
    Available,
    Unavailable,
    At(i32),
}

#[derive(Debug, Clone)]
struct InstitutionEngine {
    // Mana cost spent developing the institution.
    mana_cost: i32,

    // Current development of the province.
    dev: i32,
    institution_progress: f64,
    current_expand_infrastructure: i32,
    exploitable: Exploit,

    original_expand_infrastructure: i32,
    prov_modifiers: ProvinceModifiers,
    country_modifiers: CountryModifiers,
}

impl InstitutionEngine {
    fn dev_click(&self) -> Self {
        let variables = ProvinceVariables {
            expand_infrastructure_times: self.current_expand_infrastructure,
        };

        let dev_cost = dev_cost(
            self.dev,
            variables,
            self.prov_modifiers,
            self.country_modifiers,
        );
        let new_dev = self.dev + 1;
        let new_institution_progress =
            self.institution_progress + (new_dev as f64) / INSTITUTION_SCALING;

        Self {
            mana_cost: self.mana_cost + dev_cost,
            dev: new_dev,
            institution_progress: new_institution_progress,
            ..*self
        }
    }

    fn exploit(&self) -> Self {
        Self {
            dev: self.dev - 1,
            exploitable: Exploit::At(self.dev),
            ..*self
        }
    }

    fn expand_infrastructure(&self) -> Self {
        Self {
            mana_cost: self.mana_cost + self.country_modifiers.expand_infrastructure_cost,
            current_expand_infrastructure: self.current_expand_infrastructure + 1,
            ..*self
        }
    }
}

fn institution_cost(
    stats: ProvinceStats,
    province: ProvinceModifiers,
    country: CountryModifiers,
) -> ProvinceDevStrategy {
    let exploitable = if stats.exploitable {
        Exploit::Available
    } else {
        Exploit::Unavailable
    };

    let engine = InstitutionEngine {
        mana_cost: 0,
        dev: stats.dev,
        original_expand_infrastructure: stats.current_expand_infrastructure,
        current_expand_infrastructure: stats.current_expand_infrastructure,
        exploitable,
        institution_progress: f64::from(stats.institution_progress),
        prov_modifiers: province,
        country_modifiers: country,
    };

    let mut optimal = institution_cost_engine(engine.clone());

    let total_expands = (stats.dev / 15).max(stats.current_expand_infrastructure);
    let mut expand_infras_engine = engine.clone();
    for _ in (stats.current_expand_infrastructure + 1)..=total_expands {
        expand_infras_engine = expand_infras_engine.expand_infrastructure();
        optimal = optimal.min(institution_cost_engine(expand_infras_engine.clone()));
    }

    optimal
}

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default)]
struct Modifier(f64);

impl ops::Add for Modifier {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0 + rhs.0)
    }
}

impl Modifier {
    #[must_use]
    pub fn from_percent(percent: i32) -> Self {
        Self(percent as f64 / 100.0)
    }

    #[must_use]
    pub fn mul(self, times: i32) -> Self {
        Self(times as f64 * self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default)]
struct DevEfficiency(f64);

impl ops::Add for DevEfficiency {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0 + rhs.0)
    }
}

#[derive(Debug, Clone, Copy)]
struct CountryModifiers {
    // Mana cost of clicking the expand infrastructure button.
    expand_infrastructure_cost: i32,

    expand_infrastructure_dev_cost_modifier: Modifier,

    // Country-wide dev efficiency for all owned provinces (eg: admin tech 17)
    dev_efficiency: DevEfficiency,
}

impl Default for CountryModifiers {
    fn default() -> Self {
        Self {
            expand_infrastructure_cost: 50,
            expand_infrastructure_dev_cost_modifier: Modifier::from_percent(-15),
            dev_efficiency: Default::default(),
        }
    }
}

#[derive(Debug, Default, Clone, Copy)]
struct ProvinceVariables {
    // Number of times province infrastructure has been expanded
    expand_infrastructure_times: i32,
}

#[derive(Debug, Default, Clone, Copy)]
struct ProvinceModifiers {
    // Province specific dev efficiency (eg: monument dev efficiency for state)
    dev_efficiency: DevEfficiency,

    // Province specific dev cost modifier
    dev_cost_modifier: Modifier,
}

#[derive(Debug, Default, Clone, Copy)]
struct ProvinceStats {
    dev: i32,
    institution_progress: f32,
    current_expand_infrastructure: i32,
    exploitable: bool,
}

#[derive(Debug)]
struct ProvinceInstitution<'a> {
    results: ProvinceDevStrategy,
    province: &'a Province,
    current_institution_progress: f32,
    province_id: ProvinceId,
    dev: i32,
    dev_cost_modifier: Modifier,
    dev_cost_modifier_heuristic: Modifier,
}

impl SaveFileImpl {
    pub fn institution_provinces(
        &self,
        tag: &str,
        country_wide_dev_cost_modifier: f64,
        expand_infrastructure_cost: i32,
        overrides: JsValue,
    ) -> CountryInstitution {
        let overrides: HashMap<ProvinceId, f64> =
            serde_wasm_bindgen::from_value(overrides).unwrap();
        let tag = tag.parse::<CountryTag>().unwrap();
        let country = self.query.country(&tag).unwrap();
        let state_lookup = self.game.province_area_lookup();

        let institutions = &self.query.save().game.institutions;
        let institutions_spawned = institutions
            .iter()
            .position(|&x| x == 0)
            .unwrap_or(institutions.len() - 1);
        let institutions_embraced = country
            .institutions
            .iter()
            .position(|&x| x == 0)
            .unwrap_or(country.institutions.len() - 1);

        let max_institution_index = (institutions_spawned - 1).max(0);

        let dev_efficiency = match country.technology.adm_tech {
            ..=16 => 0.0,
            17..=22 => 0.1,
            23..=26 => 0.2,
            27.. => 0.3,
        };

        let country_modifers = CountryModifiers {
            dev_efficiency: DevEfficiency(dev_efficiency),
            expand_infrastructure_cost,
            expand_infrastructure_dev_cost_modifier: Modifier(-0.15),
        };

        let provinces = self
            .query
            .save()
            .game
            .provinces
            .iter()
            .filter(|(_, prov)| prov.owner.is_some_and(|owner| owner == tag));

        let mut costs = Vec::new();

        for (id, save) in provinces {
            let Some(game) = self.game.get_province(id) else {
                continue;
            };

            let current_institution_progress = save
                .institutions
                .get(max_institution_index)
                .copied()
                .unwrap_or_default();

            if current_institution_progress >= 100.0 {
                continue;
            }

            let terrain_local_dev = self
                .game
                .terrain_info(game.terrain)
                .map(|x| x.local_development_cost)
                .unwrap_or_default();

            let cot_dev = match save.center_of_trade {
                2 => -0.05,
                3.. => -0.10,
                _ => 0.0,
            };

            let trade_goods_modifier = save
                .trade_goods
                .as_ref()
                .filter(|x| matches!(x.as_str(), "cotton" | "cloth"))
                .map(|_| -0.1)
                .unwrap_or_default();

            // let climate_dev =

            let capital_modifier = if country.capital == *id {
                -(((country.raw_development / 100.0) * 0.05).min(0.5)) as f64
            } else {
                0.0
            };

            let prosperity_modifier = state_lookup
                .get(id)
                .and_then(|state| self.query.save().game.map_area_data.get(*state))
                .and_then(|x| x.state.as_ref())
                .and_then(|x| x.country_states.iter().find(|c| c.country == tag))
                .filter(|x| x.prosperity >= 100.0)
                .map(|_| -0.1)
                .unwrap_or_default();

            let dev_cost_modifier = f64::from(terrain_local_dev)
                + cot_dev
                + capital_modifier
                + prosperity_modifier
                + trade_goods_modifier
                + country_wide_dev_cost_modifier;

            // Avoid situations where "-0.15000000000000002" (which does
            // influence results), we convert to percent and keep 2 decimals.
            let dev_cost_modifier_heuristic = f64::trunc(dev_cost_modifier * 10000.0) / 10000.0;

            let dev_cost_modifier = overrides
                .get(id)
                .copied()
                .map(|x| f64::trunc(x * 10000.0) / 10000.0)
                .unwrap_or(dev_cost_modifier_heuristic);

            let province_modifiers = ProvinceModifiers {
                dev_efficiency: DevEfficiency(0.0),
                dev_cost_modifier: Modifier(dev_cost_modifier),
            };

            let dev = (save.base_tax + save.base_production + save.base_manpower).floor() as i32;
            let stats = ProvinceStats {
                dev,
                institution_progress: current_institution_progress,
                current_expand_infrastructure: save.expand_infrastructure,
                exploitable: !save.recently_exploited(self.query.save().meta.date),
            };
            let cost = institution_cost(stats, province_modifiers, country_modifers);

            costs.push(ProvinceInstitution {
                results: cost,
                dev_cost_modifier: province_modifiers.dev_cost_modifier,
                dev_cost_modifier_heuristic: Modifier(dev_cost_modifier_heuristic),
                current_institution_progress,
                province: save,
                province_id: *id,
                dev,
            })
        }

        costs.sort_by(|a, b| a.results.cmp(&b.results));

        let dev_push = costs
            .into_iter()
            .map(|x| InstitutionCost {
                province_id: x.province_id,
                name: x.province.name.clone(),
                mana_cost: x.results.mana_cost,
                current_expand_infrastructure: x.province.expand_infrastructure,
                additional_expand_infrastructure: x.results.additional_expand_infrastructure,
                exploit_at: x.results.exploit_at,
                current_dev: x.dev,
                final_dev: x.results.final_dev,
                current_institution_progress: x.current_institution_progress,
                dev_cost_modifier: x.dev_cost_modifier.0,
                dev_cost_modifier_heuristic: x.dev_cost_modifier_heuristic.0,
            })
            .collect();

        CountryInstitution {
            institutions_available: institutions_spawned as i32,
            institutions_embraced: institutions_embraced as i32,
            dev_push,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests generated from: https://docs.google.com/spreadsheets/d/1I45UTLi1twV-std0vq57J_LCJETWLSNEAqJmjhGE-8c/edit#gid=2146778308
    #[test]
    fn test_exploit_at() {
        assert_eq!(exploit_at(3, 0.0), 12);
        assert_eq!(exploit_at(4, 0.0), 16);
        assert_eq!(exploit_at(5, 0.0), 21);
        assert_eq!(exploit_at(6, 0.0), 27);
        assert_eq!(exploit_at(7, 0.0), 34);
        assert_eq!(exploit_at(8, 0.0), 8);
        assert_eq!(exploit_at(9, 0.0), 16);
        assert_eq!(exploit_at(10, 0.0), 26);
        assert_eq!(exploit_at(11, 0.0), 11);
        assert_eq!(exploit_at(12, 0.0), 13);
        assert_eq!(exploit_at(13, 0.0), 26);
        assert_eq!(exploit_at(14, 0.0), 14);
        assert_eq!(exploit_at(15, 0.0), 18);
        assert_eq!(exploit_at(16, 0.0), 34);
        assert_eq!(exploit_at(17, 0.0), 17);
        assert_eq!(exploit_at(18, 0.0), 31);
        assert_eq!(exploit_at(19, 0.0), 19);
        assert_eq!(exploit_at(20, 0.0), 31);
        assert_eq!(exploit_at(21, 0.0), 21);
        assert_eq!(exploit_at(22, 0.0), 34);
        assert_eq!(exploit_at(23, 0.0), 23);
        assert_eq!(exploit_at(24, 0.0), 40);
        assert_eq!(exploit_at(25, 0.0), 25);
        assert_eq!(exploit_at(26, 0.0), 26);
        assert_eq!(exploit_at(27, 0.0), 33);
        assert_eq!(exploit_at(28, 0.0), 28);
        assert_eq!(exploit_at(29, 0.0), 29);
        assert_eq!(exploit_at(30, 0.0), 31);
    }

    #[test]
    fn test_exploit_at_partial_4() {
        assert_eq!(exploit_at(4, 0.000000), 16);
        assert_eq!(exploit_at(4, 4.991681), 20);
        assert_eq!(exploit_at(4, 9.983361), 23);
        assert_eq!(exploit_at(4, 14.975042), 25);
        assert_eq!(exploit_at(4, 19.966722), 26);
        assert_eq!(exploit_at(4, 24.958403), 26);
        assert_eq!(exploit_at(4, 29.950083), 25);
        assert_eq!(exploit_at(4, 34.941764), 23);
        assert_eq!(exploit_at(4, 39.933444), 20);
        assert_eq!(exploit_at(4, 44.925125), 16);
        assert_eq!(exploit_at(4, 49.916805), 11);
        assert_eq!(exploit_at(4, 54.908486), 5);
        assert_eq!(exploit_at(4, 59.900166), 20);
        assert_eq!(exploit_at(4, 64.891847), 11);
        assert_eq!(exploit_at(4, 69.883527), 4);
        assert_eq!(exploit_at(4, 74.875208), 8);
        assert_eq!(exploit_at(4, 79.866889), 11);
        assert_eq!(exploit_at(4, 84.858569), 10);
        assert_eq!(exploit_at(4, 89.850250), 5);
        assert_eq!(exploit_at(4, 94.841930), 5);
        assert_eq!(exploit_at(4, 99.833611), 4);

        assert_eq!(end_dev(4, 100.0 * 596.0 / MIN_INSITUTION_POINTS as f64), 5);
        assert_eq!(
            exploit_at(4, 100.0 * 596.0 / MIN_INSITUTION_POINTS as f64),
            5
        );
    }

    #[test]
    fn test_base_dev_cost_modifier() {
        assert_eq!(base_dev_cost_modifier(3), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(4), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(5), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(6), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(7), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(8), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(9), Modifier::from_percent(0));
        assert_eq!(base_dev_cost_modifier(10), Modifier::from_percent(3));
        assert_eq!(base_dev_cost_modifier(11), Modifier::from_percent(6));
        assert_eq!(base_dev_cost_modifier(12), Modifier::from_percent(9));
        assert_eq!(base_dev_cost_modifier(13), Modifier::from_percent(12));
        assert_eq!(base_dev_cost_modifier(14), Modifier::from_percent(15));
        assert_eq!(base_dev_cost_modifier(15), Modifier::from_percent(18));
        assert_eq!(base_dev_cost_modifier(16), Modifier::from_percent(21));
        assert_eq!(base_dev_cost_modifier(17), Modifier::from_percent(24));
        assert_eq!(base_dev_cost_modifier(18), Modifier::from_percent(27));
        assert_eq!(base_dev_cost_modifier(19), Modifier::from_percent(30));
        assert_eq!(base_dev_cost_modifier(20), Modifier::from_percent(36));
        assert_eq!(base_dev_cost_modifier(21), Modifier::from_percent(42));
        assert_eq!(base_dev_cost_modifier(22), Modifier::from_percent(48));
        assert_eq!(base_dev_cost_modifier(23), Modifier::from_percent(54));
        assert_eq!(base_dev_cost_modifier(24), Modifier::from_percent(60));
        assert_eq!(base_dev_cost_modifier(25), Modifier::from_percent(66));
        assert_eq!(base_dev_cost_modifier(26), Modifier::from_percent(72));
        assert_eq!(base_dev_cost_modifier(27), Modifier::from_percent(78));
        assert_eq!(base_dev_cost_modifier(28), Modifier::from_percent(84));
        assert_eq!(base_dev_cost_modifier(29), Modifier::from_percent(90));
        assert_eq!(base_dev_cost_modifier(30), Modifier::from_percent(99));
        assert_eq!(base_dev_cost_modifier(31), Modifier::from_percent(108));
        assert_eq!(base_dev_cost_modifier(32), Modifier::from_percent(117));
        assert_eq!(base_dev_cost_modifier(33), Modifier::from_percent(126));
        assert_eq!(base_dev_cost_modifier(34), Modifier::from_percent(135));
        assert_eq!(base_dev_cost_modifier(35), Modifier::from_percent(144));
        assert_eq!(base_dev_cost_modifier(36), Modifier::from_percent(153));
        assert_eq!(base_dev_cost_modifier(37), Modifier::from_percent(162));
        assert_eq!(base_dev_cost_modifier(38), Modifier::from_percent(171));
        assert_eq!(base_dev_cost_modifier(39), Modifier::from_percent(180));
        assert_eq!(base_dev_cost_modifier(40), Modifier::from_percent(192));
    }

    #[test]
    fn test_dev_cost_base() {
        fn dev(dev: i32) -> i32 {
            let variables = ProvinceVariables {
                expand_infrastructure_times: dev / 15,
            };
            let prov_mods = ProvinceModifiers::default();
            let country_mods = CountryModifiers {
                expand_infrastructure_dev_cost_modifier: Modifier(-0.25),
                ..CountryModifiers::default()
            };
            dev_cost(dev, variables, prov_mods, country_mods)
        }

        assert_eq!(dev(3), 50);
        assert_eq!(dev(4), 50);
        assert_eq!(dev(5), 50);
        assert_eq!(dev(6), 50);
        assert_eq!(dev(7), 50);
        assert_eq!(dev(8), 50);
        assert_eq!(dev(9), 50);
        assert_eq!(dev(10), 51);
        assert_eq!(dev(11), 53);
        assert_eq!(dev(12), 54);
        assert_eq!(dev(13), 56);
        assert_eq!(dev(14), 57);
        assert_eq!(dev(15), 46);
        assert_eq!(dev(16), 48);
        assert_eq!(dev(17), 49);
        assert_eq!(dev(18), 51);
        assert_eq!(dev(19), 52);
        assert_eq!(dev(20), 55);
        assert_eq!(dev(21), 58);
        assert_eq!(dev(22), 61);
        assert_eq!(dev(23), 64);
        assert_eq!(dev(24), 67);
        assert_eq!(dev(25), 70);
        assert_eq!(dev(26), 73);
        assert_eq!(dev(27), 76);
        assert_eq!(dev(28), 79);
        assert_eq!(dev(29), 82);
        assert_eq!(dev(30), 74);
    }

    #[test]
    fn test_dev_cost_modifier() {
        fn dev(dev: i32) -> i32 {
            let variables = ProvinceVariables {
                expand_infrastructure_times: dev / 15,
            };
            let prov_mods = ProvinceModifiers {
                dev_cost_modifier: Modifier(-0.1),
                ..ProvinceModifiers::default()
            };
            let country_mods = CountryModifiers {
                expand_infrastructure_dev_cost_modifier: Modifier(-0.25),
                ..CountryModifiers::default()
            };
            dev_cost(dev, variables, prov_mods, country_mods)
        }

        assert_eq!(dev(3), 45);
        assert_eq!(dev(4), 45);
        assert_eq!(dev(5), 45);
        assert_eq!(dev(6), 45);
        assert_eq!(dev(7), 45);
        assert_eq!(dev(8), 45);
        assert_eq!(dev(9), 45);
        assert_eq!(dev(10), 46);
        assert_eq!(dev(11), 48);
        assert_eq!(dev(12), 49);
        assert_eq!(dev(13), 51);
        assert_eq!(dev(14), 52);
        assert_eq!(dev(15), 41);
        assert_eq!(dev(16), 43);
        assert_eq!(dev(17), 44);
        assert_eq!(dev(18), 46);
        assert_eq!(dev(19), 47);
        assert_eq!(dev(20), 50);
        assert_eq!(dev(21), 53);
        assert_eq!(dev(22), 56);
        assert_eq!(dev(23), 59);
        assert_eq!(dev(24), 62);
        assert_eq!(dev(25), 65);
        assert_eq!(dev(26), 68);
        assert_eq!(dev(27), 71);
        assert_eq!(dev(28), 74);
        assert_eq!(dev(29), 77);
        assert_eq!(dev(30), 69);
    }

    #[test]
    fn test_dev_cost_efficiency() {
        fn dev(dev: i32) -> i32 {
            let variables = ProvinceVariables {
                expand_infrastructure_times: dev / 15,
            };
            let prov_mods = ProvinceModifiers::default();
            let country_mods = CountryModifiers {
                expand_infrastructure_dev_cost_modifier: Modifier(-0.25),
                dev_efficiency: DevEfficiency(0.1),
                ..CountryModifiers::default()
            };
            dev_cost(dev, variables, prov_mods, country_mods)
        }

        assert_eq!(dev(3), 45);
        assert_eq!(dev(4), 45);
        assert_eq!(dev(5), 45);
        assert_eq!(dev(6), 45);
        assert_eq!(dev(7), 45);
        assert_eq!(dev(8), 45);
        assert_eq!(dev(9), 45);
        assert_eq!(dev(10), 46);
        assert_eq!(dev(11), 47);
        assert_eq!(dev(12), 49);
        assert_eq!(dev(13), 50);
        assert_eq!(dev(14), 51);
        assert_eq!(dev(15), 41);
        assert_eq!(dev(16), 43);
        assert_eq!(dev(17), 44);
        assert_eq!(dev(18), 45);
        assert_eq!(dev(19), 47);
        assert_eq!(dev(20), 49);
        assert_eq!(dev(21), 52);
        assert_eq!(dev(22), 55);
        assert_eq!(dev(23), 58);
        assert_eq!(dev(24), 60);
        assert_eq!(dev(25), 63);
        assert_eq!(dev(26), 66);
        assert_eq!(dev(27), 68);
        assert_eq!(dev(28), 71);
        assert_eq!(dev(29), 74);
        assert_eq!(dev(30), 67);
    }

    #[test]
    fn test_dev_cost_both() {
        fn dev(dev: i32) -> i32 {
            let variables = ProvinceVariables {
                expand_infrastructure_times: dev / 15,
            };
            let prov_mods = ProvinceModifiers {
                dev_cost_modifier: Modifier(-0.1),
                ..ProvinceModifiers::default()
            };
            let country_mods = CountryModifiers {
                expand_infrastructure_dev_cost_modifier: Modifier(-0.25),
                dev_efficiency: DevEfficiency(0.1),
                ..CountryModifiers::default()
            };
            dev_cost(dev, variables, prov_mods, country_mods)
        }

        assert_eq!(dev(3), 40);
        assert_eq!(dev(4), 40);
        assert_eq!(dev(5), 40);
        assert_eq!(dev(6), 40);
        assert_eq!(dev(7), 40);
        assert_eq!(dev(8), 40);
        assert_eq!(dev(9), 40);
        assert_eq!(dev(10), 41);
        assert_eq!(dev(11), 43);
        assert_eq!(dev(12), 44);
        assert_eq!(dev(13), 45);
        assert_eq!(dev(14), 47);
        assert_eq!(dev(15), 37);
        assert_eq!(dev(16), 38);
        assert_eq!(dev(17), 40);
        assert_eq!(dev(18), 41);
        assert_eq!(dev(19), 42);
        assert_eq!(dev(20), 45);
        assert_eq!(dev(21), 48);
        assert_eq!(dev(22), 50);
        assert_eq!(dev(23), 53);
        assert_eq!(dev(24), 56);
        assert_eq!(dev(25), 58);
        assert_eq!(dev(26), 61);
        assert_eq!(dev(27), 64);
        assert_eq!(dev(28), 67);
        assert_eq!(dev(29), 69);
        assert_eq!(dev(30), 62);
    }

    #[test]
    fn test_institution_cost() {
        fn institution(dev: i32) -> ProvinceDevStrategy {
            let prov_mods = ProvinceModifiers {
                dev_cost_modifier: Modifier(-0.27),
                ..ProvinceModifiers::default()
            };
            let country_mods = CountryModifiers::default();

            let stats = ProvinceStats {
                dev,
                institution_progress: 0.0,
                current_expand_infrastructure: 0,
                exploitable: true,
            };
            institution_cost(stats, prov_mods, country_mods)
        }

        assert_eq!(
            institution(3),
            ProvinceDevStrategy {
                mana_cost: 1690,
                additional_expand_infrastructure: 1,
                final_dev: 34,
                exploit_at: Some(15),
            }
        );

        assert_eq!(
            institution(4),
            ProvinceDevStrategy {
                mana_cost: 1656,
                additional_expand_infrastructure: 1,
                final_dev: 34,
                exploit_at: Some(16),
            }
        );

        assert_eq!(
            institution(16),
            ProvinceDevStrategy {
                mana_cost: 1544,
                additional_expand_infrastructure: 2,
                final_dev: 37,
                exploit_at: Some(34),
            }
        );
    }

    /// Verify we do not recommend exploiting development at 3
    #[test]
    fn test_institution_cost_dev_3() {
        let prov_mods = ProvinceModifiers::default();
        let country_mods = CountryModifiers {
            dev_efficiency: DevEfficiency(0.1),
            ..CountryModifiers::default()
        };

        let stats = ProvinceStats {
            dev: 3,
            institution_progress: 91.35,
            current_expand_infrastructure: 0,
            exploitable: true,
        };

        let cost = institution_cost(stats, prov_mods, country_mods);
        assert_eq!(
            cost,
            ProvinceDevStrategy {
                mana_cost: 360,
                additional_expand_infrastructure: 0,
                final_dev: 10,
                exploit_at: Some(4),
            }
        );
    }
}
