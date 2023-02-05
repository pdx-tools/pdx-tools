use crate::{LocalizedTag, SaveFileImpl};
use eu4game::SaveGameQuery;
use eu4save::CountryTag;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Serialize, Deserialize, PartialEq, Clone, Copy)]
pub enum TagsState {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "alive")]
    Alive,
    #[serde(rename = "dead")]
    Dead,
    #[serde(rename = "none")]
    None,
}

#[derive(Serialize, Deserialize, PartialEq, Clone, Copy)]
pub enum AiTagsState {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "alive")]
    Alive,
    #[serde(rename = "great")]
    Great,
    #[serde(rename = "dead")]
    Dead,
    #[serde(rename = "none")]
    None,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub struct TagFilterPayloadRaw {
    players: TagsState,
    ai: AiTagsState,
    #[serde(default)]
    subcontinents: Vec<String>,
    #[serde(default)]
    include: Vec<String>,
    #[serde(default)]
    exclude: Vec<String>,
    include_subjects: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub struct TagFilterPayload {
    pub players: TagsState,
    pub ai: AiTagsState,
    pub subcontinents: Vec<String>,
    pub include: Vec<CountryTag>,
    pub exclude: Vec<CountryTag>,
    pub include_subjects: bool,
}

impl From<TagFilterPayloadRaw> for TagFilterPayload {
    fn from(x: TagFilterPayloadRaw) -> Self {
        let include = x
            .include
            .iter()
            .filter_map(|x| x.parse::<CountryTag>().ok())
            .collect();
        let exclude = x
            .exclude
            .iter()
            .filter_map(|x| x.parse::<CountryTag>().ok())
            .collect();
        TagFilterPayload {
            players: x.players,
            ai: x.ai,
            subcontinents: x.subcontinents,
            include,
            exclude,
            include_subjects: x.include_subjects,
        }
    }
}

impl SaveFileImpl {
    pub fn matching_countries(&self, payload: TagFilterPayloadRaw) -> Vec<LocalizedTag> {
        let payload = TagFilterPayload::from(payload);
        let save_game_query = SaveGameQuery::new(&self.query, &self.game);

        let mut result: Vec<_> = self
            .matching_tags(&payload)
            .into_iter()
            .map(|tag| LocalizedTag {
                tag,
                name: save_game_query.localize_country(&tag),
            })
            .collect();

        result.sort_unstable_by_key(|x| x.tag);

        result
    }

    pub fn matching_tags(&self, payload: &TagFilterPayload) -> HashSet<CountryTag> {
        let provs_in_subcontinent: HashSet<_> = payload
            .subcontinents
            .iter()
            .filter_map(|superregion| self.game.superregion_regions(superregion))
            .flatten()
            .filter_map(|region| self.game.region_areas(region))
            .flatten()
            .filter_map(|area| self.game.area_provinces(area))
            .flatten()
            .collect();

        let existing_tags: HashSet<_> = self
            .province_owners
            .initial
            .iter()
            .filter_map(|x| x.as_ref())
            .chain(self.province_owners.changes.iter().map(|x| &x.tag))
            .chain(
                self.query
                    .save()
                    .game
                    .provinces
                    .values()
                    .filter_map(|x| x.owner.as_ref()),
            )
            .collect();

        let mut tags: HashSet<CountryTag> = HashSet::new();
        tags.extend(payload.include.iter());

        let players: HashSet<_> = self.all_players().into_iter().collect();
        for (tag, country) in &self.query.save().game.countries {
            if tag.as_bytes() == b"---" || !existing_tags.contains(tag) {
                continue;
            }

            let insert = if players.contains(tag) {
                match (payload.players, country.num_of_cities) {
                    (TagsState::All, _) => true,
                    (TagsState::Dead, x) if x == 0 => true,
                    (TagsState::Alive, x) if x != 0 => true,
                    _ => false,
                }
            } else {
                match (payload.ai, country) {
                    (AiTagsState::All, _) => true,
                    (AiTagsState::Dead, x) if x.num_of_cities == 0 => true,
                    (AiTagsState::Alive, x) if x.num_of_cities != 0 => true,
                    (AiTagsState::Great, x) if x.is_great_power => true,
                    _ => false,
                }
            };

            let geographically_relevant = provs_in_subcontinent.is_empty()
                || provs_in_subcontinent.contains(&country.capital);

            if insert && geographically_relevant {
                tags.insert(*tag);
                if payload.include_subjects {
                    tags.extend(country.subjects.iter());
                }
            }
        }

        for tag in &payload.exclude {
            tags.remove(tag);
        }

        tags
    }
}
