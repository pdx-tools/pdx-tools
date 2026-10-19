//! The country and market tables of a campaign snapshot.
//!
//! The tables are columns, so the analysis store keeps each snapshot as a few
//! typed arrays. A missing value is NaN. Country values are f64. Market and
//! breakdown values are f32, because they are most of the rows and charts do
//! not need more precision.
use eu5save::models::{Gamestate, LocationRank};
use std::collections::HashMap;

/// The version of the campaign analysis payload: the map projection and
/// these tables. Increase it when their schema, calculations, or precision
/// change, so that the store does not mix old and new snapshots.
pub const EXTRACTOR_VERSION: u32 = 1;

/// A country column, in table order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CountryMetric {
    Population,
    Development,
    Wealth,
    Tax,
    EffectiveDevelopment,
    StateCapacity,
    Births,
    RuralPopulation,
    UrbanPopulation,
    RgoLevels,
    BuildingLevels,
    BuildingEmployment,
    Income,
    GreatPowerRank,
}

impl CountryMetric {
    pub const ALL: [CountryMetric; 14] = [
        CountryMetric::Population,
        CountryMetric::Development,
        CountryMetric::Wealth,
        CountryMetric::Tax,
        CountryMetric::EffectiveDevelopment,
        CountryMetric::StateCapacity,
        CountryMetric::Births,
        CountryMetric::RuralPopulation,
        CountryMetric::UrbanPopulation,
        CountryMetric::RgoLevels,
        CountryMetric::BuildingLevels,
        CountryMetric::BuildingEmployment,
        CountryMetric::Income,
        CountryMetric::GreatPowerRank,
    ];

    /// The name that the web app uses for this column.
    pub fn name(self) -> &'static str {
        match self {
            CountryMetric::Population => "population",
            CountryMetric::Development => "development",
            CountryMetric::Wealth => "wealth",
            CountryMetric::Tax => "tax",
            CountryMetric::EffectiveDevelopment => "effectiveDevelopment",
            CountryMetric::StateCapacity => "stateCapacity",
            CountryMetric::Births => "births",
            CountryMetric::RuralPopulation => "ruralPopulation",
            CountryMetric::UrbanPopulation => "urbanPopulation",
            CountryMetric::RgoLevels => "rgoLevels",
            CountryMetric::BuildingLevels => "buildingLevels",
            CountryMetric::BuildingEmployment => "buildingEmployment",
            CountryMetric::Income => "income",
            CountryMetric::GreatPowerRank => "greatPowerRank",
        }
    }
}

/// A composition of a country, in table order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Breakdown {
    /// Population by religion.
    Religions,
    /// RGO levels by raw material.
    Materials,
    /// Building levels by building type.
    Buildings,
}

impl Breakdown {
    pub const ALL: [Breakdown; 3] = [
        Breakdown::Religions,
        Breakdown::Materials,
        Breakdown::Buildings,
    ];
}

/// A market column, in table order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarketMetric {
    Price,
    Supply,
    Demand,
    Stockpile,
}

impl MarketMetric {
    pub const ALL: [MarketMetric; 4] = [
        MarketMetric::Price,
        MarketMetric::Supply,
        MarketMetric::Demand,
        MarketMetric::Stockpile,
    ];

    pub fn name(self) -> &'static str {
        match self {
            MarketMetric::Price => "price",
            MarketMetric::Supply => "supply",
            MarketMetric::Demand => "demand",
            MarketMetric::Stockpile => "stockpile",
        }
    }
}

/// The country and market observations of one save.
///
/// Text values are indices into `strings`. Each country row has its range
/// of breakdown rows and market centers, given by the offset columns.
#[derive(Debug, Default, PartialEq)]
pub struct SnapshotTables {
    pub strings: Vec<String>,

    /// The full country ID (`UiCountryId`), one for each country.
    pub country_ids: Vec<u32>,
    pub country_tags: Vec<u32>,
    pub country_locations: Vec<u32>,
    /// `CountryMetric::ALL.len()` values for each country.
    pub country_values: Vec<f64>,
    /// For country `i` and breakdown `k`, the rows are from
    /// `breakdown_offsets[i * 3 + k]` to `breakdown_offsets[i * 3 + k + 1]`.
    pub breakdown_offsets: Vec<u32>,
    /// The string key of each breakdown row.
    pub breakdown_keys: Vec<u32>,
    pub breakdown_values: Vec<f32>,
    /// Country `i` has the market centers from `country_market_offsets[i]`
    /// to `country_market_offsets[i + 1]`.
    pub country_market_offsets: Vec<u32>,
    /// Location IDs of the market centers that the country owns locations in.
    pub country_markets: Vec<u32>,

    /// The location ID of the market center, one for each market and good.
    pub market_centers: Vec<u32>,
    pub market_center_names: Vec<u32>,
    pub market_goods: Vec<u32>,
    /// `MarketMetric::ALL.len()` values for each market and good.
    pub market_values: Vec<f32>,
}

#[derive(Default)]
struct Strings {
    values: Vec<String>,
    index: HashMap<String, u32>,
}

impl Strings {
    fn intern(&mut self, value: &str) -> u32 {
        if let Some(&index) = self.index.get(value) {
            return index;
        }
        let index = self.values.len() as u32;
        self.values.push(value.to_owned());
        self.index.insert(value.to_owned(), index);
        index
    }
}

#[derive(Default)]
struct CountryRow {
    id: u32,
    tag: u32,
    locations: u32,
    values: [f64; CountryMetric::ALL.len()],
    breakdowns: [Vec<(u32, f64)>; Breakdown::ALL.len()],
    markets: Vec<u32>,
}

impl CountryRow {
    fn add(&mut self, metric: CountryMetric, value: f64) {
        self.values[metric as usize] += finite(value);
    }

    fn add_breakdown(&mut self, kind: Breakdown, key: u32, value: f64) {
        let rows = &mut self.breakdowns[kind as usize];
        match rows.iter_mut().find(|(k, _)| *k == key) {
            Some((_, total)) => *total += value,
            None => rows.push((key, value)),
        }
    }
}

fn finite(value: f64) -> f64 {
    if value.is_finite() { value } else { 0.0 }
}

fn or_missing(value: f64) -> f32 {
    let value = value as f32;
    if value.is_finite() { value } else { f32::NAN }
}

/// Copy the country and market observations out of a parsed save.
pub fn extract(game: &Gamestate<'_>) -> SnapshotTables {
    let mut strings = Strings::default();
    let location_names: HashMap<_, _> = game
        .metadata()
        .compatibility
        .locations_iter()
        .map(|(id, name)| (id.value(), name))
        .collect();

    let mut market_centers = Vec::new();
    let mut market_center_names = Vec::new();
    let mut market_goods = Vec::new();
    let mut market_values = Vec::new();
    let mut centers_by_market = HashMap::new();
    for (market_id, market) in game.market_manager.database.iter_with_id() {
        let center = market.center.value();
        centers_by_market.insert(market_id.value(), center);
        let name = location_names
            .get(&center)
            .map(|name| strings.intern(name))
            .unwrap_or(u32::MAX);
        for good in market.goods.iter() {
            market_centers.push(center);
            market_center_names.push(name);
            market_goods.push(strings.intern(good.good.to_str()));
            market_values.extend(MarketMetric::ALL.map(|metric| {
                or_missing(match metric {
                    MarketMetric::Price => good.price,
                    MarketMetric::Supply => good.supply,
                    MarketMetric::Demand => good.demand,
                    MarketMetric::Stockpile => good.stockpile,
                })
            }));
        }
    }

    let mut rows: Vec<CountryRow> = Vec::new();
    let mut row_of = HashMap::new();
    for entry in game.locations.iter() {
        let location = entry.location();
        // The dummy country holds the unowned locations.
        if location.owner.real_id().is_none() {
            continue;
        }
        let Some(owner) = game.countries.get_entry(location.owner) else {
            continue;
        };
        let row = *row_of.entry(owner.id().value()).or_insert_with(|| {
            let data = owner.data();
            let mut row = CountryRow {
                id: owner.id().value(),
                tag: strings.intern(owner.tag().to_str()),
                ..Default::default()
            };
            row.values[CountryMetric::Income as usize] = data
                .map(|d| finite(d.estimated_monthly_income_trade_and_tax))
                .unwrap_or(0.0);
            row.values[CountryMetric::GreatPowerRank as usize] = data
                .map(|d| d.great_power_rank)
                .filter(|&rank| rank > 0)
                .map_or(f64::NAN, f64::from);
            rows.push(row);
            rows.len() - 1
        });
        let total = &mut rows[row];
        let population = game.location_population(location);
        let development = finite(location.development);
        let effective = finite(location.control * development);
        total.locations += 1;
        total.add(CountryMetric::Population, population);
        total.add(CountryMetric::Development, development);
        total.add(CountryMetric::Wealth, location.possible_tax);
        total.add(CountryMetric::Tax, location.tax);
        total.add(CountryMetric::EffectiveDevelopment, effective);
        total.add(CountryMetric::StateCapacity, population * effective);
        total.add(
            CountryMetric::Births,
            crate::population::location_yearly_births(location),
        );
        match location.rank {
            LocationRank::RuralSettlement => total.add(CountryMetric::RuralPopulation, population),
            LocationRank::Town | LocationRank::City | LocationRank::Megalopolis => {
                total.add(CountryMetric::UrbanPopulation, population)
            }
            _ => {}
        }
        let rgo = finite(location.rgo_level);
        total.add(CountryMetric::RgoLevels, rgo);
        if let Some(material) = location.raw_material {
            let key = strings.intern(material.to_str());
            total.add_breakdown(Breakdown::Materials, key, rgo);
        }
        if let Some(&center) = location
            .market
            .and_then(|id| centers_by_market.get(&id.value()))
            && !total.markets.contains(&center)
        {
            total.markets.push(center);
        }
        for &id in location.population.pops {
            if let Some(pop) = game.population.database.lookup(id)
                && let Some(religion) = game.religion_manager.lookup(pop.religion)
            {
                let key = strings.intern(religion.key.to_str());
                total.add_breakdown(Breakdown::Religions, key, (pop.size * 1000.0).floor());
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
        let Some(&row) = row_of.get(&owner.id().value()) else {
            continue;
        };
        let total = &mut rows[row];
        let levels = finite(building.level);
        total.add(CountryMetric::BuildingLevels, levels);
        total.add(
            CountryMetric::BuildingEmployment,
            building.employed * 1000.0,
        );
        let key = strings.intern(building.kind.to_str());
        total.add_breakdown(Breakdown::Buildings, key, levels);
    }

    let mut tables = SnapshotTables {
        breakdown_offsets: vec![0],
        country_market_offsets: vec![0],
        market_centers,
        market_center_names,
        market_goods,
        market_values,
        ..Default::default()
    };
    rows.sort_by_key(|row| row.id);
    for row in rows {
        tables.country_ids.push(row.id);
        tables.country_tags.push(row.tag);
        tables.country_locations.push(row.locations);
        tables.country_values.extend(row.values);
        for kind in Breakdown::ALL {
            for &(key, value) in &row.breakdowns[kind as usize] {
                tables.breakdown_keys.push(key);
                tables.breakdown_values.push(value as f32);
            }
            tables
                .breakdown_offsets
                .push(tables.breakdown_values.len() as u32);
        }
        tables.country_markets.extend(row.markets);
        tables
            .country_market_offsets
            .push(tables.country_markets.len() as u32);
    }
    tables.strings = strings.values;
    tables
}

impl SnapshotTables {
    /// The number of bytes of the columns, without the strings.
    pub fn column_bytes(&self) -> usize {
        4 * (self.country_ids.len()
            + self.country_tags.len()
            + self.country_locations.len()
            + self.breakdown_offsets.len()
            + self.breakdown_keys.len()
            + self.country_market_offsets.len()
            + self.country_markets.len()
            + self.market_centers.len()
            + self.market_center_names.len()
            + self.market_goods.len()
            + self.breakdown_values.len()
            + self.market_values.len())
            + 8 * self.country_values.len()
    }

    /// The values of a country row, or None if the snapshot does not have it.
    pub fn country(&self, id: u32) -> Option<&[f64]> {
        let row = self.country_ids.binary_search(&id).ok()?;
        let width = CountryMetric::ALL.len();
        Some(&self.country_values[row * width..(row + 1) * width])
    }
}
