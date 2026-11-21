//! Data kept alongside a save's map columns. The store counts these bytes
//! against the same memory budget. Queries decode only the rows they need.

use crate::{
    OverviewData,
    snapshot::{CountryObservation, MarketObservation, SaveSnapshot},
};
use campaign_analysis::{
    Column, ColumnError, Columns, DecodeError, Decoder, Encoder, PayloadError, RowColumns, Table,
    View, columns,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::collections::{BTreeMap, BTreeSet};

use super::Eu5Analysis;

/// Variable-length rows within one contiguous column. Row ends are stored
/// separately so reading one country or chart doesn't parse its neighbors.
#[derive(Debug, Clone, Default, PartialEq)]
struct PackedRows {
    ends: Vec<u32>,
    data: Vec<u8>,
}
columns!(PackedRows { ends, data });

impl PackedRows {
    fn push(&mut self, bytes: &[u8]) -> Result<(), PayloadError> {
        self.data.extend_from_slice(bytes);
        self.ends
            .push(u32::try_from(self.data.len()).map_err(invalid)?);
        Ok(())
    }

    fn serialize(&mut self, row: &impl Serialize) -> Result<(), PayloadError> {
        self.push(&postcard::to_allocvec(row).map_err(invalid)?)
    }

    fn get(&self, row: usize) -> Option<&[u8]> {
        let start = if row == 0 {
            0
        } else {
            *self.ends.get(row - 1)?
        };
        self.data.get(start as usize..*self.ends.get(row)? as usize)
    }

    fn read<T: DeserializeOwned>(&self, row: usize) -> Option<T> {
        postcard::from_bytes(self.get(row)?).ok()
    }

    fn len(&self) -> usize {
        self.ends.len()
    }

    fn validate(&self, name: &str) -> Result<(), PayloadError> {
        if !self.ends.is_sorted()
            || self.ends.last().copied().unwrap_or(0) as usize != self.data.len()
        {
            return Err(invalid(format_args!("invalid {name} row offsets")));
        }
        Ok(())
    }
}

impl Column for PackedRows {
    type Value<'a> = &'a [u8];

    fn get_value(&self, offset: usize) -> Option<&[u8]> {
        self.get(offset)
    }
}

impl RowColumns for PackedRows {
    fn table_name() -> &'static str {
        "countries"
    }

    fn check_rows(&self, expected: usize) -> Result<(), ColumnError> {
        self.ends.check_rows(expected)
    }
}

// Country IDs are stable save IDs, so tag reuse does not join two series.
#[derive(Debug, Clone, PartialEq)]
struct CountryTable(Table<u32, PackedRows>);

impl Default for CountryTable {
    fn default() -> Self {
        Self(Table::sorted(Vec::new(), PackedRows::default()).expect("empty country table"))
    }
}

impl Columns for CountryTable {
    fn encode(&self, out: &mut Encoder) {
        self.0.encode_with(out, |keys, out| out.column(keys));
    }

    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        Table::decode_sorted_with(input, |input| input.column()).map(Self)
    }

    fn heap_bytes(&self) -> usize {
        size_of_val(self.0.keys()) + self.0.columns().heap_bytes()
    }

    fn allocated_bytes(&self) -> usize {
        size_of_val(self.0.keys()) + self.0.columns().allocated_bytes()
    }
}

impl CountryTable {
    fn get(&self, id: u32) -> Option<CountryObservation> {
        let row = self.0.row(&id)?;
        postcard::from_bytes(self.0.value(row, |rows| rows).ok()?).ok()
    }

    fn rows(&self) -> impl Iterator<Item = CountryObservation> {
        self.0
            .rows()
            .filter_map(|row| postcard::from_bytes(self.0.value(row, |rows| rows).ok()?).ok())
    }
}

fn invalid(error: impl std::fmt::Display) -> PayloadError {
    PayloadError::Invalid(format!("EU5 analytical columns: {error}"))
}

macro_rules! overview_fields {
    ($($kind:ident => $field:ident),+ $(,)?) => {
        #[derive(Debug, Clone, Copy, Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[serde(rename_all = "camelCase")]
        pub enum OverviewKey {
            $($kind),+
        }

        impl OverviewKey {
            const COUNT: usize = [$(Self::$kind),+].len();
        }

        fn pack_overviews(data: OverviewData) -> Result<PackedRows, PayloadError> {
            let mut rows = PackedRows::default();
            $(
                // JSON preserves the viewer's named fields. Compress each chart
                // separately so querying it cannot decode the other charts.
                let json = serde_json::to_vec(&data.$field).map_err(invalid)?;
                let compressed = pdx_zstd::encode_all(&json, 4).map_err(invalid)?;
                rows.push(&compressed)?;
            )+
            Ok(rows)
        }
    };
}

overview_fields! {
    Political => political,
    Control => control,
    Development => development,
    Population => population,
    Markets => markets,
    RgoLevel => rgo_level,
    BuildingLevels => building_levels,
    Wealth => wealth,
    UnrealizedTaxBase => unrealized_tax_base,
    Religion => religion,
    StateEfficacy => state_efficacy,
    PopulationGrowth => population_growth,
    WealthScope => wealth_scope,
    UnrealizedTaxBaseScope => unrealized_tax_base_scope,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(super) struct Analytics {
    countries: CountryTable,
    world: Vec<u8>,
    labels: Vec<u8>,
    goods: Vec<u8>,
    markets: PackedRows,
    overviews: PackedRows,
}
columns!(Analytics {
    countries,
    world,
    labels,
    goods,
    markets,
    overviews,
});

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct CountryLabel {
    pub country_id: u32,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct MarketLabel {
    pub center: u32,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsCatalog {
    pub country_names: Vec<CountryLabel>,
    pub goods: Vec<String>,
    pub market_labels: Vec<MarketLabel>,
}

impl AnalyticsCatalog {
    fn new(
        country_names: BTreeMap<u32, String>,
        goods: Vec<String>,
        market_labels: BTreeMap<u32, String>,
    ) -> Self {
        Self {
            country_names: country_names
                .into_iter()
                .map(|(country_id, name)| CountryLabel { country_id, name })
                .collect(),
            goods,
            market_labels: market_labels
                .into_iter()
                .map(|(center, name)| MarketLabel { center, name })
                .collect(),
        }
    }
}

impl Analytics {
    pub(super) fn new(
        save: SaveSnapshot,
        country_names: BTreeMap<u32, String>,
        overviews: Option<OverviewData>,
    ) -> Result<Self, PayloadError> {
        let mut countries = PackedRows::default();
        let mut country_ids = Vec::with_capacity(save.countries.len());
        let mut world = CountryObservation {
            country_id: u32::MAX,
            tag: "world".into(),
            ..CountryObservation::default()
        };
        for country in &save.countries {
            country_ids.push(country.country_id);
            countries.serialize(country)?;
            accumulate(&mut world, country);
        }

        let mut by_good = BTreeMap::<_, Vec<_>>::new();
        let mut market_labels = BTreeMap::new();
        for market in save.markets {
            market_labels.entry(market.center).or_insert_with(|| {
                market
                    .center_name
                    .as_deref()
                    .filter(|name| !name.is_empty())
                    .map_or_else(
                        || format!("Location {}", market.center),
                        |name| name.replace('_', " "),
                    )
            });
            by_good.entry(market.good.clone()).or_default().push(market);
        }

        let mut markets = PackedRows::default();
        let mut goods = Vec::with_capacity(by_good.len());
        for (good, rows) in by_good {
            goods.push(good);
            markets.serialize(&rows)?;
        }
        let catalog = AnalyticsCatalog::new(country_names, goods, market_labels);

        Ok(Self {
            countries: CountryTable(Table::sorted(country_ids, countries).map_err(invalid)?),
            world: postcard::to_allocvec(&world).map_err(invalid)?,
            labels: postcard::to_allocvec(&(catalog.country_names, catalog.market_labels))
                .map_err(invalid)?,
            goods: postcard::to_allocvec(&catalog.goods).map_err(invalid)?,
            markets,
            overviews: overviews
                .map(pack_overviews)
                .transpose()?
                .unwrap_or_default(),
        })
    }

    pub(super) fn has_overviews(&self) -> bool {
        self.overviews.len() != 0
    }

    pub(super) fn validate(&self) -> Result<(), PayloadError> {
        self.countries.0.columns().validate("country")?;
        self.markets.validate("market")?;
        self.overviews.validate("chart")?;
        if self.has_overviews() && self.overviews.len() != OverviewKey::COUNT {
            return Err(invalid("incomplete chart columns"));
        }
        if !self.goods.is_empty() {
            let goods = self
                .goods()
                .ok_or_else(|| invalid("invalid goods catalog"))?;
            if goods.len() != self.markets.len() || goods.windows(2).any(|pair| pair[0] >= pair[1])
            {
                return Err(invalid("market goods must be unique and sorted"));
            }
        } else if self.markets.len() != 0 {
            return Err(invalid("market columns are missing their catalog"));
        }
        Ok(())
    }

    fn world(&self) -> Option<CountryObservation> {
        postcard::from_bytes(&self.world).ok()
    }

    fn read_catalog(&self) -> Option<AnalyticsCatalog> {
        let (country_names, market_labels) = postcard::from_bytes(&self.labels).ok()?;
        Some(AnalyticsCatalog {
            country_names,
            market_labels,
            goods: self.goods()?,
        })
    }

    fn goods(&self) -> Option<Vec<String>> {
        postcard::from_bytes(&self.goods).ok()
    }

    fn good(&self, good: &str) -> Option<Vec<MarketObservation>> {
        let goods = self.goods()?;
        let row = goods.binary_search_by(|key| key.as_str().cmp(good)).ok()?;
        self.markets.read(row)
    }
}

fn accumulate(world: &mut CountryObservation, country: &CountryObservation) {
    macro_rules! sum {
        ($($field:ident),+) => { $(world.$field += country.$field;)+ };
    }
    sum!(
        population,
        development,
        locations,
        wealth,
        tax,
        effective_development,
        state_capacity,
        births,
        rural_population,
        urban_population,
        rgo_levels,
        building_levels,
        building_employment,
        income
    );
    for (total, source) in [
        (&mut world.religions, &country.religions),
        (&mut world.materials, &country.materials),
        (&mut world.buildings, &country.buildings),
    ] {
        for (key, value) in source {
            *total.entry(key.clone()).or_insert(0.0) += value;
        }
    }
}

pub fn catalog(view: &View<'_, Eu5Analysis>) -> AnalyticsCatalog {
    let mut country_names = BTreeMap::new();
    let mut goods = BTreeSet::new();
    let mut market_labels = BTreeMap::new();
    for snapshot in view.snapshots() {
        if let Some(row) = snapshot.payload().analytics.read_catalog() {
            country_names.extend(
                row.country_names
                    .into_iter()
                    .map(|country| (country.country_id, country.name)),
            );
            market_labels.extend(
                row.market_labels
                    .into_iter()
                    .map(|market| (market.center, market.name)),
            );
            goods.extend(row.goods);
        }
    }
    AnalyticsCatalog::new(country_names, goods.into_iter().collect(), market_labels)
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsObservation {
    pub id: String,
    pub date: String,
    pub date_sort: i32,
    pub game_version: String,
    pub countries: Vec<CountryObservation>,
    pub markets: Vec<MarketObservation>,
}

pub fn history(
    view: &View<'_, Eu5Analysis>,
    country_id: Option<u32>,
    good: Option<String>,
    centers: Vec<u32>,
) -> Vec<AnalyticsObservation> {
    let centers = centers.into_iter().collect::<BTreeSet<_>>();
    view.snapshots()
        .iter()
        .map(|snapshot| {
            let descriptor = snapshot.descriptor();
            let data = &snapshot.payload().analytics;
            let country = match country_id {
                Some(id) => data.countries.get(id),
                None => data.world(),
            };
            let markets = good
                .as_deref()
                .and_then(|good| data.good(good))
                .unwrap_or_default();
            AnalyticsObservation {
                id: descriptor.id.clone(),
                date: descriptor.date.clone(),
                date_sort: descriptor.date_sort,
                game_version: descriptor.game_version.clone(),
                countries: country.into_iter().collect(),
                markets: markets
                    .into_iter()
                    .filter(|market| centers.is_empty() || centers.contains(&market.center))
                    .collect(),
            }
        })
        .collect()
}

/// Export one snapshot at a time so callers can stream a campaign without a
/// single campaign-sized allocation in either the worker or the main thread.
pub fn observation(view: &View<'_, Eu5Analysis>, id: String) -> Option<AnalyticsObservation> {
    let snapshot = view
        .snapshots()
        .iter()
        .find(|snapshot| snapshot.descriptor().id == id)?;
    let descriptor = snapshot.descriptor();
    let data = &snapshot.payload().analytics;
    Some(AnalyticsObservation {
        id,
        date: descriptor.date.clone(),
        date_sort: descriptor.date_sort,
        game_version: descriptor.game_version.clone(),
        countries: data.countries.rows().collect(),
        markets: (0..data.markets.len())
            .filter_map(|i| data.markets.read::<Vec<_>>(i))
            .flatten()
            .collect(),
    })
}

pub fn market_centers(view: &View<'_, Eu5Analysis>, country_id: u32) -> Vec<u32> {
    view.snapshots()
        .iter()
        .filter_map(|snapshot| snapshot.payload().analytics.countries.get(country_id))
        .flat_map(|country| country.market_centers)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct ChartOverview {
    pub id: String,
    pub json: String,
}

pub fn overview(view: &View<'_, Eu5Analysis>, key: OverviewKey) -> Option<ChartOverview> {
    let [snapshot] = view.snapshots() else {
        return None;
    };
    let compressed = snapshot.payload().analytics.overviews.get(key as usize)?;
    let bytes = pdx_zstd::decode_all(compressed).ok()?;
    Some(ChartOverview {
        id: snapshot.descriptor().id.clone(),
        json: String::from_utf8(bytes).ok()?,
    })
}
