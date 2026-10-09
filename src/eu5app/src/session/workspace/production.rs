//! Where goods are made.
//!
//! The save records production for each market and good, split by source
//! (`production_supplied`), but it does not record the output of a location.
//! The estimate here divides the production of each market, good, and source
//! across the locations of that market:
//!
//! - RGO (`RawMaterials`) production goes to locations with that raw material,
//!   in proportion to the RGO size.
//! - Building (`Buildings`) production goes to the buildings that use a
//!   method that makes the good, in proportion to employment times the base
//!   output of the method.
//!
//! The market totals are exact. The split between locations is an estimate,
//! because the save does not keep the output modifiers. `Base` production has
//! no known source in the save, so no location gets it.

use super::Eu5Workspace;
use crate::insights::markets::workspace::{GoodProducer, GoodProducersData};
use crate::presentation::GoodRefSource;
use eu5save::hash::FxHashMap;
use eu5save::models::{CountryId, GoodName, LocationIdx, MarketGood, MarketId};

/// The production that a market records for a good, from all sources.
pub(crate) fn market_good_production(good: &MarketGood) -> f64 {
    good.supplied
        .iter()
        .find(|(category, _)| category.to_str() == "Production")
        .map_or(0.0, |(_, amount)| *amount)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum ProductionSource {
    RawMaterials,
    Buildings,
}

impl ProductionSource {
    fn from_category(category: &str) -> Option<Self> {
        match category {
            "RawMaterials" => Some(Self::RawMaterials),
            "Buildings" => Some(Self::Buildings),
            _ => None,
        }
    }
}

/// The estimated monthly output of one good from one source in one location.
#[derive(Debug, Clone, Copy)]
pub(crate) struct LocationProduction {
    pub location: LocationIdx,
    pub market: MarketId,
    /// An index into [`ProductionEstimate::goods`].
    pub good: u16,
    pub source: ProductionSource,
    pub units: f64,
}

#[derive(Debug, Default)]
pub(crate) struct ProductionEstimate {
    pub goods: Vec<String>,
    pub rows: Vec<LocationProduction>,
}

impl ProductionEstimate {
    pub fn good_index(&self, good: &str) -> Option<u16> {
        self.goods
            .iter()
            .position(|name| name == good)
            .map(|idx| idx as u16)
    }
}

impl<'bump> Eu5Workspace<'bump> {
    pub(crate) fn production_estimate(&self) -> &ProductionEstimate {
        self.production_estimate
            .get_or_init(|| self.compute_production_estimate())
    }

    fn compute_production_estimate(&self) -> ProductionEstimate {
        let mut goods: Vec<String> = Vec::new();
        let mut good_indices: FxHashMap<String, u16> = FxHashMap::default();
        let mut intern = |name: &str| -> u16 {
            if let Some(&idx) = good_indices.get(name) {
                return idx;
            }
            let idx = goods.len() as u16;
            goods.push(name.to_string());
            good_indices.insert(name.to_string(), idx);
            idx
        };

        // The weight of each location, good, and source.
        let mut weights: FxHashMap<(LocationIdx, MarketId, u16, ProductionSource), f64> =
            FxHashMap::default();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() || loc.rgo_level <= 0.0 {
                continue;
            }
            let (Some(market), Some(raw_material)) = (loc.market, loc.raw_material) else {
                continue;
            };
            let good = intern(raw_material.to_str());
            *weights
                .entry((entry.idx(), market, good, ProductionSource::RawMaterials))
                .or_default() += loc.rgo_level;
        }

        for building in self.gamestate.building_manager.database.iter() {
            if building.employed <= 0.0 {
                continue;
            }
            let Some(loc_idx) = self.gamestate.locations.get(building.location) else {
                continue;
            };
            let loc = self.gamestate.locations.index(loc_idx).location();
            let Some(market) = loc.market else {
                continue;
            };
            if loc.owner.is_dummy() {
                continue;
            }
            for method in building.production_methods {
                let Some(method) = self.game_data.production_method(method.to_str()) else {
                    continue;
                };
                let good = intern(&method.produced);
                *weights
                    .entry((loc_idx, market, good, ProductionSource::Buildings))
                    .or_default() += building.employed * method.output;
            }
        }

        // The recorded production of each market, good, and source.
        let mut market_totals: FxHashMap<(MarketId, u16, ProductionSource), f64> =
            FxHashMap::default();
        for (market_id, market) in self.gamestate.market_manager.database.iter_with_id() {
            for market_good in market.goods {
                let Some(&good) = good_indices.get(market_good.good.to_str()) else {
                    continue;
                };
                for (category, amount) in market_good.production_supplied {
                    if let Some(source) = ProductionSource::from_category(category.to_str()) {
                        *market_totals.entry((market_id, good, source)).or_default() += amount;
                    }
                }
            }
        }

        let mut weight_sums: FxHashMap<(MarketId, u16, ProductionSource), f64> =
            FxHashMap::default();
        for (&(_, market, good, source), &weight) in &weights {
            *weight_sums.entry((market, good, source)).or_default() += weight;
        }

        let mut rows: Vec<LocationProduction> = weights
            .into_iter()
            .filter_map(|((location, market, good, source), weight)| {
                let total = market_totals.get(&(market, good, source)).copied()?;
                let weight_sum = weight_sums[&(market, good, source)];
                let units = total * weight / weight_sum;
                (units > 0.0).then_some(LocationProduction {
                    location,
                    market,
                    good,
                    source,
                    units,
                })
            })
            .collect();
        rows.sort_by_key(|row| (row.good, row.location.value()));

        ProductionEstimate { goods, rows }
    }

    /// The producers of one good in the markets in scope. With a market, only
    /// that market is in scope. Without a market, a market is in scope when
    /// its center is in the selection, or every market is in scope when the
    /// selection is empty.
    pub(crate) fn calculate_good_producers<'a>(
        &self,
        good: &'a str,
        scope_market: Option<MarketId>,
    ) -> GoodProducersData<'a> {
        let is_empty_selection = self.selection_state.is_empty();
        let mut scoped_markets: FxHashMap<MarketId, ()> = FxHashMap::default();

        let mut total_units = 0.0;
        let mut world_units = 0.0;
        let mut raw_material_units = 0.0;
        let mut building_units = 0.0;
        let mut market_count = 0;
        for (market_id, market) in self.gamestate.market_manager.database.iter_with_id() {
            let Some(market_good) = market.goods.iter().find(|g| g.good.to_str() == good) else {
                continue;
            };
            let production = market_good_production(market_good);
            world_units += production;

            let in_scope = match scope_market {
                Some(scope_market) => scope_market == market_id,
                None => {
                    is_empty_selection
                        || self
                            .gamestate
                            .locations
                            .get(market.center)
                            .is_some_and(|center| self.selection_state.contains(center))
                }
            };
            if !in_scope {
                continue;
            }
            scoped_markets.insert(market_id, ());
            market_count += 1;
            total_units += production;
            for (category, amount) in market_good.production_supplied {
                match ProductionSource::from_category(category.to_str()) {
                    Some(ProductionSource::RawMaterials) => raw_material_units += amount,
                    Some(ProductionSource::Buildings) => building_units += amount,
                    None => {}
                }
            }
        }

        struct CountryAgg {
            units: f64,
            raw_material_units: f64,
            building_units: f64,
            location_count: u32,
            last_location: Option<LocationIdx>,
        }

        let estimate = self.production_estimate();
        let mut by_country: FxHashMap<CountryId, CountryAgg> = FxHashMap::default();
        if let Some(good_idx) = estimate.good_index(good) {
            let start = estimate.rows.partition_point(|row| row.good < good_idx);
            let rows = estimate.rows[start..]
                .iter()
                .take_while(|row| row.good == good_idx);
            for row in rows {
                if !scoped_markets.contains_key(&row.market) {
                    continue;
                }
                let loc = self.gamestate.locations.index(row.location).location();
                let Some(owner) = loc.owner.real_id().map(|id| id.country_id()) else {
                    continue;
                };
                let agg = by_country.entry(owner).or_insert(CountryAgg {
                    units: 0.0,
                    raw_material_units: 0.0,
                    building_units: 0.0,
                    location_count: 0,
                    last_location: None,
                });
                agg.units += row.units;
                match row.source {
                    ProductionSource::RawMaterials => agg.raw_material_units += row.units,
                    ProductionSource::Buildings => agg.building_units += row.units,
                }
                // Rows of a good are sorted by location, so a location's rows
                // are next to each other.
                if agg.last_location != Some(row.location) {
                    agg.location_count += 1;
                    agg.last_location = Some(row.location);
                }
            }
        }

        let mut countries: Vec<GoodProducer> = by_country
            .into_iter()
            .filter_map(|(country_id, agg)| {
                let country_idx = self.gamestate.countries.get(country_id)?;
                Some(GoodProducer {
                    country: self.country_ref_from_country_idx(country_idx),
                    units: agg.units,
                    raw_material_units: agg.raw_material_units,
                    building_units: agg.building_units,
                    location_count: agg.location_count,
                })
            })
            .collect();
        countries.sort_by(|a, b| b.units.total_cmp(&a.units));

        let base_price = self.game_data.good(good).map(|g| g.default_market_price);
        GoodProducersData {
            good: GoodRefSource(GoodName::new(eu5save::models::BStr::new(good.as_bytes()))),
            base_price,
            market_count,
            total_units,
            world_units,
            raw_material_units,
            building_units,
            other_units: (total_units - raw_material_units - building_units).max(0.0),
            countries,
        }
    }
}
