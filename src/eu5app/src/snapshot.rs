use eu5save::models::*;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct MarketObservation {
    pub center: u32,
    pub center_name: Option<String>,
    pub market_id: u32,
    pub good: String,
    pub price: Option<f64>,
    pub supply: Option<f64>,
    pub demand: Option<f64>,
    pub stockpile: Option<f64>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct CountryObservation {
    pub tag: String,
    pub population: f64,
    pub development: f64,
    pub locations: u32,
    pub wealth: f64,
    pub tax: f64,
    pub effective_development: f64,
    pub state_capacity: f64,
    pub births: f64,
    pub rural_population: f64,
    pub urban_population: f64,
    pub rgo_levels: f64,
    pub building_levels: f64,
    pub building_employment: f64,
    pub income: f64,
    pub great_power_rank: Option<i32>,
    pub religions: BTreeMap<String, f64>,
    pub materials: BTreeMap<String, f64>,
    pub buildings: BTreeMap<String, f64>,
    pub market_centers: Vec<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct SaveSnapshot {
    pub schema_version: u32,
    pub date: String,
    pub date_sort: i32,
    pub campaign_id: String,
    pub version: String,
    pub markets: Vec<MarketObservation>,
    pub countries: Vec<CountryObservation>,
    pub population: f64,
    pub development: f64,
}

/// Borrow only the model sections needed by the history extractor.
pub struct SnapshotInput<'a> {
    pub metadata: &'a Metadata<'a>,
    pub population: &'a PopulationDirectory<'a>,
    pub countries: &'a Countries<'a>,
    pub locations: &'a Locations<'a>,
    pub building_manager: &'a BuildingManager<'a>,
    pub religion_manager: &'a ReligionManager<'a>,
}
impl SnapshotInput<'_> {
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
/// Market values independent of either parser's market representation.
pub struct MarketGood<'a> {
    pub market_id: u32,
    pub center: u32,
    pub name: &'a str,
    pub price: f64,
    pub supply: f64,
    pub demand: f64,
    pub stockpile: f64,
}

fn finite(value: f64) -> Option<f64> {
    value.is_finite().then_some(value)
}

// Reuse existing keys; entry(key.to_owned()) allocates a String for every pop/building.
fn add_named(totals: &mut BTreeMap<String, f64>, key: &str, value: f64) {
    if let Some(total) = totals.get_mut(key) {
        *total += value;
    } else {
        // Keep the same arithmetic as or_default() += value, including signed zero.
        totals.insert(key.to_owned(), 0.0 + value);
    }
}

/// Copy compact observations out of one parsed save; the arena can then be freed.
pub fn extract<'a>(
    game: SnapshotInput<'a>,
    goods: impl Iterator<Item = MarketGood<'a>>,
    centers: impl Iterator<Item = (u32, u32)>,
) -> SaveSnapshot {
    let meta = game.metadata;
    let date = crate::Eu5DateComponents::from(meta.date);
    let location_names: BTreeMap<_, _> = meta
        .compatibility
        .locations_iter()
        .map(|(id, name)| (id.value(), name))
        .collect();
    let markets = goods
        .map(|good| MarketObservation {
            center: good.center,
            center_name: location_names
                .get(&good.center)
                .map(|name| name.to_string()),
            market_id: good.market_id,
            good: good.name.to_owned(),
            price: finite(good.price),
            supply: finite(good.supply),
            demand: finite(good.demand),
            stockpile: finite(good.stockpile),
        })
        .collect();
    let market_centers: BTreeMap<_, _> = centers.collect();
    let mut totals = BTreeMap::<&str, CountryObservation>::new();
    for entry in game.locations.iter() {
        let location = entry.location();
        let Some(owner) = game.countries.get_entry(location.owner) else {
            continue;
        };
        let tag = owner.tag().to_str();
        let total = totals.entry(tag).or_insert_with(|| {
            let data = owner.data();
            CountryObservation {
                tag: tag.to_owned(),
                income: data
                    .map(|d| d.estimated_monthly_income_trade_and_tax)
                    .and_then(finite)
                    .unwrap_or(0.0),
                great_power_rank: data
                    .and_then(|d| (d.great_power_rank > 0).then_some(d.great_power_rank)),
                ..Default::default()
            }
        });
        let pop = game.location_population(location);
        let dev = finite(location.development).unwrap_or(0.0);
        let effective = finite(location.control * dev).unwrap_or(0.0);
        total.population += pop;
        total.development += dev;
        total.locations += 1;
        total.wealth += finite(location.possible_tax).unwrap_or(0.0);
        total.tax += finite(location.tax).unwrap_or(0.0);
        total.effective_development += effective;
        total.state_capacity += pop * effective;
        total.births += finite(crate::population::location_yearly_births(location)).unwrap_or(0.0);
        if matches!(
            location.rank,
            eu5save::models::LocationRank::RuralSettlement
        ) {
            total.rural_population += pop;
        } else if matches!(
            location.rank,
            eu5save::models::LocationRank::Town
                | eu5save::models::LocationRank::City
                | eu5save::models::LocationRank::Megalopolis
        ) {
            total.urban_population += pop;
        }
        let levels = finite(location.rgo_level).unwrap_or(0.0);
        total.rgo_levels += levels;
        if let Some(material) = location.raw_material {
            add_named(&mut total.materials, material.to_str(), levels);
        }
        if let Some(&center) = location
            .market
            .and_then(|id| market_centers.get(&id.value()))
            && !total.market_centers.contains(&center)
        {
            total.market_centers.push(center);
        }
        for &id in location.population.pops {
            if let Some(pop) = game.population.database.lookup(id)
                && let Some(religion) = game.religion_manager.lookup(pop.religion)
            {
                add_named(
                    &mut total.religions,
                    religion.key.to_str(),
                    (pop.size * 1000.0).floor(),
                );
            }
        }
    }
    for building in game.building_manager.database.iter() {
        let Some(idx) = game.locations.get(building.location) else {
            continue;
        };
        let location = game.locations.index(idx).location();
        let Some(owner) = game.countries.get_entry(location.owner) else {
            continue;
        };
        if let Some(total) = totals.get_mut(owner.tag().to_str()) {
            let levels = finite(building.level).unwrap_or(0.0);
            total.building_levels += levels;
            total.building_employment += finite(building.employed * 1000.0).unwrap_or(0.0);
            add_named(&mut total.buildings, building.kind.to_str(), levels);
        }
    }
    let population = totals.values().map(|x| x.population).sum();
    let development = totals.values().map(|x| x.development).sum();
    SaveSnapshot {
        schema_version: 3,
        date: format!("{:04}-{:02}-{:02}", date.year, date.month, date.day),
        date_sort: i32::from(date.year) * 10000 + i32::from(date.month) * 100 + i32::from(date.day),
        campaign_id: meta.playthrough_id.to_str().to_owned(),
        version: format!(
            "{}.{}.{}",
            meta.version.major, meta.version.minor, meta.version.patch
        ),
        markets,
        countries: totals.into_values().collect(),
        population,
        development,
    }
}
