use eu5save::models::{Gamestate, LocationIndexedVec};

pub(crate) fn location_building_levels(game: &Gamestate<'_>) -> LocationIndexedVec<f64> {
    let mut levels = game.locations.create_index(0.0);
    for building in game.building_manager.database.iter() {
        if let Some(idx) = game.locations.get(building.location)
            && game.locations.index(idx).location().owner == building.owner
        {
            levels[idx] += building.level;
        }
    }
    levels
}
