//! Compact province observations of one save for campaign analysis.

use crate::shared::{SaveCheckSummer, playthrough_id};
use campaign_analysis::{
    Game, History, Observation, SaveDate, SnapshotDescriptor, SnapshotSource, View,
};
use eu4save::{PdsDate, models::Province, query::Query};

/// Changes when the observations or their calculations change.
pub const EXTRACTOR_VERSION: u32 = 1;

/// The development of a province, as the province list of the viewer shows it.
pub fn province_development(province: &Province) -> f32 {
    province.base_tax + province.base_production + province.base_manpower
}

/// The province columns of a snapshot. Each column has one row for each
/// province, in province ID order. The layout keeps the province IDs.
#[derive(Debug, Clone, PartialEq)]
pub struct ProvinceColumns {
    pub development: Vec<f32>,
    /// 1 when a country owns the province, else 0.
    pub owned: Vec<u8>,
}
campaign_analysis::columns!(ProvinceColumns { development, owned });

impl ProvinceColumns {
    /// The development of all owned provinces, as the province list of the
    /// viewer counts it.
    pub fn owned_development(&self) -> f64 {
        self.development
            .iter()
            .zip(&self.owned)
            .filter(|(_, owned)| **owned != 0)
            .map(|(development, _)| f64::from(*development))
            .sum()
    }
}

/// The EU4 descriptor fields. EU4 has none yet.
#[allow(
    clippy::empty_structs_with_brackets,
    reason = "TypeScript reads a struct with fields as an object; a unit struct is null"
)]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct Eu4Detail {}

/// Extract the observations from a full parse. The campaign identity comes
/// from the parsed game state, not from the metadata.
pub fn extract(query: &Query, content_hash: String) -> Observation<Eu4Analysis> {
    let save = query.save();
    let mut provinces: Vec<_> = save.game.provinces.iter().collect();
    provinces.sort_unstable_by_key(|(id, _)| id.as_u16());

    let mut layout = SaveCheckSummer::new(true);
    let mut ids = Vec::with_capacity(provinces.len());
    let mut development = Vec::with_capacity(provinces.len());
    let mut owned = Vec::with_capacity(provinces.len());
    for (id, province) in provinces {
        let id = u32::from(id.as_u16());
        layout.append(&id.to_le_bytes());
        ids.push(id);
        development.push(province_development(province));
        owned.push(u8::from(province.owner.is_some()));
    }

    let date = save.meta.date;
    let version = &save.meta.savegame_version;
    let descriptor = SnapshotDescriptor::new::<Eu4Analysis>(
        SnapshotSource {
            campaign_id: playthrough_id(query),
            content_hash,
            date: SaveDate {
                year: i32::from(date.year()),
                month: date.month(),
                day: date.day(),
            },
            game_version: format!(
                "{}.{}.{}.{}",
                version.first, version.second, version.third, version.fourth
            ),
        },
        layout.finish().unwrap_or_default(),
    );
    Observation {
        descriptor,
        detail: Eu4Detail {},
        ids,
        payload: ProvinceColumns { development, owned },
    }
}

#[derive(Debug)]
pub struct Eu4Analysis;

impl Game for Eu4Analysis {
    const GAME: &'static str = "eu4";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    const ARTIFACTS: &'static [&'static str] = &["observations"];
    type Detail = Eu4Detail;
    type Payload = ProvinceColumns;
    type Query = Eu4Query;

    fn validate(rows: usize, payload: &ProvinceColumns) -> Result<(), String> {
        if payload.development.len() == rows && payload.owned.len() == rows {
            Ok(())
        } else {
            Err(String::from("Incomplete province observations"))
        }
    }
}

campaign_analysis::queries! {
    /// The EU4 history queries.
    pub enum Eu4Query for Eu4Analysis => Eu4Answer {
        /// The development of all owned provinces on each date.
        WorldDevelopment => History = world_development,
        /// The development of a fixed set of provinces on each date. If a
        /// snapshot does not have one of the provinces, its total is a gap.
        ProvinceDevelopment { province_ids: Vec<u32> } => History = fixed_province_development,
    }
}

pub fn world_development(view: &View<'_, Eu4Analysis>) -> History {
    view.series(|snapshot| Some(snapshot.payload().owned_development()))
}

pub fn fixed_province_development(view: &View<'_, Eu4Analysis>, province_ids: Vec<u32>) -> History {
    view.sum_over(&province_ids, |snapshot, row| {
        f64::from(snapshot.payload().development[row])
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use campaign_analysis::{AnalysisError, Query, Selection, Store};

    fn observation(
        hash: &str,
        date: (i32, u8, u8),
        ids: &[u32],
        development: &[f32],
        owned: &[u8],
    ) -> Observation<Eu4Analysis> {
        let descriptor = SnapshotDescriptor::new::<Eu4Analysis>(
            SnapshotSource {
                campaign_id: String::from("campaign"),
                content_hash: String::from(hash),
                date: SaveDate {
                    year: date.0,
                    month: date.1,
                    day: date.2,
                },
                game_version: String::from("1.37.5.0"),
            },
            format!("{ids:?}"),
        );
        Observation {
            descriptor,
            detail: Eu4Detail {},
            ids: ids.to_vec(),
            payload: ProvinceColumns {
                development: development.to_vec(),
                owned: owned.to_vec(),
            },
        }
    }

    fn store() -> Store<Eu4Analysis> {
        let mut store = Store::new();
        for observation in [
            observation(
                "b",
                (1500, 1, 1),
                &[1, 2, 3],
                &[12.0, 20.0, 31.0],
                &[1, 0, 1],
            ),
            observation(
                "a",
                (1444, 11, 11),
                &[1, 2, 3],
                &[10.0, 20.0, 30.0],
                &[1, 1, 1],
            ),
            observation("c", (1600, 1, 1), &[1, 2], &[15.0, 25.0], &[1, 1]),
        ] {
            store.append(observation, usize::MAX).unwrap();
        }
        store
    }

    fn values(store: &Store<Eu4Analysis>, query: Eu4Query) -> Vec<Option<f64>> {
        let view = View::select(store, "campaign", &Selection::All);
        let (Eu4Answer::WorldDevelopment(history) | Eu4Answer::ProvinceDevelopment(history)) =
            query.answer(&view);
        history.rows.into_iter().map(|row| row.value).collect()
    }

    #[test]
    fn sums_the_owned_provinces_in_date_order() {
        assert_eq!(
            values(&store(), Eu4Query::WorldDevelopment),
            [Some(60.0), Some(43.0), Some(40.0)]
        );
    }

    #[test]
    fn sums_a_fixed_set_of_provinces_and_a_missing_province_is_a_gap() {
        let store = store();
        let fixed = |province_ids: &[u32]| {
            values(
                &store,
                Eu4Query::ProvinceDevelopment {
                    province_ids: province_ids.to_vec(),
                },
            )
        };
        assert_eq!(fixed(&[1, 3]), [Some(40.0), Some(43.0), None]);
        assert_eq!(fixed(&[2]), [Some(20.0), Some(20.0), Some(25.0)]);
        assert_eq!(fixed(&[]), [None, None, None]);
    }

    #[test]
    fn shares_equal_layouts_and_refuses_incomplete_columns() {
        assert_eq!(store().memory().layouts, 2);
        let mut store = Store::<Eu4Analysis>::new();
        let incomplete = observation("x", (1444, 11, 11), &[1, 2], &[1.0, 2.0], &[1]);
        assert_eq!(
            store.append(incomplete, usize::MAX).unwrap_err(),
            AnalysisError::Payload(String::from("Incomplete province observations"))
        );
    }
}
