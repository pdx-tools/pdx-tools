use super::*;

impl<'bump> Eu5Workspace<'bump> {
    /// Calculate state efficacy scores for all nations
    ///
    /// State efficacy measures territorial quality by combining location control and development.
    /// Formula: Location Efficacy = Control × Development
    /// National metrics: Total Efficacy (sum), Average Efficacy (mean), Location Count, Total Population
    pub fn calculate_state_efficacy_insight(&self) -> StateEfficacyInsightData {
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

        // Single pass through all locations
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();

            // Skip unowned locations
            if location.owner.is_dummy() {
                continue;
            }

            // When a selection is active, only include selected locations
            if !self.selection_state.is_empty()
                && !self.selection_state.contains(location_entry.idx())
            {
                continue;
            }

            // Calculate location efficacy: control × development
            let location_efficacy = location.control * location.development;

            // Get population for this location
            let population = self.gamestate.location_population(location) as u32;
            location_count += 1;
            total_efficacy += location_efficacy;
            total_population += population;

            // Aggregate by country
            let aggregate = aggregates.entry(location.owner).or_default();
            aggregate.total_efficacy += location_efficacy;
            aggregate.location_count += 1;
            aggregate.total_population += population;
        }

        // Convert to result vector
        let mut results: Vec<CountryStateEfficacy> = aggregates
            .into_iter()
            .filter_map(|(country_id, aggregate)| {
                let country_idx = self.gamestate.countries.get(country_id)?;
                let entity_ref = self.entity_ref_from_country_idx(country_idx)?;

                let avg_efficacy = if aggregate.location_count > 0 {
                    aggregate.total_efficacy / (aggregate.location_count as f64)
                } else {
                    0.0
                };

                Some(CountryStateEfficacy {
                    anchor_location_idx: entity_ref.anchor_location_idx,
                    tag: entity_ref.tag,
                    name: entity_ref.name,
                    color_hex: entity_ref.color_hex,
                    total_efficacy: aggregate.total_efficacy,
                    location_count: aggregate.location_count,
                    avg_efficacy,
                    total_population: aggregate.total_population,
                })
            })
            .collect();

        // Sort by total efficacy descending
        results.sort_by(|a, b| {
            b.total_efficacy
                .total_cmp(&a.total_efficacy)
                .then_with(|| a.tag.cmp(&b.tag))
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

    pub fn state_efficacy_location_distribution(&self) -> LocationDistribution {
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
                location_idx: idx.value(),
                name: self.location_name(*idx).to_string(),
                value: *value,
            })
            .collect();

        LocationDistribution {
            metric_label: "State Efficacy".to_string(),
            buckets,
            top_locations,
        }
    }

    pub fn state_efficacy_top_locations(&self) -> Vec<StateEfficacyTopLocation> {
        let mut metrics = self.state_efficacy_location_metrics();
        metrics.sort_by(|a, b| b.1.total_cmp(&a.1));

        const TOP_LOCATIONS: usize = 50;
        metrics
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, state_efficacy, development, control, population)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(StateEfficacyTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
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
    pub fn selection_location_distribution(&self) -> LocationDistribution {
        let building_levels = self.get_location_building_levels();

        let metric_label = match self.current_map_mode {
            MapMode::Control => "Control",
            MapMode::Population => "Population",
            MapMode::RgoLevel => "RGO Level",
            MapMode::BuildingLevels => "Building Levels",
            MapMode::PossibleTax | MapMode::Markets => "Possible Tax",
            MapMode::TaxGap => "Tax Gap",
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
                MapMode::PossibleTax | MapMode::Markets => loc.possible_tax,
                MapMode::TaxGap => loc.possible_tax - loc.tax,
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
                location_idx: idx.value(),
                name: self.location_name(*idx).to_string(),
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
    pub fn calculate_development_insight(&self) -> DevelopmentInsightData {
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
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some(CountryDevSummary {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
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
                .then_with(|| a.tag.cmp(&b.tag))
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
                let owner = self.owner_ref_for_location(loc)?;
                Some(DevTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
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

    /// Possible-tax insight: per-country ceiling aggregates and top locations
    /// by possible tax, over the current selection (or all locations when empty).
    pub fn calculate_possible_tax_insight(&self) -> PossibleTaxInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_possible_tax: f64,
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

            let ptax = loc.possible_tax;
            let pop = self.gamestate.location_population(loc) as u32;
            let ctrl = loc.control;
            let dev = loc.development;
            all_locs.push((entry.idx(), ptax, pop, ctrl, dev));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_possible_tax += ptax;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryPossibleTax> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some(CountryPossibleTax {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    total_possible_tax: agg.total_possible_tax,
                    avg_possible_tax: if agg.count > 0 {
                        agg.total_possible_tax / agg.count as f64
                    } else {
                        0.0
                    },
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_possible_tax
                .total_cmp(&a.total_possible_tax)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        all_locs.sort_by(|a, b| b.1.total_cmp(&a.1));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<PossibleTaxTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, ptax, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(PossibleTaxTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    possible_tax: ptax,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        PossibleTaxInsightData {
            countries,
            top_locations,
            distribution,
        }
    }

    pub fn calculate_tax_gap_insight(&self) -> TaxGapInsightData {
        #[derive(Default)]
        struct TaxAgg {
            total_tax: f64,
            total_possible_tax: f64,
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

            let tax = loc.tax;
            let ptax = loc.possible_tax;
            let gap = ptax - tax;
            let pop = self.gamestate.location_population(loc) as u32;
            all_locs.push((
                entry.idx(),
                tax,
                ptax,
                gap,
                pop,
                loc.control,
                loc.development,
            ));

            if let Some(owner_id) = loc.owner.real_id().map(|r| r.country_id()) {
                let agg = aggregates.entry(owner_id).or_default();
                agg.total_tax += tax;
                agg.total_possible_tax += ptax;
                agg.count += 1;
                agg.pop += pop;
            }
        }

        let mut countries: Vec<CountryTaxGap> = aggregates
            .into_iter()
            .filter_map(|(cid, agg)| {
                let cidx = self.gamestate.countries.get(cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                let tax_gap = agg.total_possible_tax - agg.total_tax;
                let realization_ratio = if agg.total_possible_tax > 0.0 {
                    agg.total_tax / agg.total_possible_tax
                } else {
                    0.0
                };
                Some(CountryTaxGap {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    current_tax_base: agg.total_tax,
                    total_possible_tax: agg.total_possible_tax,
                    tax_gap,
                    realization_ratio,
                    location_count: agg.count,
                    total_population: agg.pop,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.tax_gap
                .total_cmp(&a.tax_gap)
                .then_with(|| a.tag.cmp(&b.tag))
        });

        all_locs.sort_by(|a, b| b.3.total_cmp(&a.3));
        const TOP_LOCATIONS: usize = 50;
        let top_locations: Vec<TaxGapTopLocation> = all_locs
            .iter()
            .take(TOP_LOCATIONS)
            .filter_map(|&(idx, tax, ptax, gap, pop, ctrl, dev)| {
                let loc = self.gamestate.locations.index(idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(TaxGapTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    tax,
                    possible_tax: ptax,
                    tax_gap: gap,
                    development: dev,
                    control: ctrl,
                    population: pop,
                    owner,
                })
            })
            .collect();

        let distribution = self.selection_location_distribution();

        TaxGapInsightData {
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
    pub fn calculate_market_insight(&self) -> MarketInsightData {
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
            center_idx: LocationIdx,
            name: String,
            color_hex: String,
            market_value: f64,
            shortage_pressure: f64,
            surplus_pressure: f64,
            total_taken: f64,
            good_count: u32,
            member_locations: Vec<(LocationIdx, &'a eu5save::models::Location<'a>)>,
        }

        let mut good_aggs: FxHashMap<RawMaterialsName, GoodAgg> = FxHashMap::default();
        let mut market_aggs: Vec<MarketAgg> = Vec::new();
        let mut good_price_by_market: FxHashMap<(u32, RawMaterialsName), (f64, f64, f64)> =
            FxHashMap::default();
        let mut good_market_cells: Vec<crate::selection_views::GoodMarketBalanceCell> = Vec::new();

        let mut total_market_value = 0.0f64;
        let mut total_shortage_value = 0.0f64;
        let mut total_surplus_value = 0.0f64;

        let lookup_center_idx = |center: LocationId| self.gamestate.locations.get(center);

        for market in self.gamestate.market_manager.database.iter() {
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
                good_market_cells.push(crate::selection_views::GoodMarketBalanceCell {
                    good: good.good.to_string(),
                    market_anchor_location_idx: center_idx.value(),
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

            let color_hex = format!(
                "#{:02x}{:02x}{:02x}",
                market.color.0[0], market.color.0[1], market.color.0[2]
            );
            let name = format!("{} Market", self.location_name(center_idx));

            market_aggs.push(MarketAgg {
                center_idx,
                name,
                color_hex,
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
        let mut producing_location_counts: FxHashMap<RawMaterialsName, u32> = FxHashMap::default();

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

        let mut goods: Vec<ScopedGoodSummary> = good_aggs
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
                ScopedGoodSummary {
                    name: name.to_string(),
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
                .then_with(|| a.name.cmp(&b.name))
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
                        anchor_location_idx: agg.center_idx.value(),
                        center_name: agg.name,
                        color_hex: agg.color_hex,
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
                    .then_with(|| a.center_name.cmp(&b.center_name))
            });
            rows
        };

        let mut production_rows: Vec<ProductionLocationSummary> = Vec::new();
        for (idx, loc) in production_candidates {
            let Some(owner) = self.owner_ref_for_location(loc) else {
                continue;
            };
            let Some(raw_material) = loc.raw_material else {
                continue;
            };
            let (market_center_name, center_location_idx_opt) = if let Some(market_id) = loc.market
                && let Some(market) = self.gamestate.market_manager.get(market_id)
                && let Some(center_idx) = lookup_center_idx(market.center)
            {
                (
                    Some(self.location_name(center_idx).to_string()),
                    Some(center_idx.value()),
                )
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
                location_idx: idx.value(),
                name: self.location_name(idx).to_string(),
                owner,
                market_center_name,
                raw_material: Some(raw_material.to_string()),
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
    pub fn calculate_population_insight(&self) -> PopulationInsightData {
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
                let eref = self.entity_ref_from_country_idx(cidx)?;
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
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
                    total_population: agg.population,
                    location_count: agg.location_count,
                    ranks,
                })
            })
            .collect();
        countries.sort_by(|a, b| {
            b.total_population
                .cmp(&a.total_population)
                .then_with(|| a.tag.cmp(&b.tag))
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
                let owner = self.owner_ref_for_location(loc)?;
                Some(PopulationTopLocation {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
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

    pub fn calculate_religion_insight(&self) -> ReligionInsightData {
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

        let religion_color_hex = |rid: ReligionId| -> Option<(String, String)> {
            let rel = self.gamestate.religion_manager.lookup(rid)?;
            let name = rel.name.to_str().to_string();
            let hex = format!(
                "#{:02x}{:02x}{:02x}",
                rel.color.0[0], rel.color.0[1], rel.color.0[2]
            );
            Some((name, hex))
        };

        let mut state_religions: Vec<StateReligionRow> = state_rel_aggs
            .iter()
            .filter_map(|(&sr_id, agg)| {
                let (religion, color_hex) = religion_color_hex(sr_id)?;
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
                        let (rel_name, rel_hex) = religion_color_hex(rid)?;
                        Some(PopulationReligionShare {
                            religion: rel_name,
                            color_hex: rel_hex,
                            population: pop as u32,
                        })
                    })
                    .collect();

                Some(StateReligionRow {
                    religion,
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
                .then_with(|| a.religion.cmp(&b.religion))
        });

        let all_religion_ids: FxHashSet<ReligionId> = state_rel_aggs
            .keys()
            .chain(follower_aggs.keys())
            .copied()
            .collect();

        let mut religions: Vec<ReligionRow> = all_religion_ids
            .iter()
            .filter_map(|&rid| {
                let (religion, color_hex) = religion_color_hex(rid)?;
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
                    religion,
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
                .then_with(|| a.religion.cmp(&b.religion))
        });

        ReligionInsightData {
            state_religions,
            religions,
        }
    }

    pub fn calculate_building_levels_insight(&self) -> BuildingLevelsInsightData {
        use crate::selection_views::ForeignBuildingLocationRow;
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

        // Build type summaries (all types, sorted by levels descending)
        let mut types: Vec<BuildingTypeSummary> = type_agg
            .into_iter()
            .map(|(kind, t)| BuildingTypeSummary {
                kind: kind.to_string(),
                levels: t.levels,
                foreign_levels: t.foreign_levels,
                employed: t.employed,
                building_count: t.building_count,
                location_count: t.locations.len() as u32,
                foreign_owner_count: t.foreign_owners.len() as u32,
            })
            .collect();
        types.sort_by(|a, b| {
            b.levels
                .total_cmp(&a.levels)
                .then_with(|| a.kind.cmp(&b.kind))
        });

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
            types.iter().take(20).map(|t| t.kind.as_str()).collect();
        let top_owner_ids: FxHashSet<CountryId> = foreign_owner_vec
            .iter()
            .take(20)
            .map(|(cid, _)| *cid)
            .collect();

        // Resolve EntityRef for each top foreign owner
        let owner_erefs: FxHashMap<CountryId, EntityRef> = foreign_owner_vec
            .iter()
            .take(20)
            .filter_map(|(cid, _)| {
                let cidx = self.gamestate.countries.get(*cid)?;
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some((*cid, eref))
            })
            .collect();

        let mut foreign_owner_cells: Vec<BuildingTypeForeignOwnerCell> = foreign_cell_agg
            .into_iter()
            .filter(|&((kind, ref cid), _)| {
                top_type_kinds.contains(kind) && top_owner_ids.contains(cid)
            })
            .filter_map(|((kind, cid), fc)| {
                let owner = owner_erefs.get(&cid)?.clone();
                Some(BuildingTypeForeignOwnerCell {
                    kind: kind.to_string(),
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

        let foreign_location_rows: Vec<ForeignBuildingLocationRow> = loc_foreign_vec
            .into_iter()
            .filter_map(|((loc_idx_val, kind, foreign_owner_id), fl)| {
                let loc_idx = eu5save::models::LocationIdx::new(loc_idx_val);
                let loc = self.gamestate.locations.index(loc_idx).location();
                let location_owner = self.owner_ref_for_location(loc)?;
                let foreign_cidx = self.gamestate.countries.get(foreign_owner_id)?;
                let foreign_owner = self.entity_ref_from_country_idx(foreign_cidx)?;
                let location_total_levels = loc_agg.get(&loc_idx_val).map_or(0.0, |la| la.levels);
                Some(ForeignBuildingLocationRow {
                    location_idx: loc_idx_val,
                    location_name: self.location_name(loc_idx).to_string(),
                    location_owner,
                    foreign_owner,
                    kind: kind.to_string(),
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
                let owner = self.owner_ref_for_location(loc)?;
                Some(BuildingLevelsTopLocation {
                    location_idx: loc_idx_val,
                    name: self.location_name(loc_idx).to_string(),
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
            types,
            foreign_owner_cells,
            foreign_location_rows,
            top_locations,
        }
    }

    pub fn get_possible_tax_scope(&self) -> PossibleTaxScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_possible_tax = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_possible_tax += loc.possible_tax;
            location_count += 1;
        }

        PossibleTaxScope {
            location_count,
            total_possible_tax,
            avg_possible_tax: if location_count > 0 {
                total_possible_tax / location_count as f64
            } else {
                0.0
            },
            is_empty,
        }
    }

    pub fn get_tax_gap_scope(&self) -> TaxGapScope {
        let is_empty = self.selection_state.is_empty();
        let mut total_tax = 0.0f64;
        let mut total_possible_tax = 0.0f64;
        let mut location_count = 0u32;

        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() {
                continue;
            }
            if !is_empty && !self.selection_state.contains(entry.idx()) {
                continue;
            }
            total_tax += loc.tax;
            total_possible_tax += loc.possible_tax;
            location_count += 1;
        }

        let tax_gap = total_possible_tax - total_tax;

        TaxGapScope {
            location_count,
            tax_gap,
            realization_ratio: if total_possible_tax > 0.0 {
                total_tax / total_possible_tax
            } else {
                0.0
            },
            is_empty,
        }
    }

    pub fn calculate_rgo_insight(&self) -> RgoInsightData {
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
            raw_material: RawMaterialsName<'a>,
            rgo_level: f64,
        }

        let mut scoped_mat: FxHashMap<RawMaterialsName<'_>, MaterialAgg> = FxHashMap::default();
        let mut global_mat_total: FxHashMap<RawMaterialsName<'_>, f64> = FxHashMap::default();

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

        let mut mat_entries: Vec<(RawMaterialsName<'_>, MaterialAgg)> =
            scoped_mat.into_iter().collect();
        mat_entries.sort_by(|a, b| b.1.total_rgo_level.total_cmp(&a.1.total_rgo_level));

        for (_, agg) in &mut mat_entries {
            agg.levels.sort_by(f64::total_cmp);
        }

        let materials: Vec<RgoMaterialSummary> = mat_entries
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
                    raw_material: raw_material.to_str().to_string(),
                    total_rgo_level: agg.total_rgo_level,
                    avg_rgo_level: agg.total_rgo_level / agg.location_count as f64,
                    median_rgo_level,
                    location_count: agg.location_count,
                    scoped_share,
                    global_share,
                }
            })
            .collect();

        let profile_deltas: Vec<RgoMaterialProfileDelta> = if is_selection_empty {
            Vec::new()
        } else {
            let scoped_lookup: FxHashMap<RawMaterialsName<'_>, &MaterialAgg> =
                mat_entries.iter().map(|(name, agg)| (*name, agg)).collect();

            let mut deltas: Vec<RgoMaterialProfileDelta> = global_mat_total
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
                        raw_material: raw_material.to_str().to_string(),
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
                    .then_with(|| a.raw_material.cmp(&b.raw_material))
            });
            deltas.truncate(PROFILE_DELTA_CAP);
            deltas
        };

        scoped_locs.sort_by(|a, b| b.rgo_level.total_cmp(&a.rgo_level));
        let top_locations: Vec<RgoTopLocation> = scoped_locs
            .iter()
            .take(TOP_LOCATIONS_CAP)
            .filter_map(|entry| {
                let loc = self.gamestate.locations.index(entry.idx).location();
                let owner = self.owner_ref_for_location(loc)?;
                Some(RgoTopLocation {
                    location_idx: entry.idx.value(),
                    name: self.location_name(entry.idx).to_string(),
                    owner,
                    raw_material: entry.raw_material.to_str().to_string(),
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

    pub fn calculate_control_insight(&self) -> ControlInsightData {
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
                let eref = self.entity_ref_from_country_idx(cidx)?;
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
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
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
                let eref = self.entity_ref_from_country_idx(cidx)?;
                Some(CountryControlPoint {
                    anchor_location_idx: eref.anchor_location_idx,
                    tag: eref.tag,
                    name: eref.name,
                    color_hex: eref.color_hex,
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
                let owner = self.owner_ref_for_location(loc)?;
                Some(ControlTopLocation {
                    location_idx: cand.idx.value(),
                    name: self.location_name(cand.idx).to_string(),
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
