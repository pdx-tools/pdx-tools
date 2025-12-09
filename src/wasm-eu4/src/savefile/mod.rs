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
        Country, CountryEvent, CountryTechnology, Province, ProvinceEvent, ProvinceEventValue,
        WarEvent, WarHistory,
    },
    query::{LedgerPoint, NationEventKind, NationEvents, Query},
    CountryTag, Encoding, Eu4Date, PdsDate, ProvinceId, TagResolver,
};
use std::collections::{HashMap, HashSet};

mod country_details;
mod institution;
mod map;
mod models;
mod tag_filter;

pub use map::*;
pub use models::*;
pub use tag_filter::*;

// Struct created to help compiler debugging as the wasm_bindgen macro can cause opaque errors.
#[derive(Debug)]
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
        frequency: FileObservationFrequency,
        save_data: Vec<u8>,
    ) -> Result<Reparse, Eu4GameError> {
        let tokens = tokens::get_tokens();

        let meta = eu4game::shared::parse_meta(&save_data, tokens)?;

        let prev_date = self.query.save().meta.date;

        let too_soon = Ok(Reparse::TooSoon { date: meta.date });
        use FileObservationFrequency as FOF;
        match frequency {
            FOF::Daily if meta.date == prev_date => return too_soon,
            FOF::Monthly
                if meta.date.year() == prev_date.year()
                    && meta.date.month() == prev_date.month() =>
            {
                return too_soon
            }
            FOF::Yearly if meta.date.year() == prev_date.year() => return too_soon,
            _ => {}
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
            let ai = if self.player_histories.len() == 1 {
                AiTagsState::Great
            } else {
                AiTagsState::None
            };

            let ntags: HashSet<CountryTag> =
                self.matching_tags(&TagFilterPayload { ai, ..payload });

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
        } else if payload.ai == AiTagsState::Alive && self.player_histories.len() == 1 {
            // If there are fewer AI alive than the limit, we should consider
            // past greats to the AI that is alive
            self.matching_tags(&TagFilterPayload {
                ai: AiTagsState::Great,
                ..payload
            })
        } else {
            tags
        }
    }

    fn localize_ledger_points(&self, iter: impl Iterator<Item = LedgerPoint>) -> LocalizedLedger {
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
            let x = window.first().unwrap();
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
            .map(|tag| (tag, self.localize_tag(*tag)))
            .collect();

        result.sort_unstable_by(|a, b| {
            a.year.cmp(&b.year).then_with(|| {
                tag_names
                    .get(&a.tag)
                    .map(|x| &x.name)
                    .cmp(&tag_names.get(&b.tag).map(|x| &x.name))
            })
        });

        let localization = tag_names.into_values().collect();

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

    fn dev_efficiencies<'a>(
        &self,
        countries: impl Iterator<Item = (CountryTag, &'a Country)>,
    ) -> Vec<CountryDevEffiency> {
        struct CountryManaDetails<'a> {
            tag: CountryTag,
            country: &'a Country,
            dev_breakdown: Vec<(CountryTag, usize)>,
            provinces_improved: usize,
        }

        let mut country_details = countries
            .map(|(tag, country)| {
                let dev_breakdown = country
                    .history
                    .events
                    .iter()
                    .filter_map(|(_, event)| match event {
                        CountryEvent::ChangedTagFrom(tag) => Some(*tag),
                        _ => None,
                    })
                    .chain(std::iter::once(tag))
                    .map(|tag| (tag, 0))
                    .collect::<Vec<_>>();
                CountryManaDetails {
                    tag,
                    country,
                    dev_breakdown,
                    provinces_improved: 0,
                }
            })
            .map(|x| (x.tag, x))
            .collect::<HashMap<_, _>>();

        // province dev tag to a list of filtered tags that were that tag. For
        // example, AI polish may be annexed by the player who tag switched into
        // poland (and then tag switched again), so we'll credit both the AI and
        // the player with any polish improvements. Yeah it's a flaw to this
        // method but we make due with the data that EU4 gives us.
        let mut devs: HashMap<CountryTag, Vec<CountryTag>> = HashMap::new();
        for country in country_details.values() {
            for (tag, _) in &country.dev_breakdown {
                devs.entry(*tag).or_default().push(country.tag)
            }
        }

        // countries latest tag has improved a given province
        let mut seen: Vec<CountryTag> = Vec::new();

        for prov in self.query.save().game.provinces.values() {
            seen.clear();

            for (tag, amt) in &prov.country_improve_count {
                if *amt < 0 {
                    continue;
                }

                // The tag that is recorded in the country improvement count could now be stored in multiple
                let Some(devs) = devs.get(tag) else {
                    continue;
                };

                for dev_tag in devs {
                    let Some(details) = country_details.get_mut(dev_tag) else {
                        continue;
                    };

                    let Some((_, improvements)) = details
                        .dev_breakdown
                        .iter_mut()
                        .find(|(tag, _)| tag == dev_tag)
                    else {
                        continue;
                    };

                    *improvements += *amt as usize;
                    if !seen.contains(dev_tag) {
                        seen.push(*dev_tag);
                    }
                }
            }

            for tag in &seen {
                let details = country_details.get_mut(tag).expect("country to exist");
                details.provinces_improved += 1;
            }
        }

        let mut result = country_details
            .drain()
            .map(|(_, mut country)| {
                let mana = self.query.country_mana_breakdown(country.country);
                CountryDevEffiency {
                    country: self.localize_tag(country.tag),
                    dev_mana: mana.adm.develop_prov + mana.dip.develop_prov + mana.mil.develop_prov,
                    mana,
                    dev_clicks: country.dev_breakdown.iter().map(|(_, amt)| amt).sum(),
                    dev_breakdown: country
                        .dev_breakdown
                        .drain(..)
                        .map(|(tag, amt)| CountryDevMana {
                            country: self.localize_tag(tag),
                            sum: amt,
                        })
                        .collect(),
                    provinces_improved: country.provinces_improved,
                }
            })
            .collect::<Vec<_>>();

        result.sort_unstable_by(|a, b| {
            a.dev_clicks
                .cmp(&b.dev_clicks)
                .reverse()
                .then_with(|| a.country.name.cmp(&b.country.name))
        });

        result
    }

    pub fn get_dev_efficiency(&self, payload: TagFilterPayloadRaw) -> Vec<CountryDevEffiency> {
        let filter = TagFilterPayload::from(payload);
        let tags = self.matching_tags(&filter);
        let countries = self
            .query
            .save()
            .game
            .countries
            .iter()
            .filter(|(tag, _)| tags.contains(tag))
            .map(|(tag, country)| (*tag, country));

        self.dev_efficiencies(countries)
    }

    pub fn get_province_development_density(
        &self,
        payload: TagFilterPayloadRaw,
    ) -> ProvinceDevDensity {
        let filter = TagFilterPayload::from(payload);
        let matching_tags = self.matching_tags(&filter);

        let mut values = Vec::new();
        let mut min_dev = f32::MAX;
        let mut max_dev = 0.0_f32;

        for province in self.query.save().game.provinces.values() {
            let Some(owner_tag) = province.owner else {
                continue;
            };

            if !matching_tags.contains(&owner_tag) {
                continue;
            }

            let development = province.base_tax + province.base_production + province.base_manpower;

            values.push(development);
            min_dev = min_dev.min(development);
            max_dev = max_dev.max(development);
        }

        let total_provinces = values.len();
        if total_provinces == 0 {
            return ProvinceDevDensity {
                bandwidth: 0.0,
                min: 0.0,
                max: 0.0,
                total_provinces: 0,
                points: Vec::new(),
            };
        }

        let n = total_provinces as f32;
        let mean = values.iter().sum::<f32>() / n;
        let variance = values
            .iter()
            .map(|x| {
                let diff = x - mean;
                diff * diff
            })
            .sum::<f32>()
            / n;
        let std_dev = variance.sqrt();

        // Silverman's rule of thumb for Gaussian KDE
        let mut bandwidth = if std_dev == 0.0 {
            1.0
        } else {
            1.06 * std_dev * n.powf(-0.2)
        };
        bandwidth = bandwidth.max(0.5);

        let padding = bandwidth * 3.0;
        let start = (min_dev - padding).max(0.0);
        let end = max_dev + padding;
        const STEPS: usize = 80;
        let step = if STEPS > 1 {
            (end - start) / (STEPS as f32 - 1.0)
        } else {
            0.0
        };

        let norm_const = 1.0 / ((2.0 * std::f32::consts::PI).sqrt() * bandwidth * n);

        let mut points = Vec::with_capacity(STEPS);
        for i in 0..STEPS {
            let x = start + step * i as f32;
            let density_sum = values
                .iter()
                .map(|v| {
                    let z = (x - v) / bandwidth;
                    (-0.5 * z * z).exp()
                })
                .sum::<f32>();
            let y = norm_const * density_sum;
            points.push(ProvinceDevDensityPoint { x, y });
        }

        ProvinceDevDensity {
            bandwidth,
            min: min_dev,
            max: max_dev,
            total_provinces,
            points,
        }
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

    pub fn get_countries(&self) -> Vec<CountryInfo> {
        let mut results: Vec<_> = self
            .query
            .countries()
            .filter(|x| x.tag.is_some())
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
                    let prov = self.query.save().game.provinces.get(&id)?;
                    let owner = prov.owner.as_ref()?;

                    if !filter.contains(owner) {
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
            .map(|d| (d[1].as_str(), d[0].as_str()))
            .collect()
    }

    pub fn get_player_histories(&self) -> Vec<PlayerHistory> {
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);
        let mut data = self
            .query
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
            .collect::<Vec<_>>();

        data.sort_unstable_by(|a, b| {
            fn history_state(a: &PlayerHistory) -> i32 {
                if a.annexed.is_some() {
                    2
                } else if !a.is_human {
                    1
                } else {
                    0
                }
            }

            history_state(a)
                .cmp(&history_state(b))
                .then_with(|| a.name.cmp(&b.name))
        });

        data
    }

    pub fn get_lucky_countries(&self) -> Vec<LocalizedTag> {
        let mut v: Vec<_> = self
            .query
            .save()
            .game
            .countries
            .iter()
            .filter(|(_, country)| country.luck)
            .map(|(tag, _)| self.localize_tag(*tag))
            .collect();
        v.sort_unstable_by(|a, b| a.name.cmp(&b.name));
        v
    }

    pub fn get_great_powers(&self) -> Vec<GreatPower> {
        let mut great_powers = self
            .query
            .countries()
            .filter(|x| x.country.num_of_cities > 0)
            .map(|x| GreatPower {
                country: self.localize_tag(x.tag),
                score: x.country.great_power_score,
            })
            .collect::<Vec<_>>();

        great_powers.sort_by(|a, b| a.score.total_cmp(&b.score).reverse());
        great_powers
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
        if let Ok(tag) = tag.parse::<CountryTag>() {
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

    pub fn save_info(&self) -> SaveInfo {
        SaveInfo {
            mode: self.save_mode(),
            encoding: self.encoding,
            gameplay_options: self.query.save().game.gameplay_settings.options.clone(),
            dlc: self.query.save().meta.dlc_enabled.clone(),
            playthough_id: playthrough_id(&self.query),
            random_world: self.query.save().game.random_world,
            colonial_subjects: self.colonial_subjects(),
        }
    }

    fn colonial_subjects(&self) -> HashMap<CountryTag, (CountryTag, [u8; 3])> {
        self.query
            .save()
            .game
            .countries
            .iter()
            .filter_map(|(tag, country)| {
                let parent = country.colonial_parent?;
                Some((*tag, (parent, country.colors.country_color)))
            })
            .collect()
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

    pub fn get_provinces(&self) -> Vec<ProvinceItem> {
        self.query
            .save()
            .game
            .provinces
            .iter()
            .filter_map(|(id, prov)| prov.owner.as_ref().map(|owner| (id, prov, owner)))
            .map(|(id, prov, owner)| ProvinceItem {
                id: *id,
                name: prov.name.clone(),
                owner: self.localize_tag(*owner),
                tax: prov.base_tax,
                production: prov.base_production,
                manpower: prov.base_manpower,
                development: prov.base_tax + prov.base_production + prov.base_manpower,
                expand_infrastructure: prov.expand_infrastructure,
                num_centralized_state: prov.num_centralize_state,
                religion: prov.religion.clone(),
                culture: prov.culture.clone(),
                devastation: prov.devastation,
                exploit_date: prov.exploit_date,
                in_hre: prov.hre,
                trade_goods: prov.trade_goods.clone(),
            })
            .collect()
    }

    pub fn get_province_development_histogram(&self, payload: TagFilterPayloadRaw) -> ProvinceDevHistogram {
        let filter = TagFilterPayload::from(payload);
        let matching_tags = self.matching_tags(&filter);

        // Collect development values for provinces owned by matching countries
        let mut developments: Vec<f32> = self.query
            .save()
            .game
            .provinces
            .values()
            .filter_map(|province| {
                let owner_tag = province.owner.as_ref()?;

                if !matching_tags.contains(owner_tag) {
                    return None;
                }

                let development = province.base_tax + province.base_production + province.base_manpower;
                Some(development)
            })
            .collect();

        if developments.is_empty() {
            return ProvinceDevHistogram {
                buckets: Vec::new(),
                total_provinces: 0,
                average_dev: 0.0,
                median_dev: 0.0,
                max_dev: 0.0,
                min_dev: 0.0,
            };
        }

        // Sort for median calculation
        developments.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let total_provinces = developments.len();
        let min_dev = developments[0];
        let max_dev = developments[total_provinces - 1];
        let average_dev = developments.iter().sum::<f32>() / total_provinces as f32;
        let median_dev = if total_provinces % 2 == 0 {
            (developments[total_provinces / 2 - 1] + developments[total_provinces / 2]) / 2.0
        } else {
            developments[total_provinces / 2]
        };

        // Create histogram buckets
        const NUM_BUCKETS: usize = 20;
        let range = max_dev - min_dev;
        let bucket_width = if range > 0.0 { range / NUM_BUCKETS as f32 } else { 1.0 };

        let mut buckets = vec![0usize; NUM_BUCKETS];

        for &dev in &developments {
            let bucket_index = if dev >= max_dev {
                NUM_BUCKETS - 1
            } else {
                ((dev - min_dev) / bucket_width).floor() as usize
            };
            buckets[bucket_index] += 1;
        }

        // Convert to response format
        let histogram_buckets: Vec<HistogramBucket> = buckets
            .into_iter()
            .enumerate()
            .map(|(i, count)| {
                let min_bucket_dev = min_dev + (i as f32 * bucket_width);
                let max_bucket_dev = if i == NUM_BUCKETS - 1 {
                    max_dev
                } else {
                    min_dev + ((i + 1) as f32 * bucket_width)
                };

                HistogramBucket {
                    min_dev: min_bucket_dev,
                    max_dev: max_bucket_dev,
                    count,
                    percentage: (count as f32 / total_provinces as f32) * 100.0,
                }
            })
            .collect();

        ProvinceDevHistogram {
            buckets: histogram_buckets,
            total_provinces,
            average_dev,
            median_dev,
            max_dev,
            min_dev,
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
            armed_forces: CountryArmedForces,
            army_tradition: f32,
            navy_tradition: f32,
            professionalism: f32,

            // other
            stability: f32,
            technology: CountryTechnology,
            ideas: i32,
            corruption: f32,
        }

        impl CountryHealthDatum {
            fn force_strength(&self) -> f32 {
                self.armed_forces.infantry_units.strength
                    + self.armed_forces.cavalry_units.strength
                    + self.armed_forces.artillery_units.strength
                    + self.armed_forces.mercenary_units.strength
            }

            fn ships(&self) -> usize {
                self.armed_forces.heavy_ship_units
                    + self.armed_forces.light_ship_units
                    + self.armed_forces.galley_units
                    + self.armed_forces.transport_units
            }
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
                    .filter(|x| x.owner.as_ref() == Some(tag))
                    .map(|x| x.buildings.len())
                    .sum::<usize>();

                let armed_forces = self.armed_forces(country);

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
                    armed_forces,
                    stability: country.stability,
                    technology: country.technology.clone(),
                    ideas,
                    corruption: country.corruption,
                    army_tradition: country.army_tradition,
                    navy_tradition: country.navy_tradition,
                    professionalism: country.army_professionalism,
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

        const AN_AVERAGE_GENERAL_PIPS: u16 = 10;
        let best_general = countries
            .iter()
            .filter_map(|x| x.armed_forces.best_general.as_ref())
            .map(|x| x.fire + x.shock + x.maneuver + x.siege)
            .fold(AN_AVERAGE_GENERAL_PIPS, u16::max) as f32;

        let max_manpower_balance = countries
            .iter()
            .map(|x| x.armed_forces.net_manpower)
            .fold(0., f32::max);

        let min_manpower_balance = countries
            .iter()
            .map(|x| x.armed_forces.net_manpower)
            .fold(0., f32::min);

        let max_force_strength = countries
            .iter()
            .map(|x| x.force_strength())
            .fold(0., f32::max);

        let max_max_manpower = countries
            .iter()
            .map(|x| x.armed_forces.max_manpower)
            .fold(0., f32::max);

        const AN_AVERAGE_ADMIRAL_PIPS: u16 = 7;
        let best_admiral = countries
            .iter()
            .filter_map(|x| x.armed_forces.best_admiral.as_ref())
            .map(|x| x.fire + x.shock + x.maneuver)
            .fold(AN_AVERAGE_ADMIRAL_PIPS, u16::max) as f32;
        let max_ships = countries.iter().map(|x| x.ships()).fold(0, usize::max);

        let max_tech = countries
            .iter()
            .map(|x| x.technology.adm_tech + x.technology.dip_tech + x.technology.mil_tech)
            .fold(0, u8::max);

        let max_ideas = countries.iter().map(|x| x.ideas).fold(0, i32::max);
        let max_corruption = countries.iter().map(|x| x.inflation).fold(15., f32::max);
        let max_land_morale = countries
            .iter()
            .filter_map(|x| x.armed_forces.land_morale)
            .fold(0., f32::max);
        let max_naval_morale = countries
            .iter()
            .filter_map(|x| x.armed_forces.naval_morale)
            .fold(0., f32::max);

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

                let net_manpower_color = if country.armed_forces.net_manpower > 0. {
                    country.armed_forces.net_manpower * (blue_max - blue_min)
                        / (max_manpower_balance)
                        + blue_min
                } else {
                    blue_min - (country.armed_forces.net_manpower * blue_min / min_manpower_balance)
                };

                let tech_total = (country.technology.adm_tech
                    + country.technology.dip_tech
                    + country.technology.mil_tech) as f32;
                let standard_regiments = country.force_strength();
                let ships = country.ships() as f32;
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
                        .armed_forces
                        .best_general
                        .as_ref()
                        .map(|x| {
                            let total = (x.fire + x.shock + x.maneuver + x.siege) as f32;
                            LeaderDatum {
                                value: total,
                                fire: x.fire,
                                shock: x.shock,
                                maneuver: x.maneuver,
                                siege: x.siege,
                                color: ((12. - (best_general - total).min(12.)) * (blue_max / 12.))
                                    as u8,
                            }
                        })
                        .unwrap_or_else(|| LeaderDatum {
                            value: 0.,
                            fire: 0,
                            shock: 0,
                            maneuver: 0,
                            siege: 0,
                            color: 0,
                        }),

                    land_morale: HealthDatumOptional {
                        value: country.armed_forces.land_morale,
                        color: country
                            .armed_forces
                            .land_morale
                            .map(|x| x * blue_max / max_land_morale)
                            .unwrap_or(blue_min) as u8,
                    },

                    army_tradition: HealthDatum {
                        value: country.army_tradition,
                        color: (country.army_tradition * blue_max / 100.) as u8,
                    },

                    net_manpower: HealthDatum {
                        value: country.armed_forces.net_manpower,
                        color: net_manpower_color as u8,
                    },

                    max_manpower: HealthDatum {
                        value: country.armed_forces.max_manpower,
                        color: (country.armed_forces.max_manpower * blue_max / max_max_manpower)
                            as u8,
                    },

                    force_strength: HealthDatum {
                        value: standard_regiments,
                        color: (standard_regiments * blue_max / max_force_strength) as u8,
                    },

                    professionalism: HealthDatum {
                        value: country.professionalism,
                        color: (country.professionalism * blue_max) as u8,
                    },

                    best_admiral: country
                        .armed_forces
                        .best_admiral
                        .as_ref()
                        .map(|x| {
                            let total = (x.fire + x.shock + x.maneuver) as f32;
                            LeaderDatum {
                                value: total,
                                fire: x.fire,
                                shock: x.shock,
                                maneuver: x.maneuver,
                                siege: x.siege,
                                color: ((12. - (best_admiral - total).min(12.)) * (blue_max / 12.))
                                    as u8,
                            }
                        })
                        .unwrap_or_else(|| LeaderDatum {
                            value: 0.,
                            fire: 0,
                            shock: 0,
                            maneuver: 0,
                            siege: 0,
                            color: 0,
                        }),

                    naval_morale: HealthDatumOptional {
                        value: country.armed_forces.naval_morale,
                        color: country
                            .armed_forces
                            .naval_morale
                            .map(|x| x * blue_max / max_naval_morale)
                            .unwrap_or(blue_min) as u8,
                    },

                    navy_tradition: HealthDatum {
                        value: country.navy_tradition,
                        color: (country.navy_tradition * blue_max / 100.) as u8,
                    },

                    ships: HealthDatum {
                        value: ships,
                        color: (ships * blue_max / max_ships as f32) as u8,
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
                    armed_forces: country.armed_forces,
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

        let province = self.query.save().game.provinces.get(&id)?;
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
                                country: self.localize_tag(country_state.country),
                                prosperity: country_state.prosperity,
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default(),
                investments: area
                    .investments
                    .iter()
                    .map(|investment| TradeCompanyInvestments {
                        country: self.localize_tag(investment.tag),
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

        let owner = province.owner.as_ref().map(|tag| self.localize_tag(*tag));

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
                                tag: CountryTag::new(*b"REB"),
                                name: reb.name.clone(),
                            })
                        } else {
                            None
                        }
                    })
            })
            .or_else(|| {
                province
                    .controller
                    .as_ref()
                    .map(|tag| self.localize_tag(*tag))
            });

        let cores = province
            .cores
            .iter()
            .map(|tag| self.localize_tag(*tag))
            .collect();

        let claims = province
            .claims
            .iter()
            .map(|tag| self.localize_tag(*tag))
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
                        data: ProvinceHistoryEventKind::Owner(self.localize_tag(*x)),
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
                country: self.localize_tag(*tag),
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
                .is_some_and(|area| states.contains(&(area, owner)));

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
        // Previously this function used `players_countries`, however this
        // proved inaccurate.
        //
        // > `players_countries` seems to keep all players who played so it
        // > represent the number of unique players who played in that save. But
        // > the tags are not correct.
        //
        // https://discord.com/channels/712465396590182461/712465397135179778/1358140139301507433
        //
        // And then we eliminate players who have no cities, so they don't clog
        // up charts

        self.query
            .countries()
            .filter(|x| x.country.was_player && x.country.num_of_cities > 0)
            .map(|x| x.tag)
            .collect()
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
                    let Some(country) = self.query.country(x) else {
                        continue;
                    };
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
                let countries = player_countries
                    .iter()
                    .filter_map(|tag| self.query.country(tag))
                    .flat_map(|x| x.subjects.iter());
                desired_countries.extend(countries);
            }
        }

        if paint_subject_in_overlord_hue {
            let mut lighten_subjects = HashMap::new();
            for tag in &desired_countries {
                if let Some(color) = country_colors.get(tag) {
                    let Some(country) = self.query.country(tag) else {
                        continue;
                    };

                    for sub in &country.subjects {
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
            .or_else(|| self.query.save().game.provinces.keys().max())
            .map_or_else(
                || self.query.save().game.provinces.len() as u16,
                |x| x.as_u16(),
            );

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

    pub fn wars(&self, payload: TagFilterPayloadRaw) -> Vec<War> {
        let filter = TagFilterPayload::from(payload);
        let tags = self.matching_tags(&filter);
        let previous_wars = &self.query.save().game.previous_wars;
        let active_wars = &self.query.save().game.active_wars;
        let prev = previous_wars.iter().map(WarOverview::from);
        let act = active_wars.iter().map(WarOverview::from);

        prev.chain(act)
            .filter(|x| !x.name.is_empty() && x.original_attacker.is_some())
            .map(|x| {
                let battles = x
                    .history
                    .events
                    .iter()
                    .filter(|(_d, event)| matches!(event, WarEvent::Battle(_)))
                    .count();

                let war = self.war_info(&x);
                War {
                    name: war.name,
                    start_date: war.start_date,
                    end_date: war.end_date,
                    days: war.days,
                    attackers: war.attackers,
                    defenders: war.defenders,
                    battles,
                }
            })
            .filter(|war| war.start_date > self.query.save().game.start_date)
            .filter(|war| {
                let mut all_participants = war
                    .attackers
                    .members
                    .iter()
                    .chain(war.defenders.members.iter());

                all_participants.any(|part| {
                    tags.contains(
                        &self
                            .tag_resolver
                            .resolve(part.country.tag, part.joined)
                            .map(|x| x.current)
                            .unwrap_or(part.country.tag),
                    )
                })
            })
            .collect::<Vec<_>>()
    }

    pub fn get_commander_stats<'a>(
        &'a self,
        date: Eu4Date,
        tags: impl Iterator<Item = &'a CountryTag>,
        commander: &str,
    ) -> String {
        tags.filter_map(|tag| self.query.country(tag))
            .flat_map(|country| {
                let leaders = country
                    .history
                    .events
                    .iter()
                    .rev()
                    .skip_while(|(d, _)| d > &date)
                    .map(|(_, event)| event)
                    .filter_map(|x| x.as_leader());

                let merc_leaders = country
                    .mercenary_companies
                    .iter()
                    .flat_map(|x| x.leader.as_ref());

                leaders.chain(merc_leaders)
            })
            .find(|leader| leader.name == commander)
            .map(|x| format!("({} / {} / {} / {})", x.fire, x.shock, x.maneuver, x.siege))
            .unwrap_or_else(|| String::from("(? / ? / ? / ?)"))
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

    fn war_info(&self, war: &WarOverview) -> RawWarInfo {
        let mut attackers = HashSet::new();
        let mut joined = HashMap::new();
        let mut exited = HashMap::new();

        let start_date = war.history.events.iter().map(|(date, _)| date).min();
        let start_date = start_date.copied().unwrap_or_else(eu4save::eu4_start_date);
        let last_date = war.history.events.iter().map(|(date, _)| date).max();
        let last_date = last_date.copied();

        for (date, event) in &war.history.events {
            match event {
                WarEvent::AddAttacker(x) => {
                    joined.insert(x, date);
                    attackers.insert(x);
                }
                WarEvent::AddDefender(x) => {
                    joined.insert(x, date);
                }
                WarEvent::RemoveAttacker(x) => {
                    exited.insert(x, date);
                }
                WarEvent::RemoveDefender(x) => {
                    exited.insert(x, date);
                }
                WarEvent::Battle(_) => {}
            }
        }

        let mut attacker_participants = Vec::new();
        let mut defender_participants = Vec::new();

        let mut total_attacker_participation: f64 = 0.0;
        let mut total_defender_participation: f64 = 0.0;
        for participant in war.participants {
            if attackers.contains(&participant.tag) {
                total_attacker_participation += f64::from(participant.value);
            } else {
                total_defender_participation += f64::from(participant.value);
            }
        }

        for participant in war.participants {
            let exit = exited
                .get(&participant.tag)
                .filter(|&&&x| matches!(last_date, Some(e) if e >= x))
                .map(|&&x| x);

            let join = joined
                .get(&participant.tag)
                .filter(|&&&x| start_date < x)
                .map(|&&x| x)
                .unwrap_or(start_date);

            let mut participant = WarParticipant {
                country: self.localize_tag(participant.tag),
                participation: participant.value,
                participation_percent: f64::from(participant.value),
                losses: SaveFileImpl::create_losses(&participant.losses.members),
                joined: join,
                exited: exit,
            };

            if attackers.contains(&participant.country.tag) {
                participant.participation_percent /= total_attacker_participation;
                attacker_participants.push(participant);
            } else {
                participant.participation_percent /= total_defender_participation;
                defender_participants.push(participant);
            }
        }

        let days = if let Some(d) = (!war.is_active).then_some(last_date).flatten() {
            start_date.days_until(&d)
        } else {
            start_date.days_until(&self.query.save().meta.date)
        };

        RawWarInfo {
            name: String::from(war.name),
            start_date,
            end_date: if war.is_active { None } else { last_date },
            days,
            attackers: WarInfoSide {
                original: self.localize_tag(war.original_attacker),
                members: attacker_participants,
            },
            defenders: WarInfoSide {
                original: self.localize_tag(war.original_defender),
                members: defender_participants,
            },
        }
    }

    fn battle_info(&self, history: &WarHistory) -> Vec<BattleInfo> {
        let mut attackers = HashSet::new();
        let mut defenders = HashSet::new();
        let mut battles = Vec::new();
        let mut commanders = HashMap::new();

        for (date, event) in &history.events {
            match event {
                WarEvent::AddAttacker(x) => {
                    attackers.insert(x);
                }
                WarEvent::AddDefender(x) => {
                    defenders.insert(x);
                }
                WarEvent::RemoveAttacker(x) => {
                    attackers.remove(x);
                }
                WarEvent::RemoveDefender(x) => {
                    defenders.remove(x);
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

                    let attacker = BattleSide::new(
                        &b.attacker,
                        self.localize_tag(b.attacker.country),
                        attacker_commander_stats,
                    );
                    let defender = BattleSide::new(
                        &b.defender,
                        self.localize_tag(b.defender.country),
                        defender_commander_stats,
                    );

                    let x = BattleInfo {
                        name: b.name.clone(),
                        date: *date,
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

        battles
    }

    pub fn get_war(&self, name: &str) -> Option<WarInfo> {
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

        let war = active_war
            .map(WarOverview::from)
            .or_else(|| previous_war.map(WarOverview::from))?;

        let battles = self.battle_info(war.history);
        let result = self.war_info(&war);
        Some(WarInfo {
            name: result.name,
            start_date: result.start_date,
            end_date: result.end_date,
            days: result.days,
            attackers: result.attackers,
            defenders: result.defenders,
            battles,
        })
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
