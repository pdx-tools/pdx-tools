//! Compact province and country observations of one save for campaign
//! analysis.

use crate::lineage::{GameDate, HeldTag, Lineage, LineageKind, TagSwitch, lineages, tag_switches};
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
    query::Query,
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
    /// The countries that the save says have been played, now or before:
    /// its player list and the countries it marks as played. Sorted.
    pub played: Vec<CountryTag>,
    /// The countries a person was playing when the save was made, by its
    /// human flags. Sorted. In multiplayer only who was connected then.
    pub connected: Vec<CountryTag>,
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
        out.serde(&self.played);
        out.serde(&self.connected);
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
        let played = input.serde()?;
        let connected = input.serde()?;
        Ok(Self {
            provinces,
            countries,
            religions,
            country_religions,
            switches,
            played,
            connected,
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
/// The countries a save says have been played: its player list, which pairs
/// each player with a country, and the countries marked as played now or
/// before. Sorted, each once.
fn played_countries(save: &eu4save::models::Eu4Save) -> Vec<CountryTag> {
    let listed = save
        .game
        .players_countries
        .chunks(2)
        .filter_map(|pair| pair.get(1)?.parse::<CountryTag>().ok());
    let marked = save
        .game
        .countries
        .iter()
        .filter(|(_, country)| country.human || country.was_player)
        .map(|(tag, _)| *tag);
    listed
        .chain(marked)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

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
            switches: tag_switches(save),
            played: played_countries(save),
            connected: save
                .game
                .countries
                .iter()
                .filter(|(_, country)| country.human)
                .map(|(tag, _)| *tag)
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect(),
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

/// The value of a lineage in one snapshot, with the tag it held then.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LineageCell {
    Value {
        tag: CountryTag,
        /// The index of the tag in the lineage's tags.
        held: usize,
        value: f64,
    },
    /// The country owns provinces, but the save has no record of it.
    NoRecord { tag: CountryTag, held: usize },
}

/// One country over time and its value in each snapshot of the reply. A
/// snapshot where it did not exist or owned no province has none.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct LineageValues {
    pub lineage: Lineage,
    pub values: Vec<Option<LineageCell>>,
    /// A snapshot says the country was played, under the tag it held there,
    /// at that save or before. Who was playing at a given save is not known.
    pub played: bool,
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
        /// The lineages that hold the tags, followed through the tag
        /// switches that the snapshots record, each with a value in some
        /// snapshot. Generated tags ([`is_generated_tag`]) have none.
        CountrySeries { tags: Vec<CountryTag>, metric: CountryMetric } => Vec<LineageValues> = country_series,
        /// One series for each part of a country value on the selected
        /// dates, by name. A part is zero on a date where the country exists
        /// without it, and a gap where the country does not exist.
        CountryBreakdown { tag: CountryTag, dimension: CountryDimension } => Vec<Series<String>> = country_breakdown,
        /// The countries that each snapshot says have been played, in date
        /// order: its player list and the countries marked as played.
        PlayedCountries => Vec<Vec<CountryTag>> = played_by_snapshot,
    }
}

pub fn played_by_snapshot(view: &View<'_, Eu4Analysis>) -> Vec<Vec<CountryTag>> {
    view.snapshots()
        .iter()
        .map(|snapshot| snapshot.payload().played.clone())
        .collect()
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

/// Every tag switch that the snapshots record.
fn campaign_switches(view: &View<'_, Eu4Analysis>) -> Vec<TagSwitch> {
    view.snapshots()
        .iter()
        .flat_map(|snapshot| &snapshot.payload().switches)
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub fn country_series(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    metric: CountryMetric,
) -> Vec<LineageValues> {
    let switches = campaign_switches(view);
    // The game reuses a generated tag without a switch, so it is followed by no lineage.
    let found = lineages(tags, &switches, |tag| !is_generated_tag(tag));
    let developments: Vec<_> = view
        .snapshots()
        .iter()
        .map(|snapshot| snapshot.payload().province_development_by_country())
        .collect();
    found
        .into_iter()
        .map(|lineage| {
            let values = view
                .snapshots()
                .iter()
                .zip(&developments)
                .map(|(snapshot, development)| {
                    let date = GameDate::from_date_sort(snapshot.descriptor().date_sort);
                    let payload = snapshot.payload();
                    let (held, &HeldTag { tag, .. }) = lineage.held_in(date, &payload.switches)?;
                    let row = payload.country_offset(&tag)?;
                    let owned = development[row]?;
                    let columns = payload.countries.columns();
                    let value = match metric {
                        CountryMetric::ProvinceDevelopment => Some(owned),
                        CountryMetric::MaxManpower => {
                            columns.max_manpower.get(row).flatten().map(f64::from)
                        }
                        CountryMetric::ArmySize => {
                            columns.army_size.get(row).flatten().map(f64::from)
                        }
                    };
                    Some(match value {
                        Some(value) => LineageCell::Value { tag, held, value },
                        None => LineageCell::NoRecord { tag, held },
                    })
                })
                .collect::<Vec<_>>();
            let played = view
                .snapshots()
                .iter()
                .zip(&values)
                .any(|(snapshot, cell)| {
                    let tag = match cell {
                        Some(
                            LineageCell::Value { tag, .. } | LineageCell::NoRecord { tag, .. },
                        ) => tag,
                        None => return false,
                    };
                    snapshot.payload().played.binary_search(tag).is_ok()
                });
            LineageValues {
                lineage,
                values,
                played,
            }
        })
        // A tag whose holders cannot be told apart stays, so the chart can say so.
        .filter(|x| {
            x.lineage.kind() == LineageKind::Ambiguous || x.values.iter().any(Option::is_some)
        })
        .collect()
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

/// The countries of a campaign chart. The country series follows each one
/// through its tag switches.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct ChartCountries {
    /// Sorted and distinct.
    pub tags: Vec<CountryTag>,
    /// Generated tags that the filter chose, which the chart leaves out.
    pub left_out: Vec<CountryTag>,
}

/// The chosen tags, with generated tags left out and listed.
pub fn chart_countries(chosen: impl IntoIterator<Item = CountryTag>) -> ChartCountries {
    let (left_out, tags): (BTreeSet<_>, BTreeSet<_>) =
        chosen.into_iter().partition(is_generated_tag);
    ChartCountries {
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
            played: Vec::new(),
            connected: Vec::new(),
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

    /// A cell as its tag and value; no record is NaN.
    type Cell = Option<(String, f64)>;

    /// Each lineage as its tags, and its cells.
    fn histories(series: Vec<LineageValues>) -> Vec<(String, Vec<Cell>)> {
        let mut result: Vec<_> = series
            .into_iter()
            .map(|x| {
                let name = x
                    .lineage
                    .tags()
                    .iter()
                    .map(|held| held.tag.to_string())
                    .collect::<Vec<_>>()
                    .join(">");
                let cells = x
                    .values
                    .into_iter()
                    .map(|cell| match cell? {
                        LineageCell::Value { tag, value, .. } => Some((tag.to_string(), value)),
                        LineageCell::NoRecord { tag, .. } => Some((tag.to_string(), f64::NAN)),
                    })
                    .collect();
                (name, cells)
            })
            .collect();
        result.sort_by(|a, b| a.0.cmp(&b.0));
        result
    }

    fn cell(tag: &str, value: f64) -> Cell {
        Some((tag.to_owned(), value))
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
        // SWE is alive in 1600 but owns no province, so it has no value and no lineage.
        let tags = ["FRA", "ENG", "SWE"];
        assert_eq!(
            run(CountryMetric::ProvinceDevelopment, &tags),
            [
                (
                    "ENG".into(),
                    vec![cell("ENG", 60.0), cell("ENG", 12.0), None]
                ),
                (
                    "FRA".into(),
                    vec![None, cell("FRA", 31.0), cell("FRA", 40.0)]
                ),
            ]
        );
        assert_eq!(
            run(CountryMetric::MaxManpower, &tags),
            [
                (
                    "ENG".into(),
                    vec![cell("ENG", 10.0), cell("ENG", 10.0), None]
                ),
                (
                    "FRA".into(),
                    vec![None, cell("FRA", 20.0), cell("FRA", 10.0)]
                ),
            ]
        );
        assert_eq!(
            run(CountryMetric::ArmySize, &tags[..2]),
            [
                ("ENG".into(), vec![cell("ENG", 1.0), cell("ENG", 1.0), None]),
                ("FRA".into(), vec![None, cell("FRA", 2.0), cell("FRA", 1.0)]),
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
        let found = run(CountryMetric::MaxManpower);
        assert_eq!(found.len(), 1);
        assert!(found[0].1[0].as_ref().unwrap().1.is_nan());
        assert_eq!(
            run(CountryMetric::ProvinceDevelopment),
            [("ENG".into(), vec![cell("ENG", 5.0)])]
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
    fn a_chart_leaves_out_generated_tags() {
        let chart = chart_countries([tag("GER"), tag("C02"), tag("ENG"), tag("D01")]);
        assert_eq!(chart.tags, ["D01", "ENG", "GER"].map(tag));
        assert_eq!(chart.left_out, [tag("C02")]);
    }

    #[test]
    fn a_series_follows_each_country_through_its_tags() {
        // A country's switch, the first one of its history.
        let switch = |from: &str, to: &str, year: i32| TagSwitch {
            from: tag(from),
            to: tag(to),
            date: GameDate::from_date_sort(year * 10000 + 101),
            country: tag(from),
            country_since: GameDate::from_date_sort(year * 10000 + 101),
            order: 0,
            copy: 0,
            joins: true,
        };
        // A later switch of the country whose first switch is `first`.
        let then = |first: TagSwitch, order: u16, from: &str, to: &str, year: i32| TagSwitch {
            country: first.country,
            country_since: first.country_since,
            order,
            ..switch(from, to, year)
        };
        // Each snapshot carries the switches that its save records.
        let saved = |hash, year, provinces: &[Spec], switches: Vec<TagSwitch>| {
            let observation = observation(hash, (year, 1, 1), provinces);
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
        let p = |tag: &'static str, development: f32| -> Spec { (1, development, Some(tag), None) };
        let q = |tag: &'static str, development: f32| -> Spec { (2, development, Some(tag), None) };

        // A simple switch, recorded only in the later save: ALO becomes NBI.
        let simple = vec![
            saved("a", 1445, &[p("ALO", 21.0)], vec![]),
            saved(
                "b",
                1460,
                &[p("NBI", 55.0)],
                vec![switch("ALO", "NBI", 1451)],
            ),
        ];
        assert_eq!(
            run(simple, &["NBI"]),
            [("ALO>NBI".into(), vec![cell("ALO", 21.0), cell("NBI", 55.0)])]
        );

        // A chain: BRA, then PRU, then GER, by one country. Each save records
        // its past switches.
        let formed = switch("BRA", "PRU", 1525);
        let chain = vec![
            saved("a", 1500, &[p("BRA", 10.0)], vec![]),
            saved("b", 1600, &[p("PRU", 20.0)], vec![formed]),
            saved(
                "c",
                1750,
                &[p("GER", 30.0)],
                vec![formed, then(formed, 1, "PRU", "GER", 1700)],
            ),
        ];
        assert_eq!(
            run(chain, &["GER"]),
            [(
                "BRA>PRU>GER".into(),
                vec![cell("BRA", 10.0), cell("PRU", 20.0), cell("GER", 30.0)]
            )]
        );

        // A tag reused by an unrelated country, before: the first BYZ is
        // annexed and ULM forms BYZ in 1550. After: POL forms PLC in 1519
        // and a new POL appears.
        let reused = vec![
            saved("a", 1444, &[p("BYZ", 10.0), q("ULM", 3.0)], vec![]),
            saved(
                "b",
                1600,
                &[p("BYZ", 20.0), q("POL", 5.0)],
                vec![switch("ULM", "BYZ", 1550), switch("POL", "PLC", 1519)],
            ),
        ];
        let found = run(reused, &["BYZ", "POL"]);
        assert_eq!(
            found,
            [
                ("BYZ".into(), vec![cell("BYZ", 10.0), None]),
                ("POL".into(), vec![None, cell("POL", 5.0)]),
                ("ULM>BYZ".into(), vec![cell("ULM", 3.0), cell("BYZ", 20.0)]),
            ]
        );

        // Two holders that cannot be told apart: two switches into BYZ on
        // one date. BYZ is one flagged lineage and joins neither.
        let unclear = vec![
            saved("a", 1444, &[p("BYZ", 10.0), q("ULM", 3.0)], vec![]),
            saved(
                "b",
                1600,
                &[p("BYZ", 20.0)],
                vec![switch("ULM", "BYZ", 1550), switch("TRE", "BYZ", 1550)],
            ),
        ];
        let mut store = Store::new();
        for snapshot in unclear {
            store.append(snapshot, usize::MAX).unwrap();
        }
        let Eu4Answer::CountrySeries(answer) = answer(
            &store,
            Eu4Query::CountrySeries {
                tags: vec![tag("BYZ"), tag("ULM")],
                metric: CountryMetric::ProvinceDevelopment,
            },
        ) else {
            panic!("country series");
        };
        let byz = answer
            .iter()
            .find(|x| x.lineage.tags()[0].tag == tag("BYZ"))
            .unwrap();
        assert_eq!(byz.lineage.kind(), LineageKind::Ambiguous);
        assert_eq!(byz.lineage.tags().len(), 1);
        assert_eq!(
            histories(answer),
            [
                // Two countries took BYZ on one day: its values are not shown.
                ("BYZ".into(), vec![None, None]),
                ("ULM".into(), vec![cell("ULM", 3.0), None]),
            ]
        );

        // The first BYZ lives in 1500. After it is gone, ULM forms BYZ and
        // that country forms ROM on one day. Its history orders the two
        // switches, so it is one country through ULM, BYZ and ROM. The 1600
        // save lacks the second switch of that day, so it can be from before
        // it and gives nothing.
        let first = switch("ULM", "BYZ", 1600);
        let one_day = [first, then(first, 1, "BYZ", "ROM", 1600)];
        let same_day = vec![
            saved("a", 1500, &[p("BYZ", 10.0)], vec![]),
            saved("b", 1600, &[p("BYZ", 20.0)], vec![one_day[0]]),
            saved("c", 1610, &[p("ROM", 30.0)], one_day.to_vec()),
        ];
        assert_eq!(
            run(same_day, &["BYZ", "ULM", "ROM"]),
            [
                ("BYZ".into(), vec![cell("BYZ", 10.0), None, None]),
                ("ULM>BYZ>ROM".into(), vec![None, None, cell("ROM", 30.0)]),
            ]
        );

        // A save that lists ALO as played marks the whole country as played.
        let first = saved("a", 1445, &[p("ALO", 21.0), q("FRA", 5.0)], vec![]);
        let first = {
            let mut payload = first.payload().clone();
            payload.played = vec![tag("ALO")];
            Observation::new(first.descriptor.clone(), Eu4Detail {}, payload).unwrap()
        };
        let mut store = Store::new();
        store.append(first, usize::MAX).unwrap();
        store
            .append(
                saved(
                    "b",
                    1460,
                    &[p("NBI", 55.0)],
                    vec![switch("ALO", "NBI", 1451)],
                ),
                usize::MAX,
            )
            .unwrap();
        let Eu4Answer::CountrySeries(played) = super::tests::answer(
            &store,
            Eu4Query::CountrySeries {
                tags: vec![tag("NBI"), tag("FRA")],
                metric: CountryMetric::ProvinceDevelopment,
            },
        ) else {
            panic!("country series");
        };
        let played: Vec<_> = played
            .iter()
            .map(|x| (x.lineage.tags().last().unwrap().tag.to_string(), x.played))
            .collect();
        assert!(played.contains(&("NBI".to_string(), true)));
        assert!(played.contains(&("FRA".to_string(), false)));
        let Eu4Answer::PlayedCountries(by_save) =
            super::tests::answer(&store, Eu4Query::PlayedCountries)
        else {
            panic!("played countries");
        };
        assert_eq!(by_save, [vec![tag("ALO")], vec![]]);

        // Two countries switch into BYZ on one day: whose BYZ it is cannot
        // be told, so BYZ has no values.
        let two_countries = vec![
            saved("a", 1500, &[p("BYZ", 10.0)], vec![]),
            saved(
                "b",
                1610,
                &[p("BYZ", 30.0)],
                vec![switch("ULM", "BYZ", 1600), switch("TRE", "BYZ", 1600)],
            ),
        ];
        assert_eq!(
            run(two_countries, &["BYZ"]),
            [("BYZ".into(), vec![None, None])]
        );

        // Two branches of one campaign: in one ULM forms BYZ in 1550, in the
        // other the first BYZ lives on. The other branch's later save lacks
        // the switch, so neither its BYZ nor its ULM gets a row's value.
        let forked = vec![
            saved("a", 1500, &[p("BYZ", 10.0), q("ULM", 3.0)], vec![]),
            saved(
                "b",
                1560,
                &[p("BYZ", 20.0)],
                vec![switch("ULM", "BYZ", 1550)],
            ),
            saved("c", 1580, &[p("BYZ", 12.0), q("ULM", 4.0)], vec![]),
        ];
        assert_eq!(
            run(forked, &["BYZ", "ULM"]),
            [
                ("BYZ".into(), vec![cell("BYZ", 10.0), None, None]),
                (
                    "ULM>BYZ".into(),
                    vec![cell("ULM", 3.0), cell("BYZ", 20.0), None]
                ),
            ]
        );

        // Two branches where each holds a switch of the other's tags: in one
        // the first BYZ forms ROM in 1600, in the other ULM forms BYZ in 1550.
        // Together they show BYZ taken by ULM and left by the first BYZ: two
        // countries held it in turn, so that holding has no values and joins
        // nothing. Rome is its own row, never put after Ulm.
        let crossed = vec![
            saved("a", 1500, &[p("BYZ", 10.0), q("ULM", 3.0)], vec![]),
            saved(
                "b",
                1560,
                &[p("BYZ", 20.0)],
                vec![switch("ULM", "BYZ", 1550)],
            ),
            saved(
                "c",
                1650,
                &[p("ROM", 30.0)],
                vec![switch("BYZ", "ROM", 1600)],
            ),
        ];
        assert_eq!(
            run(crossed, &["BYZ", "ULM", "ROM"]),
            [
                ("BYZ".into(), vec![cell("BYZ", 10.0), None, None]),
                ("BYZ".into(), vec![None, None, None]),
                ("ROM".into(), vec![None, None, cell("ROM", 30.0)]),
                ("ULM".into(), vec![cell("ULM", 3.0), None, None]),
            ]
        );

        // A colonial nation forms BYZ after the first BYZ is gone. The
        // switch is not followed, but the two holders of BYZ stay apart.
        // A later save of the same branch keeps the value, even when it no
        // longer records a switch of the first BYZ.
        let colonial = vec![
            saved(
                "a",
                1500,
                &[p("BYZ", 10.0)],
                vec![switch("GRE", "BYZ", 1450)],
            ),
            saved(
                "b",
                1720,
                &[p("BYZ", 25.0)],
                vec![switch("GRE", "BYZ", 1450), switch("C01", "BYZ", 1700)],
            ),
            saved(
                "c",
                1800,
                &[p("BYZ", 40.0)],
                vec![switch("C01", "BYZ", 1700)],
            ),
        ];
        assert_eq!(
            run(colonial, &["BYZ"]),
            [
                (
                    "BYZ".into(),
                    vec![None, cell("BYZ", 25.0), cell("BYZ", 40.0)]
                ),
                ("GRE>BYZ".into(), vec![cell("BYZ", 10.0), None, None]),
            ]
        );
    }
}
