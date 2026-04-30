use super::*;

impl<'bump> Eu5Workspace<'bump> {
    /// Returns the entity kind for the current single-entity scope.
    pub fn derived_entity_kind(&self) -> Option<EntityKind> {
        self.derived_entity_kind
    }

    pub fn active_profile_identity(&self) -> Option<ActiveProfileIdentity> {
        if let Some(idx) = self.selection_state.focused_location() {
            return Some(ActiveProfileIdentity::Location {
                location_idx: idx.value(),
                label: self.location_name(idx).to_string(),
            });
        }

        if let (Some(anchor), Some(kind)) = (self.derived_entity_anchor, self.derived_entity_kind) {
            return match kind {
                EntityKind::Country => {
                    self.country_header(anchor, self.empty_headline()).map(|h| {
                        ActiveProfileIdentity::Country {
                            anchor_location_idx: h.anchor_location_idx,
                            label: h.name,
                        }
                    })
                }
                EntityKind::Market => self.market_header(anchor, self.empty_headline()).map(|h| {
                    ActiveProfileIdentity::Market {
                        anchor_location_idx: h.anchor_location_idx,
                        label: h.name,
                    }
                }),
            };
        }

        if self.selection_state.len() == 1 {
            let idx = self
                .selection_state
                .selected_locations()
                .iter()
                .next()
                .copied()?;
            return Some(ActiveProfileIdentity::Location {
                location_idx: idx.value(),
                label: self.location_name(idx).to_string(),
            });
        }

        None
    }

    fn empty_headline(&self) -> HeadlineStats {
        HeadlineStats {
            location_count: 0,
            total_development: 0.0,
            total_population: 0,
        }
    }

    fn headline_for_locations(&self, locations: &[LocationIdx]) -> HeadlineStats {
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_development += loc.development;
            total_population += self.gamestate.location_population(loc) as u32;
        }
        HeadlineStats {
            location_count: locations.len() as u32,
            total_development,
            total_population,
        }
    }

    pub fn country_profile_for(&self, anchor_idx: LocationIdx) -> Option<CountryProfile> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Country)?;
        let header = self.country_header(anchor_idx, self.headline_for_locations(&locations))?;
        let overview = self.country_overview(anchor_idx, &locations)?;
        let economy = self.country_economy(anchor_idx, &locations)?;
        let religion = self.country_religion(&locations);
        let locations_section = self.build_locations_section(&locations)?;
        let diplomacy = self.country_diplomacy(anchor_idx)?;
        Some(CountryProfile {
            header,
            overview,
            economy,
            religion,
            locations: locations_section,
            diplomacy,
        })
    }

    pub fn market_profile_for(&self, anchor_idx: LocationIdx) -> Option<MarketProfile> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Market)?;
        let header = self.market_header(anchor_idx, self.headline_for_locations(&locations))?;
        let overview = self.market_overview(anchor_idx, &locations)?;
        let member_countries = self.market_member_countries(&locations);
        let locations = self.build_locations_section(&locations)?;
        Some(MarketProfile {
            header,
            overview,
            locations,
            member_countries,
        })
    }

    pub fn country_population_profile_for(
        &self,
        anchor_idx: LocationIdx,
    ) -> Option<CountryPopulationProfile> {
        #[derive(Default)]
        struct RankAgg {
            population: u32,
            location_count: u32,
        }

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

        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Country)?;
        let mut rank_totals = [
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
        ];
        let mut type_aggs: [TypeAgg; 8] = Default::default();

        for idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            let population = self.gamestate.location_population(loc) as u32;
            let rank_idx = match &loc.rank {
                LocationRank::RuralSettlement => Some(0),
                LocationRank::Town => Some(1),
                LocationRank::City => Some(2),
                LocationRank::Metropolis => Some(3),
                LocationRank::Other => None,
            };
            if let Some(rank_idx) = rank_idx {
                rank_totals[rank_idx].population += population;
                rank_totals[rank_idx].location_count += 1;
            }

            for &pop_id in loc.population.pops {
                let Some(pop) = self.gamestate.population.database.lookup(pop_id) else {
                    continue;
                };
                let Some(type_idx) = pop_type_id(pop.kind) else {
                    continue;
                };
                let agg = &mut type_aggs[type_idx];
                agg.population += pop.size;
                agg.satisfaction_num += pop.satisfaction * pop.size;
                agg.literacy_num += pop.literacy * pop.size;
                agg.pop_count += 1;
            }
        }

        let total_population: f64 = type_aggs.iter().map(|a| a.population).sum();
        let type_profile = (0u8..8)
            .map(|i| {
                let agg = &type_aggs[i as usize];
                let share = if total_population > 0.0 {
                    agg.population / total_population
                } else {
                    0.0
                };
                PopulationTypeProfileRow {
                    population_type: i,
                    population: agg.population,
                    share,
                    baseline_population: agg.population,
                    baseline_share: share,
                    share_delta: 0.0,
                    avg_satisfaction: if agg.population > 0.0 {
                        agg.satisfaction_num / agg.population
                    } else {
                        0.0
                    },
                    avg_literacy: if agg.population > 0.0 {
                        agg.literacy_num / agg.population
                    } else {
                        0.0
                    },
                    pop_count: agg.pop_count,
                }
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

        Some(CountryPopulationProfile {
            type_profile,
            rank_totals,
        })
    }

    /// Returns header data for the current single-entity scope.
    /// Returns None when the filter is empty or spans multiple entities.
    pub fn entity_header(&self) -> Option<EntityHeader> {
        let anchor = self.derived_entity_anchor?;
        let kind = self.derived_entity_kind()?;
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        let headline = self.headline_for_locations(&locations);
        match kind {
            EntityKind::Country => self.country_header(anchor, headline),
            EntityKind::Market => self.market_header(anchor, headline),
        }
    }

    fn country_header(
        &self,
        anchor: eu5save::models::LocationIdx,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let entry = self.gamestate.countries.index(country_idx);
        let data = entry.data()?;
        let tag = entry.tag().to_str().to_string();
        let name = self.localized_country_name(&data.country_name).to_string();
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            data.color.0[0], data.color.0[1], data.color.0[2]
        );
        Some(EntityHeader {
            kind: EntityKind::Country,
            name,
            tag: Some(tag),
            color_hex,
            anchor_location_idx: anchor.value(),
            headline,
        })
    }

    fn market_header(
        &self,
        anchor: eu5save::models::LocationIdx,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;
        let center_idx = self.gamestate.locations.get(market.center)?;
        let name = format!("{} Market", self.location_name(center_idx));
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            market.color.0[0], market.color.0[1], market.color.0[2]
        );
        Some(EntityHeader {
            kind: EntityKind::Market,
            name,
            tag: None,
            color_hex,
            anchor_location_idx: anchor.value(),
            headline,
        })
    }

    /// Returns aggregated overview stats for the current country scope.
    pub fn country_overview_section(&self) -> Option<CountryOverviewSection> {
        let anchor = self.derived_entity_anchor?;
        if !matches!(self.derived_entity_kind()?, EntityKind::Country) {
            return None;
        }
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.country_overview(anchor, &locations)
    }

    /// Returns aggregated overview stats for the current market scope.
    pub fn market_overview_section(&self) -> Option<MarketOverviewSection> {
        let anchor = self.derived_entity_anchor?;
        if !matches!(self.derived_entity_kind()?, EntityKind::Market) {
            return None;
        }
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.market_overview(anchor, &locations)
    }

    fn overview_totals(&self, locations: &[LocationIdx]) -> Option<(f64, f64, f64, f64, f64)> {
        if locations.is_empty() {
            return None;
        }
        let building_levels = self.get_location_building_levels();
        let mut total_control = 0.0_f64;
        let mut total_development = 0.0_f64;
        let mut total_rgo_level = 0.0_f64;
        let mut total_building_levels = 0.0_f64;
        let mut total_possible_tax = 0.0_f64;
        let count = locations.len() as f64;
        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_control += loc.control;
            total_development += loc.development;
            total_rgo_level += loc.rgo_level;
            total_building_levels += building_levels[idx];
            total_possible_tax += loc.possible_tax;
        }

        Some((
            if count > 0.0 {
                total_control / count
            } else {
                0.0
            },
            if count > 0.0 {
                total_development / count
            } else {
                0.0
            },
            total_rgo_level,
            total_building_levels,
            total_possible_tax,
        ))
    }

    fn country_overview(
        &self,
        anchor: LocationIdx,
        locations: &[LocationIdx],
    ) -> Option<CountryOverviewSection> {
        let (
            avg_control,
            avg_development,
            total_rgo_level,
            total_building_levels,
            total_possible_tax,
        ) = self.overview_totals(locations)?;
        let top_economic_indicators = self.country_overview_economic_indicators(
            anchor,
            total_building_levels,
            total_possible_tax,
        )?;

        let diplomatic_summary = self.overview_diplomatic_summary(anchor)?;

        Some(CountryOverviewSection {
            avg_control,
            avg_development,
            total_rgo_level,
            total_building_levels,
            top_economic_indicators,
            diplomatic_summary,
        })
    }

    fn country_religion(&self, locations: &[LocationIdx]) -> CountryReligionSection {
        #[derive(Default)]
        struct ReligionAgg {
            location_count: u32,
            population: u32,
        }
        let mut by_religion: HashMap<eu5save::models::ReligionId, ReligionAgg> = HashMap::new();

        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();

            if let Some(rid) = loc.religion {
                by_religion.entry(rid).or_default().location_count += 1;
            }

            for &pop_id in loc.population.pops {
                if let Some(pop) = self.gamestate.population.database.lookup(pop_id) {
                    let pop_size = (pop.size * 1000.0).floor() as u32;
                    by_religion.entry(pop.religion).or_default().population += pop_size;
                }
            }
        }

        let mut rows: Vec<ReligionShare> = by_religion
            .into_iter()
            .filter_map(|(rid, agg)| {
                let rel = self.gamestate.religion_manager.lookup(rid)?;
                let color_hex = format!(
                    "#{:02x}{:02x}{:02x}",
                    rel.color.0[0], rel.color.0[1], rel.color.0[2]
                );
                Some(ReligionShare {
                    religion: rel.name.to_str().to_string(),
                    location_count: agg.location_count,
                    population: agg.population,
                    color_hex,
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.location_count
                .cmp(&a.location_count)
                .then_with(|| a.religion.cmp(&b.religion))
        });

        CountryReligionSection {
            religion_breakdown: rows,
        }
    }

    fn market_overview(
        &self,
        anchor: LocationIdx,
        locations: &[LocationIdx],
    ) -> Option<MarketOverviewSection> {
        let (
            avg_control,
            avg_development,
            total_rgo_level,
            total_building_levels,
            total_possible_tax,
        ) = self.overview_totals(locations)?;
        let top_economic_indicators =
            self.market_overview_economic_indicators(anchor, total_possible_tax)?;
        let location_market_access = locations
            .iter()
            .map(|&idx| self.gamestate.locations.index(idx).location().market_access)
            .collect();
        let location_market_attraction = locations
            .iter()
            .map(|&idx| {
                self.gamestate
                    .locations
                    .index(idx)
                    .location()
                    .market_attraction
            })
            .collect();

        Some(MarketOverviewSection {
            avg_control,
            avg_development,
            total_rgo_level,
            total_building_levels,
            top_economic_indicators,
            location_market_access,
            location_market_attraction,
        })
    }

    fn country_overview_economic_indicators(
        &self,
        anchor: eu5save::models::LocationIdx,
        total_building_levels: f64,
        total_possible_tax: f64,
    ) -> Option<Vec<EconomicIndicator>> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let data = self.gamestate.countries.index(country_idx).data()?;
        Some(vec![
            EconomicIndicator {
                label: "Tax base".to_string(),
                value: data.current_tax_base,
                format: IndicatorFormat::Float1,
            },
            EconomicIndicator {
                label: "Monthly trade".to_string(),
                value: data.monthly_trade_value,
                format: IndicatorFormat::Currency,
            },
            EconomicIndicator {
                label: "Gold".to_string(),
                value: data.currency_data.gold,
                format: IndicatorFormat::Currency,
            },
            EconomicIndicator {
                label: "Total buildings".to_string(),
                value: total_building_levels,
                format: IndicatorFormat::Float1,
            },
            EconomicIndicator {
                label: "Total possible tax".to_string(),
                value: total_possible_tax,
                format: IndicatorFormat::Float1,
            },
        ])
    }

    fn market_overview_economic_indicators(
        &self,
        anchor: eu5save::models::LocationIdx,
        total_possible_tax: f64,
    ) -> Option<Vec<EconomicIndicator>> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;
        let mut indicators = vec![EconomicIndicator {
            label: "Market value".to_string(),
            value: market.market_value(),
            format: IndicatorFormat::Currency,
        }];
        let mut top_goods: Vec<_> = market.goods.iter().collect();
        top_goods.sort_by(|a, b| (b.price * b.total_taken).total_cmp(&(a.price * a.total_taken)));
        indicators.extend(top_goods.into_iter().take(3).map(|good| EconomicIndicator {
            label: format!("Top good: {}", good.good.to_str()),
            value: good.price * good.total_taken,
            format: IndicatorFormat::Currency,
        }));
        indicators.push(EconomicIndicator {
            label: "Total possible tax".to_string(),
            value: total_possible_tax,
            format: IndicatorFormat::Float1,
        });
        Some(indicators)
    }

    fn overview_diplomatic_summary(
        &self,
        anchor: eu5save::models::LocationIdx,
    ) -> Option<DiplomaticSummary> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let overlord =
            self.overlord_of[country_idx].and_then(|idx| self.entity_ref_from_country_idx(idx));
        let subject_count = self
            .gamestate
            .countries
            .iter()
            .filter(|entry| self.overlord_of[entry.idx()] == Some(country_idx))
            .count() as u32;
        Some(DiplomaticSummary {
            overlord,
            subject_count,
        })
    }

    /// Returns economy section for the current country scope.
    pub fn country_economy_section(&self) -> Option<CountryEconomySection> {
        let anchor = self.derived_entity_anchor?;
        if !matches!(self.derived_entity_kind()?, EntityKind::Country) {
            return None;
        }
        let locations: Vec<eu5save::models::LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.country_economy(anchor, &locations)
    }

    /// Returns goods section for the current market scope.
    pub fn market_goods_section(&self) -> Option<MarketGoodsSection> {
        let anchor = self.derived_entity_anchor?;
        if !matches!(self.derived_entity_kind()?, EntityKind::Market) {
            return None;
        }
        let locations: Vec<eu5save::models::LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.market_goods(anchor, &locations)
    }

    fn country_economy(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<CountryEconomySection> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        let data = self.gamestate.countries.index(country_idx).data()?;

        let building_levels = self.get_location_building_levels();
        let mut total_building_levels = 0.0_f64;
        let mut total_possible_tax = 0.0_f64;
        let mut market_counts: FxHashMap<String, u32> = FxHashMap::default();

        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_building_levels += building_levels[idx];
            total_possible_tax += loc.possible_tax;
            if let Some(name) = self.market_center_name_for_location(loc) {
                *market_counts.entry(name).or_insert(0) += 1;
            }
        }

        let mut market_membership: Vec<MarketMembership> = market_counts
            .into_iter()
            .map(|(market_center_name, location_count)| MarketMembership {
                market_center_name,
                location_count,
            })
            .collect();
        market_membership.sort_by(|a, b| b.location_count.cmp(&a.location_count));

        Some(CountryEconomySection {
            current_tax_base: data.current_tax_base,
            monthly_trade_value: data.monthly_trade_value,
            gold: data.currency_data.gold,
            total_building_levels,
            total_possible_tax,
            market_membership,
        })
    }

    fn market_goods(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<MarketGoodsSection> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;

        let building_levels = self.get_location_building_levels();
        let mut total_building_levels = 0.0_f64;
        let mut total_possible_tax = 0.0_f64;
        for &idx in locations {
            let l = self.gamestate.locations.index(idx).location();
            total_building_levels += building_levels[idx];
            total_possible_tax += l.possible_tax;
        }

        let mut top_goods: Vec<MarketGoodEntry> = market
            .goods
            .iter()
            .map(|g| MarketGoodEntry {
                good_name: g.good.to_str().to_string(),
                price: g.price,
                supply: g.supply,
                demand: g.demand,
            })
            .collect();
        top_goods.sort_by(|a, b| b.supply.total_cmp(&a.supply));
        top_goods.truncate(10);

        Some(MarketGoodsSection {
            market_value: market.market_value(),
            total_building_levels,
            total_possible_tax,
            top_goods,
        })
    }

    pub fn market_goods_profile(&self, anchor: LocationIdx) -> Vec<ScopedGoodSummary> {
        let loc = self.gamestate.locations.index(anchor).location();
        let Some(market_id) = loc.market else {
            return Vec::new();
        };
        let Some(market) = self.gamestate.market_manager.get(market_id) else {
            return Vec::new();
        };

        let mut producing_location_counts: FxHashMap<RawMaterialsName, u32> = FxHashMap::default();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() || loc.market != Some(market_id) {
                continue;
            }
            if let Some(raw_material) = loc.raw_material {
                *producing_location_counts.entry(raw_material).or_insert(0) += 1;
            }
        }

        let mut goods: Vec<ScopedGoodSummary> = market
            .goods
            .iter()
            .map(|good| {
                let shortage = (good.demand - good.supply).max(0.0);
                let surplus = (good.supply - good.demand).max(0.0);
                let balance_ratio = if good.demand > 0.0 {
                    good.supply / good.demand
                } else {
                    0.0
                };

                ScopedGoodSummary {
                    name: good.good.to_string(),
                    supply: good.supply,
                    demand: good.demand,
                    total_taken: good.total_taken,
                    weighted_price: if good.total_taken > 0.0 {
                        good.price
                    } else {
                        0.0
                    },
                    shortage,
                    surplus,
                    shortage_value: shortage * good.price,
                    surplus_value: surplus * good.price,
                    balance_ratio,
                    impact: good.impact,
                    stockpile: good.stockpile,
                    market_count: 1,
                    producing_location_count: producing_location_counts
                        .get(&good.good)
                        .copied()
                        .unwrap_or(0),
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
        goods
    }

    /// Returns location rows for all selected locations, sorted by location index.
    pub fn locations_section(&self) -> Option<LocationsSection> {
        self.derived_entity_anchor?;
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.build_locations_section(&locations)
    }

    fn build_locations_section(&self, locations: &[LocationIdx]) -> Option<LocationsSection> {
        if locations.is_empty() {
            return None;
        }
        let mut rows: Vec<LocationRow> = locations
            .iter()
            .map(|&idx| {
                let loc = self.gamestate.locations.index(idx).location();
                let population = self.gamestate.location_population(loc) as u32;
                LocationRow {
                    location_idx: idx.value(),
                    name: self.location_name(idx).to_string(),
                    development: loc.development,
                    population,
                    control: loc.control,
                    tax: loc.tax,
                    possible_tax: loc.possible_tax,
                    owner: self.owner_ref_for_location(loc),
                    market: self.market_ref_for_location(loc),
                }
            })
            .collect();
        rows.sort_by_key(|row| row.location_idx);
        Some(LocationsSection { locations: rows })
    }

    /// Returns diplomacy data for the current country scope.
    /// Returns None for market entities (markets have no diplomacy).
    pub fn diplomacy_section(&self) -> Option<DiplomacySection> {
        let anchor = self.derived_entity_anchor?;
        if matches!(self.derived_entity_kind()?, EntityKind::Market) {
            return None;
        }
        self.country_diplomacy(anchor)
    }

    fn country_diplomacy(&self, anchor: LocationIdx) -> Option<DiplomacySection> {
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let anchor_country_idx = self.gamestate.countries.get(owner_id)?;

        let overlord = self.overlord_of[anchor_country_idx]
            .and_then(|idx| self.entity_ref_from_country_idx(idx));

        let subjects: Vec<EntityRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    self.entity_ref_from_country_idx(entry.idx())
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection { overlord, subjects })
    }

    fn market_member_countries(&self, locations: &[LocationIdx]) -> Vec<MarketMemberCountry> {
        let mut countries: FxHashMap<CountryIdx, (u32, u32, f64)> = FxHashMap::default();
        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            let Some(owner_id) = loc.owner.real_id().map(|id| id.country_id()) else {
                continue;
            };
            let Some(country_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };
            let entry = countries.entry(country_idx).or_insert((0, 0, 0.0));
            entry.0 += 1;
            entry.1 += self.gamestate.location_population(loc) as u32;
            entry.2 += loc.development;
        }

        let mut rows: Vec<_> = countries
            .into_iter()
            .filter_map(|(country_idx, (location_count, population, development))| {
                Some(MarketMemberCountry {
                    country: self.entity_ref_from_country_idx(country_idx)?,
                    location_count,
                    population,
                    development,
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.location_count
                .cmp(&a.location_count)
                .then_with(|| b.population.cmp(&a.population))
                .then_with(|| a.country.name.cmp(&b.country.name))
        });
        rows
    }

    /// Returns a full data profile for a single location.
    /// Returns None for unowned / water tiles.
    pub fn location_profile_for(
        &self,
        idx: eu5save::models::LocationIdx,
    ) -> Option<LocationProfile> {
        let loc = self.gamestate.locations.index(idx).location();
        if loc.owner.is_dummy() {
            return None;
        }

        let name = self.location_name(idx).to_string();
        let population = self.gamestate.location_population(loc) as u32;

        let terrain = match self.location_terrain(idx) {
            Terrain::Other => "Land",
            Terrain::Water => "Water",
            Terrain::Impassable => "Impassable",
        }
        .to_string();

        let religion = loc.religion.and_then(|rid| {
            self.gamestate
                .religion_manager
                .lookup(rid)
                .map(|r| r.name.to_str().to_string())
        });

        let raw_material = loc.raw_material.map(|r| r.to_str().to_string());
        let owner = self.owner_ref_for_location(loc);
        let market = self.market_ref_for_location(loc);

        let location_id = self.gamestate.locations.index(idx).id();
        let buildings: Vec<BuildingEntry> = self
            .gamestate
            .building_manager
            .database
            .iter()
            .filter(|b| b.location == location_id && b.owner == loc.owner)
            .map(|b| BuildingEntry {
                name: b.kind.to_str().to_string(),
                level: b.level,
            })
            .collect();

        Some(LocationProfile {
            header: LocationHeader {
                location_idx: idx.value(),
                name,
                owner,
                market,
            },
            stats: LocationStats {
                development: loc.development,
                population,
                control: loc.control,
                terrain,
                religion,
                raw_material,
                tax: loc.tax,
                possible_tax: loc.possible_tax,
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
            },
            buildings,
        })
    }

    pub(super) fn entity_kind_for_mode(&self) -> EntityKind {
        if self.current_map_mode == MapMode::Markets {
            EntityKind::Market
        } else {
            EntityKind::Country
        }
    }

    pub(super) fn collect_entity_locations(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> Option<Vec<eu5save::models::LocationIdx>> {
        match kind {
            EntityKind::Country => {
                let loc = self.gamestate.locations.index(anchor_idx).location();
                let owner = loc.owner.real_id()?;
                let locations = self
                    .gamestate
                    .locations
                    .iter()
                    .filter(|entry| entry.location().owner.real_id() == Some(owner))
                    .map(|entry| entry.idx())
                    .collect();
                Some(locations)
            }
            EntityKind::Market => {
                let loc = self.gamestate.locations.index(anchor_idx).location();
                let market_id = loc.market?;
                let locations = self
                    .gamestate
                    .locations
                    .iter()
                    .filter(|entry| entry.location().market == Some(market_id))
                    .map(|entry| entry.idx())
                    .collect();
                Some(locations)
            }
        }
    }

    /// Header for a specific entity resolved from `anchor_idx`, over that
    /// entity's full territory in the gamestate (ignores current selection).
    pub fn entity_header_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<EntityHeader> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        let location_count = locations.len() as u32;
        for &idx in &locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_development += loc.development;
            total_population += self.gamestate.location_population(loc) as u32;
        }
        let headline = HeadlineStats {
            location_count,
            total_development,
            total_population,
        };
        match kind {
            EntityKind::Country => self.country_header(anchor_idx, headline),
            EntityKind::Market => self.market_header(anchor_idx, headline),
        }
    }

    /// Overview section for a specific country entity's full territory.
    pub fn country_overview_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<CountryOverviewSection> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Country)?;
        self.country_overview(anchor_idx, &locations)
    }

    /// Overview section for a specific market entity's full territory.
    pub fn market_overview_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<MarketOverviewSection> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Market)?;
        self.market_overview(anchor_idx, &locations)
    }

    /// Economy section for a specific country entity's full territory.
    pub fn country_economy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<CountryEconomySection> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Country)?;
        self.country_economy(anchor_idx, &locations)
    }

    /// Goods section for a specific market entity's full territory.
    pub fn market_goods_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<MarketGoodsSection> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Market)?;
        self.market_goods(anchor_idx, &locations)
    }

    /// Locations section for a specific entity's full territory.
    pub fn locations_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<LocationsSection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        self.build_locations_section(&locations)
    }

    /// Diplomacy section for a specific country entity (by anchor location).
    /// Returns None for market entities or if the anchor doesn't resolve to a country.
    pub fn diplomacy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<DiplomacySection> {
        if matches!(self.entity_kind_for_mode(), EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor_idx).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let anchor_country_idx = self.gamestate.countries.get(owner_id)?;

        let overlord = self.overlord_of[anchor_country_idx]
            .and_then(|idx| self.entity_ref_from_country_idx(idx));

        let subjects: Vec<EntityRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    self.entity_ref_from_country_idx(entry.idx())
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection { overlord, subjects })
    }
}
