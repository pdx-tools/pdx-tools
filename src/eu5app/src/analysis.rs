//! The EU5 rules of campaign analysis: the snapshot payload and the history
//! queries over it.

use crate::insights::WorldSummary;
use crate::map_projection::{
    EXTRACTOR_VERSION, MapProjection, MapProjectionData, MapProjectionError,
    ValidatedMapProjectionData,
};
use campaign_analysis::{
    AnalysisError, ColumnError, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, Observation, PayloadError, PreparedIndex, ReferenceError, RegistryMemory,
    RowColumns, RowSelect, SelectionRows, SnapshotDescriptor, SnapshotSource, Table, View,
};
use eu5save::models::LocationId;
use serde::{Deserialize, Serialize};

/// The EU5 fields of a snapshot descriptor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Eu5Detail {
    pub world: WorldSummary,
}

/// Aligned location columns. The location table keeps the keys.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectionColumns {
    pub control: Vec<u16>,
    pub market_access: Vec<u16>,
    pub development: Vec<f32>,
    pub population: Vec<f32>,
    pub building_levels: Vec<f32>,
    pub rgo_level: Vec<f32>,
    pub wealth: Vec<f32>,
    pub unrealized_tax_base: Vec<f32>,
    pub population_growth: Vec<f32>,
    pub owners: Vec<u16>,
    pub controllers: Vec<u16>,
    pub religions: Vec<u16>,
    pub markets: Vec<u16>,
}
campaign_analysis::columns!(ProjectionColumns {
    control,
    market_access,
    development,
    population,
    building_levels,
    rgo_level,
    wealth,
    unrealized_tax_base,
    population_growth,
    owners,
    controllers,
    religions,
    markets,
});

impl RowColumns for ProjectionColumns {
    fn check_rows(&self, expected: usize) -> Result<(), ColumnError> {
        self.control.check_rows(expected)?;
        self.market_access.check_rows(expected)?;
        self.development.check_rows(expected)?;
        self.population.check_rows(expected)?;
        self.building_levels.check_rows(expected)?;
        self.rgo_level.check_rows(expected)?;
        self.wealth.check_rows(expected)?;
        self.unrealized_tax_base.check_rows(expected)?;
        self.population_growth.check_rows(expected)?;
        self.owners.check_rows(expected)?;
        self.controllers.check_rows(expected)?;
        self.religions.check_rows(expected)?;
        self.markets.check_rows(expected)?;
        Ok(())
    }
}
#[derive(Debug, Clone, PartialEq)]
pub struct Eu5Payload {
    pub locations: Table<LocationId, ProjectionColumns>,
    pub countries: Vec<u32>,
    pub religion_colors: Vec<u32>,
    pub market_colors: Vec<u32>,
}
impl Columns for Eu5Payload {
    fn encode(&self, out: &mut Encoder) {
        self.locations.encode_with(out, |keys, out| {
            out.column(&keys.iter().map(|id| id.value()).collect::<Vec<_>>())
        });
        self.countries.encode(out);
        self.religion_colors.encode(out);
        self.market_colors.encode(out);
    }
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        Ok(Self {
            locations: Table::decode_map_order_with(input, |input| {
                Ok(input
                    .column::<u32>()?
                    .into_iter()
                    .map(LocationId::new)
                    .collect())
            })?,
            countries: Columns::decode(input)?,
            religion_colors: Columns::decode(input)?,
            market_colors: Columns::decode(input)?,
        })
    }
    fn heap_bytes(&self) -> usize {
        self.locations.columns().heap_bytes()
            + self.countries.heap_bytes()
            + self.religion_colors.heap_bytes()
            + self.market_colors.heap_bytes()
    }
    fn allocated_bytes(&self) -> usize {
        self.locations.columns().allocated_bytes()
            + self.countries.allocated_bytes()
            + self.religion_colors.allocated_bytes()
            + self.market_colors.allocated_bytes()
    }
}
impl Eu5Payload {
    pub fn data<'a>(&'a self, layout_key: &'a str) -> MapProjectionData<'a> {
        let columns = self.locations.columns();
        MapProjectionData {
            layout_key,
            location_ids: self.locations.keys(),
            control: &columns.control,
            market_access: &columns.market_access,
            development: &columns.development,
            population: &columns.population,
            building_levels: &columns.building_levels,
            rgo_level: &columns.rgo_level,
            wealth: &columns.wealth,
            unrealized_tax_base: &columns.unrealized_tax_base,
            population_growth: &columns.population_growth,
            owners: &columns.owners,
            controllers: &columns.controllers,
            religions: &columns.religions,
            markets: &columns.markets,
            countries: &self.countries,
            religion_colors: &self.religion_colors,
            market_colors: &self.market_colors,
        }
    }
}

/// Borrow paint data from an observation that passed local payload validation.
/// The map worker must decode transferred bytes before it calls this function.
pub fn frame(observation: &Observation<Eu5Analysis>) -> ValidatedMapProjectionData<'_> {
    ValidatedMapProjectionData::new(
        observation
            .payload()
            .data(&observation.descriptor.layout_key),
    )
}

/// The snapshot of a save from its map projection and its world summary.
pub fn observation(
    projection: MapProjection,
    world: WorldSummary,
    source: SnapshotSource,
) -> Result<Observation<Eu5Analysis>, AnalysisError> {
    let MapProjection {
        layout_key,
        location_ids,
        control,
        market_access,
        development,
        population,
        building_levels,
        rgo_level,
        wealth,
        unrealized_tax_base,
        population_growth,
        owners,
        controllers,
        religions,
        markets,
        countries,
        religion_colors,
        market_colors,
    } = projection;
    let columns = ProjectionColumns {
        control,
        market_access,
        development,
        population,
        building_levels,
        rgo_level,
        wealth,
        unrealized_tax_base,
        population_growth,
        owners,
        controllers,
        religions,
        markets,
    };
    Observation::new(
        SnapshotDescriptor::new::<Eu5Analysis>(source, layout_key),
        Eu5Detail { world },
        Eu5Payload {
            locations: Table::map_order(location_ids, columns)?,
            countries,
            religion_colors,
            market_colors,
        },
    )
}

#[derive(Debug)]
pub struct Eu5Analysis;

impl Game for Eu5Analysis {
    const GAME: &'static str = "eu5";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    const ARTIFACTS: &'static [&'static str] = &["observations", "map"];
    type Detail = Eu5Detail;
    type Payload = Eu5Payload;
    type Shared = IndexRegistry<LocationId>;
    type Prepared = PreparedIndex<LocationId>;
    type Query = Eu5Query;

    fn validate(payload: &Eu5Payload) -> Result<(), PayloadError> {
        payload
            .data("")
            .validate_intrinsic()
            .map_err(|error| match error {
                MapProjectionError::TableRow { column, row, rows } => {
                    PayloadError::Reference(ReferenceError::Row {
                        column,
                        row: u32::from(row),
                        rows,
                    })
                }
                MapProjectionError::TableWidth {
                    table,
                    width,
                    actual,
                } => PayloadError::DictionaryWidth {
                    table,
                    width,
                    actual,
                },
                MapProjectionError::TableSize { table } => PayloadError::DictionarySize { table },
                MapProjectionError::ColumnLength {
                    expected, actual, ..
                } => PayloadError::Column(ColumnError::Length { expected, actual }),
                MapProjectionError::NonFinite { location } => {
                    PayloadError::NonFiniteAt { key: location }
                }
                error => PayloadError::Invalid(error.to_string()),
            })
    }
    fn prepare(
        payload: &mut Eu5Payload,
        layout: &str,
        shared: &Self::Shared,
    ) -> Result<Self::Prepared, AnalysisError> {
        shared.prepare(&mut payload.locations, Some(layout))
    }
    fn added_bytes(prepared: &Self::Prepared) -> usize {
        prepared.added_bytes()
    }
    fn commit(shared: &mut Self::Shared, prepared: Self::Prepared) {
        shared.commit(prepared);
    }
    fn shared_memory(shared: &Self::Shared) -> RegistryMemory {
        shared.memory()
    }
}

campaign_analysis::queries! {
    /// The EU5 history queries.
    pub enum Eu5Query for Eu5Analysis => Eu5Answer {
        /// The population of the world on each date, as the world summary of
        /// the save counts it.
        WorldPopulation => History = world_population,
        /// The population of a fixed set of locations on each date. If a
        /// snapshot does not have one of the locations, its total is a gap.
        LocationPopulation { location_ids: Vec<u32> } => History = location_population,
    }
}

pub fn world_population(view: &View<'_, Eu5Analysis>) -> History {
    view.series(|snapshot| Some(f64::from(snapshot.detail().world.total_population)))
}

pub fn location_population(view: &View<'_, Eu5Analysis>, location_ids: Vec<u32>) -> History {
    let keys: Vec<_> = location_ids.into_iter().map(LocationId::new).collect();
    let mut select = RowSelect::new(&keys);
    view.series(|snapshot| {
        let table = &snapshot.payload().locations;
        match select.resolve(table) {
            SelectionRows::Rows(rows) => Some(
                rows.bind(table)
                    .expect("resolved table identity")
                    .values(|c| &c.population)
                    .map(|x| f64::from(*x))
                    .sum(),
            ),
            SelectionRows::MissingKey | SelectionRows::EmptySelection => None,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::map_projection::NO_ROW;
    use campaign_analysis::{Query, SaveDate, Selection, Store};

    fn save(
        hash: &str,
        date_sort: i32,
        population: &[f32],
        world: u32,
    ) -> Observation<Eu5Analysis> {
        let n = population.len();
        let projection = MapProjection {
            layout_key: format!("layout-{n}"),
            location_ids: [42, 43][..n].iter().copied().map(LocationId::new).collect(),
            control: vec![0; n],
            market_access: vec![0; n],
            development: vec![0.0; n],
            population: population.to_vec(),
            building_levels: vec![0.0; n],
            rgo_level: vec![0.0; n],
            wealth: vec![0.0; n],
            unrealized_tax_base: vec![0.0; n],
            population_growth: vec![0.0; n],
            owners: vec![NO_ROW; n],
            controllers: vec![NO_ROW; n],
            religions: vec![NO_ROW; n],
            markets: vec![NO_ROW; n],
            countries: Vec::new(),
            religion_colors: Vec::new(),
            market_colors: Vec::new(),
        };
        let world = WorldSummary {
            location_count: n as u32,
            country_count: 1,
            total_population: world,
        };
        let source = SnapshotSource {
            campaign_id: String::from("campaign"),
            content_hash: String::from(hash),
            date: SaveDate {
                year: date_sort / 10000,
                month: (date_sort / 100 % 100) as u8,
                day: (date_sort % 100) as u8,
            },
            game_version: String::from("1.0.0"),
        };
        observation(projection, world, source).unwrap()
    }

    fn store() -> Store<Eu5Analysis> {
        let mut store = Store::new();
        for (hash, date, population, world) in [
            ("a", 14000101, &[100.0, 50.0][..], 150),
            ("b", 14100101, &[120.75, 60.5][..], 120),
            ("c", 14200101, &[130.0][..], 130),
        ] {
            store
                .append(save(hash, date, population, world), usize::MAX)
                .unwrap();
        }
        store
    }

    fn values(store: &Store<Eu5Analysis>, campaign: &str, query: Eu5Query) -> Vec<Option<f64>> {
        let view = View::select(store, campaign, &Selection::All);
        let (Eu5Answer::WorldPopulation(history) | Eu5Answer::LocationPopulation(history)) =
            query.answer(&view);
        history.rows.into_iter().map(|row| row.value).collect()
    }

    #[test]
    fn sums_a_fixed_set_of_locations_and_a_missing_location_is_a_gap() {
        let store = store();
        let fixed = |ids: &[u32]| {
            values(
                &store,
                "campaign",
                Eu5Query::LocationPopulation {
                    location_ids: ids.to_vec(),
                },
            )
        };
        assert_eq!(fixed(&[42, 43]), [Some(150.0), Some(181.25), None]);
        assert_eq!(fixed(&[42]), [Some(100.0), Some(120.75), Some(130.0)]);
    }

    #[test]
    fn world_population_comes_from_the_world_summary() {
        let store = store();
        assert_eq!(
            values(&store, "campaign", Eu5Query::WorldPopulation),
            [Some(150.0), Some(120.0), Some(130.0)]
        );
        assert!(values(&store, "other", Eu5Query::WorldPopulation).is_empty());
    }

    #[test]
    fn the_binary_form_keeps_the_world_summary_and_the_map_columns() {
        let original = save("a", 14000101, &[1.0, 2.0], 3);
        let decoded = Observation::<Eu5Analysis>::decode(&original.encode()).unwrap();
        assert_eq!(decoded.detail, original.detail);
        assert_eq!(decoded.payload(), original.payload());
        assert_eq!(
            decoded.payload().locations.keys(),
            original.payload().locations.keys()
        );
    }

    #[test]
    fn refuses_nonfinite_values_and_invalid_references() {
        let original = save("a", 14000101, &[1.0], 1);
        let mut baseline = Encoder::new();
        original.payload().encode(&mut baseline);
        let baseline = baseline.finish();
        let malformed = |columns: ProjectionColumns, countries: Vec<u32>| Eu5Payload {
            locations: Table::map_order(vec![LocationId::new(42)], columns).unwrap(),
            countries,
            religion_colors: vec![],
            market_colors: vec![],
        };
        let mut nonfinite = original.payload().locations.columns().clone();
        nonfinite.population[0] = f32::NAN;
        let mut reference = original.payload().locations.columns().clone();
        reference.owners[0] = 0;
        let mut sentinel = original.payload().locations.columns().clone();
        sentinel.religions[0] = crate::map_projection::UNKNOWN_ROW;
        let cases = [
            malformed(nonfinite, vec![]),
            malformed(reference, vec![]),
            malformed(sentinel, vec![]),
            malformed(original.payload().locations.columns().clone(), vec![1]),
        ];
        let mut store = campaign_analysis::Session::<Eu5Analysis>::new();
        for payload in cases {
            let error = Observation::<Eu5Analysis>::new(
                original.descriptor.clone(),
                original.detail.clone(),
                payload.clone(),
            )
            .unwrap_err();
            let mut out = Encoder::new();
            payload.encode(&mut out);
            let mut bytes = original.encode();
            bytes.truncate(bytes.len() - baseline.len());
            bytes.extend(out.finish());
            assert_eq!(
                Observation::<Eu5Analysis>::decode(&bytes).unwrap_err(),
                error
            );
            let before = store.memory();
            store.append(0, &bytes, usize::MAX).unwrap_err();
            assert_eq!(store.memory(), before);
        }
        let mut columns = original.payload().locations.columns().clone();
        columns.markets[0] = crate::map_projection::UNKNOWN_ROW;
        Observation::<Eu5Analysis>::new(
            original.descriptor,
            original.detail,
            malformed(columns, vec![]),
        )
        .unwrap();
    }
}
