//! Compact province observations of one save for campaign analysis.

use crate::shared::playthrough_id;
use campaign_analysis::{
    AnalysisError, BoundSelectionRows, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, Observation, PayloadError, PreparedIndex, RegistryMemory, RowSelect, SaveDate,
    SnapshotDescriptor, SnapshotSource, Table, View,
};
use eu4save::{PdsDate, ProvinceId, models::Province, query::Query};
use std::hash::{Hash, Hasher};

/// Changes when the observations or their calculations change.
pub const EXTRACTOR_VERSION: u32 = 1;

/// The development of a province, as the province list of the viewer shows it.
pub fn province_development(province: &Province) -> f32 {
    province.base_tax + province.base_production + province.base_manpower
}

/// The province columns of a snapshot. Each column has one row for each
/// province, in province ID order. The table keeps the province IDs.
#[derive(Debug, Clone, PartialEq)]
pub struct ProvinceColumns {
    pub development: Vec<f32>,
    /// 1 when a country owns the province, else 0.
    pub owned: Vec<u8>,
}
campaign_analysis::columns!(rows ProvinceColumns, "provinces" { development, owned });

#[derive(Debug, Clone, PartialEq)]
pub struct Eu4Payload {
    pub provinces: Table<ProvinceId, ProvinceColumns>,
}
impl Columns for Eu4Payload {
    fn encode(&self, out: &mut Encoder) {
        self.provinces
            .encode_with(out, |keys, out| out.serde(&keys));
    }
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        let provinces = Table::decode_sorted_with(input, |input| {
            let raw: Vec<i32> = input.serde()?;
            raw.into_iter()
                .map(|id| checked_province(id).map_err(DecodeError::Header))
                .collect()
        })?;
        Ok(Self { provinces })
    }
    fn heap_bytes(&self) -> usize {
        self.provinces.columns().heap_bytes()
    }
    fn allocated_bytes(&self) -> usize {
        self.provinces.columns().allocated_bytes()
    }
}
fn checked_province(id: i32) -> Result<ProvinceId, String> {
    if id < 0 {
        Err(String::from(
            "Province IDs must be nonnegative i32 integers",
        ))
    } else {
        Ok(ProvinceId::new(id))
    }
}
fn deserialize_provinces<'de, D: serde::Deserializer<'de>>(
    input: D,
) -> Result<Vec<ProvinceId>, D::Error> {
    use serde::Deserialize;
    Vec::<i32>::deserialize(input)?
        .into_iter()
        .map(|id| checked_province(id).map_err(serde::de::Error::custom))
        .collect()
}

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
pub fn extract(
    query: &Query,
    content_hash: String,
) -> Result<Observation<Eu4Analysis>, AnalysisError> {
    let save = query.save();
    let mut provinces: Vec<_> = save.game.provinces.iter().collect();
    provinces.sort_unstable_by_key(|(id, _)| **id);

    let mut fingerprint = std::hash::DefaultHasher::new();
    let mut ids = Vec::with_capacity(provinces.len());
    let mut development = Vec::with_capacity(provinces.len());
    let mut owned = Vec::with_capacity(provinces.len());
    for (id, province) in provinces {
        id.hash(&mut fingerprint);
        ids.push(*id);
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
        format!("{:016x}", fingerprint.finish()),
    );
    Observation::new(
        descriptor,
        Eu4Detail {},
        Eu4Payload {
            provinces: Table::sorted(ids, ProvinceColumns { development, owned })?,
        },
    )
}

#[derive(Debug)]
pub struct Eu4Analysis;

impl Game for Eu4Analysis {
    const GAME: &'static str = "eu4";
    const EXTRACTOR_VERSION: u32 = EXTRACTOR_VERSION;
    const ARTIFACTS: &'static [&'static str] = &["observations"];
    type Detail = Eu4Detail;
    type Payload = Eu4Payload;
    type Shared = IndexRegistry<ProvinceId>;
    type Prepared = PreparedIndex<ProvinceId>;
    type Query = Eu4Query;

    fn validate(payload: &Eu4Payload) -> Result<(), PayloadError> {
        if payload
            .provinces
            .columns()
            .development
            .iter()
            .any(|x| !x.is_finite())
        {
            return Err(PayloadError::NonFinite);
        }
        Ok(())
    }
    fn prepare(
        payload: &mut Eu4Payload,
        layout: &str,
        shared: &Self::Shared,
    ) -> Result<Self::Prepared, AnalysisError> {
        shared.prepare(&mut payload.provinces, Some(layout))
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
    /// The EU4 history queries.
    pub enum Eu4Query for Eu4Analysis => Eu4Answer {
        /// The development of all owned provinces on each date.
        WorldDevelopment => History = world_development,
        /// The development of a fixed set of provinces on each date. If a
        /// snapshot does not have one of the provinces, its total is a gap.
        ProvinceDevelopment { #[serde(deserialize_with = "deserialize_provinces")] province_ids: Vec<ProvinceId> } => History = fixed_province_development,
    }
}

pub fn world_development(view: &View<'_, Eu4Analysis>) -> History {
    view.series(|snapshot| Some(snapshot.payload().provinces.columns().owned_development()))
}

pub fn fixed_province_development(
    view: &View<'_, Eu4Analysis>,
    province_ids: Vec<ProvinceId>,
) -> History {
    let mut selection = RowSelect::new(&province_ids);
    view.series(|snapshot| {
        let table = &snapshot.payload().provinces;
        match selection.resolve_bound(table) {
            BoundSelectionRows::Rows(rows) => {
                Some(rows.values(|c| &c.development).map(|x| f64::from(*x)).sum())
            }
            BoundSelectionRows::EmptySelection | BoundSelectionRows::MissingKey => None,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use campaign_analysis::{Query, Selection, Store};

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
        Observation::new(
            descriptor,
            Eu4Detail {},
            Eu4Payload {
                provinces: Table::sorted(
                    ids.iter().map(|id| ProvinceId::new(*id as i32)).collect(),
                    ProvinceColumns {
                        development: development.to_vec(),
                        owned: owned.to_vec(),
                    },
                )
                .unwrap(),
            },
        )
        .unwrap()
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
        let fixed = |province_ids: &[i32]| {
            values(
                &store,
                Eu4Query::ProvinceDevelopment {
                    province_ids: province_ids.iter().copied().map(ProvinceId::from).collect(),
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
        Table::sorted(
            vec![ProvinceId::new(1), ProvinceId::new(2)],
            ProvinceColumns {
                development: vec![1.0, 2.0],
                owned: vec![1],
            },
        )
        .unwrap_err();
    }
    #[test]
    fn full_province_identity_survives_queries_and_encoding() {
        let mut store = Store::<Eu4Analysis>::new();
        let large = 65536 + 42;
        let observation = observation("wide", (1500, 1, 1), &[42, large], &[1.0, 7.0], &[1, 1]);
        let bytes = observation.encode();
        let decoded = Observation::<Eu4Analysis>::decode(&bytes).unwrap();
        assert_eq!(
            decoded.payload().provinces.keys(),
            [ProvinceId::new(42), ProvinceId::new(large as i32)]
        );
        store.append(decoded, usize::MAX).unwrap();
        for (id, expected) in [(42, 1.0), (large as i32, 7.0)] {
            let query: Eu4Query = serde_json::from_value(
                serde_json::json!({"kind":"provinceDevelopment","provinceIds":[id]}),
            )
            .unwrap();
            assert_eq!(values(&store, query), [Some(expected)]);
        }
        for invalid in [
            serde_json::json!(-42),
            serde_json::json!(i32::MIN),
            serde_json::json!(2147483648u64),
            serde_json::json!(1.5),
        ] {
            serde_json::from_value::<Eu4Query>(
                serde_json::json!({"kind":"provinceDevelopment","provinceIds":[invalid]}),
            )
            .unwrap_err();
        }
        for raw in [-42, i32::MIN] {
            let mut out = Encoder::new();
            out.serde(&vec![raw]);
            ProvinceColumns {
                development: vec![1.0],
                owned: vec![1],
            }
            .encode(&mut out);
            Eu4Payload::decode(&mut Decoder::new(&out.finish())).unwrap_err();
        }
        let table = &store.snapshots()[0].payload().provinces;
        let mut registry = IndexRegistry::<ProvinceId>::default();
        let mut full = Table::sorted(
            vec![ProvinceId::new(42), ProvinceId::new(large as i32)],
            table.columns().clone(),
        )
        .unwrap();
        let plan = registry.prepare(&mut full, None).unwrap();
        registry.commit(plan);
        let mut narrow = Table::sorted(
            vec![ProvinceId::new(42), ProvinceId::new(43)],
            table.columns().clone(),
        )
        .unwrap();
        let plan = registry.prepare(&mut narrow, None).unwrap();
        registry.commit(plan);
        assert_ne!(full.index_id(), narrow.index_id());
    }
}
