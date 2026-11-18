//! The EU5 rules of campaign analysis: the snapshot payload and the history
//! queries over it.

mod analytics;

pub use analytics::{AnalyticsCatalog, AnalyticsObservation, ChartOverview, OverviewKey};

use crate::map_projection::{
    MapProjection, MapProjectionData, MapProjectionError, ValidatedMapProjectionData,
};
use crate::{OverviewData, insights::WorldSummary, snapshot::SaveSnapshot};
use analytics::Analytics;
use campaign_analysis::{
    AnalysisError, BoundSelectionRows, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, Observation, PayloadError, PreparedIndex, ReferenceError, RegistryMemory,
    RowSelect, SnapshotDescriptor, SnapshotSource, Table, View,
};
use eu5save::models::LocationId;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
campaign_analysis::columns!(rows ProjectionColumns, "locations" {
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

#[derive(Debug, Clone, PartialEq)]
pub struct Eu5Payload {
    pub locations: Table<LocationId, ProjectionColumns>,
    pub countries: Vec<u32>,
    pub religion_colors: Vec<u32>,
    pub market_colors: Vec<u32>,
    analytics: Analytics,
}
impl Eu5Payload {
    fn encode_map(&self, out: &mut Encoder) {
        self.locations.encode_with(out, |keys, out| {
            out.column(&keys.iter().map(|id| id.value()).collect::<Vec<_>>())
        });
        self.countries.encode(out);
        self.religion_colors.encode(out);
        self.market_colors.encode(out);
    }
}

impl Columns for Eu5Payload {
    fn encode(&self, out: &mut Encoder) {
        self.encode_map(out);
        self.analytics.encode(out);
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
            analytics: Columns::decode(input)?,
        })
    }
    fn heap_bytes(&self) -> usize {
        self.locations.columns().heap_bytes()
            + self.countries.heap_bytes()
            + self.religion_colors.heap_bytes()
            + self.market_colors.heap_bytes()
            + self.analytics.heap_bytes()
    }
    fn allocated_bytes(&self) -> usize {
        self.locations.columns().allocated_bytes()
            + self.countries.allocated_bytes()
            + self.religion_colors.allocated_bytes()
            + self.market_colors.allocated_bytes()
            + self.analytics.allocated_bytes()
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
    build_observation(projection, world, source, Analytics::default())
}

/// Attach the history and optional chart data to the same stored map snapshot.
pub fn analytical_observation(
    projection: MapProjection,
    world: WorldSummary,
    source: SnapshotSource,
    save: SaveSnapshot,
    country_names: BTreeMap<u32, String>,
    overviews: Option<OverviewData>,
) -> Result<Observation<Eu5Analysis>, AnalysisError> {
    let analytics =
        Analytics::new(save, country_names, overviews).map_err(AnalysisError::Payload)?;
    build_observation(projection, world, source, analytics)
}

fn build_observation(
    projection: MapProjection,
    world: WorldSummary,
    source: SnapshotSource,
    analytics: Analytics,
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
    let mut descriptor = SnapshotDescriptor::new::<Eu5Analysis>(source, layout_key);
    if analytics.has_overviews() {
        descriptor.artifacts.push("charts".into());
    }
    Observation::new(
        descriptor,
        Eu5Detail { world },
        Eu5Payload {
            locations: Table::map_order(location_ids, columns)?,
            countries,
            religion_colors,
            market_colors,
            analytics,
        },
    )
}

/// Preview and video rendering transfer only map columns. The analytical
/// columns remain in the analysis worker even during fast playback.
pub fn encode_map_frame(snapshot: &campaign_analysis::Snapshot<Eu5Analysis>) -> Vec<u8> {
    snapshot.encode_with(|payload, out| {
        payload.encode_map(out);
        Analytics::default().encode(out);
    })
}

#[derive(Debug)]
pub struct Eu5Analysis;

impl Game for Eu5Analysis {
    const GAME: &'static str = "eu5";
    const ARTIFACTS: &'static [&'static str] = &["observations", "map"];
    type Detail = Eu5Detail;
    type Payload = Eu5Payload;
    type Shared = IndexRegistry<LocationId>;
    type Prepared = PreparedIndex<LocationId>;
    type Query = Eu5Query;

    fn validate(payload: &Eu5Payload) -> Result<(), PayloadError> {
        payload.analytics.validate()?;
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
                    .in_table("locations")
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
                    column,
                    expected,
                    actual,
                } => PayloadError::Column(
                    campaign_analysis::ColumnError::Length { expected, actual }.in_column(column),
                )
                .in_table("locations"),
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
        LocationPopulation {
            #[cfg_attr(feature = "tsify", tsify(type = "number[]"))]
            location_ids: Vec<LocationId>
        } => History = location_population,
        AnalyticsCatalog => AnalyticsCatalog = analytics::catalog,
        CampaignHistory {
            #[serde(default)]
            country_id: Option<u32>,
            #[serde(default)]
            good: Option<String>,
            #[serde(default)]
            centers: Vec<u32>
        } => Vec<AnalyticsObservation> = analytics::history,
        AnalyticsObservation { id: String } => Option<AnalyticsObservation> = analytics::observation,
        CountryMarketCenters { country_id: u32 } => Vec<u32> = analytics::market_centers,
        ChartOverview { key: OverviewKey } => Option<ChartOverview> = analytics::overview,
    }
}

pub fn world_population(view: &View<'_, Eu5Analysis>) -> History {
    view.series(|snapshot| Some(f64::from(snapshot.detail().world.total_population)))
}

pub fn location_population(view: &View<'_, Eu5Analysis>, location_ids: Vec<LocationId>) -> History {
    let mut select = RowSelect::new(&location_ids);
    view.series(|snapshot| {
        let table = &snapshot.payload().locations;
        match select.resolve_bound(table) {
            BoundSelectionRows::Rows(rows) => {
                Some(rows.values(|c| &c.population).map(|x| f64::from(*x)).sum())
            }
            BoundSelectionRows::MissingKey | BoundSelectionRows::EmptySelection => None,
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
            query.answer(&view)
        else {
            panic!("expected population history");
        };
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
                    location_ids: ids.iter().copied().map(LocationId::new).collect(),
                },
            )
        };
        assert_eq!(fixed(&[42, 43]), [Some(150.0), Some(181.25), None]);
        assert_eq!(fixed(&[42]), [Some(100.0), Some(120.75), Some(130.0)]);
    }

    #[test]
    fn query_input_preserves_location_ids_and_rejects_invalid_numbers() {
        for id in [0u32, 42, 65_578, u32::MAX] {
            let query: Eu5Query = serde_json::from_value(serde_json::json!({
                "kind": "locationPopulation", "locationIds": [id],
            }))
            .unwrap();
            let Eu5Query::LocationPopulation { location_ids } = query else {
                panic!("location query");
            };
            assert_eq!(location_ids, [LocationId::new(id)]);
        }
        for id in ["-42", "-2147483648", "4294967296", "1.5"] {
            assert!(
                serde_json::from_str::<Eu5Query>(&format!(
                    r#"{{"kind":"locationPopulation","locationIds":[{id}]}}"#
                ))
                .is_err()
            );
        }
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
    fn history_and_map_frames_share_one_stored_snapshot() {
        use crate::snapshot::{CountryObservation, MarketObservation};

        let mut store = Store::<Eu5Analysis>::new();
        for (id, hash, date) in [(7, "a", 14000101), (8, "b", 14010101)] {
            let map = save(hash, date, &[100.0], 100);
            let mut payload = map.payload().clone();
            payload.analytics = Analytics::new(
                SaveSnapshot {
                    countries: vec![CountryObservation {
                        country_id: id,
                        tag: "SAME".into(),
                        population: 100.0,
                        market_centers: vec![42],
                        ..CountryObservation::default()
                    }],
                    markets: vec![
                        MarketObservation {
                            center: 42,
                            center_name: Some("New_City".into()),
                            market_id: 1,
                            good: "wheat".into(),
                            price: Some(3.0),
                            supply: None,
                            demand: None,
                            stockpile: None,
                        },
                        MarketObservation {
                            center: 43,
                            center_name: None,
                            market_id: 2,
                            good: "wheat".into(),
                            price: None,
                            supply: None,
                            demand: None,
                            stockpile: None,
                        },
                    ],
                },
                BTreeMap::from([(id, format!("Country {id}"))]),
                None,
            )
            .unwrap();
            let map_bytes = map.payload().heap_bytes();
            assert!(payload.heap_bytes() > map_bytes);

            let analysis =
                Observation::<Eu5Analysis>::new(map.descriptor, map.detail, payload).unwrap();
            let bytes = analysis.encode();
            store
                .append(Observation::decode(&bytes).unwrap(), usize::MAX)
                .unwrap();
        }

        let view = View::select(&store, "campaign", &Selection::All);
        let history = analytics::history(&view, Some(7), Some("wheat".into()), vec![42]);
        assert_eq!(history[0].countries[0].country_id, 7);
        assert!(
            history[1].countries.is_empty(),
            "the next country reused the tag"
        );
        assert_eq!(history[0].markets.len(), 1);
        assert_eq!(history[0].markets[0].price, Some(3.0));
        assert_eq!(analytics::market_centers(&view, 7), [42]);
        let catalog = analytics::catalog(&view);
        assert_eq!(catalog.country_names.len(), 2);
        assert_eq!(catalog.goods, ["wheat"]);
        assert_eq!(catalog.market_labels[0].name, "New City");
        assert_eq!(catalog.market_labels[1].name, "Location 43");

        let saved = view.snapshots()[0];
        let frame_bytes = encode_map_frame(saved);
        assert!(frame_bytes.len() < saved.encode().len());
        let frame = Observation::<Eu5Analysis>::decode(&frame_bytes).unwrap();
        assert_eq!(frame.payload().analytics, Analytics::default());
        let encode_map = |payload: &Eu5Payload| {
            let mut out = Encoder::new();
            payload.encode_map(&mut out);
            out.finish()
        };
        assert_eq!(encode_map(frame.payload()), encode_map(saved.payload()));
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
            analytics: Analytics::default(),
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
