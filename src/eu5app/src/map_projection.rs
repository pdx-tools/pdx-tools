//! Compact, save-independent inputs for replaying observed map modes.
use crate::{SaveCheckSummer, subject_color, timeline::CountryIdentities};
use eu5save::hash::FxHashMap;
use eu5save::models::{CountryId, Gamestate, Location, LocationId, Locations, Metadata};
use pdx_map::GpuColor;
use std::{collections::BTreeMap, io::Write};

/// The version of the campaign analysis payload. Increase it when the schema,
/// calculations, or precision of the projection change, so that the store does
/// not mix old and new snapshots.
pub const EXTRACTOR_VERSION: u32 = 2;

pub const FRACTION_SCALE: f64 = u16::MAX as f64;

/// A location with no owner, controller, religion or market.
pub const NO_ROW: u16 = u16::MAX;
/// A location in a market that the save names but has no record of.
pub const UNKNOWN_ROW: u16 = u16::MAX - 1;

/// A fraction column of a location, in frame order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fraction {
    Control,
    MarketAccess,
}

impl Fraction {
    pub const ALL: [Fraction; 2] = [Fraction::Control, Fraction::MarketAccess];

    pub(crate) fn of(self, location: &Location) -> f64 {
        match self {
            Fraction::Control => location.control,
            Fraction::MarketAccess => location.market_access,
        }
    }
}

/// A measurement column of a location, in frame order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Metric {
    Development,
    Population,
    BuildingLevels,
    RgoLevel,
    Wealth,
    UnrealizedTaxBase,
    PopulationGrowth,
}

impl Metric {
    pub const ALL: [Metric; 7] = [
        Metric::Development,
        Metric::Population,
        Metric::BuildingLevels,
        Metric::RgoLevel,
        Metric::Wealth,
        Metric::UnrealizedTaxBase,
        Metric::PopulationGrowth,
    ];

    /// The value of a location in the save. Building levels need a pass over
    /// all buildings, so the caller supplies them.
    pub(crate) fn of(
        self,
        game: &Gamestate<'_>,
        location: &Location,
        building_levels: impl FnOnce() -> f64,
    ) -> f64 {
        match self {
            Metric::Development => location.development,
            Metric::Population => game.location_population(location),
            Metric::BuildingLevels => building_levels(),
            Metric::RgoLevel => location.rgo_level,
            Metric::Wealth => location.possible_tax,
            Metric::UnrealizedTaxBase => (location.possible_tax - location.tax).max(0.0),
            Metric::PopulationGrowth => {
                crate::population::location_reproduction_rate(game, location)
            }
        }
    }
}

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
    #[error("snapshot column {column} names row {row} of a table with {rows} rows")]
    TableRow {
        column: &'static str,
        row: u16,
        rows: usize,
    },
    #[error("snapshot table {table} has more rows than a location column can name")]
    TableSize { table: &'static str },
    #[error("snapshot location {index} has id {actual}, expected {expected}")]
    LocationMismatch {
        index: usize,
        expected: u32,
        actual: u32,
    },
    #[error("map measurement for location {location} is not finite")]
    NonFinite { location: u32 },
}

/// A compact observed map: fractions use u16 and measurements f32. The
/// owner, controller, religion and market of a location are rows of the
/// tables of the frame, or [`NO_ROW`].
#[derive(Debug, PartialEq)]
pub struct MapProjection {
    pub layout_key: String,
    pub location_ids: Vec<LocationId>,
    pub control: Vec<u16>,
    pub market_access: Vec<u16>,
    pub development: Vec<f32>,
    pub population: Vec<f32>,
    pub building_levels: Vec<f32>,
    pub rgo_level: Vec<f32>,
    pub wealth: Vec<f32>,
    pub unrealized_tax_base: Vec<f32>,
    pub population_growth: Vec<f32>,
    /// A row of `countries`.
    pub owners: Vec<u16>,
    /// A row of `countries`.
    pub controllers: Vec<u16>,
    /// A row of `religion_colors`.
    pub religions: Vec<u16>,
    /// A row of `market_colors`, or [`UNKNOWN_ROW`].
    pub markets: Vec<u16>,
    /// [country ID, historical owner color, current controller color, primary religion]
    pub countries: Vec<u32>,
    /// [religion ID, packed color]
    pub religion_colors: Vec<u32>,
    /// [market ID, center location ID, packed color]
    pub market_colors: Vec<u32>,
}

pub struct MapProjectionData<'a> {
    pub layout_key: &'a str,
    pub location_ids: &'a [LocationId],
    pub control: &'a [u16],
    pub market_access: &'a [u16],
    pub development: &'a [f32],
    pub population: &'a [f32],
    pub building_levels: &'a [f32],
    pub rgo_level: &'a [f32],
    pub wealth: &'a [f32],
    pub unrealized_tax_base: &'a [f32],
    pub population_growth: &'a [f32],
    pub owners: &'a [u16],
    pub controllers: &'a [u16],
    pub religions: &'a [u16],
    pub markets: &'a [u16],
    pub countries: &'a [u32],
    pub religion_colors: &'a [u32],
    pub market_colors: &'a [u32],
}
/// A frame borrowed from a validated observation. Its fields cannot change.
/// Use `analysis::frame` after local observation decode.
pub struct ValidatedMapProjectionData<'a>(MapProjectionData<'a>);
impl<'a> ValidatedMapProjectionData<'a> {
    pub(crate) fn new(data: MapProjectionData<'a>) -> Self {
        Self(data)
    }
    pub(crate) fn into_data(self) -> MapProjectionData<'a> {
        self.0
    }
}
impl MapProjectionData<'_> {
    pub fn metric(&self, metric: Metric) -> &[f32] {
        match metric {
            Metric::Development => self.development,
            Metric::Population => self.population,
            Metric::BuildingLevels => self.building_levels,
            Metric::RgoLevel => self.rgo_level,
            Metric::Wealth => self.wealth,
            Metric::UnrealizedTaxBase => self.unrealized_tax_base,
            Metric::PopulationGrowth => self.population_growth,
        }
    }
    pub fn fraction(&self, fraction: Fraction) -> &[u16] {
        match fraction {
            Fraction::Control => self.control,
            Fraction::MarketAccess => self.market_access,
        }
    }
    /// Check columns, dictionary widths, references, and finite values.
    pub fn validate_intrinsic(&self) -> Result<(), MapProjectionError> {
        let n = self.location_ids.len();
        for (column, actual, expected) in [
            ("location_ids", self.location_ids.len(), n),
            ("control", self.control.len(), n),
            ("market_access", self.market_access.len(), n),
            ("development", self.development.len(), n),
            ("population", self.population.len(), n),
            ("building_levels", self.building_levels.len(), n),
            ("rgo_level", self.rgo_level.len(), n),
            ("wealth", self.wealth.len(), n),
            ("unrealized_tax_base", self.unrealized_tax_base.len(), n),
            ("population_growth", self.population_growth.len(), n),
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
        for (column, values, table, width) in [
            ("owners", self.owners, self.countries, 4),
            ("controllers", self.controllers, self.countries, 4),
            ("religions", self.religions, self.religion_colors, 2),
            ("markets", self.markets, self.market_colors, 3),
        ] {
            let rows = table.len() / width;
            if rows > usize::from(UNKNOWN_ROW) {
                return Err(MapProjectionError::TableSize { table: column });
            }

            let named = |row: u16| {
                row == NO_ROW
                    || usize::from(row) < rows
                    || (column == "markets" && row == UNKNOWN_ROW)
            };
            if let Some(&row) = values.iter().find(|row| !named(**row)) {
                return Err(MapProjectionError::TableRow { column, row, rows });
            }
        }
        for metric in Metric::ALL {
            if let Some(index) = self
                .metric(metric)
                .iter()
                .position(|value| !value.is_finite())
            {
                return Err(MapProjectionError::NonFinite {
                    location: self.location_ids[index].value(),
                });
            }
        }
        Ok(())
    }
    /// Check the frame against the loaded map before changing renderer buffers.
    pub fn validate(
        &self,
        layout: &str,
        locations: &Locations<'_>,
    ) -> Result<(), MapProjectionError> {
        self.validate_intrinsic()?;
        self.validate_compatibility(layout, locations)
    }
    pub(crate) fn validate_compatibility(
        &self,
        layout: &str,
        locations: &Locations<'_>,
    ) -> Result<(), MapProjectionError> {
        if self.layout_key != layout {
            return Err(MapProjectionError::LayoutMismatch);
        }
        if self.location_ids.len() != locations.len() {
            return Err(MapProjectionError::ColumnLength {
                column: "location_ids",
                expected: locations.len(),
                actual: self.location_ids.len(),
            });
        }
        for (index, (entry, actual)) in locations.iter().zip(self.location_ids).enumerate() {
            if entry.id() != *actual {
                return Err(MapProjectionError::LocationMismatch {
                    index,
                    expected: entry.id().value(),
                    actual: actual.value(),
                });
            }
        }
        Ok(())
    }
}
impl MapProjection {
    pub fn as_data(&self) -> MapProjectionData<'_> {
        MapProjectionData {
            layout_key: &self.layout_key,
            location_ids: &self.location_ids,
            control: &self.control,
            market_access: &self.market_access,
            development: &self.development,
            population: &self.population,
            building_levels: &self.building_levels,
            rgo_level: &self.rgo_level,
            wealth: &self.wealth,
            unrealized_tax_base: &self.unrealized_tax_base,
            population_growth: &self.population_growth,
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

/// A table of a frame: rows of an ID and `N` values, in the order that the
/// locations first name them.
struct Table<const N: usize> {
    name: &'static str,
    rows: FxHashMap<u32, u16>,
    values: Vec<u32>,
}

impl<const N: usize> Table<N> {
    fn new(name: &'static str) -> Self {
        Self {
            name,
            rows: FxHashMap::default(),
            values: Vec::new(),
        }
    }

    /// The row of an ID. A new ID gets the next row.
    fn row(
        &mut self,
        id: u32,
        values: impl FnOnce() -> [u32; N],
    ) -> Result<u16, MapProjectionError> {
        if let Some(row) = self.rows.get(&id) {
            return Ok(*row);
        }
        let row = u16::try_from(self.rows.len())
            .ok()
            .filter(|row| *row < UNKNOWN_ROW)
            .ok_or(MapProjectionError::TableSize { table: self.name })?;
        self.rows.insert(id, row);
        self.values.push(id);
        self.values.extend(values());
        Ok(row)
    }
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
        subject_color::subject_map_color(
            owner,
            color,
            game.countries.len(),
            |id| overlords.get(&id).copied(),
            color_of,
        )
        .packed()
    };
    let buildings = crate::map_measurements::location_building_levels(game);
    let mut countries = Table::<3>::new("countries");
    let mut religions = Table::<1>::new("religion_colors");
    let mut markets = Table::<2>::new("market_colors");
    let mut result = MapProjection {
        layout_key: layout_key(game.metadata()),
        location_ids: Vec::with_capacity(game.locations.len()),
        control: Vec::with_capacity(game.locations.len()),
        market_access: Vec::with_capacity(game.locations.len()),
        development: Vec::with_capacity(game.locations.len()),
        population: Vec::with_capacity(game.locations.len()),
        building_levels: Vec::with_capacity(game.locations.len()),
        rgo_level: Vec::with_capacity(game.locations.len()),
        wealth: Vec::with_capacity(game.locations.len()),
        unrealized_tax_base: Vec::with_capacity(game.locations.len()),
        population_growth: Vec::with_capacity(game.locations.len()),
        owners: Vec::with_capacity(game.locations.len()),
        controllers: Vec::with_capacity(game.locations.len()),
        religions: Vec::with_capacity(game.locations.len()),
        markets: Vec::with_capacity(game.locations.len()),
        countries: Vec::new(),
        religion_colors: Vec::new(),
        market_colors: Vec::new(),
    };
    let mut religion = |id: eu5save::models::ReligionId| {
        religions.row(id.value(), || {
            [game
                .religion_manager
                .lookup(id)
                .map(|r| GpuColor::from(r.color.0).packed())
                .unwrap_or(GpuColor::DEBUG.packed())]
        })
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
        result.location_ids.push(entry.id());
        result
            .control
            .push(quantize(Fraction::Control.of(location)));
        result
            .market_access
            .push(quantize(Fraction::MarketAccess.of(location)));
        result.development.push(compact(
            Metric::Development.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.population.push(compact(
            Metric::Population.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.building_levels.push(compact(
            Metric::BuildingLevels.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.rgo_level.push(compact(
            Metric::RgoLevel.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.wealth.push(compact(
            Metric::Wealth.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.unrealized_tax_base.push(compact(
            Metric::UnrealizedTaxBase.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        result.population_growth.push(compact(
            Metric::PopulationGrowth.of(game, location, || buildings[entry.idx()]),
            entry.id().value(),
        )?);
        for (id, values) in [
            (location.owner, &mut result.owners),
            (location.controller, &mut result.controllers),
        ] {
            let Some(id) = id.real_id() else {
                values.push(NO_ROW);
                continue;
            };
            let id: CountryId = id.into();
            let primary = game
                .countries
                .get(id)
                .and_then(|idx| game.countries.index(idx).data())
                .and_then(|c| c.primary_religion)
                .filter(|id| game.religion_manager.lookup(*id).is_some());
            // The table keeps the religion ID, and the religion gets a row.
            if let Some(primary) = primary {
                religion(primary)?;
            }
            let primary = primary.map_or(u32::MAX, |id| id.value());
            values.push(countries.row(id.value(), || {
                [blended(id, true), blended(id, false), primary]
            })?);
        }
        let religion = match location.religion {
            Some(id) => religion(id)?,
            None => NO_ROW,
        };
        result.religions.push(religion);
        let market = match location.market {
            None => NO_ROW,
            Some(id) => match game.market_manager.get(id) {
                Some(market) => markets.row(id.value(), || {
                    [
                        market.center.value(),
                        GpuColor::from(market.color.0).packed(),
                    ]
                })?,
                None => UNKNOWN_ROW,
            },
        };
        result.markets.push(market);
    }
    result.countries = countries.values;
    result.religion_colors = religions.values;
    result.market_colors = markets.values;
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
    fn a_table_gives_each_id_one_row_and_refuses_more_rows_than_a_column_names() {
        let mut table = Table::<1>::new("test");
        assert_eq!(table.row(42, || [7]), Ok(0));
        assert_eq!(table.row(43, || [8]), Ok(1));
        assert_eq!(table.row(42, || [9]), Ok(0));
        assert_eq!(table.values, [42, 7, 43, 8]);
        for id in 2..u32::from(UNKNOWN_ROW) {
            table.row(id + 100, || [0]).unwrap();
        }
        assert_eq!(
            table.row(1, || [0]),
            Err(MapProjectionError::TableSize { table: "test" })
        );
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
