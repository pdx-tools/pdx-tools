use crate::lean_market::MarketManager;
use crate::snapshot::{CountryObservation, MarketObservation, SaveSnapshot};
use arena_serde::ArenaDeserialize;
use eu5save::models::*;
use std::collections::BTreeMap;
#[derive(ArenaDeserialize)]
pub struct ProjectedGame<'bump> {
    pub metadata: Metadata<'bump>,
    pub population: PopulationDirectory<'bump>,
    pub countries: Countries<'bump>,
    pub locations: Locations<'bump>,
    pub market_manager: MarketManager<'bump>,
    pub building_manager: BuildingManager<'bump>,
    pub religion_manager: ReligionManager<'bump>,
}
impl ProjectedGame<'_> {
    fn location_population(&self, location: &Location<'_>) -> f64 {
        location
            .population
            .pops
            .iter()
            .filter_map(|id| {
                self.population
                    .database
                    .lookup(*id)
                    .map(|p| (p.size * 1000.0).floor())
            })
            .sum()
    }
}
include!(concat!(env!("OUT_DIR"), "/snapshot_extract.rs"));
