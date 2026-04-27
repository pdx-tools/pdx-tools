use super::*;

impl<'bump> Eu5Workspace<'bump> {
    pub fn hover_data(&self, location_idx: LocationIdx) -> HoverDisplayData {
        let mode = self.get_map_mode();
        let location = self.gamestate().locations.index(location_idx).location();

        if location.owner.is_dummy() {
            return HoverDisplayData::Clear;
        }

        let should_show_location = self
            .derived_entity_anchor()
            .map(|anchor| self.same_entity(anchor, location_idx, mode))
            .unwrap_or(false);

        if should_show_location {
            HoverDisplayData::Location {
                location_id: location_idx.value(),
                location_name: self.location_name(location_idx).to_string(),
                stat: self.location_stat(mode, location_idx, location),
            }
        } else if mode == MapMode::Markets {
            self.market_hover(location_idx, location)
                .unwrap_or(HoverDisplayData::Clear)
        } else {
            self.country_hover(location_idx, location, mode)
                .unwrap_or(HoverDisplayData::Clear)
        }
    }

    fn location_stat(
        &self,
        mode: MapMode,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> HoverStat {
        match mode {
            MapMode::Political => HoverStat::None,
            MapMode::Control => HoverStat::Control {
                value: location.control,
            },
            MapMode::Development => HoverStat::Development {
                value: location.development,
            },
            MapMode::Population => HoverStat::Population {
                value: self.gamestate().location_population(location) as u32,
            },
            MapMode::Markets => HoverStat::Markets {
                access: location.market_access,
            },
            MapMode::RgoLevel => HoverStat::RgoLevel {
                value: location.rgo_level,
            },
            MapMode::BuildingLevels => HoverStat::BuildingLevels {
                value: self.get_location_building_levels()[location_idx],
            },
            MapMode::PossibleTax => HoverStat::PossibleTax {
                value: location.possible_tax,
            },
            MapMode::TaxGap => HoverStat::TaxGap {
                value: location.possible_tax - location.tax,
            },
            MapMode::Religion => location
                .religion
                .and_then(|rid| self.gamestate().religion_manager.lookup(rid))
                .map(|religion| HoverStat::Religion {
                    name: religion.name.to_str().to_string(),
                })
                .unwrap_or(HoverStat::None),
            MapMode::StateEfficacy => HoverStat::StateEfficacy {
                value: location.control * location.development,
            },
        }
    }

    fn country_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
        mode: MapMode,
    ) -> Option<HoverDisplayData> {
        let owner_id = location.owner;
        let country = self.gamestate().countries.get_entry(owner_id)?;
        let country_tag = country.tag().to_str().to_string();
        let country_name = country
            .data()
            .map(|data| self.localized_country_name(&data.country_name))
            .map(|name| name.to_string())
            .unwrap_or_else(|| format!("C{}", owner_id.value()));

        Some(HoverDisplayData::Country {
            location_id: location_idx.value(),
            country_tag: country_tag.clone(),
            country_name: format!("{country_name} ({country_tag})"),
            stat: self.country_stat(mode, owner_id),
        })
    }

    fn market_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> Option<HoverDisplayData> {
        let market_id = location.market?;
        let market = self.gamestate().market_manager.get(market_id)?;
        let center_idx = self.gamestate().locations.get(market.center)?;

        Some(HoverDisplayData::Market {
            location_id: location_idx.value(),
            market_center_name: self.location_name(center_idx).to_string(),
            market_value: market.market_value(),
        })
    }

    fn country_stat(&self, mode: MapMode, owner_id: CountryId) -> HoverStat {
        match mode {
            MapMode::Political => HoverStat::None,
            MapMode::Control => {
                let mut control_sum = 0.0;
                let mut count = 0_u32;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        control_sum += location.control;
                        count += 1;
                    }
                }

                if count == 0 {
                    HoverStat::None
                } else {
                    HoverStat::Control {
                        value: control_sum / count as f64,
                    }
                }
            }
            MapMode::Development => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.development;
                    }
                }

                HoverStat::Development { value: total }
            }
            MapMode::Population => {
                let mut total = 0_u32;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += self.gamestate().location_population(location) as u32;
                    }
                }

                HoverStat::Population { value: total }
            }
            MapMode::Markets => HoverStat::None,
            MapMode::RgoLevel => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.rgo_level;
                    }
                }

                HoverStat::RgoLevel { value: total }
            }
            MapMode::BuildingLevels => {
                let building_levels = self.get_location_building_levels();
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    if entry.location().owner == owner_id {
                        total += building_levels[entry.idx()];
                    }
                }

                HoverStat::BuildingLevels { value: total }
            }
            MapMode::PossibleTax => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax;
                    }
                }

                HoverStat::PossibleTax { value: total }
            }
            MapMode::TaxGap => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax - location.tax;
                    }
                }

                HoverStat::TaxGap { value: total }
            }
            MapMode::Religion => self
                .gamestate()
                .countries
                .get_entry(owner_id)
                .and_then(|country| country.data())
                .and_then(|data| data.primary_religion)
                .and_then(|religion_id| self.gamestate().religion_manager.lookup(religion_id))
                .map(|religion| HoverStat::Religion {
                    name: religion.name.to_str().to_string(),
                })
                .unwrap_or(HoverStat::None),
            MapMode::StateEfficacy => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.control * location.development;
                    }
                }

                HoverStat::StateEfficacy { value: total }
            }
        }
    }
}
