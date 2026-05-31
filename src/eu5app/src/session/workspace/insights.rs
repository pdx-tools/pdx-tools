use super::*;

const POLITICAL_SCOREBOARD_TOP_COUNT: usize = 10;

#[derive(Debug, Clone)]
struct PoliticalWorldCandidate {
    great_power_rank: i32,
    is_player: bool,
    row: PoliticalWorldRow,
}

fn political_world_display_rows(
    mut candidates: Vec<PoliticalWorldCandidate>,
) -> Vec<PoliticalWorldRow> {
    candidates.sort_by(|a, b| {
        a.great_power_rank.cmp(&b.great_power_rank).then_with(|| {
            a.row
                .country
                .country_idx
                .value()
                .cmp(&b.row.country.country_idx.value())
        })
    });

    candidates
        .into_iter()
        .enumerate()
        .filter_map(|(idx, mut candidate)| {
            if idx < POLITICAL_SCOREBOARD_TOP_COUNT || candidate.is_player {
                candidate.row.ordinal_rank = candidate.great_power_rank as u32;
                Some(candidate.row)
            } else {
                None
            }
        })
        .collect()
}

impl<'bump> Eu5Workspace<'bump> {
    pub(crate) fn calculate_political_world_scoreboard(&self) -> PoliticalWorldScoreboard {
        #[derive(Default)]
        struct PoliticalCountryAgg {
            total_state_efficacy: f64,
            active_state_capacity: f64,
            total_population: u32,
        }

        let is_empty = self.selection_state.is_empty();
        let players_only =
            self.selection_state.preset() == Some(crate::selection::SelectionPreset::Players);
        let mut aggregates: FxHashMap<CountryId, PoliticalCountryAgg> = FxHashMap::default();
        let played_countries: FnvHashSet<CountryId> = self
            .gamestate
            .played_countries
            .iter()
            .map(|played| played.country)
            .collect();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !is_empty && !self.selection_state.contains(idx) {
                continue;
            }

            let loc = entry.location();
            let Some(country_id) = loc.owner.real_id().map(|id| id.country_id()) else {
                continue;
            };
            if players_only && !played_countries.contains(&country_id) {
                continue;
            }

            let agg = aggregates.entry(country_id).or_default();
            let population = self.gamestate.location_population(loc) as u32;
            let state_efficacy = loc.control * loc.development;
            agg.total_state_efficacy += state_efficacy;
            agg.active_state_capacity += population as f64 * state_efficacy;
            agg.total_population += population;
        }

        let candidates = aggregates
            .into_iter()
            .filter_map(|(country_id, aggregate)| {
                let country_idx = self.gamestate.countries.get(country_id)?;
                let entry = self.gamestate.countries.index(country_idx);
                let data = entry.data()?;
                if data.great_power_rank <= 0 {
                    return None;
                }

                let is_player = played_countries.contains(&country_id);
                Some(PoliticalWorldCandidate {
                    great_power_rank: data.great_power_rank,
                    is_player,
                    row: PoliticalWorldRow {
                        ordinal_rank: 0,
                        country: self.country_ref_from_country_idx(country_idx),
                        total_state_efficacy: aggregate.total_state_efficacy,
                        active_state_capacity: aggregate.active_state_capacity,
                        total_population: aggregate.total_population,
                        tax_trade_income: data.estimated_monthly_income_trade_and_tax,
                    },
                })
            })
            .collect();

        PoliticalWorldScoreboard {
            rows: political_world_display_rows(candidates),
        }
    }

    /// Calculate state efficacy scores for all nations
    ///
    /// State efficacy measures territorial quality by combining location control and development.
    /// Formula: Location Efficacy = Control × Development
    /// National metrics: Total Efficacy (sum), Average Efficacy (mean), Location Count, Total Population
    pub(crate) fn calculate_state_efficacy_insight(&self) -> StateEfficacyInsightData {
        #[derive(Default)]
        struct EfficacyAggregator {
            total_efficacy: f64,
            location_count: u32,
            total_population: u32,
        }

        let mut aggregates: FxHashMap<CountryId, EfficacyAggregator> = FxHashMap::default();
        let mut location_count = 0u32;
        let mut total_efficacy = 0.0f64;
        let mut total_population = 0u32;

        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();

            if location.owner.is_dummy() {
                continue;
            }

            if !self.selection_state.is_empty()
                && !self.selection_state.contains(location_entry.idx())
            {
                continue;
            }

            let location_efficacy = location.control * location.development;
            let population = self.gamestate.location_population(location) as u32;
            location_count += 1;
            total_efficacy += location_efficacy;
            total_population += population;

            let aggregate = aggregates.entry(location.owner).or_default();
            aggregate.total_efficacy += location_efficacy;
            aggregate.location_count += 1;
            aggregate.total_population += population;
        }

        let mut results: Vec<CountryStateEfficacy> = aggregates
            .into_iter()
            .filter_map(|(country_id, aggregate)| {
                let country_idx = self.gamestate.countries.get(country_id)?;
                let avg_efficacy = if aggregate.location_count > 0 {
                    aggregate.total_efficacy / (aggregate.location_count as f64)
                } else {
                    0.0
                };
                Some(CountryStateEfficacy {
                    country: self.country_ref_from_country_idx(country_idx),
                    total_efficacy: aggregate.total_efficacy,
                    location_count: aggregate.location_count,
                    avg_efficacy,
                    total_population: aggregate.total_population,
                })
            })
            .collect();

        results.sort_by(|a, b| {
            b.total_efficacy.total_cmp(&a.total_efficacy).then_with(|| {
                a.country
                    .country_idx
                    .value()
                    .cmp(&b.country.country_idx.value())
            })
        });

        StateEfficacyInsightData {
            scope: StateEfficacyScopeSummary {
                location_count,
                country_count: results.len() as u32,
                total_efficacy,
                avg_efficacy: if location_count > 0 {
                    total_efficacy / location_count as f64
                } else {
                    0.0
                },
                total_population,
                is_empty: self.selection_state.is_empty(),
            },
            countries: results,
            top_locations: self.state_efficacy_top_locations(),
            distribution: self.state_efficacy_location_distribution(),
        }
    }

    pub(crate) fn state_efficacy_location_distribution(&self) -> LocationDistribution {
        let mut metrics = self.state_efficacy_location_metrics();

        if metrics.is_empty() {
            return LocationDistribution {
                metric_label: "State Efficacy".to_string(),
                buckets: vec![],
                top_locations: vec![],
            };
        }

        let min_val = metrics
            .iter()
            .map(|(_, v, _, _, _)| *v)
            .fold(f64::INFINITY, f64::min);
        let max_val = metrics
            .iter()
            .map(|(_, v, _, _, _)| *v)
            .fold(f64::NEG_INFINITY, f64::max);

        const TARGET_BUCKETS: usize = 20;

        let buckets = if (max_val - min_val).abs() < f64::EPSILON {
            vec![DistributionBucket {
                lo: min_val,
                hi: max_val,
                count: metrics.len() as u32,
            }]
        } else {
            let step = nice_bucket_step(max_val - min_val, TARGET_BUCKETS);
            let start = (min_val / step).floor() * step;
            let end = (max_val / step).ceil() * step;
            let num_buckets = ((end - start) / step).ceil() as usize;
            let num_buckets = num_buckets.clamp(1, TARGET_BUCKETS * 2);
            let mut counts = vec![0u32; num_buckets];
            for (_, value, _, _, _) in &metrics {
                let b = ((*value - start) / step).floor() as usize;
                let b = b.min(num_buckets - 1);
                counts[b] += 1;
            }
            counts
                .into_iter()
                .enumerate()
                .map(|(i, count)| DistributionBucket {
                    lo: start + i as f64 * step,
                    hi: start + (i + 1) as f64 * step,
                    count,
                })
                .collect()
        };

        metrics.sort_by(|a, b| b.1.total_cmp(&a.1));
        let top_locations: Vec<RankedLocation> = metrics
            .iter()
            .take(10)
            .map(|(idx, value, _, _, _)| RankedLocation {
                location: *idx,
                value: *value,
            })
            .collect();

        LocationDistribution {
            metric_label: "State Efficacy".to_string(),
            buckets,
            top_locations,
        }
    }

    pub(crate) fn state_efficacy_top_locations(&self) -> Vec<StateEfficacyTopLocation> {
        let mut metrics = self.state_efficacy_location_metrics();
        metrics.sort_by(|a, b| b.1.total_cmp(&a.1));

        const TOP_LOCATIONS: usize = 50;
        metrics
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, state_efficacy, development, control, population)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(StateEfficacyTopLocation {
                    location: idx,
                    state_efficacy,
                    development,
                    control,
                    population,
                    owner,
                })
            })
            .collect()
    }

    fn state_efficacy_location_metrics(&self) -> Vec<(LocationIdx, f64, f64, f64, u32)> {
        let mut metrics = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            let development = loc.development;
            let control = loc.control;
            let population = self.gamestate.location_population(loc) as u32;
            metrics.push((
                entry.idx(),
                control * development,
                development,
                control,
                population,
            ));
        }
        metrics
    }

    /// Returns a histogram distribution of per-location metric values for the
    /// current map mode over the current selection (or all locations if empty).
    pub(crate) fn selection_location_distribution(&self) -> LocationDistribution {
        let building_levels = self.get_location_building_levels();

        let metric_label = match self.current_map_mode {
            MapMode::Control => "Control",
            MapMode::Population => "Population",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::Wealth | MapMode::Markets => "Wealth",
            MapMode::UnrealizedTaxBase => "Unrealized Tax Base",
            MapMode::StateEfficacy => "State Efficacy",
            _ => "Development",
        };

        let mut metrics: Vec<(LocationIdx, f64)> = Vec::new();
        let mut add_location = |idx: LocationIdx| {
            let loc = self.gamestate.locations.index(idx).location();
            if loc.owner.is_dummy() {
                return;
            }
            let value = match self.current_map_mode {
                MapMode::Control => loc.control,
                MapMode::Population => self.gamestate.location_population(loc),
                MapMode::RgoLevel => loc.rgo_level,
                MapMode::BuildingLevels => building_levels[idx],
                MapMode::Wealth | MapMode::Markets => loc.possible_tax,
                MapMode::UnrealizedTaxBase => loc.possible_tax - loc.tax,
                MapMode::StateEfficacy => loc.control * loc.development,
                _ => loc.development,
            };
            metrics.push((idx, value));
        };

        if self.selection_state.is_empty() {
            for entry in self.gamestate.locations.iter() {
                add_location(entry.idx());
            }
        } else {
            for &idx in self.selection_state.selected_locations() {
                add_location(idx);
            }
        }

        if metrics.is_empty() {
            return LocationDistribution {
                metric_label: metric_label.to_string(),
                buckets: vec![],
                top_locations: vec![],
            };
        }

        let min_val = metrics
            .iter()
            .map(|(_, v)| *v)
            .fold(f64::INFINITY, f64::min);
        let max_val = metrics
            .iter()
            .map(|(_, v)| *v)
            .fold(f64::NEG_INFINITY, f64::max);

        const TARGET_BUCKETS: usize = 20;

        let buckets = if (max_val - min_val).abs() < f64::EPSILON {
            vec![DistributionBucket {
                lo: min_val,
                hi: max_val,
                count: metrics.len() as u32,
            }]
        } else {
            let step = nice_bucket_step(max_val - min_val, TARGET_BUCKETS);
            let start = (min_val / step).floor() * step;
            let end = (max_val / step).ceil() * step;
            let num_buckets = ((end - start) / step).ceil() as usize;
            let num_buckets = num_buckets.clamp(1, TARGET_BUCKETS * 2);
            let mut counts = vec![0u32; num_buckets];
            for (_, v) in &metrics {
                let b = ((*v - start) / step).floor() as usize;
                let b = b.min(num_buckets - 1);
                counts[b] += 1;
            }
            counts
                .into_iter()
                .enumerate()
                .map(|(i, count)| DistributionBucket {
                    lo: start + i as f64 * step,
                    hi: start + (i + 1) as f64 * step,
                    count,
                })
                .collect()
        };

        let mut sorted_metrics = metrics;
        sorted_metrics.sort_by(|a, b| b.1.total_cmp(&a.1));
        let top_locations: Vec<RankedLocation> = sorted_metrics
            .iter()
            .take(10)
            .map(|(idx, value)| RankedLocation {
                location: *idx,
                value: *value,
            })
            .collect();

        LocationDistribution {
            metric_label: metric_label.to_string(),
            buckets,
            top_locations,
        }
    }

    /// Development insight: per-country aggregates + top locations by development,
    /// over the current selection (or all locations when empty).
    pub(crate) fn calculate_development_insight(&self) -> DevelopmentInsightData {
        #[derive(Default)]
        struct DevAgg {
            total_dev: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, DevAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, u32, f64)> = Vec::new();
        let mut total_development = 0.0f64;
        let mut total_population = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let dev = loc.development;
            let pop = self.gamestate.location_population(loc) as u32;
            let ctrl = loc.control;
            all_locs.push((entry.idx(), dev, pop, ctrl));
            total_development += dev;
            total_population += pop;

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_dev += dev;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryDevSummary> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let country = self.country_ref_from_country_idx(cidx);
                Some(CountryDevSummary {
                    country,
                    total_development: agg.total_dev,
                    avg_development: if agg.count > 0 {
                        agg.total_dev / agg.count as f64
                    } else {
                        0.0
                    },
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_development
                .total_cmp(&a.total_development)
                .then_with(|| {
                    a.country
                        .country_idx
                        .value()
                        .cmp(&b.country.country_idx.value())
                })
        });

        all_locs.sort_by(|a, b| b.1.total_cmp(&a.1));
        // Tuned for client-side pagination: raising this materially increases
        // both payload size and DataTable initial render cost.
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<DevTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, dev, pop, ctrl)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(DevTopLocation {
                    location: idx,
                    development: dev,
                    population: pop,
                    control: ctrl,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();
        let location_count = all_locs.len() as u32;

        DevelopmentInsightData {
            scope: DevelopmentScopeSummary {
                location_count,
                country_count: countries.len() as u32,
                total_development,
                avg_development: if location_count > 0 {
                    total_development / location_count as f64
                } else {
                    0.0
                },
                total_population,
                is_empty: self.selection_state.is_empty(),
            },
            countries,
            top_locations,
            distribution,
        }
    }

    /// Wealth insight: per-country ceiling aggregates and top locations
    /// by wealth, over the current selection (or all locations when empty).
    pub(crate) fn calculate_wealth_insight(&self) -> WealthInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_wealth: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, TaxAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, u32, f64, f64)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let wealth = loc.possible_tax;
            let pop = self.gamestate.location_population(loc) as u32;
            let ctrl = loc.control;
            let dev = loc.development;
            all_locs.push((entry.idx(), wealth, pop, ctrl, dev));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_wealth += wealth;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryWealth> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let country = self.country_ref_from_country_idx(cidx);
                Some(CountryWealth {
                    country,
                    total_wealth: agg.total_wealth,
                    avg_wealth: if agg.count > 0 {
                        agg.total_wealth / agg.count as f64
                    } else {
                        0.0
                    },
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_wealth.total_cmp(&a.total_wealth).then_with(|| {
                a.country
                    .country_idx
                    .value()
                    .cmp(&b.country.country_idx.value())
            })
        });

        all_locs.sort_by(|a, b| b.1.total_cmp(&a.1));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<WealthTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, wealth, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(WealthTopLocation {
                    location: idx,
                    wealth,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        WealthInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    pub(crate) fn calculate_unrealized_tax_base_insight(&self) -> UnrealizedTaxBaseInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_tax_base: f64,
            total_wealth: f64,
            count: u32,
            pop: u32,
        }

        let mut aggregates: FxHashMap<CountryId, TaxAgg> = FxHashMap::default();
        let mut all_locs: Vec<(LocationIdx, f64, f64, f64, u32, f64, f64)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !self.selection_state.is_empty() && !self.selection_state.contains(entry.idx()) {
                continue;
            }

            let tax_base = loc.tax;
            let wealth = loc.possible_tax;
            let gap = wealth - tax_base;
            let pop = self.gamestate.location_population(loc) as u32;
            all_locs.push((
                entry.idx(),
                tax_base,
                wealth,
                gap,
                pop,
                loc.control,
                loc.development,
            ));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_tax_base += tax_base;
                agg.total_wealth += wealth;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryUnrealizedTaxBase> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let country = self.country_ref_from_country_idx(cidx);
                let unrealized_tax_base = agg.total_wealth - agg.total_tax_base;
                let realization_ratio = if agg.total_wealth > 0.0 {
                    agg.total_tax_base / agg.total_wealth
                } else {
                    0.0
                };
                Some(CountryUnrealizedTaxBase {
                    country,
                    total_tax_base: agg.total_tax_base,
                    total_wealth: agg.total_wealth,
                    unrealized_tax_base,
                    realization_ratio,
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.unrealized_tax_base
                .total_cmp(&a.unrealized_tax_base)
                .then_with(|| {
                    a.country
                        .country_idx
                        .value()
                        .cmp(&b.country.country_idx.value())
                })
        });

        all_locs.sort_by(|a, b| b.3.total_cmp(&a.3));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<UnrealizedTaxBaseTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, tax_base, wealth, gap, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(UnrealizedTaxBaseTopLocation {
                    location: idx,
                    tax_base,
                    wealth,
                    unrealized_tax_base: gap,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        UnrealizedTaxBaseInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    /// Market insight: scoped per-good and per-market aggregates that describe
    /// where the selection's economy is constrained, plus a ranked list of top
    /// production-opportunity locations. Scoped markets are markets whose center
    /// location sits inside the current location filter (or every market if the
    /// selection is empty). Production-opportunity rows only include locations
    /// in the current scope.
    pub(crate) fn calculate_market_insight(&self) -> MarketInsightData<'_> {
        use eu5save::models::LocationId;

        let is_empty_selection = self.selection_state.is_empty();
        let in_scope = |idx: LocationIdx| is_empty_selection || self.selection_state.contains(idx);

        #[derive(Default)]
        struct GoodAgg {
            supply: f64,
            demand: f64,
            total_taken: f64,
            price_weighted_numer: f64,
            price_weighted_denom: f64,
            shortage: f64,
            surplus: f64,
            shortage_value: f64,
            surplus_value: f64,
            max_impact: f64,
            stockpile: f64,
            market_count: u32,
            producing_location_count: u32,
        }

        struct MarketAgg<'a> {
            market_id: eu5save::models::MarketId,
            center_idx: LocationIdx,
            market_value: f64,
            shortage_pressure: f64,
            surplus_pressure: f64,
            total_taken: f64,
            good_count: u32,
            member_locations: Vec<(LocationIdx, &'a eu5save::models::Location<'a>)>,
        }

        let mut good_aggs: FxHashMap<GoodName, GoodAgg> = FxHashMap::default();
        let mut market_aggs: Vec<MarketAgg> = Vec::new();
        let mut good_price_by_market: FxHashMap<(u32, GoodName), (f64, f64, f64)> =
            FxHashMap::default();
        let mut good_market_cells: Vec<GoodMarketBalanceCell<'_>> = Vec::new();

        let mut total_market_value = 0.0f64;
        let mut total_shortage_value = 0.0f64;
        let mut total_surplus_value = 0.0f64;

        let lookup_center_idx = |center: LocationId| self.gamestate.locations.get(center);

        for (market_id, market) in self.gamestate.market_manager.database.iter_with_id() {
            let Some(center_idx) = lookup_center_idx(market.center) else {
                continue;
            };
            if !in_scope(center_idx) {
                continue;
            }

            let mut market_value = 0.0f64;
            let mut shortage_pressure = 0.0f64;
            let mut surplus_pressure = 0.0f64;
            let mut total_taken = 0.0f64;

            for good in market.goods {
                let shortage = (good.demand - good.supply).max(0.0);
                let surplus = (good.supply - good.demand).max(0.0);
                let shortage_value = shortage * good.price;
                let surplus_value = surplus * good.price;
                let good_value = good.price * good.total_taken;

                market_value += good_value;
                shortage_pressure += shortage_value;
                surplus_pressure += surplus_value;
                total_taken += good.total_taken;

                let agg = good_aggs.entry(good.good).or_default();
                agg.supply += good.supply;
                agg.demand += good.demand;
                agg.total_taken += good.total_taken;
                agg.price_weighted_numer += good.price * good.total_taken;
                agg.price_weighted_denom += good.total_taken;
                agg.shortage += shortage;
                agg.surplus += surplus;
                agg.shortage_value += shortage_value;
                agg.surplus_value += surplus_value;
                if good.impact > agg.max_impact {
                    agg.max_impact = good.impact;
                }
                agg.stockpile += good.stockpile;
                agg.market_count += 1;

                good_price_by_market.insert(
                    (center_idx.value(), good.good),
                    (good.price, shortage_value, good.demand),
                );

                let balance_ratio = if good.demand > 0.0 {
                    good.supply / good.demand
                } else {
                    0.0
                };
                let imbalance_value = (good.supply - good.demand) * good.price;
                good_market_cells.push(GoodMarketBalanceCell {
                    market: MarketRefSource { market_id },
                    good: good.good,
                    supply: good.supply,
                    demand: good.demand,
                    price: good.price,
                    total_taken: good.total_taken,
                    balance_ratio,
                    imbalance_value,
                });
            }

            total_market_value += market_value;
            total_shortage_value += shortage_pressure;
            total_surplus_value += surplus_pressure;

            market_aggs.push(MarketAgg {
                market_id,
                center_idx,
                market_value,
                shortage_pressure,
                surplus_pressure,
                total_taken,
                good_count: market.goods.len() as u32,
                member_locations: Vec::new(),
            });
        }

        let market_center_idx_set: FxHashMap<u32, usize> = market_aggs
            .iter()
            .enumerate()
            .map(|(i, m)| (m.center_idx.value(), i))
            .collect();

        let mut scoped_location_count = 0u32;
        let mut market_access_sum = 0.0f64;
        let mut market_access_count = 0u32;
        let mut production_candidates: Vec<(LocationIdx, &eu5save::models::Location)> = Vec::new();
        let mut producing_location_counts: FxHashMap<GoodName, u32> = FxHashMap::default();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !in_scope(idx) {
                continue;
            }
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            scoped_location_count += 1;
            market_access_sum += loc.market_access;
            market_access_count += 1;

            if let Some(market_id) = loc.market
                && let Some(market) = self.gamestate.market_manager.get(market_id)
                && let Some(center_idx) = lookup_center_idx(market.center)
                && let Some(&market_i) = market_center_idx_set.get(&center_idx.value())
            {
                market_aggs[market_i].member_locations.push((idx, loc));
            }

            if let Some(rm) = loc.raw_material {
                *producing_location_counts.entry(rm).or_insert(0) += 1;
                production_candidates.push((idx, loc));
            }
        }

        for (name, count) in &producing_location_counts {
            if let Some(agg) = good_aggs.get_mut(name) {
                agg.producing_location_count = *count;
            }
        }

        let mut goods: Vec<ScopedGoodSummary<'_>> = good_aggs
            .into_iter()
            .map(|(name, agg)| {
                let weighted_price = if agg.price_weighted_denom > 0.0 {
                    agg.price_weighted_numer / agg.price_weighted_denom
                } else {
                    0.0
                };
                let balance_ratio = if agg.demand > 0.0 {
                    agg.supply / agg.demand
                } else {
                    0.0
                };
                let good_data = self.game_data.good(name.to_str());
                ScopedGoodSummary {
                    good: crate::presentation::GoodRefSource(name),
                    default_market_price: good_data.map(|l| l.default_market_price),
                    supply: agg.supply,
                    demand: agg.demand,
                    total_taken: agg.total_taken,
                    weighted_price,
                    shortage: agg.shortage,
                    surplus: agg.surplus,
                    shortage_value: agg.shortage_value,
                    surplus_value: agg.surplus_value,
                    balance_ratio,
                    impact: agg.max_impact,
                    stockpile: agg.stockpile,
                    possible: 0.0,
                    allowed_export_amount: 0.0,
                    priority: 0.0,
                    history: Vec::new(),
                    supplied_breakdown: Vec::new(),
                    demanded_breakdown: Vec::new(),
                    taken_breakdown: Vec::new(),
                    market_count: agg.market_count,
                    producing_location_count: agg.producing_location_count,
                }
            })
            .collect();
        goods.sort_by(|a, b| {
            let a_imbalance = a.shortage_value.max(a.surplus_value);
            let b_imbalance = b.shortage_value.max(b.surplus_value);
            b_imbalance
                .total_cmp(&a_imbalance)
                .then_with(|| a.good.0.to_str().cmp(b.good.0.to_str()))
        });

        let markets: Vec<ScopedMarketSummary> = {
            let mut rows: Vec<ScopedMarketSummary> = market_aggs
                .into_iter()
                .map(|agg| {
                    let mut access_sum = 0.0f64;
                    let mut access_count = 0u32;
                    let mut country_ids: FnvHashSet<CountryId> = FnvHashSet::default();
                    for (_, loc) in &agg.member_locations {
                        access_sum += loc.market_access;
                        access_count += 1;
                        if let Some(id) = loc.owner.real_id().map(|r| r.country_id()) {
                            country_ids.insert(id);
                        }
                    }
                    ScopedMarketSummary {
                        market: MarketRefSource {
                            market_id: agg.market_id,
                        },
                        market_value: agg.market_value,
                        shortage_pressure: agg.shortage_pressure,
                        surplus_pressure: agg.surplus_pressure,
                        total_taken: agg.total_taken,
                        scoped_location_count: agg.member_locations.len() as u32,
                        member_country_count: country_ids.len() as u32,
                        avg_market_access: if access_count > 0 {
                            access_sum / access_count as f64
                        } else {
                            0.0
                        },
                        good_count: agg.good_count,
                    }
                })
                .collect();
            rows.sort_by(|a, b| {
                b.market_value
                    .total_cmp(&a.market_value)
                    .then_with(|| a.market.market_id.value().cmp(&b.market.market_id.value()))
            });
            rows
        };

        let mut production_rows: Vec<ProductionLocationSummary<'_>> = Vec::new();
        for (idx, loc) in production_candidates {
            let Some(owner) = self.owner_country_ref_for_location(loc) else {
                continue;
            };
            let Some(raw_material) = loc.raw_material else {
                continue;
            };
            let (market_id_opt, center_location_idx_opt) = if let Some(market_id) = loc.market
                && let Some(market) = self.gamestate.market_manager.get(market_id)
                && let Some(center_idx) = lookup_center_idx(market.center)
            {
                (Some(market_id), Some(center_idx.value()))
            } else {
                (None, None)
            };

            let (price, shortage_value) = center_location_idx_opt
                .and_then(|cidx| {
                    good_price_by_market
                        .get(&(cidx, raw_material))
                        .map(|(p, sv, _)| (*p, *sv))
                })
                .unwrap_or((0.0, 0.0));

            let opportunity = loc.rgo_level.max(0.0) * loc.market_access.max(0.0) * shortage_value;

            production_rows.push(ProductionLocationSummary {
                location: idx,
                owner,
                market: market_id_opt.map(|market_id| MarketRefSource { market_id }),
                raw_material: Some(raw_material),
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
                development: loc.development,
                population: self.gamestate.location_population(loc) as u32,
                good_price: price,
                good_shortage_value: shortage_value,
                production_opportunity: opportunity,
            });
        }
        production_rows.sort_by(|a, b| {
            b.production_opportunity
                .total_cmp(&a.production_opportunity)
                .then_with(|| b.rgo_level.total_cmp(&a.rgo_level))
        });
        const TOP_PRODUCTION: usize = 50;
        production_rows.truncate(TOP_PRODUCTION);

        let scope = MarketScopeSummary {
            location_count: scoped_location_count,
            market_count: markets.len() as u32,
            good_count: goods.len() as u32,
            market_value: total_market_value,
            shortage_value: total_shortage_value,
            surplus_value: total_surplus_value,
            avg_market_access: if market_access_count > 0 {
                market_access_sum / market_access_count as f64
            } else {
                0.0
            },
            is_empty: is_empty_selection,
        };

        MarketInsightData {
            scope,
            goods,
            markets,
            good_market_cells,
            top_production_locations: production_rows,
        }
    }

    /// Population insight: scoped country population, concentration curve, and
    /// top populated locations for the current selection or whole save.
    pub(crate) fn calculate_population_insight(&self) -> PopulationInsightData {
        #[derive(Default)]
        struct RankAgg {
            population: u32,
            location_count: u32,
        }

        #[derive(Default)]
        struct CountryPopAgg {
            population: u32,
            location_count: u32,
            ranks: [RankAgg; 4],
        }

        let is_empty = self.selection_state.is_empty();

        // When a non-empty selection is active, track total owned locations per country so we
        // can suppress historical_population (country-level data) for partially-selected countries.
        let total_country_locations: FxHashMap<CountryId, u32> = if is_empty {
            FxHashMap::default()
        } else {
            let mut counts: FxHashMap<CountryId, u32> = FxHashMap::default();
            for entry in self.gamestate.locations.iter() {
                if let Some(owner_id) = entry.location().owner.real_id().map(|r| r.country_id()) {
                    *counts.entry(owner_id).or_insert(0) += 1;
                }
            }
            counts
        };

        let mut scoped_locations: Vec<(LocationIdx, CountryId, u32, Option<usize>)> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !is_empty && !self.selection_state.contains(idx) {
                continue;
            }

            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) else {
                continue;
            };
            let population = self.gamestate.location_population(loc) as u32;
            let rank_idx = match &loc.rank {
                LocationRank::RuralSettlement => Some(0),
                LocationRank::Town => Some(1),
                LocationRank::City => Some(2),
                LocationRank::Megalopolis => Some(3),
                LocationRank::Other => None,
            };
            scoped_locations.push((idx, owner_id, population, rank_idx));
        }

        let location_count = scoped_locations.len() as u32;
        let total_population: u32 = scoped_locations.iter().map(|(_, _, pop, _)| *pop).sum();

        let mut populations: Vec<u32> =
            scoped_locations.iter().map(|(_, _, pop, _)| *pop).collect();
        populations.sort_unstable();

        let median_location_population = if populations.is_empty() {
            0
        } else {
            populations[populations.len() / 2]
        };

        let mut country_aggs: FxHashMap<CountryId, CountryPopAgg> = FxHashMap::default();
        let mut rank_totals = [
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
        ];
        let mut sorted_locations = scoped_locations.clone();
        sorted_locations.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.value().cmp(&b.0.value())));

        for &(_, owner_id, population, rank_idx) in &scoped_locations {
            let agg = country_aggs.entry(owner_id).or_default();
            agg.population += population;
            agg.location_count += 1;
            if let Some(rank_idx) = rank_idx {
                agg.ranks[rank_idx].population += population;
                agg.ranks[rank_idx].location_count += 1;
                rank_totals[rank_idx].population += population;
                rank_totals[rank_idx].location_count += 1;
            }
        }

        let mut countries: Vec<ScopedCountryPopulation> = country_aggs
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let data = self.gamestate.countries.index(cidx).data()?;
                let selected = agg.location_count;
                let total = total_country_locations.get(&cid).copied().unwrap_or(0);
                let historical_population = if is_empty || selected == total {
                    data.historical_population.to_vec()
                } else {
                    Vec::new()
                };
                let great_power_rank = data.great_power_rank;
                let country = self.country_ref_from_country_idx(cidx);
                let ranks = agg
                    .ranks
                    .into_iter()
                    .enumerate()
                    .map(|(idx, rank)| PopulationRankSegment {
                        rank: idx as u8,
                        population: rank.population,
                        location_count: rank.location_count,
                    })
                    .collect();
                Some(ScopedCountryPopulation {
                    country,
                    total_population: agg.population,
                    location_count: agg.location_count,
                    ranks,
                    historical_population,
                    great_power_rank,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_population.cmp(&a.total_population).then_with(|| {
                a.country
                    .country_idx
                    .value()
                    .cmp(&b.country.country_idx.value())
            })
        });

        let mut cumulative_population = 0u32;
        let concentration: Vec<PopulationConcentrationPoint> = sorted_locations
            .iter()
            .enumerate()
            .map(|(idx, (_, _, population, _))| {
                cumulative_population += *population;
                PopulationConcentrationPoint {
                    location_rank: idx as u32 + 1,
                    location_count,
                    population: *population,
                    cumulative_population,
                    population_share: if total_population > 0 {
                        cumulative_population as f64 / total_population as f64
                    } else {
                        0.0
                    },
                }
            })
            .collect();

        let top_locations: Vec<PopulationTopLocation> = sorted_locations
            .into_iter()
            .filter(|(_, _, _, rank_idx)| rank_idx.is_some())
            .take(50)
            .filter_map(|(idx, _, population, rank_idx)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(PopulationTopLocation {
                    location: idx,
                    owner,
                    population,
                    rank: rank_idx? as u8,
                })
            })
            .collect();
        let rank_totals = rank_totals
            .into_iter()
            .enumerate()
            .map(|(idx, rank)| PopulationRankSegment {
                rank: idx as u8,
                population: rank.population,
                location_count: rank.location_count,
            })
            .collect();

        #[derive(Default)]
        struct TypeAgg {
            population: f64,
            satisfaction_num: f64,
            literacy_num: f64,
            pop_count: u32,
        }

        fn pop_type_id(kind: PopulationType) -> Option<usize> {
            match kind {
                PopulationType::Peasants => Some(0),
                PopulationType::Laborers => Some(1),
                PopulationType::Burghers => Some(2),
                PopulationType::Nobles => Some(3),
                PopulationType::Clergy => Some(4),
                PopulationType::Soldiers => Some(5),
                PopulationType::Slaves => Some(6),
                PopulationType::Tribesmen => Some(7),
                PopulationType::Other => None,
            }
        }

        let mut baseline_agg: [TypeAgg; 8] = Default::default();
        let mut scoped_agg: [TypeAgg; 8] = Default::default();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            let loc = entry.location();
            if loc.owner.real_id().is_none() {
                continue;
            }
            let in_scope = is_empty || self.selection_state.contains(idx);
            for &pop_id in loc.population.pops {
                let Some(pop) = self.gamestate.population.database.lookup(pop_id) else {
                    continue;
                };
                let Some(type_idx) = pop_type_id(pop.kind) else {
                    continue;
                };
                baseline_agg[type_idx].population += pop.size;
                baseline_agg[type_idx].satisfaction_num += pop.satisfaction * pop.size;
                baseline_agg[type_idx].literacy_num += pop.literacy * pop.size;
                baseline_agg[type_idx].pop_count += 1;
                if in_scope {
                    scoped_agg[type_idx].population += pop.size;
                    scoped_agg[type_idx].satisfaction_num += pop.satisfaction * pop.size;
                    scoped_agg[type_idx].literacy_num += pop.literacy * pop.size;
                    scoped_agg[type_idx].pop_count += 1;
                }
            }
        }

        let baseline_total: f64 = baseline_agg.iter().map(|a| a.population).sum();
        let scoped_total: f64 = scoped_agg.iter().map(|a| a.population).sum();

        let type_profile: Vec<PopulationTypeProfileRow> = (0u8..8)
            .map(|i| {
                let b = &baseline_agg[i as usize];
                let s = &scoped_agg[i as usize];
                let baseline_share = if baseline_total > 0.0 {
                    b.population / baseline_total
                } else {
                    0.0
                };
                let share = if scoped_total > 0.0 {
                    s.population / scoped_total
                } else {
                    0.0
                };
                PopulationTypeProfileRow {
                    population_type: i,
                    population: s.population,
                    share,
                    baseline_population: b.population,
                    baseline_share,
                    share_delta: share - baseline_share,
                    avg_satisfaction: if s.population > 0.0 {
                        s.satisfaction_num / s.population
                    } else {
                        0.0
                    },
                    avg_literacy: if s.population > 0.0 {
                        s.literacy_num / s.population
                    } else {
                        0.0
                    },
                    pop_count: s.pop_count,
                }
            })
            .collect();

        PopulationInsightData {
            scope: PopulationScopeSummary {
                location_count,
                country_count: countries.len() as u32,
                total_population,
                median_location_population,
                is_empty,
            },
            rank_totals,
            countries,
            concentration,
            top_locations,
            type_profile,
        }
    }

    pub(crate) fn calculate_religion_insight(&self) -> ReligionInsightData {
        use eu5save::models::ReligionId;

        struct StateReligionAgg {
            country_ids: FnvHashSet<CountryId>,
            total_ruled_population: f64,
            state_religion_population: f64,
            population_by_religion: FxHashMap<ReligionId, f64>,
        }

        #[derive(Default)]
        struct FollowerAgg {
            total_followers: f64,
            state_religion_population: f64,
        }

        let is_empty = self.selection_state.is_empty();
        let mut country_state_religion: FxHashMap<CountryId, Option<ReligionId>> =
            FxHashMap::default();
        let mut state_rel_aggs: FxHashMap<ReligionId, StateReligionAgg> = FxHashMap::default();
        let mut follower_aggs: FxHashMap<ReligionId, FollowerAgg> = FxHashMap::default();

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !is_empty && !self.selection_state.contains(idx) {
                continue;
            }

            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) else {
                continue;
            };

            let state_religion_id = *country_state_religion.entry(owner_id).or_insert_with(|| {
                self.gamestate
                    .countries
                    .get(owner_id)
                    .and_then(|cidx| self.gamestate.countries.index(cidx).data())
                    .and_then(|data| data.primary_religion)
            });

            for &pop_id in loc.population.pops {
                let Some(pop) = self.gamestate.population.database.lookup(pop_id) else {
                    continue;
                };

                let pop_size = (pop.size * 1000.0).floor();
                let pop_rel_id = pop.religion;

                let follower = follower_aggs.entry(pop_rel_id).or_default();
                follower.total_followers += pop_size;

                if let Some(sr_id) = state_religion_id {
                    let agg = state_rel_aggs
                        .entry(sr_id)
                        .or_insert_with(|| StateReligionAgg {
                            country_ids: FnvHashSet::default(),
                            total_ruled_population: 0.0,
                            state_religion_population: 0.0,
                            population_by_religion: FxHashMap::default(),
                        });
                    agg.country_ids.insert(owner_id);
                    agg.total_ruled_population += pop_size;
                    *agg.population_by_religion.entry(pop_rel_id).or_default() += pop_size;

                    if pop_rel_id == sr_id {
                        agg.state_religion_population += pop_size;
                        follower.state_religion_population += pop_size;
                    }
                }
            }
        }

        let religion_color_hex = |rid: ReligionId| -> Option<String> {
            let rel = self.gamestate.religion_manager.lookup(rid)?;
            Some(format!(
                "#{:02x}{:02x}{:02x}",
                rel.color.0[0], rel.color.0[1], rel.color.0[2]
            ))
        };

        let mut state_religions: Vec<StateReligionRow> = state_rel_aggs
            .iter()
            .filter_map(|(&sr_id, agg)| {
                let color_hex = religion_color_hex(sr_id)?;
                let total = agg.total_ruled_population;
                let sr_pop = agg.state_religion_population;
                let coverage = if total > 0.0 { sr_pop / total } else { 0.0 };

                let mut by_religion: Vec<(ReligionId, f64)> = agg
                    .population_by_religion
                    .iter()
                    .map(|(&k, &v)| (k, v))
                    .collect();
                by_religion.sort_by(|a, b| b.1.total_cmp(&a.1));
                let top_population_religions: Vec<PopulationReligionShare> = by_religion
                    .into_iter()
                    .take(3)
                    .filter_map(|(rid, pop)| {
                        let rel_hex = religion_color_hex(rid)?;
                        Some(PopulationReligionShare {
                            religion: rid,
                            color_hex: rel_hex,
                            population: pop as u32,
                        })
                    })
                    .collect();

                Some(StateReligionRow {
                    religion: sr_id,
                    color_hex,
                    country_count: agg.country_ids.len() as u32,
                    total_ruled_population: total as u32,
                    state_religion_population: sr_pop as u32,
                    other_faith_population: (total - sr_pop) as u32,
                    state_religion_coverage: coverage,
                    top_population_religions,
                })
            })
            .collect();
        state_religions.sort_by(|a, b| {
            b.total_ruled_population
                .cmp(&a.total_ruled_population)
                .then_with(|| a.religion.value().cmp(&b.religion.value()))
        });

        let all_religion_ids: FxHashSet<ReligionId> = state_rel_aggs
            .keys()
            .chain(follower_aggs.keys())
            .copied()
            .collect();

        let mut religions: Vec<ReligionRow> = all_religion_ids
            .iter()
            .filter_map(|&rid| {
                let color_hex = religion_color_hex(rid)?;
                let state_agg = state_rel_aggs.get(&rid);
                let follower_agg = follower_aggs.get(&rid);

                let state_country_count =
                    state_agg.map(|a| a.country_ids.len() as u32).unwrap_or(0);
                let total_ruled = state_agg.map(|a| a.total_ruled_population).unwrap_or(0.0);
                let sr_pop = state_agg
                    .map(|a| a.state_religion_population)
                    .unwrap_or(0.0);
                let coverage = if total_ruled > 0.0 {
                    sr_pop / total_ruled
                } else {
                    0.0
                };

                let follower_population =
                    follower_agg.map(|a| a.total_followers as u32).unwrap_or(0);
                let followers_as_state = follower_agg
                    .map(|a| a.state_religion_population as u32)
                    .unwrap_or(0);

                Some(ReligionRow {
                    religion: rid,
                    color_hex,
                    state_country_count,
                    total_ruled_population: total_ruled as u32,
                    state_religion_population: sr_pop as u32,
                    other_faith_population: (total_ruled - sr_pop) as u32,
                    state_religion_coverage: coverage,
                    follower_population,
                    followers_outside_same_faith_states: follower_population
                        .saturating_sub(followers_as_state),
                })
            })
            .collect();
        religions.sort_by(|a, b| {
            b.total_ruled_population
                .cmp(&a.total_ruled_population)
                .then_with(|| a.religion.value().cmp(&b.religion.value()))
        });

        ReligionInsightData {
            state_religions,
            religions,
        }
    }

    pub(crate) fn calculate_building_levels_insight(&self) -> BuildingLevelsInsightData<'_> {
        use crate::presentation::BuildingKeyRef;
        use eu5save::models::CountryId;

        let is_empty = self.selection_state.is_empty();
        let in_scope =
            |idx: eu5save::models::LocationIdx| is_empty || self.selection_state.contains(idx);

        #[derive(Default)]
        struct TypeAgg {
            levels: f64,
            foreign_levels: f64,
            employed: f64,
            building_count: u32,
            locations: FxHashSet<u32>,
            foreign_owners: FxHashSet<CountryId>,
        }

        #[derive(Default)]
        struct ForeignOwnerAgg {
            levels: f64,
            employed: f64,
        }

        #[derive(Default)]
        struct ForeignCellAgg {
            levels: f64,
            employed: f64,
            building_count: u32,
        }

        #[derive(Default)]
        struct LocationAgg {
            levels: f64,
            foreign_levels: f64,
        }

        let mut type_agg: FxHashMap<&str, TypeAgg> = FxHashMap::default();
        let mut foreign_owner_agg: FxHashMap<CountryId, ForeignOwnerAgg> = FxHashMap::default();
        let mut foreign_cell_agg: FxHashMap<(&str, CountryId), ForeignCellAgg> =
            FxHashMap::default();
        // (loc_idx_val, kind, foreign_owner) -> foreign levels
        let mut loc_foreign_cell_agg: FxHashMap<(u32, &str, CountryId), f64> = FxHashMap::default();
        let mut loc_agg: FxHashMap<u32, LocationAgg> = FxHashMap::default();

        let mut total_levels = 0.0f64;
        let mut total_foreign_levels = 0.0f64;

        for building in self.gamestate.building_manager.database.iter() {
            let Some(loc_idx) = self.gamestate.locations.get(building.location) else {
                continue;
            };
            if !in_scope(loc_idx) {
                continue;
            }
            let location = self.gamestate.locations.index(loc_idx).location();
            let loc_owner = location.owner;
            if loc_owner.is_dummy() {
                continue;
            }

            let kind: &str = building.kind.to_str();
            let level = building.level;
            let employed = building.employed * 1000.0;
            let is_foreign = building.owner != loc_owner && building.owner.real_id().is_some();
            let loc_idx_val = loc_idx.value();

            total_levels += level;
            if is_foreign {
                total_foreign_levels += level;
            }

            // Type aggregation
            {
                let t = type_agg.entry(kind).or_default();
                t.levels += level;
                t.employed += employed;
                t.building_count += 1;
                t.locations.insert(loc_idx_val);
                if is_foreign {
                    t.foreign_levels += level;
                    t.foreign_owners.insert(building.owner);
                }
            }

            // Location aggregation
            {
                let la = loc_agg.entry(loc_idx_val).or_default();
                la.levels += level;
                if is_foreign {
                    la.foreign_levels += level;
                }
            }

            if is_foreign {
                // Foreign owner aggregation
                {
                    let fo = foreign_owner_agg.entry(building.owner).or_default();
                    fo.levels += level;
                    fo.employed += employed;
                }
                // Foreign cell aggregation (by kind + owner, for heatmap)
                {
                    let fc = foreign_cell_agg.entry((kind, building.owner)).or_default();
                    fc.levels += level;
                    fc.employed += employed;
                    fc.building_count += 1;
                }
                // Per-location foreign cell (location + kind + owner, for location table)
                *loc_foreign_cell_agg
                    .entry((loc_idx_val, kind, building.owner))
                    .or_default() += level;
            }
        }

        let location_count = loc_agg.len() as u32;

        // Build type summaries (all types, sorted by levels descending). Keep
        // the borrowed kind alongside each entry so we can sort by key without
        // allocating a tag string.
        let mut types_with_keys: Vec<(&str, BuildingTypeSummary<'_>)> = type_agg
            .into_iter()
            .map(|(kind, t)| {
                (
                    kind,
                    BuildingTypeSummary {
                        building: BuildingKeyRef(kind),
                        levels: t.levels,
                        foreign_levels: t.foreign_levels,
                        employed: t.employed,
                        building_count: t.building_count,
                        location_count: t.locations.len() as u32,
                        foreign_owner_count: t.foreign_owners.len() as u32,
                    },
                )
            })
            .collect();
        types_with_keys
            .sort_by(|a, b| b.1.levels.total_cmp(&a.1.levels).then_with(|| a.0.cmp(b.0)));

        // Keep the top foreign owners needed by the owner/type cell table.
        let foreign_owner_count = foreign_owner_agg.len() as u32;
        let mut foreign_owner_vec: Vec<(CountryId, ForeignOwnerAgg)> =
            foreign_owner_agg.into_iter().collect();
        foreign_owner_vec.sort_by(|a, b| {
            b.1.levels
                .total_cmp(&a.1.levels)
                .then_with(|| b.1.employed.total_cmp(&a.1.employed))
        });
        foreign_owner_vec.truncate(20);

        // Build foreign owner cells for top 20 types x top 20 foreign owners
        let top_type_kinds: FxHashSet<&str> =
            types_with_keys.iter().take(20).map(|t| t.0).collect();
        let top_owner_ids: FxHashSet<CountryId> = foreign_owner_vec
            .iter()
            .take(20)
            .map(|(cid, _)| *cid)
            .collect();

        // Resolve workspace CountryRef for each top foreign owner.
        let owner_erefs: FxHashMap<CountryId, CountryRefSource> = foreign_owner_vec
            .iter()
            .take(20)
            .filter_map(|(cid, _)| {
                let cidx = self.gamestate.countries.get(*cid)?;
                Some((*cid, self.country_ref_from_country_idx(cidx)))
            })
            .collect();

        let mut foreign_owner_cells: Vec<BuildingTypeForeignOwnerCell<'_>> = foreign_cell_agg
            .into_iter()
            .filter(|&((kind, ref cid), _)| {
                top_type_kinds.contains(kind) && top_owner_ids.contains(cid)
            })
            .filter_map(|((kind, cid), fc)| {
                let owner = owner_erefs.get(&cid)?.clone();
                Some(BuildingTypeForeignOwnerCell {
                    building: BuildingKeyRef(kind),
                    owner,
                    levels: fc.levels,
                    employed: fc.employed,
                    building_count: fc.building_count,
                })
            })
            .collect();
        foreign_owner_cells.sort_by(|a, b| b.levels.total_cmp(&a.levels));

        // Scope-level foreign counts (loc_agg consumed below, owner_agg consumed above)
        let foreign_location_count = loc_agg
            .values()
            .filter(|la| la.foreign_levels > 0.0)
            .count() as u32;

        // Build top 100 foreign (location, kind, owner) rows sorted by foreign levels
        let mut loc_foreign_vec: Vec<((u32, &str, CountryId), f64)> =
            loc_foreign_cell_agg.into_iter().collect();
        loc_foreign_vec.sort_by(|a, b| b.1.total_cmp(&a.1));
        loc_foreign_vec.truncate(100);

        let foreign_location_rows: Vec<ForeignBuildingLocationRow<'_>> = loc_foreign_vec
            .into_iter()
            .filter_map(|((loc_idx_val, kind, foreign_owner_id), fl)| {
                let loc_idx = eu5save::models::LocationIdx::new(loc_idx_val);
                let loc = self.gamestate.locations.index(loc_idx).location();
                let location_owner = self.owner_country_ref_for_location(loc)?;
                let foreign_cidx = self.gamestate.countries.get(foreign_owner_id)?;
                let foreign_owner = self.country_ref_from_country_idx(foreign_cidx);
                let location_total_levels = loc_agg.get(&loc_idx_val).map_or(0.0, |la| la.levels);
                Some(ForeignBuildingLocationRow {
                    location: loc_idx,
                    location_owner,
                    foreign_owner,
                    building: BuildingKeyRef(kind),
                    foreign_levels: fl,
                    location_total_levels,
                })
            })
            .collect();

        // Build top 50 locations sorted by total levels descending
        let mut loc_vec: Vec<(u32, LocationAgg)> = loc_agg.into_iter().collect();
        loc_vec.sort_by(|a, b| {
            b.1.levels
                .total_cmp(&a.1.levels)
                .then_with(|| b.1.foreign_levels.total_cmp(&a.1.foreign_levels))
                .then_with(|| a.0.cmp(&b.0))
        });
        loc_vec.truncate(50);

        let top_locations: Vec<BuildingLevelsTopLocation> = loc_vec
            .into_iter()
            .filter_map(|(loc_idx_val, la)| {
                let loc_idx = eu5save::models::LocationIdx::new(loc_idx_val);
                let loc = self.gamestate.locations.index(loc_idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(BuildingLevelsTopLocation {
                    location: loc_idx,
                    owner,
                    levels: la.levels,
                })
            })
            .collect();

        BuildingLevelsInsightData {
            scope: BuildingLevelsScopeSummary {
                location_count,
                total_levels,
                foreign_levels: total_foreign_levels,
                foreign_location_count,
                foreign_owner_count,
            },
            types: types_with_keys
                .into_iter()
                .map(|(_, summary)| summary)
                .collect(),
            foreign_owner_cells,
            foreign_location_rows,
            top_locations,
        }
    }

    pub fn get_wealth_scope(&self) -> WealthScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_wealth = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_wealth += loc.possible_tax;
            location_count += 1;
        }

        WealthScope {
            location_count,
            total_wealth,
            avg_wealth: if location_count > 0 {
                total_wealth / location_count as f64
            } else {
                0.0
            },
            is_empty,
        }
    }

    pub fn get_unrealized_tax_base_scope(&self) -> UnrealizedTaxBaseScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_tax_base = 0.0f64;
        let mut total_wealth = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_tax_base += loc.tax;
            total_wealth += loc.possible_tax;
            location_count += 1;
        }

        let unrealized_tax_base = total_wealth - total_tax_base;

        UnrealizedTaxBaseScope {
            location_count,
            unrealized_tax_base,
            realization_ratio: if total_wealth > 0.0 {
                total_tax_base / total_wealth
            } else {
                0.0
            },
            is_empty,
        }
    }

    pub(crate) fn calculate_rgo_insight(&self) -> RgoInsightData<'_> {
        const TOP_LOCATIONS_CAP: usize = 50;
        const PROFILE_DELTA_CAP: usize = 20;

        let is_selection_empty = self.selection_state.is_empty();

        #[derive(Default)]
        struct MaterialAgg {
            total_rgo_level: f64,
            location_count: u32,
            levels: Vec<f64>,
        }

        struct LocEntry<'a> {
            idx: LocationIdx,
            raw_material: GoodName<'a>,
            rgo_level: f64,
        }

        let mut scoped_mat: FxHashMap<GoodName<'_>, MaterialAgg> = FxHashMap::default();
        let mut global_mat_total: FxHashMap<GoodName<'_>, f64> = FxHashMap::default();

        let mut scoped_total = 0.0_f64;
        let mut global_total = 0.0_f64;
        let mut scoped_loc_count = 0u32;
        let mut scoped_locs: Vec<LocEntry<'_>> = Vec::new();

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            let Some(raw_material) = loc.raw_material else {
                continue;
            };
            if loc.rgo_level <= 0.0 {
                continue;
            }

            let idx = entry.idx();
            let in_scope = is_selection_empty || self.selection_state.contains(idx);

            *global_mat_total.entry(raw_material).or_default() += loc.rgo_level;
            global_total += loc.rgo_level;

            if in_scope {
                scoped_total += loc.rgo_level;
                scoped_loc_count += 1;

                let mat = scoped_mat.entry(raw_material).or_default();
                mat.total_rgo_level += loc.rgo_level;
                mat.location_count += 1;
                mat.levels.push(loc.rgo_level);

                if loc.owner.real_id().is_some() {
                    scoped_locs.push(LocEntry {
                        idx,
                        raw_material,
                        rgo_level: loc.rgo_level,
                    });
                }
            }
        }

        let mut mat_entries: Vec<(GoodName<'_>, MaterialAgg)> = scoped_mat.into_iter().collect();
        mat_entries.sort_by(|a, b| b.1.total_rgo_level.total_cmp(&a.1.total_rgo_level));

        for (_, agg) in &mut mat_entries {
            agg.levels.sort_by(f64::total_cmp);
        }

        let materials: Vec<RgoMaterialSummary<'_>> = mat_entries
            .iter()
            .map(|(raw_material, agg)| {
                let n = agg.levels.len();
                let median_rgo_level = if n % 2 == 1 {
                    agg.levels[n / 2]
                } else {
                    (agg.levels[n / 2 - 1] + agg.levels[n / 2]) / 2.0
                };
                let scoped_share = if scoped_total > 0.0 {
                    agg.total_rgo_level / scoped_total
                } else {
                    0.0
                };
                let global_rgo = global_mat_total.get(raw_material).copied().unwrap_or(0.0);
                let global_share = if global_total > 0.0 {
                    global_rgo / global_total
                } else {
                    0.0
                };
                RgoMaterialSummary {
                    raw_material: crate::presentation::GoodRefSource(*raw_material),
                    total_rgo_level: agg.total_rgo_level,
                    avg_rgo_level: agg.total_rgo_level / agg.location_count as f64,
                    median_rgo_level,
                    location_count: agg.location_count,
                    scoped_share,
                    global_share,
                }
            })
            .collect();

        let profile_deltas: Vec<RgoMaterialProfileDelta<'_>> = if is_selection_empty {
            Vec::new()
        } else {
            let scoped_lookup: FxHashMap<GoodName<'_>, &MaterialAgg> =
                mat_entries.iter().map(|(name, agg)| (*name, agg)).collect();

            let mut deltas: Vec<RgoMaterialProfileDelta<'_>> = global_mat_total
                .iter()
                .map(|(raw_material, global_rgo)| {
                    let scoped_agg = scoped_lookup.get(raw_material).copied();
                    let scoped_rgo = scoped_agg.map(|a| a.total_rgo_level).unwrap_or(0.0);
                    let location_count = scoped_agg.map(|a| a.location_count).unwrap_or(0);
                    let scoped_share = if scoped_total > 0.0 {
                        scoped_rgo / scoped_total
                    } else {
                        0.0
                    };
                    let global_share = if global_total > 0.0 {
                        global_rgo / global_total
                    } else {
                        0.0
                    };
                    RgoMaterialProfileDelta {
                        raw_material: *raw_material,
                        scoped_share,
                        global_share,
                        share_delta: scoped_share - global_share,
                        total_rgo_level: scoped_rgo,
                        location_count,
                    }
                })
                .collect();
            deltas.sort_by(|a, b| {
                b.share_delta
                    .abs()
                    .total_cmp(&a.share_delta.abs())
                    .then_with(|| a.raw_material.to_str().cmp(b.raw_material.to_str()))
            });
            deltas.truncate(PROFILE_DELTA_CAP);
            deltas
        };

        scoped_locs.sort_by(|a, b| b.rgo_level.total_cmp(&a.rgo_level));
        let top_locations: Vec<RgoTopLocation<'_>> = scoped_locs
            .iter()
            .take(TOP_LOCATIONS_CAP)
            .filter_map(|entry| {
                let loc = self.gamestate.locations.index(entry.idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(RgoTopLocation {
                    location: entry.idx,
                    owner,
                    raw_material: entry.raw_material,
                    rgo_level: entry.rgo_level,
                })
            })
            .collect();

        let scope = RgoScopeSummary {
            location_count: scoped_loc_count,
            total_rgo_level: scoped_total,
            avg_rgo_level: if scoped_loc_count > 0 {
                scoped_total / scoped_loc_count as f64
            } else {
                0.0
            },
            is_empty: is_selection_empty,
        };

        RgoInsightData {
            scope,
            materials,
            profile_deltas,
            top_locations,
        }
    }

    pub(crate) fn calculate_control_insight(&self) -> ControlInsightData {
        const COUNTRY_BAR_CAP: usize = 20;
        const COUNTRY_SCATTER_CAP: usize = 250;
        const TOP_LOCATION_CAP: usize = 50;
        const MIN_SCATTER_DEVELOPMENT: f64 = 10.0;
        const MIN_SCATTER_LOCATIONS: u32 = 5;
        const CONTROL_BANDS: [(&str, f64, f64); 5] = [
            ("superficial", 0.0, 0.25),
            ("functional", 0.25, 0.50),
            ("effective", 0.50, 0.75),
            ("great", 0.75, 0.90),
            ("perfect", 0.90, 1.01),
        ];

        #[derive(Default, Clone, Copy)]
        struct ControlBandAgg {
            development: f64,
            lost_development: f64,
            location_count: u32,
        }

        #[derive(Default)]
        struct CountryControlAgg {
            total_development: f64,
            effective_development: f64,
            lost_development: f64,
            location_count: u32,
            bands: [ControlBandAgg; 5],
        }

        fn weighted_avg_control(agg: &CountryControlAgg) -> f64 {
            if agg.total_development > 0.0 {
                agg.effective_development / agg.total_development
            } else {
                0.0
            }
        }

        struct ControlLocationCandidate {
            idx: LocationIdx,
            control: f64,
            development: f64,
            lost_development: f64,
            population: u32,
        }

        let is_empty = self.selection_state.is_empty();
        let mut country_aggs: FxHashMap<CountryId, CountryControlAgg> = FxHashMap::default();
        let mut location_candidates: Vec<ControlLocationCandidate> = Vec::new();

        let mut scope_total_development = 0.0f64;
        let mut scope_effective_development = 0.0f64;
        let mut scope_lost_development = 0.0f64;
        let mut scope_location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !is_empty && !self.selection_state.contains(idx) {
                continue;
            }
            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) else {
                continue;
            };

            let development = loc.development;
            let control = loc.control.clamp(0.0, 1.0);
            let effective_development = control * development;
            let lost_development = (1.0 - control) * development;
            let population = self.gamestate.location_population(loc) as u32;

            scope_total_development += development;
            scope_effective_development += effective_development;
            scope_lost_development += lost_development;
            scope_location_count += 1;

            let agg = country_aggs.entry(owner_id).or_default();
            agg.total_development += development;
            agg.effective_development += effective_development;
            agg.lost_development += lost_development;
            agg.location_count += 1;

            let band_idx = CONTROL_BANDS
                .iter()
                .position(|(_, lo, hi)| control >= *lo && control < *hi)
                .unwrap_or(4);
            agg.bands[band_idx].development += development;
            agg.bands[band_idx].lost_development += lost_development;
            agg.bands[band_idx].location_count += 1;

            if lost_development > 0.0 {
                location_candidates.push(ControlLocationCandidate {
                    idx,
                    control,
                    development,
                    lost_development,
                    population,
                });
            }
        }

        let scope_weighted_avg_control = if scope_total_development > 0.0 {
            scope_effective_development / scope_total_development
        } else {
            0.0
        };

        let total_countries = country_aggs.len();

        // Sort once; bar and scatter both draw from this order.
        let mut all_countries: Vec<(CountryId, CountryControlAgg)> =
            country_aggs.into_iter().collect();
        all_countries.sort_by(|a, b| {
            b.1.lost_development
                .total_cmp(&a.1.lost_development)
                .then_with(|| a.0.value().cmp(&b.0.value()))
        });

        // Bar: top 20 by lost_development, with band detail.
        let bar_countries: Vec<CountryControlBarSummary> = all_countries
            .iter()
            .take(COUNTRY_BAR_CAP)
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(*cid)?;
                let country = self.country_ref_from_country_idx(cidx);
                let bands = CONTROL_BANDS
                    .iter()
                    .enumerate()
                    .map(|(i, (name, _, _))| ControlBandSegment {
                        band: name.to_string(),
                        lost_development: agg.bands[i].lost_development,
                        development: agg.bands[i].development,
                        location_count: agg.bands[i].location_count,
                    })
                    .collect();
                Some(CountryControlBarSummary {
                    country,
                    total_development: agg.total_development,
                    effective_development: agg.effective_development,
                    lost_development: agg.lost_development,
                    weighted_avg_control: weighted_avg_control(agg),
                    location_count: agg.location_count,
                    bands,
                })
            })
            .collect();

        // Scatter: all countries (selection active) or materiality-filtered (global),
        // capped to 250. No band detail needed.
        let to_scatter_point =
            |(cid, agg): &(CountryId, CountryControlAgg)| -> Option<CountryControlPoint> {
                let cidx = self.gamestate.countries.get(*cid)?;
                let country = self.country_ref_from_country_idx(cidx);
                Some(CountryControlPoint {
                    country,
                    total_development: agg.total_development,
                    lost_development: agg.lost_development,
                    weighted_avg_control: weighted_avg_control(agg),
                    location_count: agg.location_count,
                })
            };

        let scatter_countries: Vec<CountryControlPoint> = if !is_empty {
            all_countries
                .iter()
                .take(COUNTRY_SCATTER_CAP)
                .filter_map(to_scatter_point)
                .collect()
        } else {
            all_countries
                .iter()
                .filter(|(_, agg)| {
                    agg.lost_development > 0.0
                        || agg.total_development >= MIN_SCATTER_DEVELOPMENT
                        || agg.location_count >= MIN_SCATTER_LOCATIONS
                })
                .take(COUNTRY_SCATTER_CAP)
                .filter_map(to_scatter_point)
                .collect()
        };

        // Top locations: first 50 by lost_development.
        location_candidates.sort_by(|a, b| {
            b.lost_development
                .total_cmp(&a.lost_development)
                .then_with(|| a.idx.value().cmp(&b.idx.value()))
        });

        let top_locations: Vec<ControlTopLocation> = location_candidates
            .iter()
            .take(TOP_LOCATION_CAP)
            .filter_map(|cand| {
                let loc = self.gamestate.locations.index(cand.idx).location();
                let owner = self.owner_country_ref_for_location(loc)?;
                Some(ControlTopLocation {
                    location: cand.idx,
                    owner,
                    control: cand.control,
                    development: cand.development,
                    lost_development: cand.lost_development,
                    population: cand.population,
                })
            })
            .collect();

        ControlInsightData {
            scope: ControlScopeSummary {
                location_count: scope_location_count,
                country_count: total_countries as u32,
                total_development: scope_total_development,
                effective_development: scope_effective_development,
                lost_development: scope_lost_development,
                weighted_avg_control: scope_weighted_avg_control,
                is_empty,
            },
            bar_countries,
            scatter_countries,
            top_locations,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use eu5save::models::CountryIdx;

    fn candidate(
        country_idx_value: u32,
        great_power_rank: i32,
        is_player: bool,
        total_state_efficacy: f64,
        active_state_capacity: f64,
        total_population: u32,
        tax_trade_income: f64,
    ) -> PoliticalWorldCandidate {
        PoliticalWorldCandidate {
            great_power_rank,
            is_player,
            row: PoliticalWorldRow {
                ordinal_rank: 0,
                country: CountryRefSource {
                    country_idx: CountryIdx::from_value(country_idx_value).unwrap(),
                },
                total_state_efficacy,
                active_state_capacity,
                total_population,
                tax_trade_income,
            },
        }
    }

    #[test]
    fn political_world_rows_sort_and_assign_ordinals() {
        let rows = political_world_display_rows(vec![
            candidate(2, 30, false, 2.5, 250.0, 200, 20.0),
            candidate(1, 10, false, 1.5, 150.0, 100, 10.0),
            candidate(3, 20, true, 3.5, 350.0, 300, 30.0),
        ]);

        assert_eq!(
            rows.iter()
                .map(|row| row.country.country_idx.value())
                .collect::<Vec<_>>(),
            [1, 3, 2]
        );
        assert_eq!(
            rows.iter().map(|row| row.ordinal_rank).collect::<Vec<_>>(),
            [10, 20, 30]
        );
        assert_eq!(rows[1].total_state_efficacy, 3.5);
        assert_eq!(rows[1].active_state_capacity, 350.0);
        assert_eq!(rows[1].total_population, 300);
        assert_eq!(rows[1].tax_trade_income, 30.0);
    }

    #[test]
    fn political_world_rows_append_players_outside_top_ten() {
        let mut candidates = (1..=12)
            .map(|rank| {
                candidate(
                    rank as u32,
                    rank,
                    false,
                    rank as f64,
                    rank as f64 * 100.0,
                    rank as u32,
                    0.0,
                )
            })
            .collect::<Vec<_>>();
        candidates[11].is_player = true;

        let rows = political_world_display_rows(candidates);

        assert_eq!(rows.len(), 11);
        assert_eq!(rows[9].country.country_idx.value(), 10);
        assert_eq!(rows[9].ordinal_rank, 10);
        assert_eq!(rows[10].country.country_idx.value(), 12);
        assert_eq!(rows[10].ordinal_rank, 12);
        assert!(!rows.iter().any(|row| row.country.country_idx.value() == 11));
    }

    #[test]
    fn political_world_rows_return_empty_for_empty_input() {
        assert!(political_world_display_rows(Vec::new()).is_empty());
    }
}
