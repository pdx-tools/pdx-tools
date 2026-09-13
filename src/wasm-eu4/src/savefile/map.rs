use super::{
    LocalizedObj, LocalizedTag, MapPayload, MapPayloadKind, MapQuickTipPayload, SaveFileImpl,
    TagFilterPayload, TimelineKind,
};
use eu4save::{
    CountryTag, Eu4Date, ProvinceId,
    models::{CountryEvent, Province},
    query::ReligionIndex,
};
use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};
use wasm_bindgen::prelude::*;

pub const WASTELAND: [u8; 4] = [61, 61, 61, 0];

impl SaveFileImpl {
    pub fn initial_map_position(&self) -> (u16, u16) {
        let save = self.query.save();
        self.map_position_of(&save.meta.player)
    }

    pub fn map_position_of_tag(&self, tag: &str) -> (u16, u16) {
        CountryTag::from_str(tag)
            .ok()
            .map(|x| self.map_position_of(&x))
            .unwrap_or((3000, 600))
    }

    fn map_position_of(&self, tag: &CountryTag) -> (u16, u16) {
        self.query
            .country(tag)
            .and_then(|x| self.game.get_province(&x.capital))
            .map(|x| (x.center_x, x.center_y))
            .unwrap_or((3000, 600))
    }

    pub fn map_quick_tip(
        &self,
        province_id: i32,
        payload: MapPayloadKind,
        days: Option<i32>,
    ) -> Option<MapQuickTipPayload> {
        let province_id = ProvinceId::new(province_id);
        let province = self.query.save().game.provinces.get(&province_id)?;
        let requested_date = days.map(|x| self.query.save().game.start_date.add_days(x));
        let reb = CountryTag::new(*b"REB");

        let local_controller = 'controller: {
            let Some(date) = requested_date else {
                let current_controller = province.controller.unwrap_or(CountryTag::NONE);
                if current_controller == CountryTag::NONE {
                    return None;
                }

                if let Some(rebels) = province.occupying_rebel_faction.as_ref() {
                    let rebel_name = self.query.save().game.rebel_factions.iter().find_map(|x| {
                        if x.id.id == rebels.id {
                            Some(x.name.clone())
                        } else {
                            None
                        }
                    });

                    if let Some(rebel_name) = rebel_name {
                        break 'controller LocalizedTag {
                            name: rebel_name,
                            tag: current_controller,
                        };
                    }
                };

                break 'controller self.localize_tag(current_controller);
            };

            let resolver = self.tag_resolver.at(date);
            let controller_events = province
                .history
                .events
                .iter()
                .filter_map(|(date, event)| match event {
                    eu4save::models::ProvinceEvent::Controller(c) if c.tag != reb => {
                        Some((date, c))
                    }
                    _ => None,
                })
                .take_while(|(cdate, _c)| **cdate <= date);

            let mut controller_date = Eu4Date::from_ymd(1, 1, 1);
            let mut controller_tag = province.history.owner.unwrap_or(CountryTag::NONE);
            for (date, event) in controller_events {
                // See political timelapse code for why we require at least a
                // day of controllership
                if *date != controller_date {
                    controller_tag = event.tag;
                    controller_date = *date;
                }
            }

            let current_controller = resolver
                .resolve(controller_tag, controller_date)
                .or_else(|| province.history.owner.and_then(|x| resolver.initial(x)))
                .map(|x| x.current)
                .unwrap_or(CountryTag::NONE);

            if current_controller == CountryTag::NONE {
                return None;
            } else {
                self.localize_tag(current_controller)
            }
        };

        let (owner_tag, stored_owner_tag) = 'owner: {
            let Some(date) = requested_date else {
                let owner = province.owner.as_ref()?;
                break 'owner (*owner, *owner);
            };

            let resolver = self.tag_resolver.at(date);
            let latest_owner = province
                .history
                .events
                .iter()
                .filter_map(|(date, event)| match event {
                    eu4save::models::ProvinceEvent::Owner(c) => Some((date, c)),
                    _ => None,
                })
                .take_while(|(cdate, _c)| **cdate <= date)
                .last()
                .map(|(cdate, owner)| {
                    resolver
                        .resolve(*owner, *cdate)
                        .map(|x| (x.current, x.stored))
                        .unwrap_or((*owner, *owner))
                });

            latest_owner.unwrap_or_else(|| {
                let fallback = province.history.owner.unwrap_or(CountryTag::NONE);
                resolver
                    .initial(fallback)
                    .map(|x| (x.current, x.stored))
                    .unwrap_or((
                        fallback,
                        self.tag_resolver
                            .initial(fallback)
                            .map(|x| x.stored)
                            .unwrap_or(fallback),
                    ))
            })
        };

        if owner_tag == CountryTag::NONE {
            return None;
        }

        let local_owner = self.localize_tag(owner_tag);

        match payload {
            MapPayloadKind::Political => Some(MapQuickTipPayload::Political {
                province_id,
                province_name: province.name.clone(),
                owner: local_owner,
                controller: local_controller,
            }),

            MapPayloadKind::Religion => {
                let religion_in_province_id = 'prov_religion: {
                    let Some(date) = requested_date else {
                        break 'prov_religion province.religion.clone()?;
                    };
                    let latest_religion = province
                        .history
                        .events
                        .iter()
                        .take_while(|(cdate, _c)| *cdate <= date)
                        .filter_map(|(_date, event)| match event {
                            eu4save::models::ProvinceEvent::Religion(c) => Some(c),
                            _ => None,
                        })
                        .last()
                        .cloned();

                    latest_religion
                        .or_else(|| province.history.religion.clone())
                        .or_else(|| province.religion.clone())?
                };

                let religion_in_province = self.game.religion(&religion_in_province_id)?;

                let owner = self.query.country(&stored_owner_tag)?;
                let state_religion_id = 'state_religion: {
                    let Some(date) = requested_date else {
                        break 'state_religion owner.religion.clone()?;
                    };
                    let latest_religion = owner
                        .history
                        .events
                        .iter()
                        .take_while(|(cdate, _c)| *cdate <= date)
                        .filter_map(|(_date, event)| match event {
                            eu4save::models::CountryEvent::Religion(c) => Some(c),
                            _ => None,
                        })
                        .last()
                        .cloned();

                    latest_religion
                        .or_else(|| owner.history.religion.clone())
                        .or_else(|| owner.religion.clone())?
                };
                let state_religion = self.game.religion(&state_religion_id)?;

                let religion_in_province = LocalizedObj {
                    id: religion_in_province_id,
                    name: String::from(religion_in_province.name),
                };

                let state_religion = LocalizedObj {
                    id: state_religion_id,
                    name: String::from(state_religion.name),
                };

                Some(MapQuickTipPayload::Religion {
                    province_id,
                    province_name: province.name.clone(),
                    owner: local_owner,
                    controller: local_controller,
                    religion_in_province,
                    state_religion,
                })
            }

            MapPayloadKind::Development => Some(MapQuickTipPayload::Development {
                province_id,
                province_name: province.name.clone(),
                owner: local_owner,
                controller: local_controller,
                base_tax: province.base_tax,
                base_production: province.base_production,
                base_manpower: province.base_manpower,
            }),

            MapPayloadKind::Technology => {
                let owner_tag = province.owner.as_ref()?;
                let owner = self.query.country(owner_tag)?;

                Some(MapQuickTipPayload::Technology {
                    province_id,
                    province_name: province.name.clone(),
                    owner: local_owner,
                    controller: local_controller,
                    adm_tech: owner.technology.adm_tech,
                    dip_tech: owner.technology.dip_tech,
                    mil_tech: owner.technology.mil_tech,
                })
            }

            MapPayloadKind::Battles => {
                let previous_events = self
                    .query
                    .save()
                    .game
                    .previous_wars
                    .iter()
                    .flat_map(|war| war.history.events.iter());
                let active_events = self
                    .query
                    .save()
                    .game
                    .active_wars
                    .iter()
                    .flat_map(|war| war.history.events.iter());
                let war_events = previous_events.chain(active_events);

                let battles = war_events.filter_map(|(date, event)| match event {
                    eu4save::models::WarEvent::Battle(b) => {
                        Some((b.location, date, b.attacker.losses + b.defender.losses))
                    }
                    _ => None,
                });

                let (battles, losses) = battles
                    .filter(|(location, _, _)| *location == province_id)
                    .filter(|(_, date, _)| requested_date.is_none_or(|x| **date <= x))
                    .map(|(_, _, losses)| losses)
                    .fold((0, 0), |(count, losses), x| (count + 1, losses + x));

                Some(MapQuickTipPayload::Battles {
                    province_id,
                    province_name: province.name.clone(),
                    battles,
                    losses,
                })
            }
            _ => None,
        }
    }

    pub fn map_colors(&self, payload: MapPayload) -> Vec<u8> {
        if matches!(
            payload.kind,
            MapPayloadKind::Political | MapPayloadKind::Religion | MapPayloadKind::Battles
        ) {
            let date = payload
                .date
                .map(|x| self.query.save().game.start_date.add_days(x));

            if let Some(date) = date {
                return self.historical_map_color(date, payload.kind);
            }
        }

        let province_id_to_color_index = &self.province_id_to_color_index;
        let result_len: usize = province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 2];
        let (primary, secondary) = result.split_at_mut(result_len);

        let excluded_color = [106, 108, 128, 255];
        let filter = TagFilterPayload::from(payload.tag_filter);
        let tags = self.matching_tags(&filter);

        let provs: Vec<(&ProvinceId, &Province, bool)> = self
            .query
            .save()
            .game
            .provinces
            .iter()
            .filter(|(id, _)| usize::from(id.as_u16()) < province_id_to_color_index.len())
            .map(|(id, prov)| {
                (
                    id,
                    prov,
                    tags.is_empty() || prov.owner.as_ref().is_some_and(|x| tags.contains(x)),
                )
            })
            .collect();

        match payload.kind {
            MapPayloadKind::Political => {
                let mut country_colors: HashMap<&CountryTag, [u8; 4]> = HashMap::new();
                for (tag, country) in &self.query.save().game.countries {
                    let c = &country.colors.map_color;
                    country_colors
                        .entry(tag)
                        .or_insert_with(|| [c[0], c[1], c[2], 255]);

                    if payload.paint_subject_in_overlord_hue {
                        for sub in &country.subjects {
                            let data = [
                                country.colors.map_color[0].saturating_add((255.0 * 0.1) as u8),
                                country.colors.map_color[1].saturating_add((255.0 * 0.1) as u8),
                                country.colors.map_color[2].saturating_add((255.0 * 0.1) as u8),
                                255,
                            ];
                            country_colors.insert(sub, data);
                        }
                    }
                }

                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&WASTELAND);
                    secondary_color.copy_from_slice(&WASTELAND);

                    if let Some(controller_tag) = prov.controller.as_ref() {
                        primary_color.copy_from_slice(&excluded_color);
                        secondary_color.copy_from_slice(&excluded_color);

                        if !include {
                            continue;
                        }

                        if let Some(owner_tag) = prov.owner.as_ref() {
                            if let Some(known_color) = country_colors.get(owner_tag) {
                                primary_color.copy_from_slice(known_color);
                                secondary_color.copy_from_slice(known_color);
                            }

                            if let Some(known_color) = country_colors.get(controller_tag) {
                                secondary_color.copy_from_slice(known_color);
                            }
                        }
                    } else if let Some(prov) = self.game.get_province(&id)
                        && prov.is_habitable()
                    {
                        primary_color.copy_from_slice(&[94, 94, 94, 128]);
                        secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                    }
                }
            }

            MapPayloadKind::Religion => {
                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&WASTELAND);
                    secondary_color.copy_from_slice(&WASTELAND);

                    if let Some(owner_tag) = prov.owner.as_ref() {
                        let owner = self.query.country(owner_tag).unwrap();

                        primary_color.copy_from_slice(&excluded_color);
                        secondary_color.copy_from_slice(&excluded_color);

                        if !include {
                            continue;
                        }

                        if let Some(prov_religion) = prov.religion.as_ref() {
                            if let Some(known_color) =
                                self.game.religion(prov_religion).map(|x| x.color)
                            {
                                secondary_color[..3].copy_from_slice(&known_color);
                                secondary_color[3] = 255;
                            }

                            if let Some(known_color) = owner
                                .religion
                                .as_ref()
                                .and_then(|x| self.game.religion(x))
                                .map(|x| x.color)
                            {
                                primary_color[..3].copy_from_slice(&known_color);
                                primary_color[3] = 255;
                            }
                        }
                    } else if let Some(prov) = self.game.get_province(&id)
                        && prov.is_habitable()
                    {
                        primary_color.copy_from_slice(&[94, 94, 94, 128]);
                        secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                    }
                }
            }

            MapPayloadKind::Development => {
                let min_color = [127., 0., 0.];
                let diff_color = [0. - 127., 212. - 0., 144. - 0.];

                let max_dev = provs
                    .iter()
                    .filter(|(_, _, include)| *include)
                    .map(|(_id, prov, _)| prov.base_manpower + prov.base_production + prov.base_tax)
                    .max_by(|a, b| a.total_cmp(b))
                    .unwrap_or(0.0);
                let max_dev = max_dev.clamp(10.0, 50.0);

                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&WASTELAND);
                    secondary_color.copy_from_slice(&WASTELAND);

                    if prov.owner.is_some() {
                        primary_color.copy_from_slice(&excluded_color);
                        secondary_color.copy_from_slice(&excluded_color);

                        if !include {
                            continue;
                        }

                        let prov_dev = prov.base_tax + prov.base_manpower + prov.base_production;
                        let ratio = prov_dev.min(max_dev) / max_dev;
                        let color = [
                            (min_color[0] + ratio * diff_color[0]).round() as u8,
                            (min_color[1] + ratio * diff_color[1]).round() as u8,
                            (min_color[2] + ratio * diff_color[2]).round() as u8,
                        ];

                        primary_color[..3].copy_from_slice(&color);
                        secondary_color[..3].copy_from_slice(&color);
                    } else if let Some(prov) = self.game.get_province(&id)
                        && prov.is_habitable()
                    {
                        primary_color.copy_from_slice(&[94, 94, 94, 128]);
                        secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                    }
                }
            }

            MapPayloadKind::Battles => {
                let mut timelapse = BattleTimelapse::new(self);
                let final_date = self.query.save().meta.date;
                let prep_date = final_date
                    .add_days(-365)
                    .max(self.query.save().game.start_date);
                let _ = timelapse.advance_to(prep_date);
                return timelapse.advance_to(final_date);
            }

            MapPayloadKind::Technology => {
                let min_color = [127., 0., 0.];
                let diff_color = [0. - 127., 212. - 0., 144. - 0.];

                let max_tech = self
                    .query
                    .countries()
                    .map(|x| x.country)
                    .filter(|x| x.num_of_cities > 0)
                    .map(|x| {
                        i16::from(x.technology.adm_tech)
                            + i16::from(x.technology.dip_tech)
                            + i16::from(x.technology.mil_tech)
                    })
                    .max()
                    .unwrap_or(15);

                let min_tech = max_tech - 15;

                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&WASTELAND);
                    secondary_color.copy_from_slice(&WASTELAND);

                    if let Some(owner) = prov.owner.as_ref() {
                        primary_color.copy_from_slice(&excluded_color);
                        secondary_color.copy_from_slice(&excluded_color);

                        if !include {
                            continue;
                        }

                        let owner = if let Some(c) = self.query.country(owner) {
                            c
                        } else {
                            continue;
                        };

                        let c_tech = i16::from(owner.technology.adm_tech)
                            + i16::from(owner.technology.dip_tech)
                            + i16::from(owner.technology.mil_tech);
                        let c_tech = c_tech.max(min_tech);
                        let ratio = ((c_tech - min_tech) as f64) / ((max_tech - min_tech) as f64);
                        let color = [
                            (min_color[0] + ratio * diff_color[0]).round() as u8,
                            (min_color[1] + ratio * diff_color[1]).round() as u8,
                            (min_color[2] + ratio * diff_color[2]).round() as u8,
                        ];

                        primary_color[..3].copy_from_slice(&color);
                        secondary_color[..3].copy_from_slice(&color);
                    } else if let Some(prov) = self.game.get_province(&id)
                        && prov.is_habitable()
                    {
                        primary_color.copy_from_slice(&[94, 94, 94, 128]);
                        secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                    }
                }
            }

            MapPayloadKind::Terrain => {}
        }

        result
    }

    fn historical_map_color(&self, date: eu4save::Eu4Date, kind: MapPayloadKind) -> Vec<u8> {
        match kind {
            MapPayloadKind::Religion => {
                let mut timelapse = ReligionTimelapse::new(self);
                timelapse.advance_to(date)
            }
            MapPayloadKind::Battles => {
                let mut timelapse = BattleTimelapse::new(self);
                let prep_date = date.add_days(-365).max(self.query.save().game.start_date);
                let _ = timelapse.advance_to(prep_date);
                timelapse.advance_to(date)
            }
            _ => {
                let mut timelapse = PoliticalTimelapse::new(self);
                timelapse.advance_to(date)
            }
        }
    }

    pub fn timeline_cursor(&self, kind: TimelineKind) -> TimelineCursor {
        TimelineCursor::new(self, kind)
    }

    /// Provinces that were settled or abandoned on a given date: an owner
    /// change with no country on one side. Colonization, a native tribe on
    /// the move, and a colony given up are all of this shape.
    fn settlement_provinces(&self) -> HashSet<(Eu4Date, ProvinceId)> {
        self.province_owners
            .changes
            .iter()
            .filter(|change| change.from == CountryTag::NONE || change.to == CountryTag::NONE)
            .map(|change| (change.date, change.province))
            .collect()
    }

    pub fn timeline_changes(&self, kind: TimelineKind) -> Vec<(Eu4Date, u32)> {
        use std::collections::BTreeMap;

        // The strip counts the changes a player thinks of as history: a
        // province that changes hands between countries, or changes faith.
        // Occupations come and go with every war, and colonies and tribes on
        // the move fill the map with small changes for centuries; both would
        // drown the signal. Changes up to the start date are the scenario's
        // setup, not history: province history reaches back a century before
        // the bookmark, and it all lands on day one of the strip.
        //
        // The counts are read straight from the save. A timelapse would
        // collect the same events, but also every controller change, war,
        // and color change, and then sort them all, only to be dropped.
        let save = self.query.save();
        let start = save.game.start_date;
        match kind {
            TimelineKind::Political => {
                let settlements = self.settlement_provinces();
                let mut changes: BTreeMap<Eu4Date, HashSet<ProvinceId>> = BTreeMap::new();
                for change in &self.province_owners.changes {
                    if change.date > start && !settlements.contains(&(change.date, change.province))
                    {
                        changes
                            .entry(change.date)
                            .or_default()
                            .insert(change.province);
                    }
                }
                changes
                    .into_iter()
                    .map(|(date, provinces)| (date, provinces.len() as u32))
                    .collect()
            }
            TimelineKind::Religion => {
                let settlements = self.settlement_provinces();
                let mut changes: BTreeMap<Eu4Date, HashSet<ProvinceId>> = BTreeMap::new();
                for (id, prov) in save.game.provinces.iter() {
                    for (date, event) in &prov.history.events {
                        if let eu4save::models::ProvinceEvent::Religion(religion) = event
                            && *date > start
                            && self.religion_lookup.index(religion).is_some()
                            && !settlements.contains(&(*date, *id))
                        {
                            changes.entry(*date).or_default().insert(*id);
                        }
                    }
                }
                changes
                    .into_iter()
                    .map(|(date, provinces)| (date, provinces.len() as u32))
                    .collect()
            }
            TimelineKind::Battles => {
                // The strip weighs a day by its casualties, the same measure
                // the battle timelapse paints, so a skirmish does not stand
                // as tall as a decisive battle.
                let previous = save
                    .game
                    .previous_wars
                    .iter()
                    .flat_map(|war| war.history.events.iter());
                let active = save
                    .game
                    .active_wars
                    .iter()
                    .flat_map(|war| war.history.events.iter());
                let mut losses: BTreeMap<Eu4Date, u32> = BTreeMap::new();
                for (date, event) in previous.chain(active) {
                    if let eu4save::models::WarEvent::Battle(b) = event {
                        let total = (b.attacker.losses + b.defender.losses).max(0) as u32;
                        *losses.entry(*date).or_default() += total;
                    }
                }
                losses.into_iter().filter(|(_, x)| *x > 0).collect()
            }
        }
    }
}

enum ProvinceTracking {
    OnlyOwner,
    OwnerAndController,
}

struct OwnerTimelapse {
    wasm: &'static SaveFileImpl,
    country_colors: HashMap<CountryTag, [u8; 4]>,
    current_owners: Vec<(Eu4Date, CountryTag)>,
    current_controllers: Vec<(Eu4Date, CountryTag)>,
    conflicts: HashMap<(CountryTag, CountryTag), Vec<ProvinceId>>,
    event_index: usize,
    tracking: ProvinceTracking,
    events: Vec<PoliticalEvent>,
    /// The state at the start date, kept so a rewind is a copy and not a
    /// second pass over the save.
    initial: OwnerState,
}

#[derive(Clone)]
struct OwnerState {
    country_colors: HashMap<CountryTag, [u8; 4]>,
    current_owners: Vec<(Eu4Date, CountryTag)>,
    current_controllers: Vec<(Eu4Date, CountryTag)>,
}

impl OwnerTimelapse {
    pub fn new(wasm: &SaveFileImpl, tracking: ProvinceTracking) -> Self {
        let country_colors = {
            let mut colors: HashMap<CountryTag, [u8; 4]> = wasm
                .query
                .save()
                .game
                .countries
                .iter()
                .map(|(tag, country)| {
                    let c = country
                        .history
                        .events
                        .iter()
                        .find_map(|(_, event)| match event {
                            CountryEvent::ChangedCountryMapColorFrom(c) => Some(c),
                            _ => None,
                        })
                        .unwrap_or(&country.colors.map_color);

                    (*tag, [c[0], c[1], c[2], 255])
                })
                .collect();

            colors.insert(CountryTag::NONE, [94, 94, 94, 128]);

            colors
        };

        let current_owners: Vec<_> = wasm
            .province_owners
            .initial
            .iter()
            .map(|x| (Eu4Date::from_ymd(1, 1, 1), *x))
            .collect();

        let current_controllers = if matches!(tracking, ProvinceTracking::OwnerAndController) {
            current_owners.clone()
        } else {
            Vec::new()
        };

        let owner_changes = wasm
            .province_owners
            .changes
            .iter()
            .map(|change| PoliticalEvent {
                date: change.date,
                kind: PoliticalEventKind::Owner {
                    province: change.province,
                    new_owner: change.to,
                },
            });

        let color_changes = wasm
            .query
            .save()
            .game
            .countries
            .iter()
            .flat_map(|(tag, c)| {
                let colors: Vec<_> = c
                    .history
                    .events
                    .iter()
                    .filter_map(|(date, event)| match event {
                        CountryEvent::ChangedCountryMapColorFrom(c) => Some((*date, c)),
                        _ => None,
                    })
                    .collect();

                let mut events = Vec::with_capacity(colors.len());

                // There is a color bug where the map color changes day 1 of the campaign.
                // And everything needs to shift down a slot.
                // See: https://pdx.tools/eu4/saves/UJjFWjkNuOyeECXZRGqhI
                let has_color_bug = colors
                    .last()
                    .is_some_and(|(_, col)| **col == c.colors.map_color);

                if has_color_bug {
                    let event_iter = colors.iter().map(|(date, col)| PoliticalEvent {
                        date: *date,
                        kind: PoliticalEventKind::ColorChange {
                            tag: *tag,
                            color: [col[0], col[1], col[2], 255],
                        },
                    });
                    events.extend(event_iter);
                } else {
                    // Otherwise we need to overlap the color changes so that we
                    // can know what the color changes to on a given date.
                    let mut colors_iter = colors.into_iter();
                    if let Some((mut current_date, _)) = colors_iter.next() {
                        for (date, to) in colors_iter {
                            events.push(PoliticalEvent {
                                date: current_date,
                                kind: PoliticalEventKind::ColorChange {
                                    tag: *tag,
                                    color: [to[0], to[1], to[2], 255],
                                },
                            });
                            current_date = date;
                        }

                        let col = c.colors.map_color;
                        events.push(PoliticalEvent {
                            date: current_date,
                            kind: PoliticalEventKind::ColorChange {
                                tag: *tag,
                                color: [col[0], col[1], col[2], 255],
                            },
                        });
                    }
                }

                events.into_iter()
            });

        let mut events: Vec<_> = if matches!(tracking, ProvinceTracking::OwnerAndController) {
            // Saves do not record when a rebel occupied province is lifted
            let rebels = "REB".parse::<CountryTag>().unwrap();
            let controller_changes = wasm
                .query
                .save()
                .game
                .provinces
                .iter()
                .flat_map(|(id, p)| {
                    p.history
                        .events
                        .iter()
                        .map(move |(date, event)| (id, date, event))
                })
                .filter_map(|(id, date, event)| match event {
                    eu4save::models::ProvinceEvent::Controller(x) if x.tag != rebels => {
                        Some((*id, *date, x.tag))
                    }
                    _ => None,
                })
                .map(|(id, date, tag)| PoliticalEvent {
                    date,
                    kind: PoliticalEventKind::Controller {
                        province: id,
                        new_controller: tag,
                    },
                });

            let wars = wasm.query.save().game.previous_wars.iter().map(|war| {
                let ended = war
                    .history
                    .events
                    .last()
                    .map(|(date, _)| *date)
                    .unwrap_or(wasm.query.save().meta.date);
                let attackers: Vec<_> = war
                    .history
                    .events
                    .iter()
                    .filter_map(|(_, event)| match event {
                        eu4save::models::WarEvent::AddAttacker(x) => Some(*x),
                        _ => None,
                    })
                    .collect();

                let defenders: Vec<_> = war
                    .history
                    .events
                    .iter()
                    .filter_map(|(_, event)| match event {
                        eu4save::models::WarEvent::AddDefender(x) => Some(*x),
                        _ => None,
                    })
                    .collect();

                let participants: Vec<_> = attackers
                    .into_iter()
                    .flat_map(|attacker| {
                        defenders.iter().map(move |defender| {
                            if attacker > *defender {
                                (*defender, attacker)
                            } else {
                                (attacker, *defender)
                            }
                        })
                    })
                    .collect();

                PoliticalEvent {
                    date: ended,
                    kind: PoliticalEventKind::WarEnded { participants },
                }
            });

            owner_changes
                .chain(color_changes)
                .chain(controller_changes)
                .chain(wars)
                .collect()
        } else {
            owner_changes.chain(color_changes).collect()
        };

        events.sort_by_key(|a| a.date);

        OwnerTimelapse {
            initial: OwnerState {
                country_colors: country_colors.clone(),
                current_owners: current_owners.clone(),
                current_controllers: current_controllers.clone(),
            },
            country_colors,
            current_owners,
            current_controllers,
            tracking,
            events,
            wasm: unsafe { std::mem::transmute::<&SaveFileImpl, &SaveFileImpl>(wasm) },
            event_index: 0,
            conflicts: HashMap::new(),
        }
    }

    /// Go back to the start date. The sorted events stay; only the running
    /// state is restored.
    fn rewind(&mut self) {
        self.country_colors.clone_from(&self.initial.country_colors);
        self.current_owners.clone_from(&self.initial.current_owners);
        self.current_controllers
            .clone_from(&self.initial.current_controllers);
        self.conflicts.clear();
        self.event_index = 0;
    }

    fn advance_to(&mut self, date: Eu4Date) {
        // let result_len = self.wasm.province_id_to_color_index.len() * 4;
        // let mut result: Vec<u8> = vec![0; result_len * 2];
        let resolver = self.wasm.tag_resolver.at(date);
        // let (primary, secondary) = result.split_at_mut(result_len);

        let remaining_events = &self.events[self.event_index..];
        let pos = remaining_events
            .iter()
            .position(|event| event.date > date)
            .unwrap_or(remaining_events.len());
        let events = &remaining_events[..pos];
        self.event_index += pos;

        for event in events {
            match &event.kind {
                PoliticalEventKind::ColorChange { tag, color } => {
                    self.country_colors.insert(*tag, *color);
                }

                PoliticalEventKind::Owner {
                    province,
                    new_owner,
                } => {
                    // Assume controllership changes on ownership change This is
                    // backed up by two edge case scenarios. One is the
                    // surrender of maine, where a common enemy loses control
                    // ```
                    // date 1445.1.1
                    // tag FRA
                    // declare_war BUR FRA no
                    // tag ENG
                    // declare_war ENG BUR no
                    // control 177 BUR
                    // event flavor_fra.6
                    // ```
                    // The other case is inheriting a PU while at war. The
                    // province controller doesn't change, but the save
                    // re-records controller change after the inheritance
                    // happens.
                    // ```
                    // tag SAX
                    // date 1544.1.1
                    // declare_war SAX BRA no
                    // control 63 BRA
                    // date 1544.1.2
                    // kill
                    // ```
                    let ind = usize::from(province.as_u16());
                    self.current_owners[ind] = (event.date, *new_owner);

                    if matches!(self.tracking, ProvinceTracking::OwnerAndController) {
                        self.current_controllers[ind] = (event.date, *new_owner);
                    }
                }
                PoliticalEventKind::Controller {
                    province,
                    new_controller,
                } => {
                    let ind = usize::from(province.as_u16());
                    let (controller_date, controller_tag) = &mut self.current_controllers[ind];

                    // Require at least one day of separation controllership as
                    // the save records all the tag switches as controlling the
                    // province even if the tag switch hadn't happened yet,
                    // which plays havoc for saves where the player tag switches
                    // into a previously AI run tag.
                    if *controller_date == event.date {
                        continue;
                    }

                    *controller_date = event.date;
                    *controller_tag = *new_controller;

                    let (owner_date, latest_owner) = self.current_owners[ind];
                    let latest_owner = resolver
                        .resolve(latest_owner, owner_date)
                        .or_else(|| resolver.initial(latest_owner))
                        .map(|x| x.current)
                        .unwrap_or(latest_owner);

                    if latest_owner != *new_controller {
                        let combo = if latest_owner > *new_controller {
                            (*new_controller, latest_owner)
                        } else {
                            (latest_owner, *new_controller)
                        };

                        let provs = self.conflicts.entry(combo).or_default();
                        provs.push(*province);
                    }
                }
                PoliticalEventKind::WarEnded { participants } => {
                    for combo in participants {
                        if let Some(provinces) = self.conflicts.remove(combo) {
                            for province in provinces {
                                let ind = usize::from(province.as_u16());
                                let (_, latest_controller) = self.current_controllers[ind];
                                let (_, latest_owner) = self.current_owners[ind];
                                if latest_controller != latest_owner {
                                    self.current_controllers[ind] = (event.date, latest_owner)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

enum Timelapse {
    Political(PoliticalTimelapse),
    Religion(ReligionTimelapse),
    Battles(BattleTimelapse),
}

impl std::fmt::Debug for Timelapse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Timelapse::Political(_) => write!(f, "Timelapse::Political"),
            Timelapse::Religion(_) => write!(f, "Timelapse::Religion"),
            Timelapse::Battles(_) => write!(f, "Timelapse::Battles"),
        }
    }
}

impl Timelapse {
    fn advance_to(&mut self, date: Eu4Date) -> Vec<u8> {
        match self {
            Timelapse::Political(x) => x.advance_to(date),
            Timelapse::Religion(x) => x.advance_to(date),
            Timelapse::Battles(x) => x.advance_to(date),
        }
    }

    fn rewind(&mut self) {
        match self {
            Timelapse::Political(x) => x.owners.rewind(),
            Timelapse::Religion(x) => x.rewind(),
            Timelapse::Battles(x) => x.rewind(),
        }
    }

    // The number of parts that color is data is divided into. Will be 2 if the
    // primary color and country color is the same.
    fn parts(&self) -> usize {
        match self {
            Timelapse::Political(_) => 2,
            _ => 3,
        }
    }
}

struct PoliticalEvent {
    date: Eu4Date,
    kind: PoliticalEventKind,
}

#[derive(Debug)]
enum PoliticalEventKind {
    Owner {
        province: ProvinceId,
        new_owner: CountryTag,
    },
    Controller {
        province: ProvinceId,
        new_controller: CountryTag,
    },
    WarEnded {
        participants: Vec<(CountryTag, CountryTag)>,
    },
    ColorChange {
        tag: CountryTag,
        color: [u8; 4],
    },
}

struct PoliticalTimelapse {
    wasm: &'static SaveFileImpl,
    owners: OwnerTimelapse,
}

impl PoliticalTimelapse {
    pub fn new(wasm: &SaveFileImpl) -> Self {
        let owners = OwnerTimelapse::new(wasm, ProvinceTracking::OwnerAndController);

        Self {
            wasm: unsafe { std::mem::transmute::<&SaveFileImpl, &SaveFileImpl>(wasm) },
            owners,
        }
    }

    fn advance_to(&mut self, date: Eu4Date) -> Vec<u8> {
        let result_len = self.wasm.province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 2];
        let resolver = self.wasm.tag_resolver.at(date);
        let (primary, secondary) = result.split_at_mut(result_len);
        self.owners.advance_to(date);

        for province in self.wasm.game.provinces() {
            let prov_ind = usize::from(province.id.as_u16());
            let color = 'color: {
                if !province.is_habitable() {
                    break 'color &WASTELAND;
                }

                let Some((date, owner)) = self.owners.current_owners.get(prov_ind) else {
                    break 'color &WASTELAND;
                };

                let tag = resolver
                    .resolve(*owner, *date)
                    .map(|x| x.current)
                    .unwrap_or(*owner);

                self.owners
                    .country_colors
                    .get(&tag)
                    .unwrap_or(&[94, 94, 94, 128])
            };

            let secondary_color = 'color: {
                if !province.is_habitable() {
                    break 'color &WASTELAND;
                }

                let Some((date, tag)) = self.owners.current_controllers.get(prov_ind) else {
                    break 'color &WASTELAND;
                };

                let tag = resolver
                    .resolve(*tag, *date)
                    .map(|x| x.current)
                    .unwrap_or(*tag);

                self.owners
                    .country_colors
                    .get(&tag)
                    .unwrap_or(&[94, 94, 94, 128])
            };

            let ind = self.wasm.province_id_to_color_index[prov_ind];
            let offset = usize::from(ind) * 4;
            primary[offset..offset + 4].copy_from_slice(color);
            secondary[offset..offset + 4].copy_from_slice(secondary_color);
        }

        result
    }
}

struct ReligionEvent {
    date: Eu4Date,
    kind: ReligionEventKind,
}

#[derive(Debug)]
enum ReligionEventKind {
    ProvReligion {
        province: ProvinceId,
        new_religion: ReligionIndex,
    },
    TagReligion {
        tag: CountryTag,
        new_religion: ReligionIndex,
    },
}

struct ReligionTimelapse {
    wasm: &'static SaveFileImpl,
    owners: OwnerTimelapse,
    country_religions: HashMap<CountryTag, ReligionIndex>,
    religion_colors: HashMap<ReligionIndex, [u8; 4]>,

    current_religions: Vec<ReligionIndex>,
    event_index: usize,
    events: Vec<ReligionEvent>,
    initial: ReligionState,
}

#[derive(Clone)]
struct ReligionState {
    country_religions: HashMap<CountryTag, ReligionIndex>,
    current_religions: Vec<ReligionIndex>,
}

impl ReligionTimelapse {
    pub fn new(wasm: &SaveFileImpl) -> Self {
        let owners = OwnerTimelapse::new(wasm, ProvinceTracking::OnlyOwner);

        let religion_colors = wasm
            .query
            .save()
            .game
            .religions
            .iter()
            .map(|(religion, _)| religion)
            .filter_map(|religion| {
                wasm.game.religion(religion).and_then(|gr| {
                    wasm.religion_lookup
                        .index(religion)
                        .map(|index| (index, [gr.color[0], gr.color[1], gr.color[2], 255]))
                })
            })
            .collect::<HashMap<_, _>>();

        let country_religions = wasm
            .query
            .save()
            .game
            .countries
            .iter()
            .filter_map(|(tag, country)| {
                country
                    .history
                    .religion
                    .as_ref()
                    .or_else(|| {
                        // Colonial nations don't store what religion they
                        // started as. And annexed nations don't store their
                        // latest religion. The proper solution would be to copy
                        // the game's logic. From grotaclas:
                        //
                        // > I just did a quick test as Castile and created two
                        // > CNs. One had only animist provinces and started as
                        // > animist and the other had only sunni provinces and
                        // > started as sunni. But in both cases the starting
                        // > ruler was catholic.
                        //
                        // This seems like a lot of work to emulate for not too
                        // much gain, so we just grab the monarch's religion as
                        // an approximation
                        country
                            .history
                            .events
                            .iter()
                            .filter_map(|(_, e)| e.as_monarch())
                            .find_map(|m| m.religion.as_ref())
                    })
                    .or(country.religion.as_ref())
                    .and_then(|religion| wasm.religion_lookup.index(religion))
                    .map(|index| (*tag, index))
            })
            .collect::<HashMap<_, _>>();

        let mut events =
            Vec::with_capacity(wasm.province_owners.changes.len() + wasm.game.total_provinces());

        for (id, prov) in wasm.query.save().game.provinces.iter() {
            let extend = prov
                .history
                .events
                .iter()
                .filter_map(|(date, event)| match event {
                    eu4save::models::ProvinceEvent::Religion(new_religion) => wasm
                        .religion_lookup
                        .index(new_religion)
                        .map(|i| ReligionEvent {
                            date: *date,
                            kind: ReligionEventKind::ProvReligion {
                                province: *id,
                                new_religion: i,
                            },
                        }),
                    _ => None,
                });
            events.extend(extend);
        }

        for (tag, country) in &wasm.query.save().game.countries {
            let extend = country
                .history
                .events
                .iter()
                .filter_map(|(date, event)| match event {
                    CountryEvent::Religion(new_religion) => wasm
                        .religion_lookup
                        .index(new_religion)
                        .map(|i| ReligionEvent {
                            date: *date,
                            kind: ReligionEventKind::TagReligion {
                                tag: *tag,
                                new_religion: i,
                            },
                        }),
                    _ => None,
                });
            events.extend(extend);
        }

        events.sort_by_key(|a| a.date);

        let default_religion = wasm
            .religion_lookup
            .index(&String::from("noreligion"))
            .unwrap_or_else(|| {
                let (first_religion, _) = &wasm.query.save().game.religions[0];
                wasm.religion_lookup.index(first_religion).unwrap()
            });

        let mut current_religions = vec![default_religion; owners.current_owners.len()];
        for (id, prov) in &wasm.query.save().game.provinces {
            let first_religion = prov
                .history
                .religion
                .as_ref()
                .and_then(|x| wasm.religion_lookup.index(x));

            let Some(first_religion) = first_religion else {
                continue;
            };
            let Some(religion) = current_religions.get_mut(usize::from(id.as_u16())) else {
                continue;
            };
            *religion = first_religion;
        }

        Self {
            initial: ReligionState {
                country_religions: country_religions.clone(),
                current_religions: current_religions.clone(),
            },
            owners,
            current_religions,
            country_religions,
            religion_colors,
            events,
            wasm: unsafe { std::mem::transmute::<&SaveFileImpl, &SaveFileImpl>(wasm) },
            event_index: 0,
        }
    }

    fn rewind(&mut self) {
        self.owners.rewind();
        self.country_religions
            .clone_from(&self.initial.country_religions);
        self.current_religions
            .clone_from(&self.initial.current_religions);
        self.event_index = 0;
    }

    fn advance_to(&mut self, date: Eu4Date) -> Vec<u8> {
        let result_len = self.wasm.province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 3];
        let resolver = self.wasm.tag_resolver.at(date);
        let (religion_colors, country_colors) = result.split_at_mut(result_len * 2);
        let (primary, secondary) = religion_colors.split_at_mut(result_len);

        self.owners.advance_to(date);

        let remaining_events = &self.events[self.event_index..];
        let pos = remaining_events
            .iter()
            .position(|event| event.date > date)
            .unwrap_or(remaining_events.len());
        let events = &remaining_events[..pos];
        self.event_index += pos;

        for event in events {
            match event.kind {
                ReligionEventKind::ProvReligion {
                    province,
                    new_religion,
                } => {
                    let ind = usize::from(province.as_u16());
                    self.current_religions[ind] = new_religion;
                }
                ReligionEventKind::TagReligion { tag, new_religion } => {
                    self.country_religions.insert(tag, new_religion);
                }
            }
        }

        for province in self.wasm.game.provinces() {
            let prov_ind = usize::from(province.id.as_u16());
            let (primary_color, country_color) = 'color: {
                if !province.is_habitable() {
                    break 'color (&WASTELAND, &WASTELAND);
                }

                let Some((date, owner)) = self.owners.current_owners.get(prov_ind) else {
                    break 'color (&WASTELAND, &WASTELAND);
                };

                if owner.is_none() {
                    break 'color (&[94, 94, 94, 128], &[94, 94, 94, 128]);
                }

                let tag = resolver
                    .resolve(*owner, *date)
                    .map(|x| x.stored)
                    .unwrap_or(*owner);

                let owner_religion_color = self
                    .country_religions
                    .get(&tag)
                    .and_then(|religion| self.religion_colors.get(religion))
                    .unwrap_or(&[94, 94, 94, 128]);

                let country_color = self
                    .owners
                    .country_colors
                    .get(&tag)
                    .unwrap_or(&[94, 94, 94, 128]);
                (owner_religion_color, country_color)
            };

            let secondary_color = 'color: {
                // If the owner doesn't have a religion color then also mark the
                // province as not having a religion color. This is so we don't
                // clutter the map by showing colors for unowned provinces.
                if primary_color == &[94, 94, 94, 128] {
                    break 'color primary_color;
                }

                if !province.is_habitable() {
                    break 'color &WASTELAND;
                }

                let Some(religion) = self.current_religions.get(prov_ind) else {
                    break 'color &WASTELAND;
                };

                self.religion_colors
                    .get(religion)
                    .unwrap_or(&[94, 94, 94, 128])
            };

            let ind = self.wasm.province_id_to_color_index[prov_ind];
            let offset = usize::from(ind) * 4;
            primary[offset..offset + 4].copy_from_slice(primary_color);
            secondary[offset..offset + 4].copy_from_slice(secondary_color);
            country_colors[offset..offset + 4].copy_from_slice(country_color);
        }

        result
    }
}

struct BattleEvent {
    date: Eu4Date,
    province: ProvinceId,
    kind: BattleEventKind,
}

#[derive(Debug)]
enum BattleEventKind {
    Battle { losses: i32 },
}

/// The shortest a battle's stripe stays on the map, in campaign days. At
/// playback pace (a year a second) this is a quarter of a second.
const BATTLE_FLASH_MIN_DAYS: i32 = 90;

/// The longest a stripe stays after a jump forward, so a scrub across a
/// century shows the battles of its last year and not all of them.
const BATTLE_FLASH_MAX_DAYS: i32 = 365;

struct BattleTimelapse {
    wasm: &'static SaveFileImpl,
    owners: OwnerTimelapse,
    current_losses: Vec<i32>,
    /// Days after the start of the latest battle in each province, or
    /// `i32::MIN` for a province that has seen none yet.
    last_battle: Vec<i32>,
    /// The date of the previous frame, if the cursor moved forward to reach
    /// this one. A rewind clears it.
    previous: Option<Eu4Date>,
    event_index: usize,
    events: Vec<BattleEvent>,
}

impl BattleTimelapse {
    pub fn new(wasm: &SaveFileImpl) -> Self {
        let owners = OwnerTimelapse::new(wasm, ProvinceTracking::OnlyOwner);

        let previous_events = wasm
            .query
            .save()
            .game
            .previous_wars
            .iter()
            .flat_map(|war| war.history.events.iter());
        let active_events = wasm
            .query
            .save()
            .game
            .active_wars
            .iter()
            .flat_map(|war| war.history.events.iter());
        let war_events = previous_events.chain(active_events);

        let battles = war_events.filter_map(|(date, event)| match event {
            eu4save::models::WarEvent::Battle(b) => {
                Some((*date, b.location, b.attacker.losses + b.defender.losses))
            }
            _ => None,
        });

        let mut events: Vec<_> = battles
            .map(|(date, province, losses)| BattleEvent {
                date,
                province,
                kind: BattleEventKind::Battle { losses },
            })
            .collect();

        events.sort_by_key(|a| a.date);

        let current_losses = vec![0; owners.current_owners.len()];
        let last_battle = vec![i32::MIN; owners.current_owners.len()];
        Self {
            owners,
            current_losses,
            last_battle,
            previous: None,
            events,
            wasm: unsafe { std::mem::transmute::<&SaveFileImpl, &SaveFileImpl>(wasm) },
            event_index: 0,
        }
    }

    fn rewind(&mut self) {
        self.owners.rewind();
        self.current_losses.fill(0);
        self.last_battle.fill(i32::MIN);
        self.previous = None;
        self.event_index = 0;
    }

    /// How far back a battle can be and still stripe its province. A frame
    /// that follows another covers at least the days between them, so no
    /// battle falls between two frames unseen; the window is otherwise
    /// bounded so a stripe reads as a flash at any pace.
    fn flash_window(&self, date: Eu4Date) -> i32 {
        let step = self
            .previous
            .map(|previous| previous.days_until(&date))
            .unwrap_or(0);
        step.clamp(BATTLE_FLASH_MIN_DAYS, BATTLE_FLASH_MAX_DAYS)
    }

    fn advance_to(&mut self, date: Eu4Date) -> Vec<u8> {
        let result_len = self.wasm.province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 3];
        let resolver = self.wasm.tag_resolver.at(date);
        let (religion_colors, country_colors) = result.split_at_mut(result_len * 2);
        let (primary, secondary) = religion_colors.split_at_mut(result_len);

        self.owners.advance_to(date);

        let remaining_events = &self.events[self.event_index..];
        let pos = remaining_events
            .iter()
            .position(|event| event.date > date)
            .unwrap_or(remaining_events.len());
        let events = &remaining_events[..pos];
        self.event_index += pos;

        let start = self.wasm.query.save().game.start_date;
        for event in events {
            let ind = usize::from(event.province.as_u16());

            match event.kind {
                BattleEventKind::Battle { losses } => {
                    self.last_battle[ind] = start.days_until(&event.date);
                    self.current_losses[ind] += losses;
                }
            }
        }

        // The stripe is a flash: a province keeps it only while its latest
        // battle is within the window behind this frame.
        let flash_since = start.days_until(&date) - self.flash_window(date);
        self.previous = Some(date);

        let max_losses = self.current_losses.iter().max().copied().unwrap_or(0);
        let min_color = [203., 213., 225.];
        let diff_color = [244. - 203., 63. - 213., 94. - 225.];

        for province in self.wasm.game.provinces() {
            let prov_ind = usize::from(province.id.as_u16());
            let (primary_color, country_color) = 'color: {
                if !province.is_habitable() {
                    break 'color (WASTELAND, &WASTELAND);
                }

                let Some((date, owner)) = self.owners.current_owners.get(prov_ind) else {
                    break 'color (WASTELAND, &WASTELAND);
                };

                let tag = resolver
                    .resolve(*owner, *date)
                    .map(|x| x.stored)
                    .unwrap_or(*owner);

                let losses = self.current_losses.get(prov_ind).copied().unwrap_or(0);
                let ratio = losses as f64 / max_losses as f64;
                let battle_color = [
                    (min_color[0] + ratio * diff_color[0]).round() as u8,
                    (min_color[1] + ratio * diff_color[1]).round() as u8,
                    (min_color[2] + ratio * diff_color[2]).round() as u8,
                    255,
                ];

                let country_color = self
                    .owners
                    .country_colors
                    .get(&tag)
                    .unwrap_or(&[94, 94, 94, 128]);
                (battle_color, country_color)
            };

            let secondary_color = primary_color;
            let ind = self.wasm.province_id_to_color_index[prov_ind];
            let offset = usize::from(ind) * 4;
            primary[offset..offset + 4].copy_from_slice(&primary_color);
            secondary[offset..offset + 4].copy_from_slice(&secondary_color);
            country_colors[offset..offset + 4].copy_from_slice(country_color);
        }

        let flashing = self
            .last_battle
            .iter()
            .zip(&self.wasm.province_id_to_color_index)
            .filter(|(last, _)| **last >= flash_since);
        for (_, ind) in flashing {
            let offset = usize::from(*ind) * 4;
            secondary[offset..offset + 4].copy_from_slice(&[15, 23, 42, 255]);
        }

        result
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct TimelineCursor {
    timelapse: Timelapse,
    start: Eu4Date,
    current: Eu4Date,
    end: Eu4Date,
}

#[wasm_bindgen]
impl TimelineCursor {
    fn new(save: &SaveFileImpl, kind: TimelineKind) -> Self {
        let start = save.query.save().game.start_date;
        let end = save.query.save().meta.date;
        let timelapse = match kind {
            TimelineKind::Political => Timelapse::Political(PoliticalTimelapse::new(save)),
            TimelineKind::Religion => Timelapse::Religion(ReligionTimelapse::new(save)),
            TimelineKind::Battles => Timelapse::Battles(BattleTimelapse::new(save)),
        };
        Self {
            timelapse,
            start,
            current: start,
            end,
        }
    }

    pub fn advance_to(&mut self, day: i32) -> TimelapseItem {
        let next_date = self.start.add_days(day).clamp(self.start, self.end);
        if next_date < self.current {
            self.timelapse.rewind();
        }
        let data = self.timelapse.advance_to(next_date);
        self.current = next_date;
        TimelapseItem {
            days: self.start.days_until(&next_date),
            data,
        }
    }

    #[wasm_bindgen]
    pub fn parts(&self) -> usize {
        self.timelapse.parts()
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct TimelapseItem {
    /// Days after the timeline start, after the cursor clamped the request.
    /// The date itself is derived on the JS side from the same calendar.
    days: i32,
    data: Vec<u8>,
}

impl std::fmt::Debug for TimelapseItem {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TimelapseItem")
            .field("days", &self.days)
            .field("data_len", &self.data.len())
            .finish()
    }
}

#[wasm_bindgen]
impl TimelapseItem {
    #[wasm_bindgen(getter)]
    pub fn days(&self) -> i32 {
        self.days
    }

    #[wasm_bindgen]
    pub fn data(self) -> Vec<u8> {
        self.data
    }
}
