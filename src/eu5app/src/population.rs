//! Population change rates derived from the save.

use eu5save::models::{Gamestate, Location};

/// People per unit of a pop's `size`. The save stores pop sizes in
/// thousands; [`Gamestate::location_population`] applies the same scale.
pub const POP_SIZE_SCALE: f64 = 1000.0;

/// The top of a pop's `literacy` range. The save stores literacy as a
/// percentage, not as a fraction of 1.
pub const LITERACY_SCALE: f64 = 100.0;

/// Number of population ticks in a year. The game shows the recorded
/// changes as "Last month change".
const TICKS_PER_YEAR: f64 = 12.0;

/// Converts a per-tick rate to the yearly rate the game shows. The game
/// defines the monthly pool as `population * yearly_growth / 12`, so the
/// inverse is a linear scale, not a compound one.
pub fn annualize_monthly_rate(monthly: f64) -> f64 {
    monthly * TICKS_PER_YEAR
}

/// The people born in a location in a year at the rate of the last
/// population tick, in the same unit as [`Gamestate::location_population`].
pub fn location_yearly_births(location: &Location<'_>) -> f64 {
    // `location_population` scales pop sizes, the changes keep the raw pop
    // size unit.
    annualize_monthly_rate(location.population.changes.reproduction.total() * POP_SIZE_SCALE)
}

/// The yearly reproduction rate of a location: the people born in the last
/// population tick as a fraction of the location's population, scaled to a
/// year the same way the game shows "Yearly Population Growth".
///
/// The save records only what the last tick did, not the growth formula, so
/// this is the realized rate at the save date. A location without population
/// has a rate of zero.
pub fn location_reproduction_rate(gamestate: &Gamestate<'_>, location: &Location<'_>) -> f64 {
    let population = gamestate.location_population(location);
    if population <= 0.0 {
        return 0.0;
    }

    location_yearly_births(location) / population
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn yearly_rate_matches_game_formula() {
        assert_eq!(annualize_monthly_rate(0.0), 0.0);
        assert_eq!(annualize_monthly_rate(0.01), 0.12);
    }
}
