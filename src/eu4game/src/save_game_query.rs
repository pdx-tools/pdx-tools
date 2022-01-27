use crate::game::Game;
use eu4save::{query::Query, CountryTag};

pub struct SaveGameQuery<'a> {
    query: &'a Query,
    game: &'a Game<'a>,
}

impl<'a> SaveGameQuery<'a> {
    pub fn new(query: &'a Query, game: &'a Game<'a>) -> Self {
        SaveGameQuery { query, game }
    }

    pub fn localize_country(&self, tag: &CountryTag) -> String {
        self.game
            .localize_country(tag)
            .or_else(|| {
                self.query
                    .country(tag)
                    .and_then(|x| x.name.as_ref())
                    .map(|x| x.to_string())
            })
            .unwrap_or_else(|| tag.to_string())
    }
}
