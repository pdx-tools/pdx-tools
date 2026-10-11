use crate::lean_market::MarketManager;
use arena_serde::ArenaDeserialize;
use eu5app::snapshot::{MarketGood, SaveSnapshot, SnapshotInput};
use eu5save::models::*;
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
pub fn extract(game: &ProjectedGame<'_>) -> SaveSnapshot {
    eu5app::snapshot::extract(
        SnapshotInput {
            metadata: &game.metadata,
            population: &game.population,
            countries: &game.countries,
            locations: &game.locations,
            building_manager: &game.building_manager,
            religion_manager: &game.religion_manager,
        },
        game.market_manager
            .database
            .iter_with_id()
            .flat_map(|(id, market)| {
                market.goods.iter().map(move |good| MarketGood {
                    market_id: id.value(),
                    center: market.center.value(),
                    name: good.good.to_str(),
                    price: good.price,
                    supply: good.supply,
                    demand: good.demand,
                    stockpile: good.stockpile,
                })
            }),
        game.market_manager
            .database
            .iter_with_id()
            .map(|(id, market)| (id.value(), market.center.value())),
    )
}
