use super::{LocalizedTag, SaveFileImpl};
use eu4game::SaveGameQuery;
use eu4save::CountryTag;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

mod models;
pub use models::*;

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub struct TagFilterPayload {
    pub players: TagsState,
    pub ai: AiTagsState,
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

        let mut tags: HashSet<CountryTag> = payload.include.iter().copied().collect();
        if payload.include_subjects {
            let included_subjects = payload
                .include
                .iter()
                .filter_map(|tag| self.query.country(tag))
                .flat_map(|x| x.subjects.iter());
            tags.extend(included_subjects);
        }

        let players: HashSet<_> = self.all_players().into_iter().collect();
        for (tag, country) in &self.query.save().game.countries {
            if tag.is_none() || !existing_tags.contains(tag) {
                continue;
            }

            let insert = if players.contains(tag) {
                matches!(
                    (payload.players, country.num_of_cities),
                    (TagsState::All, _) | (TagsState::Dead, 0) | (TagsState::Alive, _)
                )
            } else {
                match (payload.ai, country) {
                    (AiTagsState::All, _) => true,
                    (AiTagsState::Dead, x) if x.num_of_cities == 0 => true,
                    (AiTagsState::Alive, x) if x.num_of_cities != 0 => true,
                    (AiTagsState::Great, x) if x.is_great_power && x.raw_development > 100.0 => {
                        true
                    }
                    _ => false,
                }
            };

            if insert {
                tags.insert(*tag);
                if payload.include_subjects {
                    tags.extend(country.subjects.iter());
                }
            }
        }

        // If the user wants to view great tags but there fewer than 8 alive
        // great powers then use the best historical great powers
        if tags.len() < 8 && payload.ai == AiTagsState::Great {
            let mut great_scores: Vec<_> = self
                .query
                .save()
                .game
                .countries
                .iter()
                .map(|(tag, c)| (c.great_power_score, tag))
                .filter(|(score, tag)| *score > 1. && !tags.contains(tag))
                .collect();
            great_scores.sort_unstable_by(|(ascore, _), (bscore, _)| {
                ascore.partial_cmp(bscore).unwrap().reverse()
            });
            let dead_greats = great_scores
                .iter()
                .map(|(_, tag)| tag)
                .take(8 - tags.len())
                .copied();
            tags.extend(dead_greats)
        }

        for tag in &payload.exclude {
            tags.remove(tag);
        }

        tags
    }
}
