//! Compact province observations of one save for campaign analysis.

use crate::shared::{SaveCheckSummer, playthrough_id};
use campaign_analysis::{Game, History, Selection, SnapshotDescriptor, Store, history, sum_ids};
use eu4save::{PdsDate, models::Province, query::Query};
use serde::{Deserialize, Serialize};

/// Changes when the observations or their calculations change.
pub const EXTRACTOR_VERSION: u32 = 1;

/// The development of a province, as the province list of the viewer shows it.
pub fn province_development(province: &Province) -> f32 {
    province.base_tax + province.base_production + province.base_manpower
}

/// The observations of one save. Each column has one row for each province,
/// in province ID order.
#[derive(Debug, Clone, PartialEq)]
pub struct ProvinceObservations {
    pub campaign_id: String,
    pub date: String,
    pub date_sort: i32,
    pub game_version: String,
    pub extractor_version: u32,
    /// Saves with equal province IDs have the same key.
    pub layout_key: String,
    pub province_ids: Vec<u32>,
    pub development: Vec<f32>,
    /// 1 when a country owns the province, else 0.
    pub owned: Vec<u8>,
}

impl ProvinceObservations {
    /// The development of all owned provinces.
    pub fn owned_development(&self) -> f64 {
        owned_development(&self.development, &self.owned)
    }
}

/// The development of all owned provinces, as the province list of the
/// viewer counts it.
pub fn owned_development(development: &[f32], owned: &[u8]) -> f64 {
    development
        .iter()
        .zip(owned)
        .filter(|(_, owned)| **owned != 0)
        .map(|(development, _)| f64::from(*development))
        .sum()
}

/// Extract the observations from a full parse. The campaign identity comes
/// from the parsed game state, not from the metadata.
pub fn extract(query: &Query) -> ProvinceObservations {
    let save = query.save();
    let mut provinces: Vec<_> = save.game.provinces.iter().collect();
    provinces.sort_unstable_by_key(|(id, _)| id.as_u16());

    let mut layout = SaveCheckSummer::new(true);
    let mut province_ids = Vec::with_capacity(provinces.len());
    let mut development = Vec::with_capacity(provinces.len());
    let mut owned = Vec::with_capacity(provinces.len());
    for (id, province) in provinces {
        let id = u32::from(id.as_u16());
        layout.append(&id.to_le_bytes());
        province_ids.push(id);
        development.push(province_development(province));
        owned.push(u8::from(province.owner.is_some()));
    }

    let date = save.meta.date;
    let version = &save.meta.savegame_version;
    ProvinceObservations {
        campaign_id: playthrough_id(query),
        date: format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day()),
        date_sort: i32::from(date.year()) * 10000
            + i32::from(date.month()) * 100
            + i32::from(date.day()),
        game_version: format!(
            "{}.{}.{}.{}",
            version.first, version.second, version.third, version.fourth
        ),
        extractor_version: EXTRACTOR_VERSION,
        layout_key: layout.finish().unwrap_or_default(),
        province_ids,
        development,
        owned,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
// The flattened fields serialize as a map, so make it an object for JS.
#[cfg_attr(feature = "tsify", tsify(hashmap_as_object))]
#[serde(rename_all = "camelCase")]
pub struct Eu4SnapshotDescriptor {
    #[serde(flatten)]
    pub common: SnapshotDescriptor,
    /// Identifies the province IDs.
    pub layout_key: String,
}

/// The province columns of a snapshot. The layout keeps the province IDs.
#[derive(Debug, Clone, PartialEq)]
pub struct ProvinceColumns {
    pub development: Vec<f32>,
    /// 1 when a country owns the province, else 0.
    pub owned: Vec<u8>,
}

#[derive(Debug)]
pub struct Eu4Analysis;

impl Game for Eu4Analysis {
    const GAME: &'static str = "eu4";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    type Descriptor = Eu4SnapshotDescriptor;
    type Payload = ProvinceColumns;

    fn common(descriptor: &Eu4SnapshotDescriptor) -> &SnapshotDescriptor {
        &descriptor.common
    }

    fn validate(
        descriptor: &Eu4SnapshotDescriptor,
        layout_key: &str,
        ids: &[u32],
        payload: &ProvinceColumns,
    ) -> Result<(), String> {
        if layout_key == descriptor.layout_key
            && payload.development.len() == ids.len()
            && payload.owned.len() == ids.len()
        {
            Ok(())
        } else {
            Err(String::from("Incomplete province observations"))
        }
    }

    fn payload_bytes(payload: &ProvinceColumns) -> usize {
        payload.development.len() * size_of::<f32>() + payload.owned.len()
    }
}

/// The development of all owned provinces on each date.
pub fn world_development(
    store: &Store<Eu4Analysis>,
    campaign_id: &str,
    selection: &Selection,
) -> History {
    history(store.select(campaign_id, selection), |snapshot| {
        let provinces = &snapshot.payload;
        Some(owned_development(&provinces.development, &provinces.owned))
    })
}

/// The development of a fixed set of provinces on each date. If a snapshot
/// does not have one of the provinces, its total is a gap.
pub fn fixed_province_development(
    store: &Store<Eu4Analysis>,
    campaign_id: &str,
    selection: &Selection,
    province_ids: &[u32],
) -> History {
    history(store.select(campaign_id, selection), |snapshot| {
        sum_ids(&snapshot.layout, province_ids, |row| {
            f64::from(snapshot.payload.development[row])
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use campaign_analysis::snapshot_id;

    fn append(
        store: &mut Store<Eu4Analysis>,
        hash: &str,
        date_sort: i32,
        ids: &[u32],
        development: &[f32],
        owned: &[u8],
    ) {
        let layout_key = format!("{ids:?}");
        let descriptor = Eu4SnapshotDescriptor {
            common: SnapshotDescriptor {
                id: snapshot_id("eu4", EXTRACTOR_VERSION, hash),
                game: String::from("eu4"),
                campaign_id: String::from("campaign"),
                content_hash: String::from(hash),
                date: date_sort.to_string(),
                date_sort,
                game_version: String::from("1.37.5.0"),
                extractor_version: EXTRACTOR_VERSION,
                artifacts: vec![String::from("observations")],
            },
            layout_key: layout_key.clone(),
        };
        let columns = ProvinceColumns {
            development: development.to_vec(),
            owned: owned.to_vec(),
        };
        store
            .append(descriptor, layout_key, ids.to_vec(), columns, usize::MAX)
            .unwrap();
    }

    fn store() -> Store<Eu4Analysis> {
        let mut store = Store::new();
        append(
            &mut store,
            "b",
            15000101,
            &[1, 2, 3],
            &[12.0, 20.0, 31.0],
            &[1, 0, 1],
        );
        append(
            &mut store,
            "a",
            14441111,
            &[1, 2, 3],
            &[10.0, 20.0, 30.0],
            &[1, 1, 1],
        );
        append(&mut store, "c", 16000101, &[1, 2], &[15.0, 25.0], &[1, 1]);
        store
    }

    fn values(history: History) -> Vec<Option<f64>> {
        history.rows.into_iter().map(|row| row.value).collect()
    }

    #[test]
    fn sums_the_owned_provinces_in_date_order() {
        let store = store();
        assert_eq!(
            values(world_development(&store, "campaign", &Selection::All)),
            [Some(60.0), Some(43.0), Some(40.0)]
        );
    }

    #[test]
    fn sums_a_fixed_set_of_provinces_and_a_missing_province_is_a_gap() {
        let store = store();
        let all = Selection::All;
        assert_eq!(
            values(fixed_province_development(
                &store,
                "campaign",
                &all,
                &[1, 3]
            )),
            [Some(40.0), Some(43.0), None]
        );
        assert_eq!(
            values(fixed_province_development(&store, "campaign", &all, &[2])),
            [Some(20.0), Some(20.0), Some(25.0)]
        );
        assert_eq!(
            values(fixed_province_development(&store, "campaign", &all, &[])),
            [None, None, None]
        );
    }

    #[test]
    fn shares_equal_layouts_and_refuses_incomplete_columns() {
        let store = store();
        assert_eq!(store.memory().layouts, 2);
        let mut store = Store::<Eu4Analysis>::new();
        let descriptor = Eu4SnapshotDescriptor {
            common: SnapshotDescriptor {
                id: snapshot_id("eu4", EXTRACTOR_VERSION, "x"),
                game: String::from("eu4"),
                campaign_id: String::from("campaign"),
                content_hash: String::from("x"),
                date: String::from("1444-11-11"),
                date_sort: 14441111,
                game_version: String::from("1.37.5.0"),
                extractor_version: EXTRACTOR_VERSION,
                artifacts: Vec::new(),
            },
            layout_key: String::from("key"),
        };
        let columns = ProvinceColumns {
            development: vec![1.0, 2.0],
            owned: vec![1],
        };
        let error = store
            .append(
                descriptor,
                String::from("key"),
                vec![1, 2],
                columns,
                usize::MAX,
            )
            .unwrap_err();
        assert_eq!(error.to_string(), "Incomplete province observations");
    }
}
