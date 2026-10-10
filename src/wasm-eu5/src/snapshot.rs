use serde::Serialize;
use std::collections::BTreeMap;
use tsify::Tsify;

#[derive(Debug, Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Default, Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
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
pub fn extract(game: &eu5save::models::Gamestate<'_>) -> SaveSnapshot {
    let meta = &game.metadata;
    let date = eu5app::Eu5DateComponents::from(meta.date);
    let location_names: BTreeMap<_, _> = meta
        .compatibility
        .locations_iter()
        .map(|(id, name)| (id.value(), name))
        .collect();
    let markets = game
        .market_manager
        .database
        .iter_with_id()
        .flat_map(|(id, market)| {
            let location_names = &location_names;
            market.goods.iter().map(move |good| MarketObservation {
                center: market.center.value(),
                center_name: location_names
                    .get(&market.center.value())
                    .map(|name| name.to_string()),
                market_id: id.value(),
                good: good.good.to_str().to_owned(),
                price: finite(good.price),
                supply: finite(good.supply),
                demand: finite(good.demand),
                stockpile: finite(good.stockpile),
            })
        })
        .collect();
    let market_centers: BTreeMap<_, _> = game
        .market_manager
        .database
        .iter_with_id()
        .map(|(id, market)| (id.value(), market.center.value()))
        .collect();
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
        total.births += finite(eu5app::population::location_yearly_births(location)).unwrap_or(0.0);
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
        {
            if !total.market_centers.contains(&center) {
                total.market_centers.push(center);
            }
        }
        for &id in location.population.pops {
            if let Some(pop) = game.population.database.lookup(id) {
                if let Some(religion) = game.religion_manager.lookup(pop.religion) {
                    add_named(
                        &mut total.religions,
                        religion.key.to_str(),
                        (pop.size * 1000.0).floor(),
                    );
                }
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
