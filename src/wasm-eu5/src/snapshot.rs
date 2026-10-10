pub use eu5app::snapshot::SaveSnapshot;
use eu5app::snapshot::{MarketGood, SnapshotInput};

pub fn extract(game: &eu5save::models::Gamestate<'_>) -> SaveSnapshot {
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
