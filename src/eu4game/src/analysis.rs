//! Compact province and country observations of one save for campaign
//! analysis.

use crate::shared::playthrough_id;
use campaign_analysis::{
    AnalysisError, BoundSelectionRows, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, NullableColumn, Observation, PayloadError, PrefixKey, ReferenceError, Registry,
    RegistryMemory, RowSelect, SaveDate, Series, SnapshotDescriptor, SnapshotSource, Table,
    TableError, TextRegistry, TextRow, Texts, View, check_length,
};
use eu4save::{
    CountryTag, PdsDate, ProvinceId,
    models::{Country, Province},
    query::{NationEvents, Query},
};
use std::collections::{BTreeMap, BTreeSet};
use std::hash::{Hash, Hasher};

/// The development of a province, as the province list of the viewer shows it.
pub fn province_development(province: &Province) -> f32 {
    province.base_tax + province.base_production + province.base_manpower
}

/// The men in the land regiments of a country, in thousands, as the Health
/// Heatmap totals its current force strength. Every regiment counts,
/// mercenaries too, whatever its unit type.
pub fn army_size(country: &Country) -> f32 {
    country
        .armies
        .iter()
        .flat_map(|army| &army.regiments)
        .map(|regiment| regiment.strength)
        .sum()
}

/// A tag that the game makes for a new country and gives to another country
/// later, so one tag is not one country over a campaign: a colonial nation
/// (C00), an estate country (E00), a federation (F00), a client state (K00)
/// or a trading company (T00). These are the letters of the
/// `dynamic_countries` list that saves keep. A custom nation (D00) keeps its
/// tag, so it stays.
pub fn is_generated_tag(tag: &CountryTag) -> bool {
    let [letter, first, second] = *tag.as_bytes() else {
        return false;
    };
    matches!(letter, b'C' | b'E' | b'F' | b'K' | b'T')
        && first.is_ascii_digit()
        && second.is_ascii_digit()
}

/// A row of the country table of the same snapshot, or no country.
#[derive(Debug, Clone, Copy, PartialEq, Eq, bytemuck::Pod, bytemuck::Zeroable)]
#[repr(transparent)]
pub struct CountryRow(u16);
impl CountryRow {
    pub const NONE: Self = Self(u16::MAX);
    /// `None` when the offset does not fit beside the reserved value.
    pub fn new(offset: usize) -> Option<Self> {
        u16::try_from(offset)
            .ok()
            .filter(|row| *row != u16::MAX)
            .map(Self)
    }
    pub fn get(self) -> Option<usize> {
        (self != Self::NONE).then_some(usize::from(self.0))
    }
}

/// The province columns of a snapshot. Each column has one row for each
/// province, in province ID order. The table keeps the province IDs.
#[derive(Debug, Clone, PartialEq)]
pub struct ProvinceColumns {
    pub development: Vec<f32>,
    pub owner: Vec<CountryRow>,
}
campaign_analysis::columns!(rows ProvinceColumns, "provinces" { development, owner });

/// The country columns of a snapshot, one row for each country that is
/// alive or owns a province. Country development comes from the province
/// columns. A value is absent when the save has no record of the country.
#[derive(Debug, Clone, PartialEq)]
pub struct CountryColumns {
    /// In thousands of men, as Country Details shows it.
    pub max_manpower: NullableColumn<f32>,
    /// See [`army_size`].
    pub army_size: NullableColumn<f32>,
}
campaign_analysis::columns!(rows CountryColumns, "countries" { max_manpower, army_size });

/// A religion of a country. The religion is a row of the snapshot religions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CountryReligion {
    pub tag: CountryTag,
    pub religion: TextRow,
}
impl PrefixKey for CountryReligion {
    type Prefix = CountryTag;
    fn prefix(&self) -> &CountryTag {
        &self.tag
    }
}

/// The development of the owned provinces of each religion of a country.
#[derive(Debug, Clone, PartialEq)]
pub struct CountryReligionColumns {
    pub development: Vec<f32>,
}
campaign_analysis::columns!(rows CountryReligionColumns, "country_religions" { development });

#[derive(Debug, Clone, PartialEq)]
pub struct Eu4Payload {
    pub provinces: Table<ProvinceId, ProvinceColumns>,
    pub countries: Table<CountryTag, CountryColumns>,
    pub religions: Texts,
    pub country_religions: Table<CountryReligion, CountryReligionColumns>,
    /// The tag switches that the save records, in date order.
    pub switches: Vec<TagSwitch>,
}
impl Columns for Eu4Payload {
    fn encode(&self, out: &mut Encoder) {
        self.provinces
            .encode_with(out, |keys, out| out.serde(&keys));
        self.countries
            .encode_with(out, |keys, out| encode_tags(keys.iter(), out));
        self.religions.encode(out);
        self.country_religions.encode_with(out, |keys, out| {
            encode_tags(keys.iter().map(|key| &key.tag), out);
            out.column(
                &keys
                    .iter()
                    .map(|key| key.religion.get())
                    .collect::<Vec<_>>(),
            );
        });
        out.serde(&self.switches);
    }
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        let provinces = Table::decode_sorted_with(input, |input| {
            let raw: Vec<i32> = input.serde()?;
            raw.into_iter()
                .map(|id| checked_province(id).map_err(DecodeError::Header))
                .collect()
        })?;
        let countries = Table::decode_sorted_with(input, decode_tags)?;
        let religions = Texts::decode(input).map_err(|error| error.in_table("religions"))?;
        let country_religions = Table::decode_sorted_prefix_with(input, |input| {
            let tags = decode_tags(input)?;
            let rows = input.column::<u32>()?;
            check_length(rows.len(), tags.len()).map_err(DecodeError::Column)?;
            Ok(tags
                .into_iter()
                .zip(rows)
                .map(|(tag, row)| CountryReligion {
                    tag,
                    religion: TextRow::new(row),
                })
                .collect())
        })?;
        let switches = input.serde()?;
        Ok(Self {
            provinces,
            countries,
            religions,
            country_religions,
            switches,
        })
    }
    /// Country religion keys and switches are local to the snapshot, so they count here.
    fn heap_bytes(&self) -> usize {
        self.provinces.columns().heap_bytes()
            + self.countries.columns().heap_bytes()
            + self.religions.heap_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().heap_bytes()
            + size_of_val(self.switches.as_slice())
    }
    fn allocated_bytes(&self) -> usize {
        self.provinces.columns().allocated_bytes()
            + self.countries.columns().allocated_bytes()
            + self.religions.allocated_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().allocated_bytes()
            + self.switches.capacity() * size_of::<TagSwitch>()
    }
}
fn encode_tags<'a>(tags: impl Iterator<Item = &'a CountryTag>, out: &mut Encoder) {
    let bytes: Vec<[u8; 3]> = tags
        .map(|tag| {
            let mut bytes = [0; 3];
            bytes.copy_from_slice(tag.as_bytes());
            bytes
        })
        .collect();
    out.column(&bytes);
}
fn decode_tags(input: &mut Decoder<'_>) -> Result<Vec<CountryTag>, DecodeError> {
    input
        .column::<[u8; 3]>()?
        .into_iter()
        .map(|tag| {
            CountryTag::create(tag).map_err(|_| DecodeError::Header(String::from("Invalid tag")))
        })
        .collect()
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

impl Eu4Payload {
    /// The row of a country in the country table.
    pub fn country_offset(&self, tag: &CountryTag) -> Option<usize> {
        self.countries.keys().binary_search(tag).ok()
    }

    /// The development of all owned provinces, as the province list of the
    /// viewer counts it.
    pub fn owned_development(&self) -> f64 {
        let provinces = self.provinces.columns();
        provinces
            .development
            .iter()
            .zip(&provinces.owner)
            .filter(|(_, owner)| owner.get().is_some())
            .map(|(development, _)| f64::from(*development))
            .sum()
    }

    /// The development of the provinces that each country row owns, or
    /// none for a country that owns no province. The payload must be
    /// validated, as every stored snapshot is.
    pub fn province_development_by_country(&self) -> Vec<Option<f64>> {
        let provinces = self.provinces.columns();
        let mut totals = vec![None; self.countries.len()];
        for (development, owner) in provinces.development.iter().zip(&provinces.owner) {
            if let Some(row) = owner.get() {
                *totals[row].get_or_insert(0.0) += f64::from(*development);
            }
        }
        totals
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

    // The countries that are alive or own a province, in tag order.
    let tags: Vec<CountryTag> = provinces
        .iter()
        .filter_map(|(_, province)| province.owner)
        .chain(
            save.game
                .countries
                .iter()
                .filter(|(_, country)| country.num_of_cities > 0)
                .map(|(tag, _)| *tag),
        )
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let records: Vec<_> = tags.iter().map(|tag| query.country(tag)).collect();
    let countries = CountryColumns {
        max_manpower: records
            .iter()
            .map(|country| country.map(|country| country.max_manpower))
            .collect(),
        army_size: records
            .iter()
            .map(|country| country.map(army_size))
            .collect(),
    };

    let mut fingerprint = std::hash::DefaultHasher::new();
    let mut ids = Vec::with_capacity(provinces.len());
    let mut development = Vec::with_capacity(provinces.len());
    let mut owner = Vec::with_capacity(provinces.len());
    let mut religions = BTreeMap::<(CountryTag, &str), f64>::new();
    for (id, province) in provinces {
        id.hash(&mut fingerprint);
        ids.push(*id);
        let value = province_development(province);
        development.push(value);
        owner.push(match province.owner {
            Some(tag) => {
                let offset = tags.binary_search(&tag).expect("a collected owner");
                CountryRow::new(offset).ok_or(AnalysisError::Payload(
                    PayloadError::DictionarySize { table: "countries" },
                ))?
            }
            None => CountryRow::NONE,
        });
        if let (Some(tag), Some(religion)) = (province.owner, province.religion.as_deref()) {
            *religions.entry((tag, religion)).or_default() += f64::from(value);
        }
    }

    let texts = Texts::new(
        religions
            .keys()
            .map(|(_, religion)| *religion)
            .collect::<BTreeSet<_>>(),
    )
    .map_err(|error| TableError::Key(error).in_table("religions"))?;
    let (religion_keys, religion_development) = religions
        .into_iter()
        .map(|((tag, religion), development)| {
            let religion = texts.find(religion).expect("a collected religion");
            (CountryReligion { tag, religion }, development as f32)
        })
        .unzip();

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
            provinces: Table::sorted(ids, ProvinceColumns { development, owner })?,
            countries: Table::sorted(tags, countries)?,
            religions: texts,
            country_religions: Table::sorted_prefix(
                religion_keys,
                CountryReligionColumns {
                    development: religion_development,
                },
            )?,
            switches: tag_switches(&query.nation_events(&query.province_owners())),
        },
    )
}

campaign_analysis::registries! {
    /// The keys and texts that the EU4 snapshots of a store share.
    pub struct Eu4Shared => Eu4Prepared {
        provinces: IndexRegistry<ProvinceId>,
        countries: IndexRegistry<CountryTag>,
        religions: TextRegistry,
    }
}

#[derive(Debug)]
pub struct Eu4Analysis;

impl Game for Eu4Analysis {
    const GAME: &'static str = "eu4";
    const ARTIFACTS: &'static [&'static str] = &["observations"];
    type Detail = Eu4Detail;
    type Payload = Eu4Payload;
    type Shared = Eu4Shared;
    type Prepared = Eu4Prepared;
    type Query = Eu4Query;

    fn validate(payload: &Eu4Payload) -> Result<(), PayloadError> {
        let provinces = payload.provinces.columns();
        let countries = payload.countries.columns();
        let measurements = [
            &provinces.development,
            &payload.country_religions.columns().development,
        ];
        if measurements
            .iter()
            .any(|column| column.iter().any(|x| !x.is_finite()))
            || [&countries.max_manpower, &countries.army_size]
                .iter()
                .any(|column| column.iter().flatten().any(|x| !x.is_finite()))
        {
            return Err(PayloadError::NonFinite);
        }
        // Queries search provinces and countries by key and religions by prefix.
        if !payload.provinces.is_sorted() || !payload.countries.is_sorted() {
            return Err(PayloadError::Invalid(String::from(
                "Province and country keys must be sorted",
            )));
        }
        if !payload.country_religions.is_prefix_sorted() {
            return Err(PayloadError::Invalid(String::from(
                "Country religion keys must be prefix sorted",
            )));
        }
        if payload.countries.len() > usize::from(u16::MAX) {
            return Err(PayloadError::DictionarySize { table: "countries" });
        }
        if let Some(owner) = provinces.owner.iter().find(|owner| {
            owner
                .get()
                .is_some_and(|row| row >= payload.countries.len())
        }) {
            return Err(PayloadError::Reference(ReferenceError::Row {
                column: "owner",
                row: u32::from(owner.0),
                rows: payload.countries.len(),
            })
            .in_table("provinces"));
        }
        for key in payload.country_religions.keys() {
            payload
                .religions
                .check(key.religion)
                .map_err(|error| PayloadError::Reference(error).in_table("country_religions"))?;
            if payload.country_offset(&key.tag).is_none() {
                return Err(PayloadError::Invalid(format!(
                    "Country religions of {} have no country row",
                    key.tag
                )));
            }
        }
        Ok(())
    }
    fn prepare(
        payload: &mut Eu4Payload,
        layout: &str,
        shared: &Eu4Shared,
    ) -> Result<Eu4Prepared, AnalysisError> {
        Ok(Eu4Prepared {
            provinces: shared
                .provinces
                .prepare(&mut payload.provinces, Some(layout))?,
            countries: shared.countries.prepare(&mut payload.countries, None)?,
            religions: shared.religions.prepare(&mut payload.religions)?,
        })
    }
    fn added_bytes(prepared: &Eu4Prepared) -> usize {
        Eu4Shared::added_bytes(prepared)
    }
    fn commit(shared: &mut Eu4Shared, prepared: Eu4Prepared) {
        shared.commit(prepared);
    }
    fn shared_memory(shared: &Eu4Shared) -> RegistryMemory {
        shared.memory()
    }
}

/// A country value on each date.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum CountryMetric {
    /// The development of the provinces that the country owns, as the
    /// Province list totals it. Country Details shows the game's figure,
    /// which also counts the native development of a tribal country.
    ProvinceDevelopment,
    /// In thousands of men, as Country Details shows it.
    MaxManpower,
    /// See [`army_size`].
    ArmySize,
}

/// A country value in one snapshot.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum CountryValue {
    Value(f64),
    /// The value of another country that had the tag on this date: before
    /// the switch that gave the country its tag, or after it gave the tag up.
    OtherCountry(f64),
    /// The country owns no province, so it has no value. Zero would claim one.
    NoProvinces,
    /// The country owns provinces, but the save has no record of it.
    NoRecord,
}

/// The values of one country, aligned to the snapshot IDs of the reply.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct CountryValues {
    pub tag: CountryTag,
    pub values: Vec<CountryValue>,
}

/// How to split a country value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum CountryDimension {
    /// Development by the religion of the owned provinces.
    Religion,
}

campaign_analysis::queries! {
    /// The EU4 history queries.
    pub enum Eu4Query for Eu4Analysis => Eu4Answer {
        /// The development of all owned provinces on each date.
        WorldDevelopment => History = world_development,
        /// The development of a fixed set of provinces on each date. If a
        /// snapshot does not have one of the provinces, its total is a gap.
        ProvinceDevelopment { #[serde(deserialize_with = "deserialize_provinces")] province_ids: Vec<ProvinceId> } => History = fixed_province_development,
        /// One history for each country, in the order of the tags. Generated
        /// tags ([`is_generated_tag`]) have none. The tag switches that the
        /// snapshots record tell which dates a tag names another country.
        CountrySeries { tags: Vec<CountryTag>, metric: CountryMetric } => Vec<CountryValues> = country_series,
        /// One series for each part of a country value on the selected
        /// dates, by name. A part is zero on a date where the country exists
        /// without it, and a gap where the country does not exist.
        CountryBreakdown { tag: CountryTag, dimension: CountryDimension } => Vec<Series<String>> = country_breakdown,
    }
}

pub fn world_development(view: &View<'_, Eu4Analysis>) -> History {
    view.series(|snapshot| Some(snapshot.payload().owned_development()))
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

pub fn country_series(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    metric: CountryMetric,
) -> Vec<CountryValues> {
    let switches: Vec<_> = view
        .snapshots()
        .iter()
        .flat_map(|snapshot| &snapshot.payload().switches)
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let mut series: Vec<_> = tags
        .into_iter()
        .filter(|tag| !is_generated_tag(tag))
        .map(|tag| CountryValues {
            tag,
            values: Vec::with_capacity(view.snapshots().len()),
        })
        .collect();
    let spans: Vec<_> = series
        .iter()
        .map(|country| TagSpan::of(country.tag, &switches))
        .collect();
    for snapshot in view.snapshots() {
        let payload = snapshot.payload();
        let columns = payload.countries.columns();
        let development = payload.province_development_by_country();
        let date = snapshot.descriptor().date_sort;
        for (country, span) in series.iter_mut().zip(&spans) {
            let row = payload.country_offset(&country.tag);
            let value = match row.and_then(|row| Some((row, development[row]?))) {
                None => CountryValue::NoProvinces,
                Some((row, owned)) => {
                    let value = match metric {
                        CountryMetric::ProvinceDevelopment => Some(owned),
                        CountryMetric::MaxManpower => {
                            columns.max_manpower.get(row).flatten().map(f64::from)
                        }
                        CountryMetric::ArmySize => {
                            columns.army_size.get(row).flatten().map(f64::from)
                        }
                    };
                    match value {
                        None => CountryValue::NoRecord,
                        Some(value) if span.contains(date) => CountryValue::Value(value),
                        Some(value) => CountryValue::OtherCountry(value),
                    }
                }
            };
            country.values.push(value);
        }
    }
    series
}

pub fn country_breakdown(
    view: &View<'_, Eu4Analysis>,
    tag: CountryTag,
    dimension: CountryDimension,
) -> Vec<Series<String>> {
    match dimension {
        CountryDimension::Religion => religion_development(view, tag),
    }
}

/// A religion with no owned province on a date where the country exists is
/// zero there.
fn religion_development(view: &View<'_, Eu4Analysis>, tag: CountryTag) -> Vec<Series<String>> {
    let snapshots = view.snapshots();
    let mut exists = vec![false; snapshots.len()];
    let mut totals = BTreeMap::new();
    for (at, snapshot) in snapshots.iter().enumerate() {
        let payload = snapshot.payload();
        if payload.country_offset(&tag).is_none() {
            continue;
        }
        exists[at] = true;
        let rows = payload
            .country_religions
            .prefix_range(&tag)
            .expect("country religions are prefix sorted");
        for (key, development) in rows.keys().iter().zip(rows.values(|c| &c.development)) {
            let id = payload
                .religions
                .id(key.religion)
                .expect("a stored snapshot has an ID for each religion");
            totals
                .entry(id)
                .or_insert_with(|| vec![None; snapshots.len()])[at] = Some(f64::from(*development));
        }
    }
    let texts = &view.shared().religions;
    let mut series: Vec<_> = totals
        .into_iter()
        .map(|(id, mut values)| {
            for (value, exists) in values.iter_mut().zip(&exists) {
                if *exists {
                    value.get_or_insert(0.0);
                }
            }
            Series {
                key: texts.text(id).expect("a store text").to_owned(),
                values,
            }
        })
        .collect();
    series.sort_unstable_by(|a, b| a.key.cmp(&b.key));
    series
}

/// A game date, written `YYYY-MM-DD`. It orders like the `date_sort` of a
/// snapshot descriptor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GameDate(i32);
impl GameDate {
    pub fn from_eu4(date: eu4save::Eu4Date) -> Self {
        Self(i32::from(date.year()) * 10000 + i32::from(date.month()) * 100 + i32::from(date.day()))
    }
    /// The `date_sort` of a snapshot on this date.
    pub fn date_sort(self) -> i32 {
        self.0
    }
}
impl serde::Serialize for GameDate {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let (year, month, day) = (self.0 / 10000, self.0 / 100 % 100, self.0 % 100);
        serializer.collect_str(&format_args!("{year:04}-{month:02}-{day:02}"))
    }
}
impl<'de> serde::Deserialize<'de> for GameDate {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        let parts: Vec<_> = text.split('-').map(str::parse::<i32>).collect();
        match parts[..] {
            [Ok(year), Ok(month), Ok(day)]
                if (1..=12).contains(&month) && (1..=31).contains(&day) && year >= 0 =>
            {
                Ok(Self(year * 10000 + month * 100 + day))
            }
            _ => Err(serde::de::Error::custom("Expected a date as YYYY-MM-DD")),
        }
    }
}

/// A country that changed its tag on a date, as the nation events of a save
/// record it.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct TagSwitch {
    pub from: CountryTag,
    pub to: CountryTag,
    #[cfg_attr(feature = "tsify", tsify(type = "string"))]
    pub date: GameDate,
}

/// The dates when a tag names the country of its chart row: from the switch
/// into the tag to the switch out of it. A tag without switches names one
/// country on every date. A tag that the switches give to more than one
/// country, such as one taken again after it was given up, names none for
/// sure, so none of its values counts as the row's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TagSpan {
    One {
        from: Option<GameDate>,
        until: Option<GameDate>,
    },
    Ambiguous,
}
impl TagSpan {
    fn of(tag: CountryTag, switches: &[TagSwitch]) -> Self {
        let into: Vec<_> = switches
            .iter()
            .filter(|x| x.to == tag)
            .map(|x| x.date)
            .collect();
        let out: Vec<_> = switches
            .iter()
            .filter(|x| x.from == tag)
            .map(|x| x.date)
            .collect();
        match (into.as_slice(), out.as_slice()) {
            ([], []) => Self::One {
                from: None,
                until: None,
            },
            (&[from], []) => Self::One {
                from: Some(from),
                until: None,
            },
            ([], &[until]) => Self::One {
                from: None,
                until: Some(until),
            },
            (&[from], &[until]) if from <= until => Self::One {
                from: Some(from),
                until: Some(until),
            },
            _ => Self::Ambiguous,
        }
    }
    fn contains(self, date_sort: i32) -> bool {
        match self {
            Self::One { from, until } => {
                from.is_none_or(|from| from.date_sort() <= date_sort)
                    && until.is_none_or(|until| date_sort < until.date_sort())
            }
            Self::Ambiguous => false,
        }
    }
}

/// The tag switches of the nation events of a save, in date order.
pub fn tag_switches(events: &[NationEvents]) -> Vec<TagSwitch> {
    let mut switches: Vec<_> = events
        .iter()
        .flat_map(|nation| {
            let mut current = nation.initial;
            nation.events.iter().filter_map(move |event| {
                let (date, to) = event.as_tag_switch()?;
                let from = std::mem::replace(&mut current, to);
                Some((
                    date,
                    TagSwitch {
                        from,
                        to,
                        date: GameDate::from_eu4(date),
                    },
                ))
            })
        })
        .collect();
    switches.sort_by_key(|(date, _)| *date);
    switches.into_iter().map(|(_, switch)| switch).collect()
}

/// The countries of a campaign chart and the tag switches between them.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct ChartCountries {
    /// Sorted and distinct.
    pub tags: Vec<CountryTag>,
    pub switches: Vec<TagSwitch>,
    /// Generated tags that the filter chose, which the chart leaves out.
    pub left_out: Vec<CountryTag>,
}

/// The chosen tags with each tag that a recorded switch joins to them, so a
/// formed nation and the country that formed it show together. Generated
/// tags are left out and listed.
pub fn chart_countries(
    chosen: impl IntoIterator<Item = CountryTag>,
    switches: &[TagSwitch],
) -> ChartCountries {
    let (left_out, chosen): (BTreeSet<_>, BTreeSet<_>) =
        chosen.into_iter().partition(is_generated_tag);
    let switches: Vec<_> = switches
        .iter()
        .filter(|x| !is_generated_tag(&x.from) && !is_generated_tag(&x.to))
        .collect();
    let mut tags = chosen;
    loop {
        let joined: Vec<_> = switches
            .iter()
            .filter(|x| tags.contains(&x.from) != tags.contains(&x.to))
            .flat_map(|x| [x.from, x.to])
            .collect();
        if joined.is_empty() {
            break;
        }
        tags.extend(joined);
    }
    ChartCountries {
        switches: switches
            .into_iter()
            .filter(|x| tags.contains(&x.from))
            .cloned()
            .collect(),
        tags: tags.into_iter().collect(),
        left_out: left_out.into_iter().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use campaign_analysis::{Query, Selection, Session, Store};

    /// A province: its ID, development, owner and religion.
    type Spec = (i32, f32, Option<&'static str>, Option<&'static str>);

    fn tag(tag: &str) -> CountryTag {
        tag.parse().unwrap()
    }

    /// Countries get their max manpower and army size from the order of
    /// their tags. An alive country may own no province.
    fn payload(provinces: &[Spec], alive: &[&str]) -> Eu4Payload {
        let tags: Vec<_> = provinces
            .iter()
            .filter_map(|p| p.2)
            .chain(alive.iter().copied())
            .map(tag)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let count = tags.len();
        let religions = Texts::new(
            provinces
                .iter()
                .filter(|p| p.2.is_some())
                .filter_map(|p| p.3)
                .collect::<BTreeSet<_>>(),
        )
        .unwrap();
        let mut breakdown = BTreeMap::<CountryReligion, f32>::new();
        for (_, development, owner, religion) in provinces {
            if let (Some(owner), Some(religion)) = (owner, religion) {
                let key = CountryReligion {
                    tag: tag(owner),
                    religion: religions.find(religion).unwrap(),
                };
                *breakdown.entry(key).or_default() += development;
            }
        }
        let (keys, development) = breakdown.into_iter().unzip();
        Eu4Payload {
            provinces: Table::sorted(
                provinces.iter().map(|p| ProvinceId::new(p.0)).collect(),
                ProvinceColumns {
                    development: provinces.iter().map(|p| p.1).collect(),
                    owner: provinces
                        .iter()
                        .map(|p| match p.2 {
                            Some(owner) => {
                                CountryRow::new(tags.binary_search(&tag(owner)).unwrap()).unwrap()
                            }
                            None => CountryRow::NONE,
                        })
                        .collect(),
                },
            )
            .unwrap(),
            countries: Table::sorted(
                tags,
                CountryColumns {
                    max_manpower: (1..=count).map(|i| Some(10.0 * i as f32)).collect(),
                    army_size: (1..=count).map(|i| Some(i as f32)).collect(),
                },
            )
            .unwrap(),
            religions,
            country_religions: Table::sorted_prefix(keys, CountryReligionColumns { development })
                .unwrap(),
            switches: Vec::new(),
        }
    }

    fn descriptor(hash: &str, date: (i32, u8, u8), layout: String) -> SnapshotDescriptor {
        SnapshotDescriptor::new::<Eu4Analysis>(
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
            layout,
        )
    }

    fn observation(
        hash: &str,
        date: (i32, u8, u8),
        provinces: &[Spec],
    ) -> Observation<Eu4Analysis> {
        observation_with(hash, date, provinces, &[])
    }

    fn observation_with(
        hash: &str,
        date: (i32, u8, u8),
        provinces: &[Spec],
        alive: &[&str],
    ) -> Observation<Eu4Analysis> {
        let ids: Vec<_> = provinces.iter().map(|p| p.0).collect();
        Observation::new(
            descriptor(hash, date, format!("{ids:?}")),
            Eu4Detail {},
            payload(provinces, alive),
        )
        .unwrap()
    }

    fn saves() -> [Observation<Eu4Analysis>; 3] {
        [
            observation(
                "b",
                (1500, 1, 1),
                &[
                    (1, 12.0, Some("ENG"), Some("catholic")),
                    (2, 20.0, None, Some("catholic")),
                    (3, 31.0, Some("FRA"), Some("catholic")),
                ],
            ),
            observation(
                "a",
                (1444, 11, 11),
                &[
                    (1, 10.0, Some("ENG"), Some("catholic")),
                    (2, 20.0, Some("ENG"), Some("catholic")),
                    (3, 30.0, Some("ENG"), Some("orthodox")),
                ],
            ),
            observation_with(
                "c",
                (1600, 1, 1),
                &[
                    (1, 15.0, Some("FRA"), Some("calvinist")),
                    (2, 25.0, Some("FRA"), Some("catholic")),
                ],
                &["SWE"],
            ),
        ]
    }

    fn store() -> Store<Eu4Analysis> {
        let mut store = Store::new();
        for observation in saves() {
            store.append(observation, usize::MAX).unwrap();
        }
        store
    }

    fn answer(store: &Store<Eu4Analysis>, query: Eu4Query) -> Eu4Answer {
        query.answer(&View::select(store, "campaign", &Selection::All))
    }

    fn values(store: &Store<Eu4Analysis>, query: Eu4Query) -> Vec<Option<f64>> {
        match answer(store, query) {
            Eu4Answer::WorldDevelopment(history) | Eu4Answer::ProvinceDevelopment(history) => {
                history.rows.into_iter().map(|row| row.value).collect()
            }
            other => panic!("{other:?}"),
        }
    }

    fn series<K>(series: Vec<Series<K>>) -> Vec<(K, Vec<Option<f64>>)> {
        series.into_iter().map(|s| (s.key, s.values)).collect()
    }

    fn histories(series: Vec<CountryValues>) -> Vec<(CountryTag, Vec<CountryValue>)> {
        series.into_iter().map(|s| (s.tag, s.values)).collect()
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
    fn a_country_series_reads_stored_values_and_derives_development() {
        use CountryValue::{NoProvinces, Value};
        let store = store();
        let run = |metric, tags: &[&str]| {
            let query = Eu4Query::CountrySeries {
                tags: tags.iter().copied().map(tag).collect(),
                metric,
            };
            match answer(&store, query) {
                Eu4Answer::CountrySeries(answer) => histories(answer),
                other => panic!("{other:?}"),
            }
        };
        // SWE is alive in 1600 but owns no province, so it has no value there.
        let tags = ["FRA", "ENG", "SWE"];
        assert_eq!(
            run(CountryMetric::ProvinceDevelopment, &tags),
            [
                (tag("FRA"), vec![NoProvinces, Value(31.0), Value(40.0)]),
                (tag("ENG"), vec![Value(60.0), Value(12.0), NoProvinces]),
                (tag("SWE"), vec![NoProvinces; 3]),
            ]
        );
        assert_eq!(
            run(CountryMetric::MaxManpower, &tags),
            [
                (tag("FRA"), vec![NoProvinces, Value(20.0), Value(10.0)]),
                (tag("ENG"), vec![Value(10.0), Value(10.0), NoProvinces]),
                (tag("SWE"), vec![NoProvinces; 3]),
            ]
        );
        assert_eq!(
            run(CountryMetric::ArmySize, &tags[..2]),
            [
                (tag("FRA"), vec![NoProvinces, Value(2.0), Value(1.0)]),
                (tag("ENG"), vec![Value(1.0), Value(1.0), NoProvinces]),
            ]
        );
        // A generated tag has no series.
        assert_eq!(run(CountryMetric::ArmySize, &["C01", "ENG"]).len(), 1);
        let query: Eu4Query = serde_json::from_value(serde_json::json!({
            "kind": "countrySeries", "tags": ["ENG"], "metric": "maxManpower",
        }))
        .unwrap();
        serde_json::from_value::<Eu4Query>(serde_json::json!({
            "kind": "countrySeries", "tags": ["ENG"], "metric": "armySize",
        }))
        .unwrap();
        assert!(matches!(
            query,
            Eu4Query::CountrySeries {
                metric: CountryMetric::MaxManpower,
                ..
            }
        ));
        serde_json::from_value::<Eu4Query>(serde_json::json!({
            "kind": "countrySeries", "tags": ["ENGLAND"], "metric": "maxManpower",
        }))
        .unwrap_err();
    }

    #[test]
    fn a_breakdown_joins_religions_across_snapshot_dictionaries() {
        let store = store();
        let run = |name: &str| match answer(
            &store,
            Eu4Query::CountryBreakdown {
                tag: tag(name),
                dimension: CountryDimension::Religion,
            },
        ) {
            Eu4Answer::CountryBreakdown(answer) => series(answer),
            other => panic!("{other:?}"),
        };
        // Catholic is row 0 in the first two dictionaries and row 1 in the third.
        assert_eq!(
            run("FRA"),
            [
                (String::from("calvinist"), vec![None, Some(0.0), Some(15.0)]),
                (String::from("catholic"), vec![None, Some(31.0), Some(25.0)]),
            ]
        );
        assert_eq!(
            run("ENG"),
            [
                (String::from("catholic"), vec![Some(30.0), Some(12.0), None]),
                (String::from("orthodox"), vec![Some(30.0), Some(0.0), None]),
            ]
        );
        assert!(run("SWE").is_empty());
    }

    #[test]
    fn shares_keys_and_texts_and_a_failed_append_changes_nothing() {
        let mut store = store();
        let memory = store.memory();
        // Equal province and country keys share.
        assert_eq!(memory.layouts, 2 + 3);
        let texts = "catholicorthodoxcalvinist".len();
        assert_eq!(store.shared().religions.memory().data_bytes, texts);

        let sunni = || {
            observation(
                "d",
                (1700, 1, 1),
                &[
                    (1, 1.0, Some("TUR"), Some("sunni")),
                    (2, 1.0, Some("TUR"), None),
                ],
            )
        };
        let error = store.append(sunni(), memory.buffer_bytes).unwrap_err();
        assert_eq!(error, AnalysisError::MemoryFull);
        assert_eq!(store.memory(), memory);
        assert_eq!(store.shared().religions.memory().data_bytes, texts);
        store.append(sunni(), usize::MAX).unwrap();
        assert_eq!(
            store.shared().religions.memory().data_bytes,
            texts + "sunni".len()
        );

        // A stored snapshot gives back the bytes of the parser.
        let originals: Vec<_> = saves().into_iter().chain([sunni()]).collect();
        for stored in store.snapshots() {
            let original = originals
                .iter()
                .find(|x| x.descriptor.id == stored.descriptor().id)
                .unwrap();
            assert_eq!(stored.encode(), original.encode());
        }
    }

    #[test]
    fn admission_charges_only_new_text() {
        let added = |religion| {
            let mut store = store();
            let before = store.memory().buffer_bytes;
            let next = observation("d", (1700, 1, 1), &[(1, 1.0, Some("TUR"), Some(religion))]);
            store.append(next, usize::MAX).unwrap();
            store.memory().buffer_bytes - before
        };
        assert_eq!(added("sunni") - added("orthodox"), "sunni".len());
    }

    #[test]
    fn a_country_without_a_record_has_gaps_and_unordered_tables_are_refused() {
        let mut payload = payload(&[(1, 5.0, Some("ENG"), None)], &[]);
        payload.countries = Table::sorted(
            vec![tag("ENG")],
            CountryColumns {
                max_manpower: [None].into_iter().collect(),
                army_size: [None].into_iter().collect(),
            },
        )
        .unwrap();
        let layout = String::from("[1]");
        let saved = |payload| {
            Observation::new(
                descriptor("a", (1444, 11, 11), layout.clone()),
                Eu4Detail {},
                payload,
            )
        };
        let mut store = Store::new();
        store
            .append(saved(payload.clone()).unwrap(), usize::MAX)
            .unwrap();
        let run = |metric| match answer(
            &store,
            Eu4Query::CountrySeries {
                tags: vec![tag("ENG")],
                metric,
            },
        ) {
            Eu4Answer::CountrySeries(answer) => histories(answer),
            other => panic!("{other:?}"),
        };
        // ENG owns a province but has no record, which is not "no provinces".
        assert_eq!(
            run(CountryMetric::MaxManpower),
            [(tag("ENG"), vec![CountryValue::NoRecord])]
        );
        assert_eq!(
            run(CountryMetric::ProvinceDevelopment),
            [(tag("ENG"), vec![CountryValue::Value(5.0)])]
        );

        let mut unsorted = payload.clone();
        unsorted.countries = Table::map_order(
            vec![tag("FRA"), tag("ENG")],
            CountryColumns {
                max_manpower: [None, None].into_iter().collect(),
                army_size: [None, None].into_iter().collect(),
            },
        )
        .unwrap();
        let mut unprefixed = payload.clone();
        unprefixed.country_religions = Table::sorted(
            Vec::new(),
            CountryReligionColumns {
                development: Vec::new(),
            },
        )
        .unwrap();
        let mut provinces = payload.clone();
        provinces.provinces = Table::map_order(
            vec![ProvinceId::new(2), ProvinceId::new(1)],
            ProvinceColumns {
                development: vec![1.0; 2],
                owner: vec![CountryRow::NONE; 2],
            },
        )
        .unwrap();
        for (payload, message) in [
            (provinces, "keys must be sorted"),
            (unsorted, "keys must be sorted"),
            (unprefixed, "prefix sorted"),
        ] {
            let error = saved(payload).unwrap_err();
            assert!(error.to_string().contains(message), "{error}");
        }
    }

    fn splice(payload: &Eu4Payload) -> Vec<u8> {
        let original = &saves()[0];
        let mut baseline = Encoder::new();
        original.payload().encode(&mut baseline);
        let mut bytes = original.encode();
        bytes.truncate(bytes.len() - baseline.finish().len());
        let mut out = Encoder::new();
        payload.encode(&mut out);
        bytes.extend(out.finish());
        bytes
    }

    #[test]
    fn decode_refuses_invalid_references_and_measurements() {
        let valid = saves()[0].payload().clone();
        Observation::<Eu4Analysis>::decode(&splice(&valid)).unwrap();

        let mut owner = valid.clone();
        let mut columns = owner.provinces.columns().clone();
        columns.owner[0] = CountryRow(2);
        owner.provinces = Table::sorted(owner.provinces.keys().to_vec(), columns).unwrap();

        let mut manpower = valid.clone();
        manpower.countries = Table::sorted(
            manpower.countries.keys().to_vec(),
            CountryColumns {
                max_manpower: [None, None].into_iter().collect(),
                army_size: [Some(f32::NAN), None].into_iter().collect(),
            },
        )
        .unwrap();

        let mut religion = valid.clone();
        religion.religions = Texts::new(Vec::<&str>::new()).unwrap();

        let mut country = valid.clone();
        country.country_religions = Table::sorted_prefix(
            vec![CountryReligion {
                tag: tag("SWE"),
                religion: valid.religions.find("catholic").unwrap(),
            }],
            CountryReligionColumns {
                development: vec![1.0],
            },
        )
        .unwrap();

        let mut session = Session::<Eu4Analysis>::new();
        for (payload, message) in [
            (owner, "owner names row 2 of 2"),
            (manpower, "not finite"),
            (religion, "Dictionary reference 0 is outside 0 rows"),
            (country, "SWE"),
        ] {
            let error = Observation::<Eu4Analysis>::decode(&splice(&payload)).unwrap_err();
            assert!(error.to_string().contains(message), "{error}");
            let before = session.memory();
            session
                .append(0, &splice(&payload), usize::MAX)
                .unwrap_err();
            assert_eq!(session.memory(), before);
        }
    }

    #[test]
    fn full_province_identity_survives_queries_and_encoding() {
        let mut store = Store::<Eu4Analysis>::new();
        let large = 65536 + 42;
        let observation = observation(
            "wide",
            (1500, 1, 1),
            &[(42, 1.0, Some("ENG"), None), (large, 7.0, None, None)],
        );
        let bytes = observation.encode();
        let decoded = Observation::<Eu4Analysis>::decode(&bytes).unwrap();
        assert_eq!(
            decoded.payload().provinces.keys(),
            [ProvinceId::new(42), ProvinceId::new(large)]
        );
        store.append(decoded, usize::MAX).unwrap();
        for (id, expected) in [(42, 1.0), (large, 7.0)] {
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
        // Replace only the province IDs of a complete payload.
        let keys = |raw: i32| {
            let mut out = Encoder::new();
            out.serde(&vec![raw]);
            out.finish()
        };
        let mut out = Encoder::new();
        payload(&[(1, 1.0, None, None)], &[]).encode(&mut out);
        let rest = out.finish().split_off(keys(1).len());
        for raw in [-42, i32::MIN] {
            let bytes = [keys(raw), rest.clone()].concat();
            let error = Eu4Payload::decode(&mut Decoder::new(&bytes)).unwrap_err();
            assert!(error.to_string().contains("nonnegative"), "{error}");
        }
    }

    #[test]
    fn generated_tags_are_the_reused_dynamic_tags() {
        for generated in ["C00", "E01", "F01", "K12", "T99"] {
            assert!(is_generated_tag(&tag(generated)), "{generated}");
        }
        // A custom nation keeps its tag.
        for fixed in ["FRA", "TUR", "MEX", "---", "REB", "D05", "Z01"] {
            assert!(!is_generated_tag(&tag(fixed)), "{fixed}");
        }
    }

    #[test]
    fn a_chart_pairs_the_tags_of_recorded_switches() {
        let switch = |from: &str, to: &str, date: &str| TagSwitch {
            from: tag(from),
            to: tag(to),
            date: serde_json::from_value(serde_json::json!(date)).unwrap(),
        };
        let switches = [
            switch("BRA", "PRU", "1525-01-01"),
            switch("PRU", "GER", "1700-01-01"),
            switch("C01", "MEX", "1650-01-01"),
            switch("CAS", "SPA", "1500-01-01"),
        ];
        let chart = chart_countries([tag("GER"), tag("C02"), tag("ENG")], &switches);
        assert_eq!(chart.tags, ["BRA", "ENG", "GER", "PRU"].map(tag));
        assert_eq!(chart.left_out, [tag("C02")]);
        assert_eq!(chart.switches, switches[..2]);
        // A generated tag does not join a formed nation.
        assert_eq!(chart_countries([tag("MEX")], &switches).tags, [tag("MEX")]);
    }

    #[test]
    fn a_tag_names_another_country_outside_its_switches() {
        use CountryValue::{NoProvinces, OtherCountry, Value};
        let switch = |from: &str, to: &str, date: i32| TagSwitch {
            from: tag(from),
            to: tag(to),
            date: GameDate(date),
        };
        // Each snapshot carries the switches that its save records.
        let saved = |hash, date, provinces: &[Spec], switches: Vec<TagSwitch>| {
            let observation = observation(hash, date, provinces);
            let mut payload = observation.payload().clone();
            payload.switches = switches;
            Observation::new(observation.descriptor.clone(), Eu4Detail {}, payload).unwrap()
        };
        let run = |snapshots: Vec<Observation<Eu4Analysis>>, tags: &[&str]| {
            let mut store = Store::new();
            for snapshot in snapshots {
                store.append(snapshot, usize::MAX).unwrap();
            }
            let query = Eu4Query::CountrySeries {
                tags: tags.iter().copied().map(tag).collect(),
                metric: CountryMetric::ProvinceDevelopment,
            };
            let Eu4Answer::CountrySeries(answer) = answer(&store, query) else {
                panic!("country series");
            };
            histories(answer)
        };

        // The first BYZ is annexed, ULM forms BYZ in 1550, and another ULM
        // appears by 1600. Only the last save records the switch.
        let formed = || {
            vec![
                saved(
                    "a",
                    (1444, 11, 11),
                    &[(1, 10.0, Some("BYZ"), None), (2, 3.0, Some("ULM"), None)],
                    vec![],
                ),
                saved(
                    "b",
                    (1500, 1, 1),
                    &[(1, 10.0, Some("TUR"), None), (2, 4.0, Some("ULM"), None)],
                    vec![],
                ),
                saved(
                    "c",
                    (1600, 1, 1),
                    &[(1, 20.0, Some("BYZ"), None), (2, 5.0, Some("ULM"), None)],
                    vec![switch("ULM", "BYZ", 15500101)],
                ),
            ]
        };
        assert_eq!(
            run(formed(), &["BYZ", "ULM"]),
            [
                (
                    tag("BYZ"),
                    vec![OtherCountry(10.0), NoProvinces, Value(20.0)]
                ),
                (tag("ULM"), vec![Value(3.0), Value(4.0), OtherCountry(5.0)]),
            ]
        );

        // BYZ forms ROM in 1500 and TRE takes BYZ in 1550: BYZ names two
        // countries, so none of its values counts as the row's.
        let taken = vec![
            saved(
                "a",
                (1444, 11, 11),
                &[(1, 10.0, Some("BYZ"), None), (2, 3.0, Some("TRE"), None)],
                vec![],
            ),
            saved(
                "c",
                (1600, 1, 1),
                &[(1, 20.0, Some("ROM"), None), (2, 5.0, Some("BYZ"), None)],
                vec![
                    switch("BYZ", "ROM", 15000101),
                    switch("TRE", "BYZ", 15500101),
                ],
            ),
        ];
        assert_eq!(
            run(taken, &["BYZ", "ROM", "TRE"]),
            [
                (tag("BYZ"), vec![OtherCountry(10.0), OtherCountry(5.0)]),
                (tag("ROM"), vec![NoProvinces, Value(20.0)]),
                (tag("TRE"), vec![Value(3.0), NoProvinces]),
            ]
        );
        assert_eq!(
            serde_json::to_value(GameDate(15500101)).unwrap(),
            serde_json::json!("1550-01-01")
        );
        serde_json::from_value::<GameDate>(serde_json::json!("1550-13-01")).unwrap_err();
    }
}
