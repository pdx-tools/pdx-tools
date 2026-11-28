//! The EU5 rules of campaign analysis: the snapshot payload and the history
//! queries over it.

mod analytics;

pub use analytics::{
    Analytics, AnalyticsCatalog, CountryBuildingColumns, CountryColumns, CountryDimension,
    CountryEntry, CountryMarket, CountryMarketColumns, CountryMaterialColumns, CountryMetric,
    CountryReligionColumns, CountryText, GoodMarket, MarketColumns, MarketEntry, MarketGoodColumns,
    MarketMetric,
};

use crate::insights::WorldSummary;
use crate::map_projection::{
    MapProjection, MapProjectionData, MapProjectionError, ValidatedMapProjectionData,
};
use campaign_analysis::{
    AnalysisError, BoundSelectionRows, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, MapOrder, Observation, PayloadError, ReferenceError, RowSelect, Series,
    SnapshotDescriptor, SnapshotSource, Table, TextRegistry, View,
};
use eu5save::models::{CountryId, Gamestate, LocationId, MarketId};
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
    pub locations: Table<LocationId, ProjectionColumns, MapOrder>,
    pub countries: Vec<u32>,
    pub religion_colors: Vec<u32>,
    pub market_colors: Vec<u32>,
    pub analytics: Analytics,
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
    observation_with_analytics(projection, world, Analytics::default(), source)
}

/// The full snapshot of a save from its map projection, world summary, and
/// analytical country/market tables.
pub fn observation_with_analytics(
    projection: MapProjection,
    world: WorldSummary,
    analytics: Analytics,
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
            analytics,
        },
    )
}

/// Extract map projection, world summary, and analytical tables from a parsed save.
pub fn extract(
    game: &Gamestate<'_>,
    source: SnapshotSource,
) -> Result<Observation<Eu5Analysis>, AnalysisError> {
    let projection = crate::map_projection::extract(game)
        .map_err(|error| AnalysisError::Payload(PayloadError::Invalid(error.to_string())))?;
    let world = crate::map_projection::world_summary(game);
    let analytics = Analytics::extract(game)?;
    observation_with_analytics(projection, world, analytics, source)
}

/// Preview and video rendering transfer only map columns. The analytical
/// tables remain in the analysis worker even during fast playback.
pub fn encode_map_frame(snapshot: &campaign_analysis::Snapshot<Eu5Analysis>) -> Vec<u8> {
    thread_local! {
        static EMPTY_ANALYTICS: Analytics = Analytics::default();
    }
    snapshot.encode_with(|payload, out| {
        payload.encode_map(out);
        EMPTY_ANALYTICS.with(|empty| empty.encode(out));
    })
}

campaign_analysis::registries! {
    /// The keys and texts that the EU5 snapshots of a store share.
    pub struct Eu5Shared => Eu5Prepared {
        locations: IndexRegistry<LocationId>,
        countries: IndexRegistry<CountryId>,
        markets: IndexRegistry<MarketId>,
        tags: TextRegistry,
        religions: TextRegistry,
        materials: TextRegistry,
        buildings: TextRegistry,
        goods: TextRegistry,
        market_names: TextRegistry,
    }
}

#[derive(Debug)]
pub struct Eu5Analysis;

impl Game for Eu5Analysis {
    const GAME: &'static str = "eu5";
    const ARTIFACTS: &'static [&'static str] = &["observations", "map"];
    type Detail = Eu5Detail;
    type Payload = Eu5Payload;
    type Shared = Eu5Shared;
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
        shared: &Eu5Shared,
    ) -> Result<Eu5Prepared, AnalysisError> {
        Ok(Eu5Prepared {
            locations: shared
                .locations
                .prepare(&mut payload.locations, Some(layout))?,
            countries: shared
                .countries
                .prepare(&mut payload.analytics.countries, None)?,
            markets: shared
                .markets
                .prepare(&mut payload.analytics.markets, None)?,
            tags: shared.tags.prepare(&mut payload.analytics.tags)?,
            religions: shared.religions.prepare(&mut payload.analytics.religions)?,
            materials: shared.materials.prepare(&mut payload.analytics.materials)?,
            buildings: shared.buildings.prepare(&mut payload.analytics.buildings)?,
            goods: shared.goods.prepare(&mut payload.analytics.goods)?,
            market_names: shared
                .market_names
                .prepare(&mut payload.analytics.market_names)?,
        })
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
        /// All countries, goods, and market centers seen across the selected
        /// snapshots.
        AnalyticsCatalog => AnalyticsCatalog = analytics::catalog,
        /// The world total of a country metric across owned locations on each
        /// date.
        WorldSeries { metric: CountryMetric } => History = analytics::world_series,
        /// One series per country ID. A country absent on a date has a gap
        /// there.
        CountrySeries {
            #[cfg_attr(feature = "tsify", tsify(type = "number[]"))]
            country_ids: Vec<CountryId>,
            metric: CountryMetric
        } => Vec<Series<u32>> = analytics::country_series,
        /// One series per breakdown key (religion, raw material, or building)
        /// for one country, or for the whole world when `country_id` is absent.
        CountryBreakdown {
            #[serde(default)]
            #[cfg_attr(feature = "tsify", tsify(type = "number | undefined"))]
            country_id: Option<CountryId>,
            dimension: CountryDimension
        } => Vec<Series<String>> = analytics::country_breakdown,
        /// One series per market center for a single good and measurement.
        MarketSeries {
            good: String,
            #[cfg_attr(feature = "tsify", tsify(type = "number[]"))]
            centers: Vec<LocationId>,
            metric: MarketMetric
        } => Vec<Series<u32>> = analytics::market_series,
        /// Trade-volume-weighted price of a good across the selected market
        /// centers, or across all markets when `centers` is omitted (`None`).
        /// An explicit empty list returns gaps.
        MarketWeightedPrice {
            good: String,
            #[serde(default)]
            #[cfg_attr(feature = "tsify", tsify(type = "number[] | undefined"))]
            centers: Option<Vec<LocationId>>
        } => History = analytics::market_weighted_price,
        /// Sorted market center location IDs touched by a country across the
        /// selected snapshots.
        CountryMarketCenters {
            #[cfg_attr(feature = "tsify", tsify(type = "number"))]
            country_id: CountryId
        } => Vec<u32> = analytics::market_centers,
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
    use campaign_analysis::{Query, Selection, Store, date_from_sort};

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
            date: date_from_sort(date_sort).unwrap(),
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
        let (Eu5Answer::WorldPopulation(history)
        | Eu5Answer::LocationPopulation(history)
        | Eu5Answer::WorldSeries(history)
        | Eu5Answer::MarketWeightedPrice(history)) = query.answer(&view)
        else {
            panic!("expected history answer");
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

    fn sample_analytics(country_id: u32, with_extra_religion: bool) -> Analytics {
        use campaign_analysis::{NullableColumn, Texts};

        let tags = Texts::new(["SAME"]).unwrap();
        let religions = if with_extra_religion {
            Texts::new(["catholic", "orthodox"]).unwrap()
        } else {
            Texts::new(["catholic"]).unwrap()
        };
        let materials = Texts::new(["wheat"]).unwrap();
        let buildings = Texts::new(["granary"]).unwrap();
        let goods = Texts::new(["wheat"]).unwrap();
        let market_names = Texts::new(["New_City"]).unwrap();

        let cid = CountryId::new(country_id);
        let countries = Table::sorted(
            vec![cid],
            CountryColumns {
                tag: vec![tags.find("SAME").unwrap()],
                population: vec![100.0 * f64::from(country_id)],
                development: vec![10.0],
                locations: vec![3],
                wealth: vec![25.0],
                tax: vec![5.0],
                effective_development: vec![8.0],
                state_capacity: vec![800.0],
                births: vec![12.0],
                rural_population: vec![60.0],
                urban_population: vec![40.0],
                rgo_levels: vec![4.0],
                building_levels: vec![2.0],
                building_employment: vec![15.0],
                income: vec![9.5],
                great_power_rank: [with_extra_religion.then_some(1)].into_iter().collect(),
            },
        )
        .unwrap();

        let (rel_keys, rel_values) = if with_extra_religion {
            (
                vec![
                    CountryText {
                        country: cid,
                        text: religions.find("catholic").unwrap(),
                    },
                    CountryText {
                        country: cid,
                        text: religions.find("orthodox").unwrap(),
                    },
                ],
                vec![70.0, 30.0],
            )
        } else {
            (
                vec![CountryText {
                    country: cid,
                    text: religions.find("catholic").unwrap(),
                }],
                vec![100.0],
            )
        };
        let country_religions =
            Table::sorted_prefix(rel_keys, CountryReligionColumns { value: rel_values }).unwrap();
        let country_materials = Table::sorted_prefix(
            vec![CountryText {
                country: cid,
                text: materials.find("wheat").unwrap(),
            }],
            CountryMaterialColumns { value: vec![4.0] },
        )
        .unwrap();
        let country_buildings = Table::sorted_prefix(
            vec![CountryText {
                country: cid,
                text: buildings.find("granary").unwrap(),
            }],
            CountryBuildingColumns { value: vec![2.0] },
        )
        .unwrap();
        let country_markets = Table::sorted_prefix(
            vec![CountryMarket {
                country: cid,
                center: LocationId::new(42),
            }],
            CountryMarketColumns,
        )
        .unwrap();

        let markets = Table::sorted(
            vec![MarketId::new(1), MarketId::new(2)],
            MarketColumns {
                center: vec![42, 43],
                center_name: [Some(market_names.find("New_City").unwrap()), None]
                    .into_iter()
                    .collect(),
            },
        )
        .unwrap();
        let wheat = goods.find("wheat").unwrap();
        let market_goods = Table::sorted_prefix(
            vec![
                GoodMarket {
                    good: wheat,
                    market: MarketId::new(1),
                },
                GoodMarket {
                    good: wheat,
                    market: MarketId::new(2),
                },
            ],
            MarketGoodColumns {
                price: [Some(3.0), Some(5.0)].into_iter().collect(),
                total_taken: [Some(25.0), Some(75.0)].into_iter().collect(),
                supply: [Some(30.0), None].into_iter().collect(),
                demand: [Some(28.0), Some(80.0)].into_iter().collect(),
                stockpile: NullableColumn::from_iter([Some(10.0), None]),
            },
        )
        .unwrap();

        Analytics {
            countries,
            tags,
            religions,
            materials,
            buildings,
            country_religions,
            country_materials,
            country_buildings,
            country_markets,
            markets,
            goods,
            market_names,
            market_goods,
        }
    }

    #[test]
    fn country_and_market_tables_answer_narrow_queries_and_strip_from_map_frames() {
        let mut store = Store::<Eu5Analysis>::new();
        for (id, hash, date, extra) in [(7, "a", 14000101, false), (8, "b", 14010101, true)] {
            let map = save(hash, date, &[100.0], 100);
            let mut payload = map.payload().clone();
            payload.analytics = sample_analytics(id, extra);
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

        let catalog = analytics::catalog(&view);
        assert_eq!(
            catalog.countries,
            [
                CountryEntry {
                    country_id: 7,
                    tag: "SAME".into()
                },
                CountryEntry {
                    country_id: 8,
                    tag: "SAME".into()
                },
            ]
        );
        assert_eq!(catalog.goods, ["wheat"]);
        assert_eq!(
            catalog.markets,
            [
                MarketEntry {
                    center: 42,
                    name: "New City".into()
                },
                MarketEntry {
                    center: 43,
                    name: "Location 43".into()
                },
            ]
        );

        assert_eq!(
            values(
                &store,
                "campaign",
                Eu5Query::WorldSeries {
                    metric: CountryMetric::Population
                }
            ),
            [Some(700.0), Some(800.0)]
        );
        assert_eq!(
            values(
                &store,
                "campaign",
                Eu5Query::WorldSeries {
                    metric: CountryMetric::GreatPowerRank
                }
            ),
            [None, None]
        );

        let country_pop = analytics::country_series(
            &view,
            vec![CountryId::new(7), CountryId::new(8)],
            CountryMetric::Population,
        );
        assert_eq!(
            country_pop,
            [
                Series {
                    key: 7,
                    values: vec![Some(700.0), None]
                },
                Series {
                    key: 8,
                    values: vec![None, Some(800.0)]
                },
            ]
        );
        let country_gp = analytics::country_series(
            &view,
            vec![CountryId::new(7), CountryId::new(8)],
            CountryMetric::GreatPowerRank,
        );
        assert_eq!(
            country_gp,
            [
                Series {
                    key: 7,
                    values: vec![None, None]
                },
                Series {
                    key: 8,
                    values: vec![None, Some(1.0)]
                },
            ]
        );

        let world_religions = analytics::country_breakdown(&view, None, CountryDimension::Religion);
        assert_eq!(
            world_religions,
            [
                Series {
                    key: "catholic".into(),
                    values: vec![Some(100.0), Some(70.0)]
                },
                Series {
                    key: "orthodox".into(),
                    values: vec![Some(0.0), Some(30.0)]
                },
            ]
        );
        let country_religions = analytics::country_breakdown(
            &view,
            Some(CountryId::new(7)),
            CountryDimension::Religion,
        );
        assert_eq!(
            country_religions,
            [Series {
                key: "catholic".into(),
                values: vec![Some(100.0), None]
            }]
        );
        assert_eq!(
            analytics::country_breakdown(
                &view,
                Some(CountryId::new(8)),
                CountryDimension::Material
            ),
            [Series {
                key: "wheat".into(),
                values: vec![None, Some(4.0)]
            }]
        );
        assert_eq!(
            analytics::country_breakdown(
                &view,
                Some(CountryId::new(8)),
                CountryDimension::Building
            ),
            [Series {
                key: "granary".into(),
                values: vec![None, Some(2.0)]
            }]
        );

        let prices = analytics::market_series(
            &view,
            "wheat".into(),
            vec![LocationId::new(42), LocationId::new(43)],
            MarketMetric::Price,
        );
        assert_eq!(
            prices,
            [
                Series {
                    key: 42,
                    values: vec![Some(3.0), Some(3.0)]
                },
                Series {
                    key: 43,
                    values: vec![Some(5.0), Some(5.0)]
                },
            ]
        );
        let supply = analytics::market_series(
            &view,
            "wheat".into(),
            vec![LocationId::new(42), LocationId::new(43)],
            MarketMetric::Supply,
        );
        assert_eq!(
            supply,
            [
                Series {
                    key: 42,
                    values: vec![Some(30.0), Some(30.0)]
                },
                Series {
                    key: 43,
                    values: vec![None, None]
                },
            ]
        );
        // (3 * 25 + 5 * 75) / (25 + 75) = 4.5
        assert_eq!(
            values(
                &store,
                "campaign",
                Eu5Query::MarketWeightedPrice {
                    good: "wheat".into(),
                    centers: None
                }
            ),
            [Some(4.5), Some(4.5)]
        );
        assert_eq!(
            values(
                &store,
                "campaign",
                Eu5Query::MarketWeightedPrice {
                    good: "wheat".into(),
                    centers: Some(vec![])
                }
            ),
            [None, None]
        );
        assert_eq!(
            values(
                &store,
                "campaign",
                Eu5Query::MarketWeightedPrice {
                    good: "wheat".into(),
                    centers: Some(vec![LocationId::new(42)])
                }
            ),
            [Some(3.0), Some(3.0)]
        );
        assert_eq!(analytics::market_centers(&view, CountryId::new(7)), [42]);

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
    fn analytics_decode_refuses_invalid_references_and_measurements() {
        use campaign_analysis::{TextRow, Texts};

        let original = save("a", 14000101, &[1.0], 1);
        let mut base = original.payload().clone();
        base.analytics = sample_analytics(7, false);
        let valid_obs = Observation::<Eu5Analysis>::new(
            original.descriptor.clone(),
            original.detail.clone(),
            base.clone(),
        )
        .unwrap();
        let mut baseline = Encoder::new();
        valid_obs.payload().encode(&mut baseline);
        let baseline_len = baseline.finish().len();

        let splice = |payload: &Eu5Payload| {
            let mut bytes = valid_obs.encode();
            bytes.truncate(bytes.len() - baseline_len);
            let mut out = Encoder::new();
            payload.encode(&mut out);
            bytes.extend(out.finish());
            bytes
        };

        Observation::<Eu5Analysis>::decode(&splice(&base)).unwrap();

        let mut bad_country_float = base.clone();
        let mut cols = bad_country_float.analytics.countries.columns().clone();
        cols.population[0] = f64::NAN;
        bad_country_float.analytics.countries =
            Table::sorted(bad_country_float.analytics.countries.keys().to_vec(), cols).unwrap();

        let mut bad_market_float = base.clone();
        let mut gcols = bad_market_float.analytics.market_goods.columns().clone();
        gcols.price = [Some(f64::INFINITY), Some(5.0)].into_iter().collect();
        bad_market_float.analytics.market_goods = Table::sorted_prefix(
            bad_market_float.analytics.market_goods.keys().to_vec(),
            gcols,
        )
        .unwrap();

        let mut bad_tag_ref = base.clone();
        bad_tag_ref.analytics.tags = Texts::default();

        let mut bad_religion_ref = base.clone();
        bad_religion_ref.analytics.religions = Texts::default();

        let mut bad_market_name_ref = base.clone();
        bad_market_name_ref.analytics.market_names = Texts::default();

        let mut bad_good_ref = base.clone();
        bad_good_ref.analytics.goods = Texts::default();

        let mut orphan_breakdown = base.clone();
        orphan_breakdown.analytics.country_religions = Table::sorted_prefix(
            vec![CountryText {
                country: CountryId::new(999),
                text: TextRow::new(0),
            }],
            CountryReligionColumns { value: vec![1.0] },
        )
        .unwrap();

        let mut orphan_country_market = base.clone();
        orphan_country_market.analytics.country_markets = Table::sorted_prefix(
            vec![CountryMarket {
                country: CountryId::new(7),
                center: LocationId::new(999),
            }],
            CountryMarketColumns,
        )
        .unwrap();

        let mut orphan_market_good = base.clone();
        orphan_market_good.analytics.market_goods = Table::sorted_prefix(
            vec![GoodMarket {
                good: TextRow::new(0),
                market: MarketId::new(999),
            }],
            MarketGoodColumns {
                price: [Some(1.0)].into_iter().collect(),
                total_taken: [None].into_iter().collect(),
                supply: [None].into_iter().collect(),
                demand: [None].into_iter().collect(),
                stockpile: [None].into_iter().collect(),
            },
        )
        .unwrap();

        let mut dup_market_center = base.clone();
        dup_market_center.analytics.markets = Table::sorted(
            vec![MarketId::new(1), MarketId::new(2)],
            MarketColumns {
                center: vec![42, 42],
                center_name: [None, None].into_iter().collect(),
            },
        )
        .unwrap();

        let mut session = campaign_analysis::Session::<Eu5Analysis>::new();
        for (payload, expected_substr) in [
            (bad_country_float, "not finite"),
            (bad_market_float, "not finite"),
            (bad_tag_ref, "Dictionary reference 0 is outside 0 rows"),
            (bad_religion_ref, "Dictionary reference 0 is outside 0 rows"),
            (
                bad_market_name_ref,
                "Dictionary reference 0 is outside 0 rows",
            ),
            (bad_good_ref, "Dictionary reference 0 is outside 0 rows"),
            (orphan_breakdown, "999"),
            (orphan_country_market, "999"),
            (orphan_market_good, "999"),
            (dup_market_center, "Duplicate market center 42"),
        ] {
            let bytes = splice(&payload);
            let error = Observation::<Eu5Analysis>::decode(&bytes).unwrap_err();
            assert!(
                error.to_string().contains(expected_substr),
                "expected '{expected_substr}' in '{error}'"
            );
            let before = session.memory();
            session.append(0, &bytes, usize::MAX).unwrap_err();
            assert_eq!(session.memory(), before);
        }
    }
}
