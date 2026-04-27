use super::*;

impl<'bump> Eu5Workspace<'bump> {
    /// Get screenshot overlay data for the current map mode
    pub fn get_overlay_data(&self) -> crate::OverlayBodyConfig {
        self.get_overlay_data_for_map_mode(self.current_map_mode)
    }

    pub fn get_overlay_data_for_map_mode(&self, map_mode: MapMode) -> OverlayBodyConfig {
        match map_mode {
            MapMode::Political => self.generate_political_overlay_data(),
            MapMode::RgoLevel => self.generate_rgo_level_overlay_data(),
            MapMode::BuildingLevels => self.generate_building_levels_overlay_data(),
            MapMode::Markets => self.generate_markets_overlay_data(),
            _ => self.generate_empty_overlay_data(),
        }
    }

    fn find_root_overlord(
        &self,
        country_idx: CountryIdx,
        cache: &mut CountryIndexedVecOwned<Option<CountryIdx>>,
    ) -> CountryIdx {
        if let Some(root) = cache[country_idx] {
            return root;
        }

        let mut path = Vec::new();
        let mut current = country_idx;

        loop {
            if let Some(root) = cache[current] {
                for idx in path {
                    cache[idx] = Some(root);
                }
                return root;
            }

            path.push(current);

            match self.overlord_of[current] {
                Some(parent) => {
                    current = parent;
                }
                None => {
                    for idx in path {
                        cache[idx] = Some(current);
                    }
                    cache[current] = Some(current);
                    return current;
                }
            }
        }
    }

    fn generate_political_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        let mut direct_counts = self.gamestate.countries.create_index(0u32);
        let mut realm_counts = self.gamestate.countries.create_index(0u32);
        let mut root_cache = self.gamestate.countries.create_index(None);

        let mut has_any_owner = false;

        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();
            let owner_id = location.owner;
            let Some(owner_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };

            direct_counts[owner_idx] = direct_counts[owner_idx].saturating_add(1);

            let root_idx = self.find_root_overlord(owner_idx, &mut root_cache);
            realm_counts[root_idx] = realm_counts[root_idx].saturating_add(1);

            has_any_owner = true;
        }

        if !has_any_owner {
            return self.generate_empty_overlay_data();
        }

        struct CountryOwnershipSummary {
            id: CountryId,
            label: String,
            direct: u32,
            realm_total: u32,
        }

        let mut summaries: Vec<CountryOwnershipSummary> = Vec::new();

        for entry in self.gamestate.countries.iter() {
            let idx = entry.idx();
            let direct = direct_counts[idx];
            let realm_total = realm_counts[idx];

            if direct == 0 && realm_total == 0 {
                continue;
            }

            let tag = entry.tag().to_str();
            let display_name = entry
                .data()
                .map(|data| self.localized_country_name(&data.country_name))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(tag);

            summaries.push(CountryOwnershipSummary {
                id: entry.id(),
                label: display_name.to_string(),
                direct,
                realm_total,
            });
        }

        let mut direct_rows: Vec<_> = summaries
            .iter()
            .filter(|summary| summary.direct > 0)
            .collect();

        direct_rows.sort_by(|a, b| {
            b.direct
                .cmp(&a.direct)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let left_table_rows: Vec<Vec<TableCell>> = direct_rows
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label.clone()),
                    TableCell::Integer(summary.direct as i64),
                ]
            })
            .collect();

        let mut realm_rows: Vec<_> = summaries
            .iter()
            .filter(|summary| summary.realm_total > 0)
            .collect();

        realm_rows.sort_by(|a, b| {
            b.realm_total
                .cmp(&a.realm_total)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let right_table_rows: Vec<Vec<TableCell>> = realm_rows
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label.clone()),
                    TableCell::Integer(summary.realm_total as i64),
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Top Location Owners".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Country".to_string(),
                    "Locations".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Top Realms (Subjects included)".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Country".to_string(),
                    "Locations".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }

    fn generate_empty_overlay_data(&self) -> OverlayBodyConfig {
        OverlayBodyConfig {
            left_table: OverlayTable {
                title: None,
                headers: vec!["".to_string(), "".to_string()],
                rows: vec![
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                ],
            },
            right_table: OverlayTable {
                title: None,
                headers: vec!["".to_string(), "".to_string()],
                rows: vec![
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                    vec![
                        TableCell::Text("".to_string()),
                        TableCell::Text("".to_string()),
                    ],
                ],
            },
            max_rows: None,
        }
    }

    fn generate_rgo_level_overlay_data(&self) -> OverlayBodyConfig {
        #[derive(Debug)]
        struct ResourceSummary {
            total_levels: f64,
            location_count: u32,
        }

        #[derive(Debug, Clone, PartialEq)]
        struct LocationRgoData<'a> {
            name: &'a str,
            id: u32,
            owner_id: CountryId,
            resource_name: RawMaterialsName<'a>,
            rgo_level: f64,
        }

        impl<'a> Eq for LocationRgoData<'a> {}

        impl<'a> PartialOrd for LocationRgoData<'a> {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl<'a> Ord for LocationRgoData<'a> {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.rgo_level
                    .total_cmp(&other.rgo_level)
                    .then_with(|| self.id.cmp(&other.id)) // Tie-breaker for deterministic ordering
            }
        }

        // Separate collections: one for resource summaries, one for top locations
        let mut resource_summaries: HashMap<RawMaterialsName, ResourceSummary> = HashMap::new();
        let mut top_locations: std::collections::BinaryHeap<std::cmp::Reverse<LocationRgoData>> =
            std::collections::BinaryHeap::new();

        // Iterate through all locations using the locations database
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();
            let owner = location.owner;

            let Some(raw_material) = location.raw_material else {
                continue; // Skip if no raw material
            };

            // Skip if no RGO level
            if location.rgo_level <= 0.0 {
                continue;
            }

            let location_id = location_entry.id();
            let location_name = self.location_name(location_entry.idx());

            // Update resource summary
            let summary = resource_summaries
                .entry(raw_material)
                .or_insert(ResourceSummary {
                    total_levels: 0.0,
                    location_count: 0,
                });
            summary.total_levels += location.rgo_level;
            summary.location_count += 1;

            // Maintain top 10 locations using min-heap
            let location_data = LocationRgoData {
                name: location_name,
                id: location_id.value(),
                owner_id: owner,
                resource_name: raw_material,
                rgo_level: location.rgo_level,
            };

            if top_locations.len() < 10 {
                top_locations.push(std::cmp::Reverse(location_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_locations.peek()
                && location_data.rgo_level > smallest.rgo_level
            {
                top_locations.pop();
                top_locations.push(std::cmp::Reverse(location_data));
            }
        }

        // Generate left table: top resources by average level
        let mut resource_summary = resource_summaries
            .iter()
            .map(|(resource, summary)| {
                let avg = summary.total_levels / (summary.location_count as f64);
                (resource, avg, summary.location_count, summary.total_levels)
            })
            .collect::<Vec<_>>();

        resource_summary.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        resource_summary.truncate(10);

        let left_table_rows: Vec<Vec<TableCell>> = resource_summary
            .into_iter()
            .enumerate()
            .map(|(i, (resource, avg, count, total))| {
                vec![
                    TableCell::Text(format!("{}. {}", i + 1, resource)),
                    TableCell::Float {
                        value: avg,
                        decimals: 1,
                    },
                    TableCell::Integer(count as i64),
                    TableCell::Float {
                        value: total,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        // Generate right table: top locations by RGO level
        // Extract locations from heap and sort in descending order
        let top_locations_vec: Vec<_> = top_locations
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(location)| location)
            .collect();

        let right_table_rows: Vec<Vec<TableCell>> = top_locations_vec
            .into_iter()
            .map(|location_data| {
                let owner = self
                    .gamestate
                    .countries
                    .get(location_data.owner_id)
                    .and_then(|idx| self.gamestate.countries.index(idx).data())
                    .map(|x| self.localized_country_name(&x.country_name))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("C{}", location_data.owner_id.value()));

                vec![
                    TableCell::Text(location_data.name.to_string()),
                    TableCell::Text(owner),
                    TableCell::Text(location_data.resource_name.to_string()),
                    TableCell::Integer(location_data.id as i64),
                    TableCell::Float {
                        value: location_data.rgo_level,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Highest Average RGO Levels".to_string()),
                headers: vec![
                    "Resource".to_string(),
                    "Avg".to_string(),
                    "Loc".to_string(),
                    "Total".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Highest RGO Levels by Location".to_string()),
                headers: vec![
                    "Location".to_string(),
                    "Tag".to_string(),
                    "Resource".to_string(),
                    "ID".to_string(),
                    "Level".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(10),
        }
    }

    fn generate_building_levels_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        #[derive(Debug, Clone, PartialEq)]
        struct LocationBuildingData {
            id: u32,
            owner_id: CountryId,
            building_levels_sum: f64,
        }

        impl Eq for LocationBuildingData {}

        impl PartialOrd for LocationBuildingData {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl Ord for LocationBuildingData {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.building_levels_sum
                    .total_cmp(&other.building_levels_sum)
                    .then_with(|| self.id.cmp(&other.id))
            }
        }

        let building_levels = self.get_location_building_levels();

        // Track country-level stats: total building levels and location count
        let mut country_total_levels = self.gamestate.countries.create_index(0.0_f64);
        let mut country_location_count = self.gamestate.countries.create_index(0_u32);

        // Track top locations using min-heap
        let mut top_locations: std::collections::BinaryHeap<
            std::cmp::Reverse<LocationBuildingData>,
        > = std::collections::BinaryHeap::new();

        // Iterate through all locations
        for location_entry in self.gamestate.locations.iter() {
            let location = location_entry.location();

            let owner_id = location.owner;
            let Some(owner_idx) = self.gamestate.countries.get(owner_id) else {
                continue;
            };

            let building_levels_sum = building_levels[location_entry.idx()];

            // Update country stats (include all locations, even those with 0 matching buildings)
            country_total_levels[owner_idx] += building_levels_sum;
            country_location_count[owner_idx] += 1;

            // Track top 10 locations
            let location_data = LocationBuildingData {
                id: location_entry.id().value(),
                owner_id,
                building_levels_sum,
            };

            if top_locations.len() < MAX_ROWS {
                top_locations.push(std::cmp::Reverse(location_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_locations.peek()
                && location_data.building_levels_sum > smallest.building_levels_sum
            {
                top_locations.pop();
                top_locations.push(std::cmp::Reverse(location_data));
            }
        }

        // Generate left table: top countries by average building levels
        struct CountrySummary {
            id: CountryId,
            label: String,
            avg_levels: f64,
        }

        let mut country_summaries: Vec<CountrySummary> = Vec::new();

        for entry in self.gamestate.countries.iter() {
            let idx = entry.idx();
            let location_count = country_location_count[idx];

            if location_count == 0 {
                continue;
            }

            let total_levels = country_total_levels[idx];
            let avg_levels = total_levels / (location_count as f64);

            let tag = entry.tag().to_str();
            let display_name = entry
                .data()
                .map(|data| self.localized_country_name(&data.country_name))
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(tag);

            country_summaries.push(CountrySummary {
                id: entry.id(),
                label: display_name.to_string(),
                avg_levels,
            });
        }

        // Sort by average descending, with ID as tiebreaker
        country_summaries.sort_by(|a, b| {
            b.avg_levels
                .total_cmp(&a.avg_levels)
                .then_with(|| a.id.value().cmp(&b.id.value()))
        });

        let left_table_rows: Vec<Vec<TableCell>> = country_summaries
            .into_iter()
            .take(MAX_ROWS)
            .enumerate()
            .map(|(idx, summary)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(summary.label),
                    TableCell::Float {
                        value: summary.avg_levels,
                        decimals: 1,
                    },
                ]
            })
            .collect();

        // Generate right table: top locations by building levels sum
        let top_locations_vec: Vec<_> = top_locations
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(location)| location)
            .collect();

        let right_table_rows: Vec<Vec<TableCell>> = top_locations_vec
            .into_iter()
            .enumerate()
            .map(|(idx, location_data)| {
                let owner = self
                    .gamestate
                    .countries
                    .get(location_data.owner_id)
                    .and_then(|idx| self.gamestate.countries.index(idx).data())
                    .map(|x| self.localized_country_name(&x.country_name))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("C{}", location_data.owner_id.value()));

                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Integer(location_data.id as i64),
                    TableCell::Text(owner),
                    TableCell::Float {
                        value: location_data.building_levels_sum,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Highest Average Building Levels".to_string()),
                headers: vec!["#".to_string(), "Country".to_string(), "Avg".to_string()],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: Some("Highest Building Levels by Location".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Location ID".to_string(),
                    "Country".to_string(),
                    "Total".to_string(),
                ],
                rows: right_table_rows,
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }

    fn generate_markets_overlay_data(&self) -> OverlayBodyConfig {
        const MAX_ROWS: usize = 10;

        #[derive(Debug, Clone, PartialEq)]
        struct MarketData {
            center_location_id: u32,
            center_location_name: String,
            market_value: f64,
        }

        impl Eq for MarketData {}

        impl PartialOrd for MarketData {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl Ord for MarketData {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.market_value
                    .total_cmp(&other.market_value)
                    .then_with(|| self.center_location_id.cmp(&other.center_location_id))
            }
        }

        // Track top 10 markets using min-heap
        let mut top_markets: std::collections::BinaryHeap<std::cmp::Reverse<MarketData>> =
            std::collections::BinaryHeap::new();

        // Iterate through all markets
        for market in self.gamestate.market_manager.database.iter() {
            let Some(center_idx) = self.gamestate.locations.get(market.center) else {
                continue;
            };

            let center_location_name = self.location_name(center_idx).to_string();
            let market_value = market.market_value();

            let market_data = MarketData {
                center_location_id: market.center.value(),
                center_location_name,
                market_value,
            };

            if top_markets.len() < MAX_ROWS {
                top_markets.push(std::cmp::Reverse(market_data));
            } else if let Some(std::cmp::Reverse(smallest)) = top_markets.peek()
                && market_data.market_value > smallest.market_value
            {
                top_markets.pop();
                top_markets.push(std::cmp::Reverse(market_data));
            }
        }

        // Generate table: top 10 markets by value
        let top_markets_vec: Vec<_> = top_markets
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse(market)| market)
            .collect();

        let left_table_rows: Vec<Vec<TableCell>> = top_markets_vec
            .into_iter()
            .enumerate()
            .map(|(idx, market_data)| {
                vec![
                    TableCell::Text(format!("{}", idx + 1)),
                    TableCell::Text(market_data.center_location_name),
                    TableCell::Float {
                        value: market_data.market_value,
                        decimals: 0,
                    },
                ]
            })
            .collect();

        OverlayBodyConfig {
            left_table: OverlayTable {
                title: Some("Top 10 Markets by Value".to_string()),
                headers: vec![
                    "#".to_string(),
                    "Market Center".to_string(),
                    "Value".to_string(),
                ],
                rows: left_table_rows,
            },
            right_table: OverlayTable {
                title: None,
                headers: vec![],
                rows: vec![],
            },
            max_rows: Some(MAX_ROWS as u32),
        }
    }
}
