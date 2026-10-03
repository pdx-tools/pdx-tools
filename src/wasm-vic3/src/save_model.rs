//! A single deserialization of the save that gives both the `vic3save` model
//! and the map data of `vic3app`. The two models read some of the same
//! fields, thus a country is read once into a model that has the fields of
//! both and then split.

use serde::Deserialize;
use std::collections::HashMap;
use vic3app::{
    CountryId, DynamicName, SaveColor, SaveCountry, SaveManager, SavePact, SaveState,
    SaveWarManager, StateId, Vic3MapSave, deserialize_reference,
};
use vic3save::{
    markets::Vic3Building,
    savefile::{
        Counters, MetaData, Player, PopStatistics, Vic3Country, Vic3CountryBudget, Vic3Manager,
        Vic3Save,
    },
    stats::Vic3CountryStats,
};

#[derive(Debug, Deserialize)]
struct CountryModel {
    definition: String,
    country_type: Option<String>,
    government: Option<String>,
    budget: Vic3CountryBudget,
    gdp: Vic3CountryStats,
    literacy: Vic3CountryStats,
    prestige: Vic3CountryStats,
    avgsoltrend: Vic3CountryStats,
    pop_statistics: PopStatistics,
    #[serde(default)]
    states: Vec<StateId>,
    #[serde(default, deserialize_with = "deserialize_reference")]
    capital: Option<StateId>,
    map_color: Option<SaveColor>,
    dynamic_name: Option<DynamicName>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SaveModel {
    meta_data: MetaData,
    counters: Counters,
    country_manager: SaveManager<CountryId, CountryModel>,
    building_manager: Vic3Manager<Vic3Building>,
    previous_played: Vec<Player>,
    states: SaveManager<StateId, SaveState>,
    pacts: Option<Vic3Manager<SavePact>>,
    #[serde(default)]
    war_manager: SaveWarManager,
}

impl SaveModel {
    pub(crate) fn split(self) -> (Vic3Save, Vic3MapSave) {
        let mut database = HashMap::with_capacity(self.country_manager.database.len());
        let mut map_countries = HashMap::new();
        for (id, country) in self.country_manager.database {
            let Some(country) = country else {
                database.insert(id.value(), None);
                continue;
            };

            map_countries.insert(
                id,
                SaveCountry {
                    definition: country.definition.clone(),
                    country_type: country.country_type,
                    capital: country.capital,
                    map_color: country.map_color,
                    dynamic_name: country.dynamic_name,
                },
            );

            let country = Vic3Country {
                definition: country.definition,
                government: country.government,
                budget: country.budget,
                gdp: country.gdp,
                literacy: country.literacy,
                prestige: country.prestige,
                avgsoltrend: country.avgsoltrend,
                pop_statistics: country.pop_statistics,
                states: country.states.into_iter().map(StateId::value).collect(),
            };
            database.insert(id.value(), Some(country));
        }

        let save = Vic3Save {
            meta_data: self.meta_data,
            counters: self.counters,
            country_manager: Vic3Manager { database },
            building_manager: self.building_manager,
            previous_played: self.previous_played,
        };

        (
            save,
            Vic3MapSave::new(map_countries, self.states)
                .with_diplomacy(self.pacts, self.war_manager),
        )
    }
}
