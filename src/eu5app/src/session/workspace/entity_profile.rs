use super::*;

impl<'bump> Eu5Workspace<'bump> {
    /// Returns the entity kind for the current single-entity scope.
    pub fn derived_entity_kind(&self) -> Option<EntityKind> {
        self.derived_entity_kind
    }

    /// Returns header data for the current single-entity scope.
    /// Returns None when the filter is empty or spans multiple entities.
    pub fn entity_header(&self) -> Option<EntityHeader> {
        let anchor = self.derived_entity_anchor?;
        let kind = self.derived_entity_kind()?;
        let mut total_development = 0.0_f64;
        let mut total_population = 0u32;
        let location_count = self.selection_state.len() as u32;
        for &idx in self.selection_state.selected_locations() {
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

    /// Returns aggregated overview stats for the current single-entity scope.
    pub fn overview_section(&self) -> Option<OverviewSection> {
        let anchor = self.derived_entity_anchor?;
        let kind = self.derived_entity_kind()?;
        let locations: Vec<LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        self.build_overview_section(anchor, kind, &locations)
    }

    fn build_overview_section(
        &self,
        anchor: LocationIdx,
        kind: EntityKind,
        locations: &[LocationIdx],
    ) -> Option<OverviewSection> {
        if locations.is_empty() {
            return None;
        }
        let building_levels = self.get_location_building_levels();
        let mut total_control = 0.0_f64;
        let mut total_development = 0.0_f64;
        let mut total_rgo_level = 0.0_f64;
        let mut total_building_levels = 0.0_f64;
        let mut religion_counts: HashMap<String, (u32, String)> = HashMap::new();
        let mut top_locations_by_development: Vec<RankedLocation> = Vec::new();
        let count = locations.len() as f64;
        for &idx in locations {
            let loc = self.gamestate.locations.index(idx).location();
            total_control += loc.control;
            total_development += loc.development;
            total_rgo_level += loc.rgo_level;
            total_building_levels += building_levels[idx];
            if let Some(rid) = loc.religion
                && let Some(rel) = self.gamestate.religion_manager.lookup(rid)
            {
                let color_hex = format!(
                    "#{:02x}{:02x}{:02x}",
                    rel.color.0[0], rel.color.0[1], rel.color.0[2]
                );
                religion_counts
                    .entry(rel.name.to_str().to_string())
                    .and_modify(|(count, _)| *count += 1)
                    .or_insert((1, color_hex));
            }

            top_locations_by_development.push(RankedLocation {
                location_idx: idx.value(),
                name: self.location_name(idx).to_string(),
                value: loc.development,
            });
        }

        let mut religion_rows: Vec<_> = religion_counts
            .into_iter()
            .map(|(religion, (location_count, color_hex))| ReligionShare {
                religion,
                location_count,
                color_hex,
            })
            .collect();
        religion_rows.sort_by(|a, b| {
            b.location_count
                .cmp(&a.location_count)
                .then_with(|| a.religion.cmp(&b.religion))
        });
        let religion_breakdown = if religion_rows.len() > 3 {
            let other_count = religion_rows
                .iter()
                .skip(3)
                .map(|row| row.location_count)
                .sum();
            religion_rows.truncate(3);
            religion_rows.push(ReligionShare {
                religion: "Other".to_string(),
                location_count: other_count,
                color_hex: "#64748b".to_string(),
            });
            religion_rows
        } else {
            religion_rows
        };

        top_locations_by_development.sort_by(|a, b| {
            b.value
                .total_cmp(&a.value)
                .then_with(|| a.name.cmp(&b.name))
        });
        top_locations_by_development.truncate(5);

        let top_economic_indicators = self.overview_economic_indicators(
            anchor,
            total_building_levels,
            locations
                .iter()
                .map(|&idx| self.gamestate.locations.index(idx).location().possible_tax)
                .sum(),
            kind,
        )?;

        let diplomatic_summary = self.overview_diplomatic_summary(anchor, kind);

        Some(OverviewSection {
            avg_control: if count > 0.0 {
                total_control / count
            } else {
                0.0
            },
            avg_development: if count > 0.0 {
                total_development / count
            } else {
                0.0
            },
            total_rgo_level,
            total_building_levels,
            religion_breakdown,
            top_economic_indicators,
            top_locations_by_development,
            diplomatic_summary,
        })
    }

    fn overview_economic_indicators(
        &self,
        anchor: eu5save::models::LocationIdx,
        total_building_levels: f64,
        total_possible_tax: f64,
        kind: EntityKind,
    ) -> Option<Vec<EconomicIndicator>> {
        match kind {
            EntityKind::Country => {
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
            EntityKind::Market => {
                let loc = self.gamestate.locations.index(anchor).location();
                let market_id = loc.market?;
                let market = self.gamestate.market_manager.get(market_id)?;
                let mut indicators = vec![EconomicIndicator {
                    label: "Market value".to_string(),
                    value: market.market_value(),
                    format: IndicatorFormat::Currency,
                }];
                let mut top_goods: Vec<_> = market.goods.iter().collect();
                top_goods.sort_by(|a, b| {
                    (b.price * b.total_taken).total_cmp(&(a.price * a.total_taken))
                });
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
        }
    }

    fn overview_diplomatic_summary(
        &self,
        anchor: eu5save::models::LocationIdx,
        kind: EntityKind,
    ) -> Option<DiplomaticSummary> {
        if matches!(kind, EntityKind::Market) {
            return None;
        }
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

    /// Returns economy section for the current single-entity scope.
    pub fn economy_section(&self) -> Option<EconomySection> {
        let anchor = self.derived_entity_anchor?;
        let locations: Vec<eu5save::models::LocationIdx> = self
            .selection_state
            .selected_locations()
            .iter()
            .copied()
            .collect();
        match self.derived_entity_kind()? {
            EntityKind::Country => self.country_economy(anchor, &locations),
            EntityKind::Market => self.market_economy(anchor, &locations),
        }
    }

    fn country_economy(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<EconomySection> {
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

        Some(EconomySection {
            current_tax_base: Some(data.current_tax_base),
            monthly_trade_value: Some(data.monthly_trade_value),
            gold: Some(data.currency_data.gold),
            total_building_levels,
            total_possible_tax,
            market_membership,
            market_value: None,
            top_goods: vec![],
        })
    }

    fn market_economy(
        &self,
        anchor: eu5save::models::LocationIdx,
        locations: &[eu5save::models::LocationIdx],
    ) -> Option<EconomySection> {
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

        Some(EconomySection {
            current_tax_base: None,
            monthly_trade_value: None,
            gold: None,
            total_building_levels,
            total_possible_tax,
            market_membership: vec![],
            market_value: Some(market.market_value()),
            top_goods,
        })
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

    /// Overview section for a specific entity's full territory.
    pub fn overview_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<OverviewSection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        self.build_overview_section(anchor_idx, kind, &locations)
    }

    /// Economy section for a specific entity's full territory.
    pub fn economy_section_for(
        &self,
        anchor_idx: eu5save::models::LocationIdx,
    ) -> Option<EconomySection> {
        let kind = self.entity_kind_for_mode();
        let locations = self.collect_entity_locations(anchor_idx, kind)?;
        match kind {
            EntityKind::Country => self.country_economy(anchor_idx, &locations),
            EntityKind::Market => self.market_economy(anchor_idx, &locations),
        }
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
