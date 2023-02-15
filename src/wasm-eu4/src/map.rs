use crate::{
    tag_filter::{TagFilterPayload, TagFilterPayloadRaw},
    LocalizedObj, LocalizedTag, SaveFileImpl,
};
use eu4game::SaveGameQuery;
use eu4save::{
    models::{CountryEvent, Province},
    CountryTag, ProvinceId,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, str::FromStr};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MapPayloadKind {
    Political,
    Religion,
    Development,
    Technology,
    Terrain,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub struct MapPayload {
    kind: MapPayloadKind,
    tag_filter: TagFilterPayloadRaw,
    show_secondary_color: bool,
    paint_subject_in_overlord_hue: bool,
    date: Option<i32>,
}

// #[derive(Serialize, Deserialize, Clone)]
// #[serde(tag = "kind", rename_all = "camelCase")]
// pub enum MapPayload {
//     #[serde(rename_all = "camelCase")]
//     Political {
//         tag_filter: TagFilterPayloadRaw,
//         show_secondary_color: bool,
//         paint_subject_in_overlord_hue: bool,
//         date: Option<i32>,
//     },

//     #[serde(rename_all = "camelCase")]
//     Religion {
//         tag_filter: TagFilterPayloadRaw,
//         show_secondary_color: bool,
//     },

//     #[serde(rename_all = "camelCase")]
//     Development {
//         tag_filter: TagFilterPayloadRaw,
//     },

//     #[serde(rename_all = "camelCase")]
//     Technology {
//         tag_filter: TagFilterPayloadRaw,
//     },

//     Terrain,
// }

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
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
    ) -> Option<MapQuickTipPayload> {
        let province_id = ProvinceId::new(province_id);
        let province = self.query.save().game.provinces.get(&province_id)?;
        let controller_tag = province.controller.as_ref()?;
        let controller = self.query.country(controller_tag)?;
        let owner_tag = province.owner.as_ref()?;

        let sq = SaveGameQuery::new(&self.query, &self.game);
        let local_owner = LocalizedTag {
            name: sq.localize_country(owner_tag),
            tag: *owner_tag,
        };

        let local_controller = LocalizedTag {
            name: sq.localize_country(controller_tag),
            tag: *controller_tag,
        };

        match payload {
            MapPayloadKind::Political => Some(MapQuickTipPayload::Political {
                province_id,
                province_name: province.name.clone(),
                owner: local_owner,
                controller: local_controller,
            }),

            MapPayloadKind::Religion => {
                let religion_in_province_id = province.religion.as_deref()?;
                let religion_in_province = self.game.religion(religion_in_province_id)?;
                let state_religion_id = controller.religion.as_deref()?;
                let state_religion = self.game.religion(state_religion_id)?;

                let religion_in_province = LocalizedObj {
                    id: String::from(religion_in_province_id),
                    name: String::from(religion_in_province.name),
                };

                let state_religion = LocalizedObj {
                    id: String::from(state_religion_id),
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
            _ => None,
        }
    }

    pub fn map_colors(&self, payload: MapPayload) -> Vec<u8> {
        let province_id_to_color_index = &self.province_id_to_color_index;
        let result_len: usize = province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 2];
        let (primary, secondary) = result.split_at_mut(result_len);

        if matches!(
            payload.kind,
            MapPayloadKind::Political | MapPayloadKind::Religion
        ) {
            let date = payload
                .date
                .map(|x| self.query.save().game.start_date.add_days(x));

            if let Some(date) = date {
                return self.historical_map_color(province_id_to_color_index, date, payload.kind);
            }
        }

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
                    tags.is_empty() || prov.owner.as_ref().map_or(false, |x| tags.contains(x)),
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

                    primary_color.copy_from_slice(&[255, 255, 255, 0]);
                    secondary_color.copy_from_slice(&[255, 255, 255, 0]);

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

                            if payload.show_secondary_color {
                                if let Some(known_color) = country_colors.get(controller_tag) {
                                    secondary_color.copy_from_slice(known_color);
                                }
                            }
                        }
                    } else if let Some(prov) = self.game.get_province(&id) {
                        if prov.is_habitable() {
                            primary_color.copy_from_slice(&[94, 94, 94, 128]);
                            secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                        }
                    }
                }
            }

            MapPayloadKind::Religion => {
                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&[255, 255, 255, 0]);
                    secondary_color.copy_from_slice(&[255, 255, 255, 0]);

                    if let Some(controller_tag) = prov.controller.as_ref() {
                        let controller = self.query.country(controller_tag).unwrap();

                        primary_color.copy_from_slice(&excluded_color);
                        secondary_color.copy_from_slice(&excluded_color);

                        if !include {
                            continue;
                        }

                        if let Some(prov_religion) = prov.religion.as_ref() {
                            if let Some(known_color) =
                                self.game.religion(prov_religion).map(|x| x.color)
                            {
                                primary_color[..3].copy_from_slice(&known_color);
                                primary_color[3] = 255;
                                secondary_color[..3].copy_from_slice(&known_color);
                                secondary_color[3] = 255;
                            }

                            if payload.show_secondary_color {
                                if let Some(known_color) = controller
                                    .religion
                                    .as_ref()
                                    .and_then(|x| self.game.religion(x))
                                    .map(|x| x.color)
                                {
                                    secondary_color[..3].copy_from_slice(&known_color);
                                    secondary_color[3] = 255;
                                }
                            }
                        }
                    } else if let Some(prov) = self.game.get_province(&id) {
                        if prov.is_habitable() {
                            primary_color.copy_from_slice(&[94, 94, 94, 128]);
                            secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                        }
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
                    .max_by(|a, b| a.partial_cmp(b).unwrap())
                    .unwrap_or(0.0);
                let max_dev = max_dev.min(50.0).max(10.0);

                for (&id, prov, include) in provs {
                    let offset = province_id_to_color_index[usize::from(id.as_u16())] as usize * 4;
                    let primary_color = &mut primary[offset..offset + 4];
                    let secondary_color = &mut secondary[offset..offset + 4];

                    primary_color.copy_from_slice(&[255, 255, 255, 0]);
                    secondary_color.copy_from_slice(&[255, 255, 255, 0]);

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
                    } else if let Some(prov) = self.game.get_province(&id) {
                        if prov.is_habitable() {
                            primary_color.copy_from_slice(&[94, 94, 94, 128]);
                            secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                        }
                    }
                }
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

                    primary_color.copy_from_slice(&[255, 255, 255, 0]);
                    secondary_color.copy_from_slice(&[255, 255, 255, 0]);

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
                    } else if let Some(prov) = self.game.get_province(&id) {
                        if prov.terrain != schemas::eu4::Terrain::Wasteland
                            && prov.terrain != schemas::eu4::Terrain::Ocean
                        {
                            primary_color.copy_from_slice(&[94, 94, 94, 128]);
                            secondary_color.copy_from_slice(&[94, 94, 94, 128]);
                        }
                    }
                }
            }

            MapPayloadKind::Terrain => {}
        }

        result
    }

    fn last_province_owners_at(
        &self,
        date: eu4save::Eu4Date,
    ) -> Vec<Option<(eu4save::Eu4Date, CountryTag)>> {
        let owner_changes = self
            .province_owners
            .changes
            .iter()
            .filter(|change| change.date <= date);
        let mut last_owners = vec![None; self.province_owners.initial.len()];
        for change in owner_changes {
            let ind = usize::from(change.province.as_u16());
            last_owners[ind] = Some((change.date, change.tag));
        }

        last_owners
    }

    fn historical_religion_map_color(
        &self,
        province_id_to_color_index: &[u16],
        date: eu4save::Eu4Date,
    ) -> Vec<u8> {
        let result_len: usize = province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 2];
        let (primary, secondary) = result.split_at_mut(result_len);
        let last_owners = self.last_province_owners_at(date);

        let country_religions = self
            .query
            .save()
            .game
            .countries
            .iter()
            .map(|(tag, country)| {
                country
                    .history
                    .events
                    .iter()
                    .take_while(|(evt_date, _)| *evt_date <= date)
                    .flat_map(|(_, events)| {
                        events.0.iter().filter_map(|evt| match evt {
                            CountryEvent::Religion(religion) => Some(religion),
                            _ => None,
                        })
                    })
                    .last()
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
                            .flat_map(|(_, events)| events.0.iter())
                            .find_map(|evt| evt.as_monarch())
                            .and_then(|monarch| monarch.religion.as_ref())
                    })
                    .or_else(|| country.history.religion.as_ref())
                    .and_then(|religion| self.religion_lookup.index(religion))
                    .map(|index| (*tag, index))
            })
            .filter_map(|x| x)
            .collect::<HashMap<_, _>>();

        let province_religions = self.province_religions();

        let religion_changes = province_religions
            .changes
            .iter()
            .filter(|change| change.date <= date);
        let mut last_religion = province_religions.initial.clone();
        for change in religion_changes {
            let ind = usize::from(change.province.as_u16());
            last_religion[ind] = Some(change.religion);
        }

        let prov_religions = self
            .game
            .provinces()
            .filter(|prov| prov.is_habitable())
            .filter_map(|prov| {
                last_religion
                    .get(usize::from(prov.id.as_u16()))
                    .and_then(|religion| {
                        last_owners
                            .get(usize::from(prov.id.as_u16()))
                            .map(|owner| (religion, owner))
                    })
                    .map(move |(religion, owner)| (prov, religion, owner))
            });

        let color_map = self
            .query
            .save()
            .game
            .religions
            .iter()
            .map(|(religion, _)| religion)
            .filter_map(|religion| {
                self.game.religion(religion).and_then(|gr| {
                    self.religion_lookup
                        .index(religion)
                        .map(|index| (index, [gr.color[0], gr.color[1], gr.color[2], 255]))
                })
            })
            .collect::<HashMap<_, _>>();

        for (prov, religion, owner) in prov_religions {
            let prov_ind = usize::from(prov.id.as_u16());
            let mut province_color = religion
                .and_then(|religion| color_map.get(&religion))
                .unwrap_or(&[94, 94, 94, 128]);

            let owner_religion_color = owner
                .and_then(|(date, tag)| self.tag_resolver.resolve(tag, date))
                .map(|x| x.current)
                .or_else(|| {
                    let init = self.province_owners.initial[prov_ind];
                    init.and_then(|x| self.tag_resolver.initial(x))
                        .map(|x| x.current)
                        .or(init)
                })
                .and_then(|tag| country_religions.get(&tag))
                .and_then(|religion| color_map.get(&religion))
                .unwrap_or(&[94, 94, 94, 128]);

            let ind = province_id_to_color_index[prov_ind];
            let offset = usize::from(ind) * 4;

            // If the owner doesn't have a religion color then also mark the
            // province as not having a religion color. This is so we don't
            // clutter the map by showing colors for unowned provinces.
            if owner_religion_color == &[94, 94, 94, 128] {
                province_color = &owner_religion_color;
            }

            primary[offset..offset + 4].copy_from_slice(owner_religion_color);
            secondary[offset..offset + 4].copy_from_slice(province_color);
        }

        result
    }

    fn historical_political_map_color(
        &self,
        province_id_to_color_index: &[u16],
        date: eu4save::Eu4Date,
    ) -> Vec<u8> {
        let result_len: usize = province_id_to_color_index.len() * 4;
        let mut result: Vec<u8> = vec![0; result_len * 2];
        let (primary, secondary) = result.split_at_mut(result_len);
        let resolver = self.tag_resolver.at(date);
        let last_owners = self.last_province_owners_at(date);

        let no_owner: CountryTag = "---".parse().unwrap();
        let country_colors = {
            let mut colors: HashMap<&CountryTag, [u8; 4]> = self
                .query
                .save()
                .game
                .countries
                .iter()
                .map(|(tag, country)| {
                    let c = &country.colors.map_color;
                    (tag, [c[0], c[1], c[2], 255])
                })
                .collect();

            colors.insert(&no_owner, [94, 94, 94, 128]);
            colors
        };

        let prov_owners = self
            .game
            .provinces()
            .filter(|prov| prov.is_habitable())
            .filter_map(|prov| {
                last_owners
                    .get(usize::from(prov.id.as_u16()))
                    .map(move |owner| (prov, owner))
            });

        for (prov, owner) in prov_owners {
            let prov_ind = usize::from(prov.id.as_u16());
            let color = owner
                .and_then(|(date, tag)| resolver.resolve(tag, date))
                .map(|x| x.current)
                .or_else(|| {
                    let init = self.province_owners.initial[prov_ind];
                    init.and_then(|x| resolver.initial(x))
                        .map(|x| x.current)
                        .or(init)
                })
                .and_then(|tag| country_colors.get(&tag))
                .unwrap_or(&[94, 94, 94, 128]);

            let ind = province_id_to_color_index[prov_ind];
            let offset = usize::from(ind) * 4;
            primary[offset..offset + 4].copy_from_slice(color);
            secondary[offset..offset + 4].copy_from_slice(color);
        }

        result
    }

    fn historical_map_color(
        &self,
        province_id_to_color_index: &[u16],
        date: eu4save::Eu4Date,
        kind: MapPayloadKind,
    ) -> Vec<u8> {
        match kind {
            MapPayloadKind::Religion => {
                self.historical_religion_map_color(province_id_to_color_index, date)
            }
            MapPayloadKind::Political | _ => {
                self.historical_political_map_color(province_id_to_color_index, date)
            }
        }
    }
}
