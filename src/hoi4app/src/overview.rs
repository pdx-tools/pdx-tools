//! The world of a save as the panel reads it: countries, factions,
//! occupations, wars, and dated events.

use crate::{Hoi4World, StateId, save::SaveModel};
use hoi4save::{CountryTag, Hoi4Date};
use jomini::common::PdsDate;
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};

/// The ideologies of the base game, with the map colors from
/// `common/ideologies/00_ideologies.txt` and the names from the English
/// localisation (`<ideology>_noun`).
pub const IDEOLOGIES: [(&str, &str, [u8; 3]); 4] = [
    ("democratic", "Democracy", [0, 0, 255]),
    ("communism", "Communism", [255, 0, 0]),
    ("fascism", "Fascism", [150, 75, 0]),
    ("neutrality", "Non-Aligned", [124, 124, 124]),
];

/// Ship designs that the game counts as capital ships
const CAPITAL_SHIPS: [&str; 4] = ["battleship", "battle_cruiser", "carrier", "heavy_cruiser"];

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Hoi4Overview {
    /// The save date (eg: "1941-02-13")
    pub date: String,
    pub start_date: String,
    pub player: Option<String>,
    /// Civilian factories, military factories, and dockyards in the world
    pub total_factories: u32,
    pub countries: Vec<CountrySummary>,
    pub factions: Vec<FactionSummary>,
    pub ideologies: Vec<IdeologySummary>,
    pub occupations: Vec<OccupationSummary>,
    pub wars: Vec<WarSummary>,
    pub events: Vec<Hoi4Event>,
    pub playthroughs: Vec<PlaythroughRecord>,
    /// False when the save turned off the collection of statistics. Some
    /// playthrough values are then not correct.
    pub statistics_collected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct CountrySummary {
    pub tag: String,
    pub name: String,
    pub color: String,
    /// The base name of the tag, without the ideology or cosmetic tag. The
    /// events use it, because the save keeps only the current name.
    pub base_name: String,
    pub ideology: Option<String>,
    /// Index into the factions
    pub faction: Option<usize>,
    pub faction_joined: Option<String>,
    /// Factories in the states that the country controls
    pub factories_held: u32,
    /// Factories in the states that the country owns
    pub factories_owned: u32,
    pub states_owned: u32,
    pub states_held: u32,
    pub stability: f64,
    pub war_support: f64,
    pub enemies: Vec<String>,
    pub casualties: f64,
    pub enemy_casualties: f64,
    pub ships_lost: u32,
    pub ships_sunk: u32,
    pub capitulated: Option<String>,
    /// The country that hosts the government in exile
    pub exile_host: Option<String>,
    /// Party popularity in percent, largest first
    pub popularity: Vec<PartyPopularity>,
    /// The country that a dynamic tag split from
    pub original_tag: Option<String>,
    pub is_player: bool,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct PartyPopularity {
    pub ideology: String,
    pub popularity: f64,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct FactionSummary {
    pub name: String,
    pub color: String,
    pub ideology: Option<String>,
    pub members: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct IdeologySummary {
    pub key: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct StateRef {
    pub id: u32,
    pub name: String,
    pub factories: u32,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct OccupationSummary {
    pub occupier: String,
    pub occupied: String,
    pub states: Vec<StateRef>,
    pub resistance: f64,
    pub compliance: f64,
    /// The occupation law of most states (eg: "military_governor_occupation")
    pub law: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct WarSummary {
    pub first: String,
    pub second: String,
    pub start: String,
    pub first_casualties: f64,
    pub second_casualties: f64,
    pub instigator: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum Hoi4EventKind {
    War,
    Capitulation,
    Faction,
    Sinking,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Hoi4Event {
    pub date: String,
    pub kind: Hoi4EventKind,
    /// The countries of the event. The first country acts (eg: it declares
    /// the war, it sinks the ship).
    pub countries: Vec<String>,
    /// A faction name or a ship name and design
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct PlaythroughRecord {
    pub tag: String,
    pub stats: HashMap<String, f64>,
}

pub fn iso_date(date: Hoi4Date) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
}

impl Hoi4World {
    pub fn overview(&self, save: &SaveModel) -> Hoi4Overview {
        let player = save.player.clone();
        let tags_of = |tag: CountryTag| tag.to_string();

        // Factories and states by controller and by owner
        let mut held: HashMap<CountryTag, (u32, u32)> = HashMap::new();
        let mut owned: HashMap<CountryTag, (u32, u32)> = HashMap::new();
        let mut total_factories = 0;
        for state in save.states.values() {
            let factories = state.factories();
            total_factories += factories;
            if let Some(owner) = state.owner {
                let x = owned.entry(owner).or_default();
                x.0 += factories;
                x.1 += 1;
                let x = held.entry(state.controller.unwrap_or(owner)).or_default();
                x.0 += factories;
                x.1 += 1;
            }
        }

        let mut factions = Vec::new();
        let mut faction_of = HashMap::new();
        for faction in save.factions.iter().filter(|x| !x.members.is_empty()) {
            let idx = factions.len();
            for member in &faction.members {
                faction_of.insert(*member, idx);
            }
            let rgb = faction.rgb().unwrap_or([94, 94, 94]);
            factions.push(FactionSummary {
                name: faction.name.clone(),
                color: hex(rgb),
                ideology: faction.ideology.clone(),
                members: faction.members.iter().map(|x| tags_of(*x)).collect(),
            });
        }

        // Each war pair is in the relations of both countries
        let mut wars = Vec::new();
        let mut war_keys = BTreeSet::new();
        for (_, country) in &save.countries {
            for (_, relation) in &country.diplomacy.active_relations {
                let Some(war) = &relation.war_relation else {
                    continue;
                };
                if !war_keys.insert((war.first, war.second)) {
                    continue;
                }
                let instigator = if war.first_was_instigator {
                    war.first
                } else {
                    war.second
                };
                wars.push(WarSummary {
                    first: tags_of(war.first),
                    second: tags_of(war.second),
                    start: iso_date(war.start_date),
                    first_casualties: war.first_casualties,
                    second_casualties: war.second_casualties,
                    instigator: tags_of(instigator),
                });
            }
        }

        let mut ships: HashMap<CountryTag, (u32, u32)> = HashMap::new();
        for ship in save.history.sunk_ship.iter().filter(|x| !x.convoy) {
            if let Some(tag) = ship.country {
                ships.entry(tag).or_default().0 += 1;
            }
            if let Some(tag) = ship.killer_country {
                ships.entry(tag).or_default().1 += 1;
            }
        }

        let mut occupations = Vec::new();
        for (occupier, country) in &save.countries {
            for (occupied, occupation) in &country.occupation_status.occupation {
                // The game also keeps records for owned land of other
                // cultures (eg: Britain in Egypt at the start). Only the
                // states that another country owns are occupied.
                let states: Vec<_> = occupation
                    .states
                    .iter()
                    .filter(|id| {
                        save.states
                            .get(id)
                            .and_then(|x| x.owner)
                            .is_some_and(|owner| owner != *occupier)
                    })
                    .map(|id| StateRef {
                        id: *id,
                        name: self
                            .game()
                            .state(StateId::new(*id))
                            .map_or_else(|| format!("State {id}"), |x| x.name.clone()),
                        factories: save.states.get(id).map_or(0, |x| x.factories()),
                    })
                    .collect();
                if states.is_empty() {
                    continue;
                }
                occupations.push(OccupationSummary {
                    occupier: tags_of(*occupier),
                    occupied: tags_of(*occupied),
                    states,
                    resistance: occupation.resistance,
                    compliance: occupation.compliance,
                    law: most_common(occupation.occupation_law_list.iter().map(|(_, x)| x)),
                });
            }
        }
        occupations.sort_by_key(|a| std::cmp::Reverse(a.states.len()));

        let start = save.start_date.unwrap_or(save.date);
        let start_iso = iso_date(start);
        let events = events(save, &wars, start);

        // The countries that the panel can name: those with land, and those
        // that a faction, an occupation, a war, or an event names.
        let mut named: BTreeSet<CountryTag> = held.keys().chain(owned.keys()).copied().collect();
        named.extend(faction_of.keys().copied());
        for occupation in &occupations {
            named.extend(occupation.occupier.parse::<CountryTag>().ok());
            named.extend(occupation.occupied.parse::<CountryTag>().ok());
        }
        for war in &wars {
            named.extend(war.first.parse::<CountryTag>().ok());
            named.extend(war.second.parse::<CountryTag>().ok());
        }
        for event in &events {
            named.extend(
                event
                    .countries
                    .iter()
                    .filter_map(|x| x.parse::<CountryTag>().ok()),
            );
        }
        named.extend(player.iter().filter_map(|x| x.parse::<CountryTag>().ok()));

        let countries = save
            .countries
            .iter()
            .filter(|(tag, _)| named.contains(tag))
            .map(|(tag, country)| {
                let display = self.country(*tag);
                let (factories_held, states_held) = held.get(tag).copied().unwrap_or_default();
                let (factories_owned, states_owned) = owned.get(tag).copied().unwrap_or_default();
                let mut enemies = Vec::new();
                let (mut casualties, mut enemy_casualties) = (0.0, 0.0);
                for war in &wars {
                    if war.first == tag.as_str() {
                        enemies.push(war.second.clone());
                        casualties += war.first_casualties;
                        enemy_casualties += war.second_casualties;
                    } else if war.second == tag.as_str() {
                        enemies.push(war.first.clone());
                        casualties += war.second_casualties;
                        enemy_casualties += war.first_casualties;
                    }
                }
                enemies.sort();
                enemies.dedup();

                let politics = country.politics.as_ref();
                let mut popularity: Vec<_> = politics
                    .map(|x| {
                        x.parties
                            .iter()
                            .map(|(ideology, party)| PartyPopularity {
                                ideology: ideology.clone(),
                                popularity: party.popularity,
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                popularity.sort_by(|a, b| b.popularity.total_cmp(&a.popularity));
                let (ships_lost, ships_sunk) = ships.get(tag).copied().unwrap_or_default();

                let diplomacy = &country.diplomacy;
                CountrySummary {
                    tag: display.tag,
                    name: display.name,
                    color: display.color,
                    base_name: self.base_name(*tag),
                    ideology: politics.and_then(|x| x.ruling_party.clone()),
                    faction: faction_of.get(tag).copied(),
                    faction_joined: diplomacy.faction_join_date.map(iso_date),
                    factories_held,
                    factories_owned,
                    states_owned,
                    states_held,
                    stability: country.stability,
                    war_support: country.war_support,
                    enemies,
                    casualties,
                    enemy_casualties,
                    ships_lost,
                    ships_sunk,
                    capitulated: diplomacy
                        .capitulated
                        .then_some(diplomacy.capitulated_date)
                        .flatten()
                        .map(iso_date),
                    exile_host: diplomacy.hosting_our_government_in_exile.map(tags_of),
                    popularity,
                    original_tag: country.original_tag.map(tags_of),
                    is_player: player.as_deref() == Some(tag.as_str())
                        || save
                            .all_playthrough_data
                            .iter()
                            .any(|(t, _)| t == tag.as_str()),
                }
            })
            .collect();

        let ideologies = IDEOLOGIES
            .iter()
            .map(|(key, name, color)| IdeologySummary {
                key: key.to_string(),
                name: name.to_string(),
                color: hex(*color),
            })
            .collect();

        let playthroughs = save
            .all_playthrough_data
            .iter()
            .map(|(tag, x)| PlaythroughRecord {
                tag: tag.clone(),
                stats: x.data.first.clone(),
            })
            .collect();

        Hoi4Overview {
            date: iso_date(save.date),
            start_date: start_iso,
            player,
            total_factories,
            countries,
            factions,
            ideologies,
            occupations,
            wars,
            events,
            playthroughs,
            statistics_collected: save.statistics_collection_enabled.unwrap_or(true),
        }
    }
}

fn events(save: &SaveModel, wars: &[WarSummary], start: Hoi4Date) -> Vec<Hoi4Event> {
    let mut events = Vec::new();

    // Wars entered, grouped by date and instigator
    let mut groups: Vec<(String, String, Vec<String>)> = Vec::new();
    for war in wars {
        let target = if war.instigator == war.first {
            &war.second
        } else {
            &war.first
        };
        match groups
            .iter_mut()
            .find(|(date, inst, _)| *date == war.start && *inst == war.instigator)
        {
            Some((_, _, targets)) => targets.push(target.clone()),
            None => groups.push((
                war.start.clone(),
                war.instigator.clone(),
                vec![target.clone()],
            )),
        }
    }
    for (date, instigator, mut targets) in groups {
        targets.sort();
        targets.dedup();
        let mut countries = vec![instigator];
        countries.extend(targets);
        events.push(Hoi4Event {
            date,
            kind: Hoi4EventKind::War,
            countries,
            detail: None,
        });
    }

    for (tag, country) in &save.countries {
        let diplomacy = &country.diplomacy;
        if let (true, Some(date)) = (diplomacy.capitulated, diplomacy.capitulated_date) {
            events.push(Hoi4Event {
                date: iso_date(date),
                kind: Hoi4EventKind::Capitulation,
                countries: vec![tag.to_string()],
                detail: None,
            });
        }
    }

    for faction in &save.factions {
        for member in &faction.members {
            let joined = save
                .countries
                .iter()
                .find(|(tag, _)| tag == member)
                .and_then(|(_, x)| x.diplomacy.faction_join_date);
            if let Some(date) = joined.filter(|x| *x > start) {
                events.push(Hoi4Event {
                    date: iso_date(date),
                    kind: Hoi4EventKind::Faction,
                    countries: vec![member.to_string()],
                    detail: Some(faction.name.clone()),
                });
            }
        }
    }

    for ship in &save.history.sunk_ship {
        if ship.convoy || !CAPITAL_SHIPS.contains(&ship.definition.as_str()) {
            continue;
        }
        let countries = ship
            .killer_country
            .into_iter()
            .chain(ship.country)
            .map(|x| x.to_string())
            .collect();
        events.push(Hoi4Event {
            date: iso_date(ship.date),
            kind: Hoi4EventKind::Sinking,
            countries,
            detail: Some(format!(
                "{} ({})",
                ship.name,
                ship.definition.replace('_', " ")
            )),
        });
    }

    events.sort_by(|a, b| a.date.cmp(&b.date));
    events
}

fn most_common<'a>(values: impl Iterator<Item = &'a String>) -> Option<String> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for value in values {
        *counts.entry(value.as_str()).or_default() += 1;
    }
    counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(x, _)| x.to_string())
}

pub(crate) fn hex([r, g, b]: [u8; 3]) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}
