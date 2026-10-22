//! The EU5 rules of campaign analysis: the snapshot payload and the history
//! queries over it.

use crate::insights::WorldSummary;
use crate::map_projection::{
    EXTRACTOR_VERSION, Fraction, MapProjection, MapProjectionData, Metric,
};
use campaign_analysis::{Game, History, Observation, SnapshotDescriptor, SnapshotSource, View};
use serde::{Deserialize, Serialize};

/// The EU5 fields of a snapshot descriptor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Eu5Detail {
    pub world: WorldSummary,
}

/// The map projection without its location IDs, which the layout keeps.
#[derive(Debug, Clone, PartialEq)]
pub struct ProjectionColumns {
    pub fractions: Vec<u16>,
    pub metrics: Vec<f32>,
    pub owners: Vec<u32>,
    pub controllers: Vec<u32>,
    pub religions: Vec<u32>,
    pub markets: Vec<u32>,
    pub countries: Vec<u32>,
    pub religion_colors: Vec<u32>,
    pub market_colors: Vec<u32>,
}
campaign_analysis::columns!(ProjectionColumns {
    fractions,
    metrics,
    owners,
    controllers,
    religions,
    markets,
    countries,
    religion_colors,
    market_colors,
});

impl ProjectionColumns {
    /// The projection that a game worker paints.
    pub fn data<'a>(
        &'a self,
        layout_key: &'a str,
        location_ids: &'a [u32],
    ) -> MapProjectionData<'a> {
        MapProjectionData {
            layout_key,
            location_ids,
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

    fn metric(&self, row: usize, metric: Metric) -> f32 {
        let column = Metric::ALL.iter().position(|m| *m == metric).unwrap_or(0);
        self.metrics[row * Metric::ALL.len() + column]
    }
}

/// The snapshot of a save from its map projection and its world summary.
pub fn observation(
    projection: MapProjection,
    world: WorldSummary,
    source: SnapshotSource,
) -> Observation<Eu5Analysis> {
    let MapProjection {
        layout_key,
        location_ids,
        fractions,
        metrics,
        owners,
        controllers,
        religions,
        markets,
        countries,
        religion_colors,
        market_colors,
    } = projection;
    Observation {
        descriptor: SnapshotDescriptor::new::<Eu5Analysis>(source, layout_key),
        detail: Eu5Detail { world },
        ids: location_ids,
        payload: ProjectionColumns {
            fractions,
            metrics,
            owners,
            controllers,
            religions,
            markets,
            countries,
            religion_colors,
            market_colors,
        },
    }
}

#[derive(Debug)]
pub struct Eu5Analysis;

impl Game for Eu5Analysis {
    const GAME: &'static str = "eu5";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    const ARTIFACTS: &'static [&'static str] = &["observations", "map"];
    type Detail = Eu5Detail;
    type Payload = ProjectionColumns;
    type Query = Eu5Query;

    fn validate(rows: usize, payload: &ProjectionColumns) -> Result<(), String> {
        let complete = payload.fractions.len() == rows * Fraction::ALL.len()
            && payload.metrics.len() == rows * Metric::ALL.len()
            && [
                &payload.owners,
                &payload.controllers,
                &payload.religions,
                &payload.markets,
            ]
            .iter()
            .all(|column| column.len() == rows);
        if complete {
            Ok(())
        } else {
            Err(String::from("Incomplete analytical map columns"))
        }
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
    view.series(|snapshot| {
        snapshot.sum(&location_ids, |row| {
            f64::from(snapshot.payload().metric(row, Metric::Population))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
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
            location_ids: [42, 43][..n].to_vec(),
            fractions: vec![0; n * Fraction::ALL.len()],
            metrics: population
                .iter()
                .flat_map(|p| [0.0, *p, 0.0, 0.0, 0.0, 0.0, 0.0])
                .collect(),
            owners: vec![7; n],
            controllers: vec![7; n],
            religions: vec![0; n],
            markets: vec![0; n],
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
        observation(projection, world, source)
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
        assert_eq!(decoded.payload, original.payload);
        assert_eq!(decoded.ids, original.ids);
    }

    #[test]
    fn refuses_incomplete_columns() {
        let mut store = Store::<Eu5Analysis>::new();
        let mut incomplete = save("a", 14000101, &[1.0], 1);
        incomplete.payload.metrics.pop();
        let error = store.append(incomplete, usize::MAX).unwrap_err();
        assert!(error.to_string().contains("Incomplete"));
        assert_eq!(store.memory().snapshots, 0);
    }
}
