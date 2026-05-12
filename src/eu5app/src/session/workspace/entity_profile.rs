use eu5save::models::CountryDiplomacy;

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
                    let loc = self.gamestate.locations.index(anchor).location();
                    let owner_id = loc.owner.real_id()?.country_id();
                    let country_idx = self.gamestate.countries.get(owner_id)?;
                    let h = self.country_header(country_idx, self.empty_headline())?;
                    Some(ActiveProfileIdentity::Country {
                        country_idx: country_idx.value(),
                        label: h.name,
                    })
                }
                EntityKind::Market => {
                    let loc = self.gamestate.locations.index(anchor).location();
                    let market_id = loc.market?;
                    let h = self.market_header(market_id, self.empty_headline())?;
                    Some(ActiveProfileIdentity::Market {
                        market_id: market_id.value(),
                        label: h.name,
                    })
                }
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

    fn headline_for_locations(
        &self,
        locations: impl Iterator<Item = LocationIdx>,
    ) -> HeadlineStats {
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        let mut count = 0;
        for idx in locations {
            count += 1;
            let loc = self.gamestate.locations.index(idx).location();
            total_development += loc.development;
            total_population += self.gamestate.location_population(loc) as u32;
        }
        HeadlineStats {
            location_count: count,
            total_development,
            total_population,
        }
    }

    pub fn country_profile_for(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<CountryProfile> {
        let locations = self.iter_country_locations(country_idx);
        let header =
            self.country_header(country_idx, self.headline_for_locations(locations.clone()))?;
        let overview = self.country_overview(country_idx)?;
        let religion = self.country_religion(locations.clone());
        let locations_section = self.build_locations_section(locations);
        let diplomacy = self.country_diplomacy(country_idx)?;
        Some(CountryProfile {
            header,
            overview,
            religion,
            locations: locations_section,
            diplomacy,
        })
    }

    pub fn market_profile_for(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Option<MarketProfile> {
        let locations = self.iter_market_locations(market_id)?;
        let header =
            self.market_header(market_id, self.headline_for_locations(locations.clone()))?;
        let market = self.gamestate.market_manager.get(market_id)?;
        let market_value = market.market_value();
        let center_idx = self.gamestate.locations.get(market.center)?;
        let center_loc = self.gamestate.locations.index(center_idx).location();
        let owner_country = self.owner_ref_for_location(center_loc);
        let location_market_access = locations
            .clone()
            .map(|idx| self.gamestate.locations.index(idx).location().market_access)
            .collect();
        let location_market_attraction = locations
            .map(|idx| {
                self.gamestate
                    .locations
                    .index(idx)
                    .location()
                    .market_attraction
            })
            .collect();
        let member_countries = self.market_member_countries_from_merchants(market);
        Some(MarketProfile {
            header,
            market_value,
            owner_country,
            location_market_access,
            location_market_attraction,
            member_countries,
        })
    }

    pub fn country_population_profile_for(
        &self,
        country_idx: eu5save::models::CountryIdx,
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

        #[derive(Default)]
        struct SankeyAgg {
            size: u32,
            sat_weighted: f64,
            lit_weighted: f64,
        }

        let locations = self.iter_country_locations(country_idx);
        let mut rank_totals = [
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
            RankAgg::default(),
        ];
        let mut type_aggs: [TypeAgg; 8] = Default::default();
        let mut sankey_map: HashMap<
            (
                PopulationType,
                Option<eu5save::models::CultureId>,
                eu5save::models::ReligionId,
            ),
            SankeyAgg,
        > = HashMap::new();

        for idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            let population = self.gamestate.location_population(loc) as u32;
            let rank_idx = match &loc.rank {
                LocationRank::RuralSettlement => Some(0),
                LocationRank::Town => Some(1),
                LocationRank::City => Some(2),
                LocationRank::Megalopolis => Some(3),
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
                if let Some(type_idx) = pop_type_id(pop.kind) {
                    let agg = &mut type_aggs[type_idx];
                    agg.population += pop.size;
                    agg.satisfaction_num += pop.satisfaction * pop.size;
                    agg.literacy_num += pop.literacy * pop.size;
                    agg.pop_count += 1;
                }
                if pop.kind != PopulationType::Other {
                    let pop_size = (pop.size * 1000.0).floor() as u32;
                    let entry = sankey_map
                        .entry((pop.kind, pop.culture, pop.religion))
                        .or_default();
                    entry.size += pop_size;
                    entry.sat_weighted += pop.satisfaction * pop_size as f64;
                    entry.lit_weighted += pop.literacy * pop_size as f64;
                }
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

        let mut sankey_rows: Vec<LocationPopRow> = sankey_map
            .into_iter()
            .map(|((kind, culture_id, religion_id), agg)| {
                let kind = match kind {
                    PopulationType::Burghers => "Burghers",
                    PopulationType::Clergy => "Clergy",
                    PopulationType::Laborers => "Laborers",
                    PopulationType::Nobles => "Nobles",
                    PopulationType::Peasants => "Peasants",
                    PopulationType::Slaves => "Slaves",
                    PopulationType::Soldiers => "Soldiers",
                    PopulationType::Tribesmen => "Tribesmen",
                    PopulationType::Other => "Other",
                }
                .to_string();
                let (culture_name, culture_color_hex) = culture_id
                    .and_then(|cid| self.gamestate.culture_manager.lookup(cid))
                    .map(|c| {
                        let hex = format!(
                            "#{:02x}{:02x}{:02x}",
                            c.color.0[0], c.color.0[1], c.color.0[2]
                        );
                        (c.name.key().to_str().to_string(), hex)
                    })
                    .unwrap_or_else(|| ("Unknown".to_string(), "#808080".to_string()));
                let (religion_name, religion_color_hex) = self
                    .gamestate
                    .religion_manager
                    .lookup(religion_id)
                    .map(|r| {
                        let hex = format!(
                            "#{:02x}{:02x}{:02x}",
                            r.color.0[0], r.color.0[1], r.color.0[2]
                        );
                        (r.name.to_str().to_string(), hex)
                    })
                    .unwrap_or_else(|| ("Unknown".to_string(), "#808080".to_string()));
                let (satisfaction, literacy) = if agg.size > 0 {
                    (
                        agg.sat_weighted / agg.size as f64,
                        agg.lit_weighted / agg.size as f64,
                    )
                } else {
                    (0.0, 0.0)
                };
                LocationPopRow {
                    kind,
                    culture_name,
                    culture_color_hex,
                    religion_name,
                    religion_color_hex,
                    size: agg.size,
                    satisfaction,
                    literacy,
                }
            })
            .collect();
        sankey_rows.sort_by(|a, b| b.size.cmp(&a.size));

        Some(CountryPopulationProfile {
            type_profile,
            rank_totals,
            sankey_rows,
        })
    }

    /// Returns header data for the current single-entity scope.
    /// Returns None when the filter is empty or spans multiple entities.
    pub fn entity_header(&self) -> Option<EntityHeader> {
        let anchor = self.derived_entity_anchor?;
        let loc = self.gamestate.locations.index(anchor).location();
        let locations = self.selection_state.selected_locations().iter().copied();
        let headline = self.headline_for_locations(locations);
        match self.derived_entity_kind()? {
            EntityKind::Country => {
                let owner_id = loc.owner.real_id()?.country_id();
                let country_idx = self.gamestate.countries.get(owner_id)?;
                self.country_header(country_idx, headline)
            }
            EntityKind::Market => {
                let market_id = loc.market?;
                self.market_header(market_id, headline)
            }
        }
    }

    fn country_header(
        &self,
        country_idx: eu5save::models::CountryIdx,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        let entry = self.gamestate.countries.index(country_idx);
        let data = entry.data()?;
        let tag = entry.tag().to_str().to_string();
        let name = self.localized_country_name(&data.country_name).to_string();
        let color_hex = format!(
            "#{:02x}{:02x}{:02x}",
            data.color.0[0], data.color.0[1], data.color.0[2]
        );
        let anchor_location_idx = self
            .anchor_for_country_idx(country_idx)
            .map(|i| i.value())
            .unwrap_or(0);
        Some(EntityHeader {
            kind: EntityKind::Country,
            name,
            tag: Some(tag),
            color_hex,
            anchor_location_idx,
            headline,
        })
    }

    fn market_header(
        &self,
        market_id: eu5save::models::MarketId,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
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
            anchor_location_idx: center_idx.value(),
            headline,
        })
    }

    fn country_overview(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<CountryOverviewSection> {
        let data = self.gamestate.countries.index(country_idx).data()?;

        Some(CountryOverviewSection {
            gold: data.currency_data.gold,
            manpower: data.currency_data.manpower,
            stability: data.currency_data.stability,
            prestige: data.currency_data.prestige,
            government_power: data.currency_data.government_power,
            income: data.economy.income,
            expense: data.economy.expense,
            monthly_gold: data.economy.monthly_gold.to_vec(),
            recent_balance: data.economy.recent_balance.to_vec(),
            historical_tax_base: data.historical_tax_base.to_vec(),
            historical_population: data.historical_population.to_vec(),
        })
    }

    fn country_religion(
        &self,
        locations: impl Iterator<Item = LocationIdx>,
    ) -> CountryReligionSection {
        #[derive(Default)]
        struct ReligionAgg {
            location_count: u32,
            population: u32,
        }
        let mut by_religion: HashMap<eu5save::models::ReligionId, ReligionAgg> = HashMap::new();

        for idx in locations {
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

    pub fn market_goods_profile(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Vec<ScopedGoodSummary> {
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

                let localized = self.game_data.localized_good(good.good.to_str());
                ScopedGoodSummary {
                    key: good.good.to_string(),
                    name: localized
                        .as_ref()
                        .map(|l| l.name.clone())
                        .unwrap_or_else(|| good.good.to_str().to_string()),
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
                    possible: good.possible,
                    allowed_export_amount: good.allowed_export_amount,
                    priority: good.priority,
                    history: good.history.to_vec(),
                    supplied_breakdown: market_good_breakdown_entries(good.supplied),
                    demanded_breakdown: market_good_breakdown_entries(good.demanded),
                    taken_breakdown: market_good_breakdown_entries(good.taken),
                    default_market_price: localized.as_ref().map(|l| l.default_market_price),
                    color_hex: localized
                        .map(|l| l.color_hex)
                        .unwrap_or_else(|| "#888888".to_string()),
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

    pub fn market_locations_profile(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Vec<MarketProductionLocationSummary> {
        let mut production_rows = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            let loc = entry.location();
            if loc.owner.is_dummy() || loc.market != Some(market_id) {
                continue;
            }

            let Some(raw_material) = loc.raw_material else {
                continue;
            };
            let Some(owner) = self.owner_ref_for_location(loc) else {
                continue;
            };

            production_rows.push(MarketProductionLocationSummary {
                location_idx: idx.value(),
                name: self.location_name(idx).to_string(),
                owner,
                raw_material: Some(raw_material.to_string()),
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
                development: loc.development,
                population: self.gamestate.location_population(loc) as u32,
            });
        }

        production_rows.sort_by(|a, b| {
            b.rgo_level
                .total_cmp(&a.rgo_level)
                .then_with(|| a.name.cmp(&b.name))
        });
        production_rows
    }

    /// Resolve a representative `LocationIdx` for a country from its `CountryIdx`.
    /// Prefers the capital; falls back to the first owned location.
    fn anchor_for_country_idx(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<LocationIdx> {
        let entry = self.gamestate.countries.index(country_idx);
        let data = entry.data()?;
        let owner = entry.id().real_id()?;
        data.capital
            .and_then(|id| self.gamestate.locations.get(id))
            .or_else(|| {
                self.gamestate
                    .locations
                    .iter()
                    .find(|e| e.location().owner.real_id() == Some(owner))
                    .map(|e| e.idx())
            })
    }

    /// Returns location rows for all selected locations, sorted by location index.
    pub fn locations_section(&self) -> Option<LocationsSection> {
        self.derived_entity_anchor?;
        let locations = self.selection_state.selected_locations().iter().copied();
        Some(self.build_locations_section(locations))
    }

    fn build_locations_section(
        &self,
        locations: impl Iterator<Item = LocationIdx>,
    ) -> LocationsSection {
        let mut rows: Vec<LocationRow> = locations
            .map(|idx| {
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
        LocationsSection { locations: rows }
    }

    /// Returns diplomacy data for the current country scope.
    /// Returns None for market entities (markets have no diplomacy).
    pub fn diplomacy_section(&self) -> Option<DiplomacySection> {
        let anchor = self.derived_entity_anchor?;
        if matches!(self.derived_entity_kind()?, EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let country_idx = self.gamestate.countries.get(owner_id)?;
        self.country_diplomacy(country_idx)
    }

    fn country_diplomacy(
        &self,
        anchor_country_idx: eu5save::models::CountryIdx,
    ) -> Option<DiplomacySection> {
        let mut subject_type_map: FxHashMap<CountryIdx, SaveDiplomacySubjectType> =
            FxHashMap::default();
        let mut overlord_subject_type: Option<DiplomacySubjectType> = None;
        for dep in self.gamestate.diplomacy_manager.dependencies() {
            let Some(first_idx) = self.gamestate.countries.get(dep.first) else {
                continue;
            };
            let Some(second_idx) = self.gamestate.countries.get(dep.second) else {
                continue;
            };
            if first_idx == anchor_country_idx {
                subject_type_map.insert(second_idx, dep.subject_type);
            } else if second_idx == anchor_country_idx {
                overlord_subject_type = Some(into_profile_subject_type(dep.subject_type));
            }
        }

        let diplo_map = self.diplomatic_relations();

        #[derive(Default, Clone)]
        struct MetricsAgg {
            total_state_efficacy: f64,
            active_state_capacity: f64,
            total_population: u32,
        }

        let mut metrics_map: FxHashMap<CountryIdx, MetricsAgg> = FxHashMap::default();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|id| id.country_id()) else {
                continue;
            };
            let Some(country_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };
            let agg = metrics_map.entry(country_idx).or_default();
            let population = self.gamestate.location_population(loc) as u32;
            let state_efficacy = loc.control * loc.development;
            agg.total_state_efficacy += state_efficacy;
            agg.active_state_capacity += population as f64 * state_efficacy;
            agg.total_population += population;
        }

        let country_metrics = |idx: CountryIdx| -> CountryMetrics {
            let agg = metrics_map.get(&idx).cloned().unwrap_or_default();
            let data = self.gamestate.countries.index(idx).data();
            let tax_trade_income = data
                .map(|d| d.estimated_monthly_income_trade_and_tax)
                .unwrap_or(0.0);
            let great_power_rank = data.map(|d| d.great_power_rank).unwrap_or(0);
            CountryMetrics {
                great_power_rank,
                total_state_efficacy: agg.total_state_efficacy,
                active_state_capacity: agg.active_state_capacity,
                total_population: agg.total_population,
                tax_trade_income,
            }
        };

        let overlord_country_idx = self.overlord_of[anchor_country_idx];
        let overlord = overlord_country_idx.and_then(|idx| self.entity_ref_from_country_idx(idx));
        let overlord_metrics = overlord_country_idx.map(country_metrics);

        let subjects: Vec<SubjectRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    let entity = self.entity_ref_from_country_idx(entry.idx())?;
                    let subject_type = subject_type_map
                        .get(&entry.idx())
                        .copied()
                        .map(into_profile_subject_type)
                        .unwrap_or(DiplomacySubjectType::Other);
                    Some(SubjectRef {
                        entity,
                        subject_type,
                        liberty_desire: diplo_map
                            .get(&entry.idx())
                            .and_then(|d| d.liberty_desire)
                            .unwrap_or(0.0),
                        metrics: country_metrics(entry.idx()),
                    })
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection {
            overlord,
            overlord_subject_type,
            overlord_metrics,
            subjects,
        })
    }

    fn market_member_countries_from_merchants(
        &self,
        market: &Market<'_>,
    ) -> Vec<MarketMemberCountry> {
        let mut rows: Vec<_> = market
            .merchants
            .iter()
            .filter_map(|m| {
                let country_idx = self.gamestate.countries.get(m.country)?;
                Some(MarketMemberCountry {
                    country: self.entity_ref_from_country_idx(country_idx)?,
                    trade_advantage: m.power,
                    trade_capacity: m.capacity,
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.trade_advantage
                .partial_cmp(&a.trade_advantage)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.country.name().cmp(b.country.name()))
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
                name: self.game_data.localized_building_name(b.kind.to_str()),
                level: b.level,
            })
            .collect();

        #[derive(Default)]
        struct PopAgg {
            size: u32,
            sat_weighted: f64,
            lit_weighted: f64,
        }
        let mut by_pop: HashMap<
            (
                eu5save::models::PopulationType,
                Option<eu5save::models::CultureId>,
                eu5save::models::ReligionId,
            ),
            PopAgg,
        > = HashMap::new();
        for &pop_id in loc.population.pops {
            let Some(pop) = self.gamestate.population.database.lookup(pop_id) else {
                continue;
            };
            let pop_size = (pop.size * 1000.0).floor() as u32;
            let entry = by_pop
                .entry((pop.kind, pop.culture, pop.religion))
                .or_default();
            entry.size += pop_size;
            entry.sat_weighted += pop.satisfaction * pop_size as f64;
            entry.lit_weighted += pop.literacy * pop_size as f64;
        }
        let mut population_profile: Vec<LocationPopRow> = by_pop
            .into_iter()
            .map(|((kind, culture_id, religion_id), agg)| {
                let kind = match kind {
                    eu5save::models::PopulationType::Burghers => "Burghers",
                    eu5save::models::PopulationType::Clergy => "Clergy",
                    eu5save::models::PopulationType::Laborers => "Laborers",
                    eu5save::models::PopulationType::Nobles => "Nobles",
                    eu5save::models::PopulationType::Peasants => "Peasants",
                    eu5save::models::PopulationType::Slaves => "Slaves",
                    eu5save::models::PopulationType::Soldiers => "Soldiers",
                    eu5save::models::PopulationType::Tribesmen => "Tribesmen",
                    eu5save::models::PopulationType::Other => "Other",
                }
                .to_string();
                let (culture_name, culture_color_hex) = culture_id
                    .and_then(|cid| self.gamestate.culture_manager.lookup(cid))
                    .map(|c| {
                        let hex = format!(
                            "#{:02x}{:02x}{:02x}",
                            c.color.0[0], c.color.0[1], c.color.0[2]
                        );
                        (c.name.key().to_str().to_string(), hex)
                    })
                    .unwrap_or_else(|| ("Unknown".to_string(), "#808080".to_string()));
                let (religion_name, religion_color_hex) = self
                    .gamestate
                    .religion_manager
                    .lookup(religion_id)
                    .map(|r| {
                        let hex = format!(
                            "#{:02x}{:02x}{:02x}",
                            r.color.0[0], r.color.0[1], r.color.0[2]
                        );
                        (r.name.to_str().to_string(), hex)
                    })
                    .unwrap_or_else(|| ("Unknown".to_string(), "#808080".to_string()));
                let (satisfaction, literacy) = if agg.size > 0 {
                    (
                        agg.sat_weighted / agg.size as f64,
                        agg.lit_weighted / agg.size as f64,
                    )
                } else {
                    (0.0, 0.0)
                };
                LocationPopRow {
                    kind,
                    culture_name,
                    culture_color_hex,
                    religion_name,
                    religion_color_hex,
                    size: agg.size,
                    satisfaction,
                    literacy,
                }
            })
            .collect();
        population_profile.sort_by(|a, b| b.size.cmp(&a.size));

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
            population_profile,
        })
    }

    pub(super) fn entity_kind_for_mode(&self) -> EntityKind {
        if self.current_map_mode == MapMode::Markets {
            EntityKind::Market
        } else {
            EntityKind::Country
        }
    }

    pub(super) fn selection_covers_full_entity(
        &self,
        anchor: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> bool {
        let selected_count = self.selection_state.len();
        match kind {
            EntityKind::Country => {
                let loc = self.gamestate.locations.index(anchor).location();
                let Some(owner) = loc.owner.real_id() else {
                    return false;
                };
                let Some(country_idx) = self.gamestate.countries.get(owner.country_id()) else {
                    return false;
                };
                self.iter_country_locations(country_idx).count() == selected_count
            }
            EntityKind::Market => {
                let loc = self.gamestate.locations.index(anchor).location();
                let Some(market_id) = loc.market else {
                    return false;
                };
                self.iter_market_locations(market_id)
                    .is_some_and(|iter| iter.count() == selected_count)
            }
        }
    }

    fn iter_country_locations(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> impl Iterator<Item = eu5save::models::LocationIdx> + '_ + Clone {
        let owner = self.gamestate.countries.index(country_idx).id();
        self.gamestate
            .locations
            .iter()
            .filter(move |entry| entry.location().owner == owner)
            .map(|entry| entry.idx())
    }

    fn iter_market_locations(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Option<impl Iterator<Item = eu5save::models::LocationIdx> + '_ + Clone> {
        self.gamestate.market_manager.get(market_id)?;
        Some(
            self.gamestate
                .locations
                .iter()
                .filter(move |entry| entry.location().market == Some(market_id))
                .map(|entry| entry.idx()),
        )
    }

    pub(super) fn collect_entity_locations(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> Option<Vec<eu5save::models::LocationIdx>> {
        let loc = self.gamestate.locations.index(anchor_idx).location();
        match kind {
            EntityKind::Country => {
                let owner_id = loc.owner.real_id()?.country_id();
                let country_idx = self.gamestate.countries.get(owner_id)?;
                Some(self.iter_country_locations(country_idx).collect())
            }
            EntityKind::Market => Some(self.iter_market_locations(loc.market?)?.collect()),
        }
    }

    /// Header for a specific entity resolved from `anchor_idx`, over that
    /// entity's full territory in the gamestate (ignores current selection).
    pub fn entity_header_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<EntityHeader> {
        let loc = self.gamestate.locations.index(anchor_idx).location();
        match self.entity_kind_for_mode() {
            EntityKind::Country => {
                let owner_id = loc.owner.real_id()?.country_id();
                let country_idx = self.gamestate.countries.get(owner_id)?;
                let locations = self.iter_country_locations(country_idx);
                self.country_header(country_idx, self.headline_for_locations(locations))
            }
            EntityKind::Market => {
                let market_id = loc.market?;
                let locations = self.iter_market_locations(market_id)?;
                self.market_header(market_id, self.headline_for_locations(locations))
            }
        }
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
        Some(self.build_locations_section(locations.into_iter()))
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

        let mut subject_type_map: FxHashMap<CountryIdx, SaveDiplomacySubjectType> =
            FxHashMap::default();
        let mut overlord_subject_type: Option<DiplomacySubjectType> = None;
        for dep in self.gamestate.diplomacy_manager.dependencies() {
            let Some(first_idx) = self.gamestate.countries.get(dep.first) else {
                continue;
            };
            let Some(second_idx) = self.gamestate.countries.get(dep.second) else {
                continue;
            };
            if first_idx == anchor_country_idx {
                subject_type_map.insert(second_idx, dep.subject_type);
            } else if second_idx == anchor_country_idx {
                overlord_subject_type = Some(into_profile_subject_type(dep.subject_type));
            }
        }

        let diplo_map = self.diplomatic_relations();

        #[derive(Default, Clone)]
        struct MetricsAgg {
            total_state_efficacy: f64,
            active_state_capacity: f64,
            total_population: u32,
        }

        let mut metrics_map: FxHashMap<CountryIdx, MetricsAgg> = FxHashMap::default();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|id| id.country_id()) else {
                continue;
            };
            let Some(country_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };
            let agg = metrics_map.entry(country_idx).or_default();
            let population = self.gamestate.location_population(loc) as u32;
            let state_efficacy = loc.control * loc.development;
            agg.total_state_efficacy += state_efficacy;
            agg.active_state_capacity += population as f64 * state_efficacy;
            agg.total_population += population;
        }

        let country_metrics = |idx: CountryIdx| -> CountryMetrics {
            let agg = metrics_map.get(&idx).cloned().unwrap_or_default();
            let data = self.gamestate.countries.index(idx).data();
            let tax_trade_income = data
                .map(|d| d.estimated_monthly_income_trade_and_tax)
                .unwrap_or(0.0);
            let great_power_rank = data.map(|d| d.great_power_rank).unwrap_or(0);
            CountryMetrics {
                great_power_rank,
                total_state_efficacy: agg.total_state_efficacy,
                active_state_capacity: agg.active_state_capacity,
                total_population: agg.total_population,
                tax_trade_income,
            }
        };

        let overlord_country_idx = self.overlord_of[anchor_country_idx];
        let overlord = overlord_country_idx.and_then(|idx| self.entity_ref_from_country_idx(idx));
        let overlord_metrics = overlord_country_idx.map(country_metrics);

        let subjects: Vec<SubjectRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    let entity = self.entity_ref_from_country_idx(entry.idx())?;
                    let subject_type = subject_type_map
                        .get(&entry.idx())
                        .copied()
                        .map(into_profile_subject_type)
                        .unwrap_or(DiplomacySubjectType::Other);
                    Some(SubjectRef {
                        entity,
                        subject_type,
                        liberty_desire: diplo_map
                            .get(&entry.idx())
                            .and_then(|d| d.liberty_desire)
                            .unwrap_or(0.0),
                        metrics: country_metrics(entry.idx()),
                    })
                } else {
                    None
                }
            })
            .collect();

        Some(DiplomacySection {
            overlord,
            overlord_subject_type,
            overlord_metrics,
            subjects,
        })
    }

    fn diplomatic_relations(&self) -> FxHashMap<CountryIdx, &CountryDiplomacy> {
        let mut result = FxHashMap::default();
        for entry in self.gamestate.diplomacy_manager.entries() {
            let Some(country_idx) = self.gamestate.countries.get(entry.country) else {
                continue;
            };
            result.insert(country_idx, entry);
        }
        result
    }
}

fn into_profile_subject_type(t: SaveDiplomacySubjectType) -> DiplomacySubjectType {
    match t {
        SaveDiplomacySubjectType::Dominion => DiplomacySubjectType::Dominion,
        SaveDiplomacySubjectType::Fiefdom => DiplomacySubjectType::Fiefdom,
        SaveDiplomacySubjectType::Vassal => DiplomacySubjectType::Vassal,
        SaveDiplomacySubjectType::Tributary => DiplomacySubjectType::Tributary,
        SaveDiplomacySubjectType::HanseaticMember => DiplomacySubjectType::HanseaticMember,
        SaveDiplomacySubjectType::Samanta => DiplomacySubjectType::Samanta,
        SaveDiplomacySubjectType::Appanage => DiplomacySubjectType::Appanage,
        SaveDiplomacySubjectType::Tusi => DiplomacySubjectType::Tusi,
        SaveDiplomacySubjectType::March => DiplomacySubjectType::March,
        SaveDiplomacySubjectType::MahaSamanta => DiplomacySubjectType::MahaSamanta,
        SaveDiplomacySubjectType::Other => DiplomacySubjectType::Other,
    }
}
