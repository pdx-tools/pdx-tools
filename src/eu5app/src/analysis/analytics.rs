//! Compact columnar country and market tables kept alongside a save's map
//! columns. Text labels are interned in per-snapshot dictionaries and shared
//! across snapshots in the store.

use crate::population::POP_SIZE_SCALE;
use campaign_analysis::{
    ColumnError, Columns, DecodeError, Decoder, Encoder, History, NullableColumn, PayloadError,
    PrefixKey, Prefixed, RowColumns, Series, Table, TableError, TextId, TextRegistry, TextRow,
    Texts, View, check_length,
};
use eu5save::models::{CountryId, Gamestate, LocationId, LocationRank, MarketId};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use super::Eu5Analysis;

/// Aligned country columns of one snapshot, keyed by save [`CountryId`].
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CountryColumns {
    /// Row in the snapshot's `tags` dictionary.
    pub tag: Vec<TextRow>,
    pub population: Vec<f64>,
    pub development: Vec<f64>,
    pub locations: Vec<u32>,
    pub wealth: Vec<f64>,
    pub tax: Vec<f64>,
    pub effective_development: Vec<f64>,
    pub state_capacity: Vec<f64>,
    pub births: Vec<f64>,
    pub rural_population: Vec<f64>,
    pub urban_population: Vec<f64>,
    pub rgo_levels: Vec<f64>,
    pub building_levels: Vec<f64>,
    pub building_employment: Vec<f64>,
    pub income: Vec<f64>,
    pub great_power_rank: NullableColumn<i32>,
}
campaign_analysis::columns!(rows CountryColumns, "countries" {
    tag,
    population,
    development,
    locations,
    wealth,
    tax,
    effective_development,
    state_capacity,
    births,
    rural_population,
    urban_population,
    rgo_levels,
    building_levels,
    building_employment,
    income,
    great_power_rank,
});

impl CountryColumns {
    fn value(&self, row: usize, metric: CountryMetric) -> Option<f64> {
        match metric {
            CountryMetric::Population => self.population.get(row).copied(),
            CountryMetric::Development => self.development.get(row).copied(),
            CountryMetric::Locations => self.locations.get(row).copied().map(f64::from),
            CountryMetric::Wealth => self.wealth.get(row).copied(),
            CountryMetric::Tax => self.tax.get(row).copied(),
            CountryMetric::EffectiveDevelopment => self.effective_development.get(row).copied(),
            CountryMetric::StateCapacity => self.state_capacity.get(row).copied(),
            CountryMetric::Births => self.births.get(row).copied(),
            CountryMetric::RuralPopulation => self.rural_population.get(row).copied(),
            CountryMetric::UrbanPopulation => self.urban_population.get(row).copied(),
            CountryMetric::RgoLevels => self.rgo_levels.get(row).copied(),
            CountryMetric::BuildingLevels => self.building_levels.get(row).copied(),
            CountryMetric::BuildingEmployment => self.building_employment.get(row).copied(),
            CountryMetric::Income => self.income.get(row).copied(),
            CountryMetric::GreatPowerRank => {
                self.great_power_rank.get(row).flatten().map(f64::from)
            }
        }
    }

    fn world_total(&self, metric: CountryMetric) -> Option<f64> {
        let total = match metric {
            CountryMetric::Population => self.population.iter().sum(),
            CountryMetric::Development => self.development.iter().sum(),
            CountryMetric::Locations => self.locations.iter().map(|value| f64::from(*value)).sum(),
            CountryMetric::Wealth => self.wealth.iter().sum(),
            CountryMetric::Tax => self.tax.iter().sum(),
            CountryMetric::EffectiveDevelopment => self.effective_development.iter().sum(),
            CountryMetric::StateCapacity => self.state_capacity.iter().sum(),
            CountryMetric::Births => self.births.iter().sum(),
            CountryMetric::RuralPopulation => self.rural_population.iter().sum(),
            CountryMetric::UrbanPopulation => self.urban_population.iter().sum(),
            CountryMetric::RgoLevels => self.rgo_levels.iter().sum(),
            CountryMetric::BuildingLevels => self.building_levels.iter().sum(),
            CountryMetric::BuildingEmployment => self.building_employment.iter().sum(),
            CountryMetric::Income => self.income.iter().sum(),
            CountryMetric::GreatPowerRank => return None,
        };
        finite(total)
    }

    fn all_finite(&self) -> bool {
        let columns = [
            &self.population,
            &self.development,
            &self.wealth,
            &self.tax,
            &self.effective_development,
            &self.state_capacity,
            &self.births,
            &self.rural_population,
            &self.urban_population,
            &self.rgo_levels,
            &self.building_levels,
            &self.building_employment,
            &self.income,
        ];
        columns
            .iter()
            .all(|column| column.iter().all(|value| value.is_finite()))
    }
}

/// A breakdown entry belonging to a country. The text is a row of the
/// corresponding snapshot text dictionary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CountryText {
    pub country: CountryId,
    pub text: TextRow,
}
impl PrefixKey for CountryText {
    type Prefix = CountryId;
    fn prefix(&self) -> &CountryId {
        &self.country
    }
}

trait BreakdownValues {
    fn column(&self) -> &Vec<f64>;
}

macro_rules! breakdown_columns {
    ($($name:ident => $table:literal),+ $(,)?) => {
        $(
            #[derive(Debug, Clone, Default, PartialEq)]
            pub struct $name {
                pub value: Vec<f64>,
            }
            campaign_analysis::columns!(rows $name, $table { value });
            impl BreakdownValues for $name {
                fn column(&self) -> &Vec<f64> {
                    &self.value
                }
            }
        )+
    };
}

breakdown_columns! {
    CountryReligionColumns => "country_religions",
    CountryMaterialColumns => "country_materials",
    CountryBuildingColumns => "country_buildings",
}

/// A market center that a country has at least one owned location in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CountryMarket {
    pub country: CountryId,
    pub center: LocationId,
}
impl PrefixKey for CountryMarket {
    type Prefix = CountryId;
    fn prefix(&self) -> &CountryId {
        &self.country
    }
}

/// Zero-column table marker for [`CountryMarket`] membership rows.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CountryMarketColumns;
impl Columns for CountryMarketColumns {
    fn encode(&self, _out: &mut Encoder) {}
    fn decode(_input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        Ok(Self)
    }
    fn heap_bytes(&self) -> usize {
        0
    }
    fn allocated_bytes(&self) -> usize {
        0
    }
}
impl RowColumns for CountryMarketColumns {
    fn table_name() -> &'static str {
        "country_markets"
    }
    fn check_rows(&self, _expected: usize) -> Result<(), ColumnError> {
        Ok(())
    }
}

/// Aligned market columns of one snapshot, keyed by save [`MarketId`].
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MarketColumns {
    /// Center location ID (`LocationId::value()`).
    pub center: Vec<u32>,
    /// Optional row in the snapshot's `market_names` dictionary.
    pub center_name: NullableColumn<TextRow>,
}
campaign_analysis::columns!(rows MarketColumns, "markets" {
    center,
    center_name,
});

/// One good in one market, ordered by `(good, market)` so queries for a single
/// good scan one contiguous prefix slice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GoodMarket {
    pub good: TextRow,
    pub market: MarketId,
}
impl PrefixKey for GoodMarket {
    type Prefix = TextRow;
    fn prefix(&self) -> &TextRow {
        &self.good
    }
}

/// Measurements for one good in one market.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MarketGoodColumns {
    pub price: NullableColumn<f64>,
    pub total_taken: NullableColumn<f64>,
    pub supply: NullableColumn<f64>,
    pub demand: NullableColumn<f64>,
    pub stockpile: NullableColumn<f64>,
}
campaign_analysis::columns!(rows MarketGoodColumns, "market_goods" {
    price,
    total_taken,
    supply,
    demand,
    stockpile,
});

impl MarketGoodColumns {
    fn column(&self, metric: MarketMetric) -> &NullableColumn<f64> {
        match metric {
            MarketMetric::Price => &self.price,
            MarketMetric::TotalTaken => &self.total_taken,
            MarketMetric::Supply => &self.supply,
            MarketMetric::Demand => &self.demand,
            MarketMetric::Stockpile => &self.stockpile,
        }
    }

    fn all_finite(&self) -> bool {
        let columns = [
            &self.price,
            &self.total_taken,
            &self.supply,
            &self.demand,
            &self.stockpile,
        ];
        columns
            .iter()
            .all(|column| column.iter().flatten().all(|value| value.is_finite()))
    }
}

/// Columnar country and market observations for one EU5 save.
#[derive(Debug, Clone, PartialEq)]
pub struct Analytics {
    pub countries: Table<CountryId, CountryColumns>,
    pub tags: Texts,
    pub religions: Texts,
    pub materials: Texts,
    pub buildings: Texts,
    pub country_religions: Table<CountryText, CountryReligionColumns, Prefixed>,
    pub country_materials: Table<CountryText, CountryMaterialColumns, Prefixed>,
    pub country_buildings: Table<CountryText, CountryBuildingColumns, Prefixed>,
    pub country_markets: Table<CountryMarket, CountryMarketColumns, Prefixed>,
    pub markets: Table<MarketId, MarketColumns>,
    pub goods: Texts,
    pub market_names: Texts,
    pub market_goods: Table<GoodMarket, MarketGoodColumns, Prefixed>,
}

impl Default for Analytics {
    fn default() -> Self {
        Self {
            countries: Table::sorted(Vec::new(), CountryColumns::default())
                .expect("empty countries table"),
            tags: Texts::default(),
            religions: Texts::default(),
            materials: Texts::default(),
            buildings: Texts::default(),
            country_religions: Table::sorted_prefix(Vec::new(), CountryReligionColumns::default())
                .expect("empty country_religions table"),
            country_materials: Table::sorted_prefix(Vec::new(), CountryMaterialColumns::default())
                .expect("empty country_materials table"),
            country_buildings: Table::sorted_prefix(Vec::new(), CountryBuildingColumns::default())
                .expect("empty country_buildings table"),
            country_markets: Table::sorted_prefix(Vec::new(), CountryMarketColumns)
                .expect("empty country_markets table"),
            markets: Table::sorted(Vec::new(), MarketColumns::default())
                .expect("empty markets table"),
            goods: Texts::default(),
            market_names: Texts::default(),
            market_goods: Table::sorted_prefix(Vec::new(), MarketGoodColumns::default())
                .expect("empty market_goods table"),
        }
    }
}

fn encode_country_text<C: RowColumns>(table: &Table<CountryText, C, Prefixed>, out: &mut Encoder) {
    table.encode_with(out, |keys, out| {
        out.column(
            &keys
                .iter()
                .map(|key| key.country.value())
                .collect::<Vec<_>>(),
        );
        out.column(&keys.iter().map(|key| key.text).collect::<Vec<_>>());
    });
}

fn decode_country_text<C: RowColumns>(
    input: &mut Decoder<'_>,
) -> Result<Table<CountryText, C, Prefixed>, DecodeError> {
    Table::decode_sorted_prefix_with(input, |input| {
        let countries = input.column::<u32>()?;
        let texts = input.column::<TextRow>()?;
        check_length(texts.len(), countries.len()).map_err(DecodeError::Column)?;
        Ok(countries
            .into_iter()
            .zip(texts)
            .map(|(country, text)| CountryText {
                country: CountryId::new(country),
                text,
            })
            .collect())
    })
}

impl Columns for Analytics {
    fn encode(&self, out: &mut Encoder) {
        self.countries.encode_with(out, |keys, out| {
            out.column(&keys.iter().map(|id| id.value()).collect::<Vec<_>>());
        });
        self.tags.encode(out);
        self.religions.encode(out);
        self.materials.encode(out);
        self.buildings.encode(out);
        encode_country_text(&self.country_religions, out);
        encode_country_text(&self.country_materials, out);
        encode_country_text(&self.country_buildings, out);
        self.country_markets.encode_with(out, |keys, out| {
            out.column(
                &keys
                    .iter()
                    .map(|key| key.country.value())
                    .collect::<Vec<_>>(),
            );
            out.column(
                &keys
                    .iter()
                    .map(|key| key.center.value())
                    .collect::<Vec<_>>(),
            );
        });
        self.markets.encode_with(out, |keys, out| {
            out.column(&keys.iter().map(|id| id.value()).collect::<Vec<_>>());
        });
        self.goods.encode(out);
        self.market_names.encode(out);
        self.market_goods.encode_with(out, |keys, out| {
            out.column(&keys.iter().map(|key| key.good).collect::<Vec<_>>());
            out.column(
                &keys
                    .iter()
                    .map(|key| key.market.value())
                    .collect::<Vec<_>>(),
            );
        });
    }

    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        let countries = Table::decode_sorted_with(input, |input| {
            Ok(input
                .column::<u32>()?
                .into_iter()
                .map(CountryId::new)
                .collect())
        })?;
        let tags = Texts::decode(input).map_err(|error| error.in_table("tags"))?;
        let religions = Texts::decode(input).map_err(|error| error.in_table("religions"))?;
        let materials = Texts::decode(input).map_err(|error| error.in_table("materials"))?;
        let buildings = Texts::decode(input).map_err(|error| error.in_table("buildings"))?;
        let country_religions = decode_country_text(input)?;
        let country_materials = decode_country_text(input)?;
        let country_buildings = decode_country_text(input)?;
        let country_markets = Table::decode_sorted_prefix_with(input, |input| {
            let countries = input.column::<u32>()?;
            let centers = input.column::<u32>()?;
            check_length(centers.len(), countries.len()).map_err(DecodeError::Column)?;
            Ok(countries
                .into_iter()
                .zip(centers)
                .map(|(country, center)| CountryMarket {
                    country: CountryId::new(country),
                    center: LocationId::new(center),
                })
                .collect())
        })?;
        let markets = Table::decode_sorted_with(input, |input| {
            Ok(input
                .column::<u32>()?
                .into_iter()
                .map(MarketId::new)
                .collect())
        })?;
        let goods = Texts::decode(input).map_err(|error| error.in_table("goods"))?;
        let market_names = Texts::decode(input).map_err(|error| error.in_table("market_names"))?;
        let market_goods = Table::decode_sorted_prefix_with(input, |input| {
            let goods = input.column::<TextRow>()?;
            let markets = input.column::<u32>()?;
            check_length(markets.len(), goods.len()).map_err(DecodeError::Column)?;
            Ok(goods
                .into_iter()
                .zip(markets)
                .map(|(good, market)| GoodMarket {
                    good,
                    market: MarketId::new(market),
                })
                .collect())
        })?;
        Ok(Self {
            countries,
            tags,
            religions,
            materials,
            buildings,
            country_religions,
            country_materials,
            country_buildings,
            country_markets,
            markets,
            goods,
            market_names,
            market_goods,
        })
    }

    /// Keys for `countries` and `markets` live in store registries; composite
    /// prefix keys are local to the snapshot and count here.
    fn heap_bytes(&self) -> usize {
        self.countries.columns().heap_bytes()
            + self.tags.heap_bytes()
            + self.religions.heap_bytes()
            + self.materials.heap_bytes()
            + self.buildings.heap_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().heap_bytes()
            + size_of_val(self.country_materials.keys())
            + self.country_materials.columns().heap_bytes()
            + size_of_val(self.country_buildings.keys())
            + self.country_buildings.columns().heap_bytes()
            + size_of_val(self.country_markets.keys())
            + self.markets.columns().heap_bytes()
            + self.goods.heap_bytes()
            + self.market_names.heap_bytes()
            + size_of_val(self.market_goods.keys())
            + self.market_goods.columns().heap_bytes()
    }

    fn allocated_bytes(&self) -> usize {
        self.countries.columns().allocated_bytes()
            + self.tags.allocated_bytes()
            + self.religions.allocated_bytes()
            + self.materials.allocated_bytes()
            + self.buildings.allocated_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().allocated_bytes()
            + size_of_val(self.country_materials.keys())
            + self.country_materials.columns().allocated_bytes()
            + size_of_val(self.country_buildings.keys())
            + self.country_buildings.columns().allocated_bytes()
            + size_of_val(self.country_markets.keys())
            + self.markets.columns().allocated_bytes()
            + self.goods.allocated_bytes()
            + self.market_names.allocated_bytes()
            + size_of_val(self.market_goods.keys())
            + self.market_goods.columns().allocated_bytes()
    }
}

fn finite(value: f64) -> Option<f64> {
    value.is_finite().then_some(value)
}

fn build_breakdown<C: RowColumns>(
    entries: BTreeMap<(CountryId, &str), f64>,
    table_name: &'static str,
    build_columns: impl FnOnce(Vec<f64>) -> C,
) -> Result<(Texts, Table<CountryText, C, Prefixed>), TableError> {
    let texts = Texts::new(
        entries
            .keys()
            .map(|(_, text)| *text)
            .collect::<BTreeSet<_>>(),
    )
    .map_err(|error| TableError::Key(error).in_table(table_name))?;
    let (keys, values) = entries
        .into_iter()
        .map(|((country, text), value)| {
            let text = texts.find(text).expect("a collected text");
            (CountryText { country, text }, value)
        })
        .unzip();
    let table = Table::sorted_prefix(keys, build_columns(values))?;
    Ok((texts, table))
}

#[derive(Default)]
struct CountryAccumulator<'a> {
    tag: &'a str,
    population: f64,
    development: f64,
    locations: u32,
    wealth: f64,
    tax: f64,
    effective_development: f64,
    state_capacity: f64,
    births: f64,
    rural_population: f64,
    urban_population: f64,
    rgo_levels: f64,
    building_levels: f64,
    building_employment: f64,
    income: f64,
    great_power_rank: Option<i32>,
}

struct MarketGoodValues {
    price: Option<f64>,
    total_taken: Option<f64>,
    supply: Option<f64>,
    demand: Option<f64>,
    stockpile: Option<f64>,
}

impl Analytics {
    /// Extract country and market tables directly from a parsed save.
    pub fn extract(game: &Gamestate<'_>) -> Result<Self, TableError> {
        let meta = game.metadata();
        let location_names: HashMap<LocationId, &str> =
            meta.compatibility.locations_iter().collect();

        let mut market_rows = BTreeMap::<MarketId, (LocationId, Option<&str>)>::new();
        let mut market_centers = HashMap::<MarketId, LocationId>::new();
        let mut seen_centers = HashSet::<LocationId>::new();
        let mut raw_market_goods = BTreeMap::<(&str, MarketId), MarketGoodValues>::new();
        for (market_id, market) in game.market_manager.database.iter_with_id() {
            if game.locations.get(market.center).is_none() || !seen_centers.insert(market.center) {
                continue;
            }
            let center_name = location_names
                .get(&market.center)
                .copied()
                .filter(|name| !name.is_empty());
            market_rows.insert(market_id, (market.center, center_name));
            market_centers.insert(market_id, market.center);
            for good in market.goods.iter() {
                raw_market_goods.insert(
                    (good.good.to_str(), market_id),
                    MarketGoodValues {
                        price: finite(good.price),
                        total_taken: finite(good.total_taken),
                        supply: finite(good.supply),
                        demand: finite(good.demand),
                        stockpile: finite(good.stockpile),
                    },
                );
            }
        }

        let mut totals = BTreeMap::<CountryId, CountryAccumulator<'_>>::new();
        let mut religions = BTreeMap::<(CountryId, &str), f64>::new();
        let mut materials = BTreeMap::<(CountryId, &str), f64>::new();
        let mut buildings = BTreeMap::<(CountryId, &str), f64>::new();
        let mut country_markets = BTreeSet::<CountryMarket>::new();

        for entry in game.locations.iter() {
            let location = entry.location();
            if location.owner.is_dummy() {
                continue;
            }
            let Some(owner) = game.countries.get_entry(location.owner) else {
                continue;
            };
            let country_id = owner.id();
            let total = totals.entry(country_id).or_insert_with(|| {
                let data = owner.data();
                CountryAccumulator {
                    tag: owner.tag().to_str(),
                    income: data
                        .map(|d| d.monthly_tax_and_trade_income())
                        .and_then(finite)
                        .unwrap_or(0.0),
                    great_power_rank: data
                        .and_then(|d| (d.great_power_rank > 0).then_some(d.great_power_rank)),
                    ..Default::default()
                }
            });
            let pop = finite(game.location_population(location)).unwrap_or(0.0);
            let dev = finite(location.development).unwrap_or(0.0);
            let effective = finite(location.control * dev).unwrap_or(0.0);
            total.population += pop;
            total.development += dev;
            total.locations += 1;
            total.wealth += finite(location.possible_tax).unwrap_or(0.0);
            total.tax += finite(location.tax).unwrap_or(0.0);
            total.effective_development += effective;
            total.state_capacity += finite(pop * effective).unwrap_or(0.0);
            total.births +=
                finite(crate::population::location_yearly_births(location)).unwrap_or(0.0);
            match location.rank {
                LocationRank::RuralSettlement => total.rural_population += pop,
                LocationRank::Town | LocationRank::City | LocationRank::Megalopolis => {
                    total.urban_population += pop;
                }
                _ => {}
            }
            let levels = finite(location.rgo_level).unwrap_or(0.0);
            total.rgo_levels += levels;
            if levels > 0.0
                && let Some(material) = location.raw_material.as_ref()
            {
                *materials
                    .entry((country_id, material.to_str()))
                    .or_default() += levels;
            }
            if let Some(&center) = location.market.and_then(|id| market_centers.get(&id)) {
                country_markets.insert(CountryMarket {
                    country: country_id,
                    center,
                });
            }
            for &id in location.population.pops {
                if let Some(pop) = game.population.database.lookup(id)
                    && let Some(religion) = game.religion_manager.lookup(pop.religion)
                {
                    let size = finite((pop.size * POP_SIZE_SCALE).floor()).unwrap_or(0.0);
                    if size > 0.0 {
                        *religions
                            .entry((country_id, religion.key.to_str()))
                            .or_default() += size;
                    }
                }
            }
        }

        for building in game.building_manager.database.iter() {
            let Some(idx) = game.locations.get(building.location) else {
                continue;
            };
            let location = game.locations.index(idx).location();
            if location.owner.is_dummy() {
                continue;
            }
            let Some(owner) = game.countries.get_entry(location.owner) else {
                continue;
            };
            let country_id = owner.id();
            if let Some(total) = totals.get_mut(&country_id) {
                let levels = finite(building.level).unwrap_or(0.0);
                total.building_levels += levels;
                total.building_employment +=
                    finite(building.employed * POP_SIZE_SCALE).unwrap_or(0.0);
                if levels > 0.0 {
                    *buildings
                        .entry((country_id, building.kind.to_str()))
                        .or_default() += levels;
                }
            }
        }

        let tags = Texts::new(
            totals
                .values()
                .map(|country| country.tag)
                .collect::<BTreeSet<_>>(),
        )
        .map_err(|error| TableError::Key(error).in_table("tags"))?;

        let country_count = totals.len();
        let mut country_ids = Vec::with_capacity(country_count);
        let mut tag_rows = Vec::with_capacity(country_count);
        let mut population = Vec::with_capacity(country_count);
        let mut development = Vec::with_capacity(country_count);
        let mut locations = Vec::with_capacity(country_count);
        let mut wealth = Vec::with_capacity(country_count);
        let mut tax = Vec::with_capacity(country_count);
        let mut effective_development = Vec::with_capacity(country_count);
        let mut state_capacity = Vec::with_capacity(country_count);
        let mut births = Vec::with_capacity(country_count);
        let mut rural_population = Vec::with_capacity(country_count);
        let mut urban_population = Vec::with_capacity(country_count);
        let mut rgo_levels = Vec::with_capacity(country_count);
        let mut building_levels = Vec::with_capacity(country_count);
        let mut building_employment = Vec::with_capacity(country_count);
        let mut income = Vec::with_capacity(country_count);
        let mut great_power_ranks = Vec::with_capacity(country_count);
        for (id, acc) in totals {
            country_ids.push(id);
            tag_rows.push(tags.find(acc.tag).expect("a collected tag"));
            population.push(acc.population);
            development.push(acc.development);
            locations.push(acc.locations);
            wealth.push(acc.wealth);
            tax.push(acc.tax);
            effective_development.push(acc.effective_development);
            state_capacity.push(acc.state_capacity);
            births.push(acc.births);
            rural_population.push(acc.rural_population);
            urban_population.push(acc.urban_population);
            rgo_levels.push(acc.rgo_levels);
            building_levels.push(acc.building_levels);
            building_employment.push(acc.building_employment);
            income.push(acc.income);
            great_power_ranks.push(acc.great_power_rank);
        }

        let countries = Table::sorted(
            country_ids,
            CountryColumns {
                tag: tag_rows,
                population,
                development,
                locations,
                wealth,
                tax,
                effective_development,
                state_capacity,
                births,
                rural_population,
                urban_population,
                rgo_levels,
                building_levels,
                building_employment,
                income,
                great_power_rank: great_power_ranks.into_iter().collect(),
            },
        )?;

        let (religions, country_religions) = build_breakdown(religions, "religions", |value| {
            CountryReligionColumns { value }
        })?;
        let (materials, country_materials) = build_breakdown(materials, "materials", |value| {
            CountryMaterialColumns { value }
        })?;
        let (buildings, country_buildings) = build_breakdown(buildings, "buildings", |value| {
            CountryBuildingColumns { value }
        })?;
        let country_markets =
            Table::sorted_prefix(country_markets.into_iter().collect(), CountryMarketColumns)?;

        let market_names = Texts::new(
            market_rows
                .values()
                .filter_map(|(_, name)| *name)
                .collect::<BTreeSet<_>>(),
        )
        .map_err(|error| TableError::Key(error).in_table("market_names"))?;
        let mut market_ids = Vec::with_capacity(market_rows.len());
        let mut centers = Vec::with_capacity(market_rows.len());
        let mut center_names = Vec::with_capacity(market_rows.len());
        for (id, (center, name)) in market_rows {
            market_ids.push(id);
            centers.push(center.value());
            center_names.push(name.map(|name| market_names.find(name).expect("a collected name")));
        }
        let markets = Table::sorted(
            market_ids,
            MarketColumns {
                center: centers,
                center_name: center_names.into_iter().collect(),
            },
        )?;

        let goods = Texts::new(
            raw_market_goods
                .keys()
                .map(|(good, _)| *good)
                .collect::<BTreeSet<_>>(),
        )
        .map_err(|error| TableError::Key(error).in_table("goods"))?;
        let mut good_keys = Vec::with_capacity(raw_market_goods.len());
        let mut prices = Vec::with_capacity(raw_market_goods.len());
        let mut total_taken = Vec::with_capacity(raw_market_goods.len());
        let mut supply = Vec::with_capacity(raw_market_goods.len());
        let mut demand = Vec::with_capacity(raw_market_goods.len());
        let mut stockpile = Vec::with_capacity(raw_market_goods.len());
        for ((good, market), values) in raw_market_goods {
            good_keys.push(GoodMarket {
                good: goods.find(good).expect("a collected good"),
                market,
            });
            prices.push(values.price);
            total_taken.push(values.total_taken);
            supply.push(values.supply);
            demand.push(values.demand);
            stockpile.push(values.stockpile);
        }
        let market_goods = Table::sorted_prefix(
            good_keys,
            MarketGoodColumns {
                price: prices.into_iter().collect(),
                total_taken: total_taken.into_iter().collect(),
                supply: supply.into_iter().collect(),
                demand: demand.into_iter().collect(),
                stockpile: stockpile.into_iter().collect(),
            },
        )?;

        Ok(Self {
            countries,
            tags,
            religions,
            materials,
            buildings,
            country_religions,
            country_materials,
            country_buildings,
            country_markets,
            markets,
            goods,
            market_names,
            market_goods,
        })
    }

    pub fn country_offset(&self, id: CountryId) -> Option<usize> {
        self.countries.keys().binary_search(&id).ok()
    }

    pub fn market_offset(&self, id: MarketId) -> Option<usize> {
        self.markets.keys().binary_search(&id).ok()
    }

    pub(super) fn validate(&self) -> Result<(), PayloadError> {
        if !self.countries.columns().all_finite()
            || !self.market_goods.columns().all_finite()
            || self
                .country_religions
                .columns()
                .value
                .iter()
                .any(|value| !value.is_finite())
            || self
                .country_materials
                .columns()
                .value
                .iter()
                .any(|value| !value.is_finite())
            || self
                .country_buildings
                .columns()
                .value
                .iter()
                .any(|value| !value.is_finite())
        {
            return Err(PayloadError::NonFinite);
        }

        for &tag in &self.countries.columns().tag {
            self.tags
                .check(tag)
                .map_err(|error| PayloadError::Reference(error).in_table("countries"))?;
        }

        self.validate_breakdown(
            &self.country_religions,
            &self.religions,
            "country_religions",
        )?;
        self.validate_breakdown(
            &self.country_materials,
            &self.materials,
            "country_materials",
        )?;
        self.validate_breakdown(
            &self.country_buildings,
            &self.buildings,
            "country_buildings",
        )?;

        let mut market_centers = HashSet::with_capacity(self.markets.len());
        for &center in &self.markets.columns().center {
            if !market_centers.insert(center) {
                return Err(PayloadError::Invalid(format!(
                    "Duplicate market center {center} in markets table"
                )));
            }
        }
        for key in self.country_markets.keys() {
            if self.country_offset(key.country).is_none() {
                return Err(PayloadError::Invalid(format!(
                    "Country market membership for country {} has no country row",
                    key.country.value()
                )));
            }
            if !market_centers.contains(&key.center.value()) {
                return Err(PayloadError::Invalid(format!(
                    "Country market center {} has no market row",
                    key.center.value()
                )));
            }
        }

        for name in self.markets.columns().center_name.iter().flatten() {
            self.market_names
                .check(name)
                .map_err(|error| PayloadError::Reference(error).in_table("markets"))?;
        }

        for key in self.market_goods.keys() {
            self.goods
                .check(key.good)
                .map_err(|error| PayloadError::Reference(error).in_table("market_goods"))?;
            if self.market_offset(key.market).is_none() {
                return Err(PayloadError::Invalid(format!(
                    "Market good entry for market {} has no market row",
                    key.market.value()
                )));
            }
        }

        Ok(())
    }

    fn validate_breakdown<C>(
        &self,
        table: &Table<CountryText, C, Prefixed>,
        texts: &Texts,
        table_name: &'static str,
    ) -> Result<(), PayloadError> {
        for key in table.keys() {
            texts
                .check(key.text)
                .map_err(|error| PayloadError::Reference(error).in_table(table_name))?;
            if self.country_offset(key.country).is_none() {
                return Err(PayloadError::Invalid(format!(
                    "Breakdown rows in {table_name} for country {} have no country row",
                    key.country.value()
                )));
            }
        }
        Ok(())
    }
}

/// A country value on each date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum CountryMetric {
    Population,
    Development,
    Locations,
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

/// How to split a country or world value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum CountryDimension {
    Religion,
    Material,
    Building,
}

/// A market good value on each date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum MarketMetric {
    Price,
    TotalTaken,
    Supply,
    Demand,
    Stockpile,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct CountryEntry {
    pub country_id: u32,
    pub tag: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct MarketEntry {
    pub center: u32,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsCatalog {
    pub countries: Vec<CountryEntry>,
    pub goods: Vec<String>,
    pub markets: Vec<MarketEntry>,
}

fn format_market_name(center: u32, raw_name: Option<&str>) -> String {
    raw_name.filter(|name| !name.is_empty()).map_or_else(
        || format!("Location {center}"),
        |name| name.replace('_', " "),
    )
}

pub fn catalog(view: &View<'_, Eu5Analysis>) -> AnalyticsCatalog {
    let shared = view.shared();
    let mut country_tags = BTreeMap::<u32, TextId>::new();
    let mut good_ids = BTreeSet::<TextId>::new();
    let mut market_names = BTreeMap::<u32, Option<TextId>>::new();

    for snapshot in view.snapshots() {
        let analytics = &snapshot.payload().analytics;
        for (country_id, &tag_row) in analytics
            .countries
            .keys()
            .iter()
            .zip(&analytics.countries.columns().tag)
        {
            if let Some(tag_id) = analytics.tags.id(tag_row) {
                country_tags.insert(country_id.value(), tag_id);
            }
        }

        for row in 0..analytics.goods.len() {
            if let Some(good_id) = analytics.goods.id(TextRow::new(row as u32)) {
                good_ids.insert(good_id);
            }
        }

        let markets = analytics.markets.columns();
        for (row, &center) in markets.center.iter().enumerate() {
            let name_id = markets
                .center_name
                .get(row)
                .flatten()
                .and_then(|name_row| analytics.market_names.id(name_row));
            market_names
                .entry(center)
                .and_modify(|existing| {
                    if name_id.is_some() {
                        *existing = name_id;
                    }
                })
                .or_insert(name_id);
        }
    }

    let countries = country_tags
        .into_iter()
        .map(|(country_id, tag_id)| CountryEntry {
            country_id,
            tag: shared.tags.text(tag_id).expect("a store text").to_owned(),
        })
        .collect();

    let mut goods: Vec<String> = good_ids
        .into_iter()
        .map(|id| shared.goods.text(id).expect("a store text").to_owned())
        .collect();
    goods.sort_unstable();

    let markets = market_names
        .into_iter()
        .map(|(center, name_id)| MarketEntry {
            center,
            name: format_market_name(
                center,
                name_id.map(|id| shared.market_names.text(id).expect("a store text")),
            ),
        })
        .collect();

    AnalyticsCatalog {
        countries,
        goods,
        markets,
    }
}

pub fn world_series(view: &View<'_, Eu5Analysis>, metric: CountryMetric) -> History {
    view.series(|snapshot| {
        let countries = &snapshot.payload().analytics.countries;
        if countries.is_empty() {
            return None;
        }
        countries.columns().world_total(metric)
    })
}

pub fn country_series(
    view: &View<'_, Eu5Analysis>,
    country_ids: Vec<CountryId>,
    metric: CountryMetric,
) -> Vec<Series<u32>> {
    let mut series: Vec<_> = country_ids
        .into_iter()
        .map(|key| Series {
            key: key.value(),
            values: Vec::with_capacity(view.snapshots().len()),
        })
        .collect();
    for snapshot in view.snapshots() {
        let analytics = &snapshot.payload().analytics;
        let columns = analytics.countries.columns();
        for country in &mut series {
            let value = analytics
                .country_offset(CountryId::new(country.key))
                .and_then(|row| columns.value(row, metric));
            country.values.push(value);
        }
    }
    series
}

pub fn country_breakdown(
    view: &View<'_, Eu5Analysis>,
    country_id: Option<CountryId>,
    dimension: CountryDimension,
) -> Vec<Series<String>> {
    let shared = view.shared();
    match dimension {
        CountryDimension::Religion => breakdown_series(
            view,
            country_id,
            |analytics| (&analytics.country_religions, &analytics.religions),
            &shared.religions,
        ),
        CountryDimension::Material => breakdown_series(
            view,
            country_id,
            |analytics| (&analytics.country_materials, &analytics.materials),
            &shared.materials,
        ),
        CountryDimension::Building => breakdown_series(
            view,
            country_id,
            |analytics| (&analytics.country_buildings, &analytics.buildings),
            &shared.buildings,
        ),
    }
}

/// A part with no entry on a date where the country (or world) exists is zero
/// there, and a gap where it does not exist.
fn breakdown_series<C: BreakdownValues>(
    view: &View<'_, Eu5Analysis>,
    country_id: Option<CountryId>,
    select: impl Fn(&Analytics) -> (&Table<CountryText, C, Prefixed>, &Texts),
    registry: &TextRegistry,
) -> Vec<Series<String>> {
    let snapshots = view.snapshots();
    let mut exists = vec![false; snapshots.len()];
    let mut totals = BTreeMap::<TextId, Vec<Option<f64>>>::new();

    for (at, snapshot) in snapshots.iter().enumerate() {
        let analytics = &snapshot.payload().analytics;
        let (table, texts) = select(analytics);
        match country_id {
            Some(country) => {
                if analytics.country_offset(country).is_none() {
                    continue;
                }
                exists[at] = true;
                let rows = table.prefix_range(&country);
                for (key, value) in rows.keys().iter().zip(rows.values(|c| c.column())) {
                    let text_id = texts
                        .id(key.text)
                        .expect("a stored snapshot has an ID for each text");
                    totals
                        .entry(text_id)
                        .or_insert_with(|| vec![None; snapshots.len()])[at] = Some(*value);
                }
            }
            None => {
                if analytics.countries.is_empty() {
                    continue;
                }
                exists[at] = true;
                for (key, value) in table.keys().iter().zip(table.columns().column()) {
                    let text_id = texts
                        .id(key.text)
                        .expect("a stored snapshot has an ID for each text");
                    let slot = &mut totals
                        .entry(text_id)
                        .or_insert_with(|| vec![None; snapshots.len()])[at];
                    *slot = Some(slot.unwrap_or(0.0) + *value);
                }
            }
        }
    }

    let mut series: Vec<_> = totals
        .into_iter()
        .map(|(id, mut values)| {
            for (value, exists) in values.iter_mut().zip(&exists) {
                if *exists {
                    value.get_or_insert(0.0);
                }
            }
            Series {
                key: registry.text(id).expect("a store text").to_owned(),
                values,
            }
        })
        .collect();
    series.sort_unstable_by(|a, b| a.key.cmp(&b.key));
    series
}

pub fn market_series(
    view: &View<'_, Eu5Analysis>,
    good: String,
    centers: Vec<LocationId>,
    metric: MarketMetric,
) -> Vec<Series<u32>> {
    if centers.is_empty() {
        return Vec::new();
    }
    let mut series: Vec<_> = centers
        .into_iter()
        .map(|key| Series {
            key: key.value(),
            values: Vec::with_capacity(view.snapshots().len()),
        })
        .collect();
    let requested: HashSet<u32> = series.iter().map(|item| item.key).collect();

    for snapshot in view.snapshots() {
        let analytics = &snapshot.payload().analytics;
        let mut by_center = HashMap::<u32, Option<f64>>::new();
        if let Some(good_row) = analytics.goods.find(&good) {
            let rows = analytics.market_goods.prefix_range(&good_row);
            let market_centers = &analytics.markets.columns().center;
            for (key, value) in rows.keys().iter().zip(rows.values(|c| c.column(metric))) {
                let Some(market_row) = analytics.market_offset(key.market) else {
                    continue;
                };
                let center = market_centers[market_row];
                if requested.contains(&center) && value.is_some() {
                    by_center.insert(center, value);
                }
            }
        }
        for item in &mut series {
            item.values
                .push(by_center.get(&item.key).copied().flatten());
        }
    }
    series
}

pub fn market_weighted_price(
    view: &View<'_, Eu5Analysis>,
    good: String,
    centers: Option<Vec<LocationId>>,
) -> History {
    let filter: Option<HashSet<u32>> =
        centers.map(|list| list.into_iter().map(LocationId::value).collect());
    view.series(|snapshot| {
        if filter.as_ref().is_some_and(HashSet::is_empty) {
            return None;
        }
        let analytics = &snapshot.payload().analytics;
        let good_row = analytics.goods.find(&good)?;
        let rows = analytics.market_goods.prefix_range(&good_row);
        let market_centers = &analytics.markets.columns().center;
        let mut weighted_price = 0.0;
        let mut volume = 0.0;
        for ((key, price), taken) in rows
            .keys()
            .iter()
            .zip(rows.values(|c| &c.price))
            .zip(rows.values(|c| &c.total_taken))
        {
            let Some(market_row) = analytics.market_offset(key.market) else {
                continue;
            };
            let center = market_centers[market_row];
            if filter
                .as_ref()
                .is_some_and(|allowed| !allowed.contains(&center))
            {
                continue;
            }
            if let (Some(price), Some(taken)) = (price, taken)
                && taken > 0.0
            {
                weighted_price += price * taken;
                volume += taken;
            }
        }
        if volume <= 0.0 {
            return None;
        }
        let price = weighted_price / volume;
        price.is_finite().then_some(price)
    })
}

pub fn market_centers(view: &View<'_, Eu5Analysis>, country_id: CountryId) -> Vec<u32> {
    view.snapshots()
        .iter()
        .flat_map(|snapshot| {
            snapshot
                .payload()
                .analytics
                .country_markets
                .prefix_range(&country_id)
                .keys()
                .iter()
                .map(|key| key.center.value())
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
