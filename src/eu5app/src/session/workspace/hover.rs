use super::*;

impl<'bump> Eu5Workspace<'bump> {
    pub(crate) fn hover_data(&self, location_idx: LocationIdx) -> HoverDisplayDataSource {
        let mode = self.get_map_mode();
        let location = self.gamestate().locations.index(location_idx).location();

        if location.owner.is_dummy() {
            return HoverDisplayDataSource::Clear;
        }

        let should_show_location = self
            .derived_entity_anchor()
            .map(|anchor| self.same_entity(anchor, location_idx, mode))
            .unwrap_or(false);

        if should_show_location {
            HoverDisplayDataSource::Location {
                location_id: location_idx.value(),
                location: location_idx,
                stat: self.location_stat(mode, location_idx, location),
            }
        } else if mode == MapMode::Markets {
            self.market_hover(location_idx, location)
                .unwrap_or(HoverDisplayDataSource::Clear)
        } else {
            self.country_hover(location_idx, location, mode)
                .unwrap_or(HoverDisplayDataSource::Clear)
        }
    }

    fn location_stat(
        &self,
        mode: MapMode,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> HoverStatSource {
        match mode {
            MapMode::Political => HoverStatSource::None,
            MapMode::Control => HoverStatSource::Control {
                value: location.control,
            },
            MapMode::Development => HoverStatSource::Development {
                value: location.development,
            },
            MapMode::Population => HoverStatSource::Population {
                value: self.gamestate().location_population(location) as u32,
            },
            MapMode::Markets => HoverStatSource::Markets {
                access: location.market_access,
            },
            MapMode::RgoLevel => HoverStatSource::RgoLevel {
                value: location.rgo_level,
            },
            MapMode::BuildingLevels => HoverStatSource::BuildingLevels {
                value: self.get_location_building_levels()[location_idx],
            },
            MapMode::PossibleTax => HoverStatSource::PossibleTax {
                value: location.possible_tax,
            },
            MapMode::TaxGap => HoverStatSource::TaxGap {
                value: location.possible_tax - location.tax,
            },
            MapMode::Religion => location
                .religion
                .map(|religion_id| HoverStatSource::Religion {
                    religion: religion_id,
                })
                .unwrap_or(HoverStatSource::None),
            MapMode::StateEfficacy => HoverStatSource::StateEfficacy {
                value: location.control * location.development,
            },
        }
    }

    fn country_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
        mode: MapMode,
    ) -> Option<HoverDisplayDataSource> {
        let owner_id = location.owner;
        let country_idx = self.gamestate().countries.get(owner_id)?;

        Some(HoverDisplayDataSource::Country {
            location_id: location_idx.value(),
            country: CountryRefSource { country_idx },
            stat: self.country_stat(mode, owner_id),
        })
    }

    fn market_hover(
        &self,
        location_idx: LocationIdx,
        location: &eu5save::models::Location<'_>,
    ) -> Option<HoverDisplayDataSource> {
        let market_id = location.market?;

        Some(HoverDisplayDataSource::Market {
            location_id: location_idx.value(),
            market: market_id,
            market_value: self
                .gamestate()
                .market_manager
                .get(market_id)?
                .market_value(),
        })
    }

    fn country_stat(&self, mode: MapMode, owner_id: CountryId) -> HoverStatSource {
        match mode {
            MapMode::Political => HoverStatSource::None,
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
                    HoverStatSource::None
                } else {
                    HoverStatSource::Control {
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

                HoverStatSource::Development { value: total }
            }
            MapMode::Population => {
                let mut total = 0_u32;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += self.gamestate().location_population(location) as u32;
                    }
                }

                HoverStatSource::Population { value: total }
            }
            MapMode::Markets => HoverStatSource::None,
            MapMode::RgoLevel => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.rgo_level;
                    }
                }

                HoverStatSource::RgoLevel { value: total }
            }
            MapMode::BuildingLevels => {
                let building_levels = self.get_location_building_levels();
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    if entry.location().owner == owner_id {
                        total += building_levels[entry.idx()];
                    }
                }

                HoverStatSource::BuildingLevels { value: total }
            }
            MapMode::PossibleTax => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax;
                    }
                }

                HoverStatSource::PossibleTax { value: total }
            }
            MapMode::TaxGap => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.possible_tax - location.tax;
                    }
                }

                HoverStatSource::TaxGap { value: total }
            }
            MapMode::Religion => self
                .gamestate()
                .countries
                .get_entry(owner_id)
                .and_then(|country| country.data())
                .and_then(|data| data.primary_religion)
                .map(|religion_id| HoverStatSource::Religion {
                    religion: religion_id,
                })
                .unwrap_or(HoverStatSource::None),
            MapMode::StateEfficacy => {
                let mut total = 0.0;

                for entry in self.gamestate().locations.iter() {
                    let location = entry.location();
                    if location.owner == owner_id {
                        total += location.control * location.development;
                    }
                }

                HoverStatSource::StateEfficacy { value: total }
            }
        }
    }
}
