//! The EU5 rules of campaign analysis: the snapshot payload and the history
//! queries over it.

use crate::insights::WorldSummary;
use crate::map_projection::{
    EXTRACTOR_VERSION, Fraction, MapProjection, MapProjectionData, Metric,
};
use campaign_analysis::{
    Game, History, Layout, Selection, SnapshotDescriptor, Store, history, sum_ids,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
// The flattened fields serialize as a map, so make it an object for JS.
#[cfg_attr(feature = "tsify", tsify(hashmap_as_object))]
#[serde(rename_all = "camelCase")]
pub struct Eu5SnapshotDescriptor {
    #[serde(flatten)]
    pub common: SnapshotDescriptor,
    /// Identifies the map artifact.
    pub layout_key: String,
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

impl ProjectionColumns {
    /// Split a projection into its layout key, its location IDs and its columns.
    pub fn split(projection: MapProjection) -> (String, Vec<u32>, Self) {
        let columns = ProjectionColumns {
            fractions: projection.fractions,
            metrics: projection.metrics,
            owners: projection.owners,
            controllers: projection.controllers,
            religions: projection.religions,
            markets: projection.markets,
            countries: projection.countries,
            religion_colors: projection.religion_colors,
            market_colors: projection.market_colors,
        };
        (projection.layout_key, projection.location_ids, columns)
    }

    /// The projection that a game worker paints.
    pub fn data<'a>(&'a self, layout: &'a Layout) -> MapProjectionData<'a> {
        MapProjectionData {
            layout_key: layout.key(),
            location_ids: layout.ids(),
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

#[derive(Debug)]
pub struct Eu5Analysis;

impl Game for Eu5Analysis {
    const GAME: &'static str = "eu5";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    type Descriptor = Eu5SnapshotDescriptor;
    type Payload = ProjectionColumns;

    fn common(descriptor: &Eu5SnapshotDescriptor) -> &SnapshotDescriptor {
        &descriptor.common
    }

    fn validate(
        descriptor: &Eu5SnapshotDescriptor,
        layout_key: &str,
        ids: &[u32],
        payload: &ProjectionColumns,
    ) -> Result<(), String> {
        let n = ids.len();
        let complete = layout_key == descriptor.layout_key
            && payload.fractions.len() == n * Fraction::ALL.len()
            && payload.metrics.len() == n * Metric::ALL.len()
            && [
                &payload.owners,
                &payload.controllers,
                &payload.religions,
                &payload.markets,
            ]
            .iter()
            .all(|column| column.len() == n);
        if complete {
            Ok(())
        } else {
            Err(String::from("Incomplete analytical map columns"))
        }
    }

    fn payload_bytes(payload: &ProjectionColumns) -> usize {
        let ids = payload.owners.len()
            + payload.controllers.len()
            + payload.religions.len()
            + payload.markets.len()
            + payload.countries.len()
            + payload.religion_colors.len()
            + payload.market_colors.len();
        payload.fractions.len() * size_of::<u16>()
            + payload.metrics.len() * size_of::<f32>()
            + ids * size_of::<u32>()
    }
}

/// The population of the world on each date, as the world summary of the
/// save counts it.
pub fn world_population(
    store: &Store<Eu5Analysis>,
    campaign_id: &str,
    selection: &Selection,
) -> History {
    history(store.select(campaign_id, selection), |snapshot| {
        Some(f64::from(snapshot.descriptor.world.total_population))
    })
}

/// The population of a fixed set of locations on each date. If a snapshot
/// does not have one of the locations, its total is a gap.
pub fn location_population(
    store: &Store<Eu5Analysis>,
    campaign_id: &str,
    selection: &Selection,
    location_ids: &[u32],
) -> History {
    history(store.select(campaign_id, selection), |snapshot| {
        sum_ids(&snapshot.layout, location_ids, |row| {
            f64::from(snapshot.payload.metric(row, Metric::Population))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use campaign_analysis::snapshot_id;

    fn save(
        hash: &str,
        date_sort: i32,
        population: &[f32],
        world: u32,
    ) -> (Eu5SnapshotDescriptor, Vec<u32>, ProjectionColumns) {
        let n = population.len();
        let layout_key = format!("layout-{n}");
        let descriptor = Eu5SnapshotDescriptor {
            common: SnapshotDescriptor {
                id: snapshot_id("eu5", EXTRACTOR_VERSION, hash),
                game: String::from("eu5"),
                campaign_id: String::from("campaign"),
                content_hash: String::from(hash),
                date: date_sort.to_string(),
                date_sort,
                game_version: String::from("1.0.0"),
                extractor_version: EXTRACTOR_VERSION,
                artifacts: vec![String::from("observations"), String::from("map")],
            },
            layout_key,
            world: WorldSummary {
                location_count: n as u32,
                country_count: 1,
                total_population: world,
            },
        };
        let columns = ProjectionColumns {
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
        (descriptor, [42, 43][..n].to_vec(), columns)
    }

    fn store() -> Store<Eu5Analysis> {
        let mut store = Store::new();
        for (hash, date, population, world) in [
            ("a", 14000101, &[100.0, 50.0][..], 150),
            ("b", 14100101, &[120.75, 60.5][..], 120),
            ("c", 14200101, &[130.0][..], 130),
        ] {
            let (descriptor, ids, columns) = save(hash, date, population, world);
            let key = descriptor.layout_key.clone();
            store
                .append(descriptor, key, ids, columns, usize::MAX)
                .unwrap();
        }
        store
    }

    fn values(history: History) -> Vec<Option<f64>> {
        history.rows.into_iter().map(|row| row.value).collect()
    }

    #[test]
    fn sums_a_fixed_set_of_locations_and_a_missing_location_is_a_gap() {
        let store = store();
        let all = Selection::All;
        assert_eq!(
            values(location_population(&store, "campaign", &all, &[42, 43])),
            [Some(150.0), Some(181.25), None]
        );
        assert_eq!(
            values(location_population(&store, "campaign", &all, &[42])),
            [Some(100.0), Some(120.75), Some(130.0)]
        );
    }

    #[test]
    fn world_population_comes_from_the_world_summary() {
        let store = store();
        assert_eq!(
            values(world_population(&store, "campaign", &Selection::All)),
            [Some(150.0), Some(120.0), Some(130.0)]
        );
        assert!(
            world_population(&store, "other", &Selection::All)
                .rows
                .is_empty()
        );
    }

    #[test]
    fn refuses_incomplete_columns_and_another_layout_key() {
        let mut store = Store::<Eu5Analysis>::new();
        let (descriptor, ids, mut columns) = save("a", 14000101, &[1.0], 1);
        columns.metrics.pop();
        let key = descriptor.layout_key.clone();
        let error = store
            .append(descriptor.clone(), key, ids.clone(), columns, usize::MAX)
            .unwrap_err();
        assert!(error.to_string().contains("Incomplete"));
        let (_, _, columns) = save("a", 14000101, &[1.0], 1);
        let error = store
            .append(descriptor, String::from("other"), ids, columns, usize::MAX)
            .unwrap_err();
        assert!(error.to_string().contains("Incomplete"));
        assert_eq!(store.memory().snapshots, 0);
    }
}
