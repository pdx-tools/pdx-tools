use crate::{
    tag_filter::{TagFilterPayload, TagFilterPayloadRaw},
    LocalizedObj, LocalizedTag, SaveFileImpl,
};
use eu4game::SaveGameQuery;
use eu4save::{models::Province, query::NationEventKind, CountryTag, ProvinceId};
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
        let save = self.query.save();
        save.game
            .countries
            .get(tag)
            .and_then(|x| self.game.get_province(&x.capital))
            .map(|x| (x.center_x, x.center_y))
            .unwrap_or((3000, 600))
    }

    pub fn map_quick_tip(
        &self,
        province_id: i32,
        payload: MapPayload,
    ) -> Option<MapQuickTipPayload> {
        let province_id = ProvinceId::new(province_id);
        let province = self.query.save().game.provinces.get(&province_id)?;
        let controller_tag = province.controller.as_ref()?;
        let controller = self.query.save().game.countries.get(controller_tag)?;
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

        match payload.kind {
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
                let owner = self.query.save().game.countries.get(owner_tag)?;

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

    pub fn map_colors(&self, province_id_to_color_index: &[u16], payload: MapPayload) -> Vec<u8> {
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
                    tags.is_empty() || prov.owner.as_ref().map_or(false, |x| tags.contains(x)),
                )
            })
            .collect();

        match payload.kind {
            MapPayloadKind::Political => {
                let date = payload
                    .date
                    .map(|x| self.query.save().game.start_date.add_days(x))
                    .and_then(|x| {
                        if x == self.query.save().meta.date {
                            None
                        } else {
                            Some(x)
                        }
                    });
                if let Some(date) = date {
                    let mut tag_swithces = Vec::new();
                    for x in &self.nation_events {
                        let events = x.events.iter().filter(|x| x.date <= date);

                        let mut cur = x.initial;
                        for e in events {
                            if let NationEventKind::TagSwitch(switch) = e.kind {
                                tag_swithces.push((e.date, cur, switch));
                                cur = switch;
                            }
                        }
                    }

                    tag_swithces.sort_unstable_by(|(adate, _, _), (bdate, _, _)| adate.cmp(bdate));
                    let mut switches = tag_swithces.iter();
                    let mut current_switch = switches.next();

                    let mut owners = self.province_owners.initial.clone();
                    let owner_changes = self
                        .province_owners
                        .changes
                        .iter()
                        .take_while(|x| x.date <= date);

                    for change in owner_changes {
                        if let Some((switch_date, from, to)) = current_switch {
                            if switch_date < &change.date {
                                for owner in owners.iter_mut().filter_map(|x| x.as_mut()) {
                                    if owner == from {
                                        *owner = *to;
                                    }
                                }

                                current_switch = switches.next();
                            }
                        }

                        if let Some(owner) = owners.get_mut(usize::from(change.province.as_u16())) {
                            *owner = Some(change.tag);
                        }
                    }

                    let country_colors: HashMap<&CountryTag, [u8; 4]> = self
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

                    for (id, owner) in owners.iter().enumerate() {
                        let offset = match province_id_to_color_index.get(id) {
                            Some(&ind) => ind as usize * 4,
                            None => continue,
                        };

                        let primary_color = &mut primary[offset..offset + 4];
                        let secondary_color = &mut secondary[offset..offset + 4];

                        primary_color.copy_from_slice(&[255, 255, 255, 0]);
                        secondary_color.copy_from_slice(&[255, 255, 255, 0]);
                        if let Some(owner_tag) = owner {
                            if let Some(known_color) = country_colors.get(owner_tag) {
                                primary_color.copy_from_slice(known_color);
                                secondary_color.copy_from_slice(known_color);
                            }
                        }
                    }

                    return result;
                }

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
                        if prov.terrain != schemas::eu4::Terrain::Wasteland
                            && prov.terrain != schemas::eu4::Terrain::Ocean
                        {
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
                        let controller = self
                            .query
                            .save()
                            .game
                            .countries
                            .get(controller_tag)
                            .unwrap();

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
                        if prov.terrain != schemas::eu4::Terrain::Wasteland
                            && prov.terrain != schemas::eu4::Terrain::Ocean
                        {
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
                        if prov.terrain != schemas::eu4::Terrain::Wasteland
                            && prov.terrain != schemas::eu4::Terrain::Ocean
                        {
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
                    .save()
                    .game
                    .countries
                    .values()
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

                        let owner = if let Some(c) = self.query.save().game.countries.get(owner) {
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
}
