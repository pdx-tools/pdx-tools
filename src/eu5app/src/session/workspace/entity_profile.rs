use eu5save::{hash::FnvHashMap, models::CountryDiplomacy};

use super::*;

impl<'bump> Eu5Workspace<'bump> {
    /// Returns the entity kind for the current single-entity scope.
    pub fn derived_entity_kind(&self) -> Option<EntityKind> {
        self.derived_entity_kind
    }

    pub(crate) fn active_profile_identity(&self) -> Option<ActiveProfileIdentity> {
        if let Some(idx) = self.selection_state.focused_location() {
            return Some(ActiveProfileIdentity::Location(idx));
        }

        if let (Some(anchor), Some(kind)) = (self.derived_entity_anchor, self.derived_entity_kind) {
            return match kind {
                EntityKind::Country => {
                    let loc = self.gamestate.locations.index(anchor).location();
                    let owner_id = loc.owner.real_id()?.country_id();
                    let country_idx = self.gamestate.countries.get(owner_id)?;
                    self.gamestate.countries.index(country_idx).data()?;
                    Some(ActiveProfileIdentity::Country(country_idx))
                }
                EntityKind::Market => {
                    let loc = self.gamestate.locations.index(anchor).location();
                    let market_id = loc.market?;
                    self.gamestate.market_manager.get(market_id)?;
                    Some(ActiveProfileIdentity::Market(market_id))
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
            return Some(ActiveProfileIdentity::Location(idx));
        }

        None
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

    pub(crate) fn country_profile_for(
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

    pub(crate) fn market_profile_for(
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
        let owner_country = self.owner_country_ref_for_location(center_loc);
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

    pub(crate) fn country_population_profile_for(
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
                self.build_workspace_pop_row(
                    kind,
                    culture_id,
                    religion_id,
                    agg.size,
                    agg.sat_weighted,
                    agg.lit_weighted,
                )
            })
            .collect();
        sankey_rows.sort_by(|a, b| b.size.cmp(&a.size));

        Some(CountryPopulationProfile {
            type_profile,
            rank_totals,
            sankey_rows,
        })
    }

    fn build_workspace_pop_row(
        &self,
        kind: PopulationType,
        culture_id: Option<eu5save::models::CultureId>,
        religion_id: eu5save::models::ReligionId,
        size: u32,
        sat_weighted: f64,
        lit_weighted: f64,
    ) -> LocationPopRow {
        let culture_color_hex = culture_id
            .and_then(|cid| self.gamestate.culture_manager.lookup(cid))
            .map(|c| crate::Srgb(c.color.0))
            .unwrap_or(crate::Srgb([0x80, 0x80, 0x80]));
        let religion_color_hex = self
            .gamestate
            .religion_manager
            .lookup(religion_id)
            .map(|r| crate::Srgb(r.color.0))
            .unwrap_or(crate::Srgb([0x80, 0x80, 0x80]));
        let (satisfaction, literacy) = if size > 0 {
            (sat_weighted / size as f64, lit_weighted / size as f64)
        } else {
            (0.0, 0.0)
        };
        LocationPopRow {
            kind,
            culture: culture_id,
            culture_color_hex,
            religion: religion_id,
            religion_color_hex,
            size,
            satisfaction,
            literacy,
        }
    }

    /// Returns header data for the current single-entity scope.
    /// Returns None when the filter is empty or spans multiple entities.
    pub(crate) fn entity_header(&self) -> Option<EntityHeader> {
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
        entry.data()?;
        Some(EntityHeader {
            kind: EntityHeaderKindSource::Country(country_idx),
            headline,
        })
    }

    fn market_header(
        &self,
        market_id: eu5save::models::MarketId,
        headline: HeadlineStats,
    ) -> Option<EntityHeader> {
        self.gamestate.market_manager.get(market_id)?;
        Some(EntityHeader {
            kind: EntityHeaderKindSource::Market(market_id),
            headline,
        })
    }

    fn country_overview(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<CountryOverviewSection> {
        let data = self.gamestate.countries.index(country_idx).data()?;
        let mut loan_totals: FnvHashMap<CountryIdx, f64> = FnvHashMap::default();
        for loan in self.gamestate.loan_manager.database.iter() {
            if let Some(idx) = self.gamestate.countries.get(loan.borrower) {
                *loan_totals.entry(idx).or_insert(0.0) += loan.amount;
            }
        }
        let loan_total_for = |idx: CountryIdx| loan_totals.get(&idx).copied().unwrap_or(0.0);
        #[derive(Default, Clone, Copy)]
        struct CountryTerritoryAgg {
            wealth: f64,
            tax_base: f64,
            total_population: u32,
            effective_development: f64,
            active_state_capacity: f64,
            building_levels: f64,
        }

        let building_levels = self.get_location_building_levels();
        let mut territory_by_country: FnvHashMap<CountryIdx, CountryTerritoryAgg> =
            FnvHashMap::default();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            let Some(owner_id) = loc.owner.real_id().map(|id| id.country_id()) else {
                continue;
            };
            let Some(owner_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };
            let population = self.gamestate.location_population(loc) as u32;
            let effective_development = loc.control * loc.development;
            let totals = territory_by_country.entry(owner_idx).or_default();
            totals.wealth += loc.possible_tax;
            totals.tax_base += loc.tax;
            totals.total_population += population;
            totals.effective_development += effective_development;
            totals.active_state_capacity += population as f64 * effective_development;
            totals.building_levels += building_levels[entry.idx()];
        }
        let territory_for =
            |idx: CountryIdx| territory_by_country.get(&idx).copied().unwrap_or_default();

        let net_gold = data.currency_data.gold - loan_total_for(country_idx);
        let manpower = data.currency_data.manpower;
        let stability = data.currency_data.stability;
        let prestige = data.currency_data.prestige;
        let government_power = data.currency_data.government_power;
        let income = data.economy.income;
        let territory = territory_for(country_idx);
        let wealth = territory.wealth;
        let tax_base = territory.tax_base;
        let total_population = territory.total_population;
        let effective_development = territory.effective_development;
        let active_state_capacity = territory.active_state_capacity;
        let building_levels = territory.building_levels;

        // Rank this country's value against every real country (the same
        // `great_power_rank > 0` universe the political scoreboard uses) and
        // capture each bounded metric's cohort maximum so the UI can scale its
        // bar. A metric's rank is one plus the number of countries with a
        // strictly greater value, so ties share the better rank. `cohort` is
        // that universe's size and is identical across metrics. Maxima are
        // seeded with this country's own value so its own bar never exceeds 1
        // even when it sits outside the cohort.
        let mut cohort = 0u32;
        let mut net_gold_rank = 1u32;
        let mut manpower_rank = 1u32;
        let mut stability_rank = 1u32;
        let mut prestige_rank = 1u32;
        let mut government_power_rank = 1u32;
        let mut income_rank = 1u32;
        let mut wealth_rank = 1u32;
        let mut tax_base_rank = 1u32;
        let mut total_population_rank = 1u32;
        let mut effective_development_rank = 1u32;
        let mut active_state_capacity_rank = 1u32;
        let mut building_levels_rank = 1u32;
        let mut net_gold_max = net_gold;
        let mut income_max = income;
        let mut manpower_max = manpower;
        let mut wealth_max = wealth;
        let mut tax_base_max = tax_base;
        let mut total_population_max = total_population;
        let mut effective_development_max = effective_development;
        let mut active_state_capacity_max = active_state_capacity;
        let mut building_levels_max = building_levels;
        for entry in self.gamestate.countries.iter() {
            let Some(other) = entry.data() else { continue };
            if other.great_power_rank <= 0 {
                continue;
            }
            cohort += 1;
            let other_net_gold = other.currency_data.gold - loan_total_for(entry.idx());
            let other_territory = territory_for(entry.idx());
            let other_wealth = other_territory.wealth;
            let other_tax_base = other_territory.tax_base;
            if other_net_gold > net_gold {
                net_gold_rank += 1;
            }
            if other.currency_data.manpower > manpower {
                manpower_rank += 1;
            }
            if other.currency_data.stability > stability {
                stability_rank += 1;
            }
            if other.currency_data.prestige > prestige {
                prestige_rank += 1;
            }
            if other.currency_data.government_power > government_power {
                government_power_rank += 1;
            }
            if other.economy.income > income {
                income_rank += 1;
            }
            if other_wealth > wealth {
                wealth_rank += 1;
            }
            if other_tax_base > tax_base {
                tax_base_rank += 1;
            }
            if other_territory.total_population > total_population {
                total_population_rank += 1;
            }
            if other_territory.effective_development > effective_development {
                effective_development_rank += 1;
            }
            if other_territory.active_state_capacity > active_state_capacity {
                active_state_capacity_rank += 1;
            }
            if other_territory.building_levels > building_levels {
                building_levels_rank += 1;
            }
            net_gold_max = net_gold_max.max(other_net_gold);
            income_max = income_max.max(other.economy.income);
            manpower_max = manpower_max.max(other.currency_data.manpower);
            wealth_max = wealth_max.max(other_wealth);
            tax_base_max = tax_base_max.max(other_tax_base);
            total_population_max = total_population_max.max(other_territory.total_population);
            effective_development_max =
                effective_development_max.max(other_territory.effective_development);
            active_state_capacity_max =
                active_state_capacity_max.max(other_territory.active_state_capacity);
            building_levels_max = building_levels_max.max(other_territory.building_levels);
        }
        let ranks = CountryOverviewRanks {
            cohort,
            net_gold: net_gold_rank,
            manpower: manpower_rank,
            stability: stability_rank,
            prestige: prestige_rank,
            government_power: government_power_rank,
            income: income_rank,
            wealth: wealth_rank,
            tax_base: tax_base_rank,
            total_population: total_population_rank,
            effective_development: effective_development_rank,
            active_state_capacity: active_state_capacity_rank,
            building_levels: building_levels_rank,
        };

        Some(CountryOverviewSection {
            net_gold,
            manpower,
            stability,
            prestige,
            government_power,
            income,
            expense: data.economy.expense,
            wealth,
            tax_base,
            total_population,
            effective_development,
            active_state_capacity,
            building_levels,
            net_gold_max,
            income_max,
            manpower_max,
            wealth_max,
            tax_base_max,
            total_population_max,
            effective_development_max,
            active_state_capacity_max,
            building_levels_max,
            monthly_gold: data.economy.monthly_gold.to_vec(),
            recent_balance: data.economy.recent_balance.to_vec(),
            historical_tax_base: data.historical_tax_base.to_vec(),
            historical_population: data.historical_population.to_vec(),
            ranks,
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
                let color_hex = crate::Srgb(rel.color.0);
                Some(ReligionShare {
                    religion: rid,
                    location_count: agg.location_count,
                    population: agg.population,
                    color_hex,
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.location_count
                .cmp(&a.location_count)
                .then_with(|| a.religion.value().cmp(&b.religion.value()))
        });

        CountryReligionSection {
            religion_breakdown: rows,
        }
    }

    /// Returns goods section for the current market scope.
    pub(crate) fn market_goods_section(&'bump self) -> Option<MarketGoodsSection<'bump>> {
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
        &'bump self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<MarketGoodsSection<'bump>> {
        let loc = self.gamestate.locations.index(anchor).location();
        let market_id = loc.market?;
        let market = self.gamestate.market_manager.get(market_id)?;

        let building_levels = self.get_location_building_levels();
        let mut total_building_levels = 0.0_f64;
        let mut total_wealth = 0.0_f64;
        for &idx in locations {
            let l = self.gamestate.locations.index(idx).location();
            total_building_levels += building_levels[idx];
            total_wealth += l.possible_tax;
        }

        let mut top_goods: Vec<MarketGoodEntry> = market
            .goods
            .iter()
            .map(|g| MarketGoodEntry {
                good: g.good,
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
            total_wealth,
            top_goods,
        })
    }

    pub(crate) fn market_goods_profile(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Vec<ScopedGoodSummary<'_>> {
        let Some(market) = self.gamestate.market_manager.get(market_id) else {
            return Vec::new();
        };

        let mut producing_location_counts: FxHashMap<GoodName, u32> = FxHashMap::default();
        for entry in self.gamestate.locations.iter() {
            let loc = entry.location();
            if loc.owner.is_dummy() || loc.market != Some(market_id) {
                continue;
            }
            if let Some(raw_material) = loc.raw_material {
                *producing_location_counts.entry(raw_material).or_insert(0) += 1;
            }
        }

        let mut goods: Vec<ScopedGoodSummary<'_>> = market
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

                let good_data = self.game_data.good(good.good.to_str());
                ScopedGoodSummary {
                    good: crate::presentation::GoodRefSource(good.good),
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
                    default_market_price: good_data.map(|g| g.default_market_price),
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
                .then_with(|| a.good.0.to_str().cmp(b.good.0.to_str()))
        });
        goods
    }

    pub(crate) fn market_locations_profile(
        &self,
        market_id: eu5save::models::MarketId,
    ) -> Vec<MarketProductionLocationSummary<'_>> {
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
            let Some(owner) = self.owner_country_ref_for_location(loc) else {
                continue;
            };

            production_rows.push(MarketProductionLocationSummary {
                location: idx,
                owner,
                raw_material: Some(raw_material),
                rgo_level: loc.rgo_level,
                market_access: loc.market_access,
                development: loc.development,
                population: self.gamestate.location_population(loc) as u32,
            });
        }

        production_rows.sort_by(|a, b| {
            b.rgo_level
                .total_cmp(&a.rgo_level)
                .then_with(|| a.location.value().cmp(&b.location.value()))
        });
        production_rows
    }

    /// Returns location rows for all selected locations, sorted by location index.
    pub(crate) fn locations_section(&self) -> Option<LocationsSection> {
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
                    location: idx,
                    development: loc.development,
                    population,
                    control: loc.control,
                    tax_base: loc.tax,
                    wealth: loc.possible_tax,
                    owner: self.owner_country_ref_for_location(loc),
                    market: self.market_ref_for_location(loc),
                }
            })
            .collect();
        rows.sort_by_key(|row| row.location.value());
        LocationsSection { locations: rows }
    }

    /// Returns diplomacy data for the current country scope.
    /// Returns None for market entities (markets have no diplomacy).
    pub(crate) fn diplomacy_section(&self) -> Option<DiplomacySection> {
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
        let (subject_type_map, overlord_subject_type) =
            self.diplomacy_subject_types_for(anchor_country_idx);
        let diplo_map = self.diplomatic_relations();
        let metrics_map = self.country_metrics_map();

        let country_metrics = |idx: CountryIdx| -> CountryMetrics {
            self.country_metrics_from_map(idx, &metrics_map)
        };

        let overlord_country_idx = self.overlord_of[anchor_country_idx];
        let overlord = overlord_country_idx.map(|idx| self.country_ref_from_country_idx(idx));
        let overlord_metrics = overlord_country_idx.map(country_metrics);

        let subjects: Vec<SubjectRef> = self
            .gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                if self.overlord_of[entry.idx()] == Some(anchor_country_idx) {
                    let entity = self.country_ref_from_country_idx(entry.idx());
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

    fn diplomacy_subject_types_for(
        &self,
        anchor_country_idx: CountryIdx,
    ) -> (
        FnvHashMap<CountryIdx, SaveDiplomacySubjectType>,
        Option<DiplomacySubjectType>,
    ) {
        let mut subject_type_map: FnvHashMap<CountryIdx, SaveDiplomacySubjectType> =
            FnvHashMap::default();
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
        (subject_type_map, overlord_subject_type)
    }

    fn country_metrics_map(&self) -> FnvHashMap<CountryIdx, MetricsAgg> {
        let mut metrics_map: FnvHashMap<CountryIdx, MetricsAgg> = FnvHashMap::default();
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
        metrics_map
    }

    fn country_metrics_from_map(
        &self,
        idx: CountryIdx,
        metrics_map: &FnvHashMap<CountryIdx, MetricsAgg>,
    ) -> CountryMetrics {
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
    }

    fn market_member_countries_from_merchants(
        &self,
        market: &Market<'_>,
    ) -> Vec<MarketMemberCountry> {
        let mut rows: Vec<MarketMemberCountry> = market
            .merchants
            .iter()
            .filter_map(|m| {
                let country_idx = self.gamestate.countries.get(m.country)?;
                Some(MarketMemberCountry {
                    country: self.country_ref_from_country_idx(country_idx),
                    trade_advantage: m.power,
                    trade_capacity: m.capacity,
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            b.trade_advantage
                .partial_cmp(&a.trade_advantage)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    a.country
                        .country_idx
                        .value()
                        .cmp(&b.country.country_idx.value())
                })
        });
        rows
    }

    /// Returns a full data profile for a single location.
    /// Returns None for unowned / water tiles.
    pub(crate) fn location_profile_for(
        &'bump self,
        idx: eu5save::models::LocationIdx,
    ) -> Option<LocationProfile<'bump>> {
        let loc = self.gamestate.locations.index(idx).location();
        if loc.owner.is_dummy() {
            return None;
        }

        let population = self.gamestate.location_population(loc) as u32;

        let terrain = match self.location_terrain(idx) {
            Terrain::Other => "Land",
            Terrain::Water => "Water",
            Terrain::Impassable => "Impassable",
        }
        .to_string();

        let raw_material = loc.raw_material;
        let owner = self.owner_country_ref_for_location(loc);
        let market = self.market_ref_for_location(loc);

        let location_id = self.gamestate.locations.index(idx).id();
        let buildings: Vec<BuildingEntry> = self
            .gamestate
            .building_manager
            .database
            .iter()
            .filter(|b| b.location == location_id && b.owner == loc.owner)
            .map(|b| BuildingEntry {
                building_key: b.kind.to_str().to_string(),
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
                self.build_workspace_pop_row(
                    kind,
                    culture_id,
                    religion_id,
                    agg.size,
                    agg.sat_weighted,
                    agg.lit_weighted,
                )
            })
            .collect();
        population_profile.sort_by(|a, b| b.size.cmp(&a.size));

        Some(LocationProfile {
            header: LocationHeader {
                location: idx,
                owner,
                market,
            },
            stats: LocationStats {
                development: loc.development,
                population,
                control: loc.control,
                terrain,
                religion: loc.religion,
                raw_material,
                tax_base: loc.tax,
                wealth: loc.possible_tax,
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
    pub(crate) fn entity_header_for(
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
    pub(crate) fn market_goods_section_for(
        &'bump self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<MarketGoodsSection<'bump>> {
        let locations = self.collect_entity_locations(anchor_idx, EntityKind::Market)?;
        self.market_goods(anchor_idx, &locations)
    }

    /// Locations section for a specific entity's full territory.
    pub(crate) fn locations_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<LocationsSection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        Some(self.build_locations_section(locations.into_iter()))
    }

    /// Diplomacy section for a specific country entity (by anchor location).
    /// Returns None for market entities or if the anchor doesn't resolve to a country.
    pub(crate) fn diplomacy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<DiplomacySection> {
        if matches!(self.entity_kind_for_mode(), EntityKind::Market) {
            return None;
        }
        let loc = self.gamestate.locations.index(anchor_idx).location();
        let owner_id = loc.owner.real_id()?.country_id();
        let anchor_country_idx = self.gamestate.countries.get(owner_id)?;
        self.country_diplomacy(anchor_country_idx)
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

#[derive(Default, Clone)]
pub(crate) struct MetricsAgg {
    pub total_state_efficacy: f64,
    pub active_state_capacity: f64,
    pub total_population: u32,
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
        SaveDiplomacySubjectType::ColonialNation => DiplomacySubjectType::ColonialNation,
        SaveDiplomacySubjectType::Conquistador => DiplomacySubjectType::Conquistador,
        SaveDiplomacySubjectType::TradeCompany => DiplomacySubjectType::TradeCompany,
        SaveDiplomacySubjectType::Other => DiplomacySubjectType::Other,
    }
}
