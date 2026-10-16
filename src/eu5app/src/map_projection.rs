//! Compact, save-independent inputs for replaying observed map modes.
use crate::{SaveCheckSummer, subject_color, timeline::CountryIdentities};
use eu5save::models::{CountryId, Gamestate, Locations, Metadata};
use pdx_map::GpuColor;
use std::{collections::BTreeMap, io::Write};

pub const FRACTION_SCALE: f64 = u16::MAX as f64;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MapProjectionError {
    #[error("snapshot is for a different map layout")]
    LayoutMismatch,
    #[error("snapshot column {column} has {actual} values, expected {expected}")]
    ColumnLength {
        column: &'static str,
        expected: usize,
        actual: usize,
    },
    #[error("snapshot table {table} has {actual} values, expected rows of {width}")]
    TableWidth {
        table: &'static str,
        width: usize,
        actual: usize,
    },
    #[error("snapshot location {index} has id {actual}, expected {expected}")]
    LocationMismatch {
        index: usize,
        expected: u32,
        actual: u32,
    },
    #[error("map measurement for location {location} is not finite")]
    NonFinite { location: u32 },
}

/// A compact observed map: fractions use u16, measurements f32, identities u32.
#[derive(Debug, PartialEq)]
pub struct MapProjection {
    pub layout_key: String,
    pub location_ids: Vec<u32>,
    pub fractions: Vec<u16>,
    pub metrics: Vec<f32>,
    pub owners: Vec<u32>,
    pub controllers: Vec<u32>,
    pub religions: Vec<u32>,
    pub markets: Vec<u32>,
    /// [country ID, historical owner color, current controller color, primary religion]
    pub countries: Vec<u32>,
    /// [religion ID, packed color]
    pub religion_colors: Vec<u32>,
    /// [market ID, center location ID, packed color]
    pub market_colors: Vec<u32>,
}

pub struct MapProjectionData<'a> {
    pub layout_key: &'a str,
    pub location_ids: &'a [u32],
    pub fractions: &'a [u16],
    pub metrics: &'a [f32],
    pub owners: &'a [u32],
    pub controllers: &'a [u32],
    pub religions: &'a [u32],
    pub markets: &'a [u32],
    pub countries: &'a [u32],
    pub religion_colors: &'a [u32],
    pub market_colors: &'a [u32],
}
impl MapProjectionData<'_> {
    /// Validate the entire observation before modifying any renderer buffers.
    pub fn validate(
        &self,
        layout: &str,
        locations: &Locations<'_>,
    ) -> Result<(), MapProjectionError> {
        if self.layout_key != layout {
            return Err(MapProjectionError::LayoutMismatch);
        }
        let n = locations.len();
        for (column, actual, expected) in [
            ("location_ids", self.location_ids.len(), n),
            ("fractions", self.fractions.len(), n * 2),
            ("metrics", self.metrics.len(), n * 7),
            ("owners", self.owners.len(), n),
            ("controllers", self.controllers.len(), n),
            ("religions", self.religions.len(), n),
            ("markets", self.markets.len(), n),
        ] {
            if actual != expected {
                return Err(MapProjectionError::ColumnLength {
                    column,
                    expected,
                    actual,
                });
            }
        }
        for (table, actual, width) in [
            ("countries", self.countries.len(), 4),
            ("religion_colors", self.religion_colors.len(), 2),
            ("market_colors", self.market_colors.len(), 3),
        ] {
            if !actual.is_multiple_of(width) {
                return Err(MapProjectionError::TableWidth {
                    table,
                    width,
                    actual,
                });
            }
        }
        for (index, (entry, &actual)) in locations.iter().zip(self.location_ids).enumerate() {
            let expected = entry.id().value();
            if actual != expected {
                return Err(MapProjectionError::LocationMismatch {
                    index,
                    expected,
                    actual,
                });
            }
        }
        if let Some(index) = self.metrics.iter().position(|value| !value.is_finite()) {
            return Err(MapProjectionError::NonFinite {
                location: self.location_ids[index / 7],
            });
        }
        Ok(())
    }
}
impl MapProjection {
    pub fn as_data(&self) -> MapProjectionData<'_> {
        MapProjectionData {
            layout_key: &self.layout_key,
            location_ids: &self.location_ids,
            fractions: &self.fractions,
            metrics: &self.metrics,
            owners: &self.owners,
            controllers: &self.controllers,
            religions: &self.religions,
            markets: &self.markets,
            countries: &self.countries,
            religion_colors: &self.religion_colors,
            market_colors: &self.market_colors,
        }
    }
}

pub fn world_summary(game: &Gamestate<'_>) -> crate::insights::WorldSummary {
    let mut owners = std::collections::HashSet::new();
    let mut location_count = 0u32;
    let mut total_population = 0u32;
    for entry in game.locations.iter() {
        let loc = entry.location();
        let Some(owner) = loc.owner.real_id().map(|r| r.country_id()) else {
            continue;
        };
        owners.insert(owner);
        location_count += 1;
        total_population += game.location_population(loc) as u32;
    }
    crate::insights::WorldSummary {
        location_count,
        country_count: owners.len() as u32,
        total_population,
    }
}

pub fn layout_key(metadata: &Metadata<'_>) -> String {
    let mut hash = SaveCheckSummer::new();
    for (id, name) in metadata.compatibility.locations_iter() {
        hash.write_all(&id.value().to_le_bytes())
            .expect("checksum writes are infallible");
        hash.write_all(&(name.len() as u64).to_le_bytes())
            .expect("checksum writes are infallible");
        hash.write_all(name.as_bytes())
            .expect("checksum writes are infallible");
    }
    hash.finish()
}

pub fn quantize(value: f64) -> u16 {
    (value.clamp(0.0, 1.0) * FRACTION_SCALE).round() as u16
}

/// Reject overflow rather than silently corrupting a map's gradient domain.
fn compact(value: f64, location: u32) -> Result<f32, MapProjectionError> {
    let result = value as f32;
    if !value.is_finite() || !result.is_finite() {
        return Err(MapProjectionError::NonFinite { location });
    }
    Ok(result)
}

pub fn extract(game: &Gamestate<'_>) -> Result<MapProjection, MapProjectionError> {
    let identities = CountryIdentities::new(game);
    let date = game.metadata().date;
    let mut overlords = BTreeMap::new();
    for dependency in game.diplomacy_manager.dependencies() {
        if game.countries.get(dependency.first).is_some()
            && game.countries.get(dependency.second).is_some()
        {
            overlords.insert(dependency.second, dependency.first);
        }
    }
    let blended = |owner: CountryId, historical: bool| {
        let color_of = |id| {
            if historical {
                identities.identity_at(game, id, date).map(|x| x.color)
            } else {
                game.countries
                    .get(id)
                    .and_then(|idx| game.countries.index(idx).data())
                    .map(|c| c.color)
            }
        };
        let Some(color) = color_of(owner) else {
            return GpuColor::UNOWNED.packed();
        };
        let mut parent = owner;
        let mut parent_color = color;
        for _ in 0..game.countries.len() {
            let Some(next) = overlords.get(&parent) else {
                break;
            };
            parent = *next;
            if let Some(next_color) = color_of(parent) {
                parent_color = next_color;
            }
        }
        if parent == owner {
            return GpuColor::from(color.0).packed();
        }
        let (r, g, b) = subject_color::blend_color(
            GpuColor::from(color.0).rgb(),
            GpuColor::from(parent_color.0).rgb(),
        );
        GpuColor::from_rgb(r, g, b).packed()
    };
    let buildings = crate::map_measurements::location_building_levels(game);
    let mut countries = BTreeMap::new();
    let mut religion_colors = BTreeMap::new();
    let mut market_colors = BTreeMap::new();
    let mut result = MapProjection {
        layout_key: layout_key(game.metadata()),
        location_ids: Vec::with_capacity(game.locations.len()),
        fractions: Vec::with_capacity(game.locations.len() * 2),
        metrics: Vec::with_capacity(game.locations.len() * 7),
        owners: Vec::with_capacity(game.locations.len()),
        controllers: Vec::with_capacity(game.locations.len()),
        religions: Vec::with_capacity(game.locations.len()),
        markets: Vec::with_capacity(game.locations.len()),
        countries: Vec::new(),
        religion_colors: Vec::new(),
        market_colors: Vec::new(),
    };
    let mut religion = |id: eu5save::models::ReligionId| {
        religion_colors.entry(id.value()).or_insert_with(|| {
            game.religion_manager
                .lookup(id)
                .map(|r| GpuColor::from(r.color.0).packed())
                .unwrap_or(GpuColor::DEBUG.packed())
        });
        id.value()
    };
    for entry in game.locations.iter() {
        let location = entry.location();
        if !location.control.is_finite()
            || !location.market_access.is_finite()
            || !location.tax.is_finite()
        {
            return Err(MapProjectionError::NonFinite {
                location: entry.id().value(),
            });
        }
        result.location_ids.push(entry.id().value());
        result
            .fractions
            .extend([quantize(location.control), quantize(location.market_access)]);
        for value in [
            location.development,
            game.location_population(location),
            buildings[entry.idx()],
            location.rgo_level,
            location.possible_tax,
            (location.possible_tax - location.tax).max(0.0),
            crate::population::location_reproduction_rate(game, location),
        ] {
            result.metrics.push(compact(value, entry.id().value())?);
        }
        for (id, values) in [
            (location.owner, &mut result.owners),
            (location.controller, &mut result.controllers),
        ] {
            let Some(id) = id.real_id() else {
                values.push(u32::MAX);
                continue;
            };
            let id: CountryId = id.into();
            values.push(id.value());
            countries.entry(id.value()).or_insert_with(|| {
                let primary = game
                    .countries
                    .get(id)
                    .and_then(|idx| game.countries.index(idx).data())
                    .and_then(|c| c.primary_religion)
                    .filter(|id| game.religion_manager.lookup(*id).is_some())
                    .map(&mut religion)
                    .unwrap_or(u32::MAX);
                [blended(id, true), blended(id, false), primary]
            });
        }
        result
            .religions
            .push(location.religion.map(&mut religion).unwrap_or(u32::MAX));
        result.markets.push(
            location
                .market
                .map(|id| {
                    if let Some(market) = game.market_manager.get(id) {
                        market_colors.insert(
                            id.value(),
                            [
                                market.center.value(),
                                GpuColor::from(market.color.0).packed(),
                            ],
                        );
                    }
                    id.value()
                })
                .unwrap_or(u32::MAX),
        );
    }
    result.countries = countries
        .into_iter()
        .flat_map(|(id, [a, b, c])| [id, a, b, c])
        .collect();
    result.religion_colors = religion_colors
        .into_iter()
        .flat_map(|(id, color)| [id, color])
        .collect();
    result.market_colors = market_colors
        .into_iter()
        .flat_map(|(id, [center, color])| [id, center, color])
        .collect();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_measurement_identifies_the_location() {
        for value in [f64::NAN, f64::INFINITY, f64::MAX] {
            assert_eq!(
                compact(value, 42),
                Err(MapProjectionError::NonFinite { location: 42 })
            );
        }
        assert_eq!(compact(12.5, 42), Ok(12.5));
    }
    #[test]
    fn fixed_point_control_preserves_range_and_precision() {
        assert_eq!(quantize(-1.0), 0);
        assert_eq!(quantize(2.0), u16::MAX);
        assert_eq!(quantize(f64::NAN), 0);
        for value in [0.0, 0.0001, 0.25, 0.5, 0.987654, 1.0] {
            assert!(
                (f64::from(quantize(value)) / FRACTION_SCALE - value).abs() <= 0.5 / FRACTION_SCALE
            );
        }
    }
}
