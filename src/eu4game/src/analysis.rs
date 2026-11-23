//! Compact province and country observations of one save for campaign
//! analysis.

use crate::lineage::{GameDate, HeldTag, Lineage, LineageKind, TagSwitch, lineages, tag_switches};
use crate::shared::playthrough_id;
use campaign_analysis::{
    AnalysisError, BoundSelectionRows, Columns, DecodeError, Decoder, Encoder, Game, History,
    IndexRegistry, NullableColumn, Observation, PayloadError, PrefixKey, Prefixed, ReferenceError,
    RowSelect, Series, SnapshotDescriptor, SnapshotSource, Table, TableError, TextRegistry,
    TextRow, Texts, View, check_length,
};
use eu4save::{
    CountryTag, ProvinceId,
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
    /// The game's development less autonomy, as Country Details shows it.
    pub autonomy_development: NullableColumn<f32>,
}
campaign_analysis::columns!(rows CountryColumns, "countries" { max_manpower, army_size, autonomy_development });

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

/// A rival of a country on the save date, by the tag it held then.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CountryRival {
    pub tag: CountryTag,
    pub rival: CountryTag,
}
impl PrefixKey for CountryRival {
    type Prefix = CountryTag;
    fn prefix(&self) -> &CountryTag {
        &self.tag
    }
}

/// Where each rival stands in its country's list, as the game orders it.
#[derive(Debug, Clone, PartialEq)]
pub struct CountryRivalColumns {
    pub order: Vec<u8>,
}
campaign_analysis::columns!(rows CountryRivalColumns, "country_rivals" { order });

/// The development of the owned provinces of each religion of a country.
#[derive(Debug, Clone, PartialEq)]
pub struct CountryReligionColumns {
    pub development: Vec<f32>,
}
campaign_analysis::columns!(rows CountryReligionColumns, "country_religions" { development });

/// A kind of monarch power.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ManaType {
    Adm,
    Dip,
    Mil,
}

/// What mana was spent on, grouped from the save's spend categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum ManaUse {
    Tech,
    Ideas,
    Stability,
    Develop,
    Cores,
    /// Unjustified demands, harsh treatment, war exhaustion and war taxes.
    Peace,
    /// Buying and creating leaders, and army, fleet and colony actions.
    Leaders,
    /// Every other action, unknown categories too.
    Other,
}

/// The number of uses, in the order of [`ManaUse`].
pub const MANA_USES: usize = 8;

/// The use of a spend category of a save of game version 1.`minor`, as
/// eu4save's `mana_spent_indexed` names them. Only counters that never go
/// down are spend. The game keeps one unnamed signed counter that is not
/// spend: 38 up to 1.30, 37 in 1.31 to 1.34 and 36 from 1.35, as earlier
/// actions were removed. From 1.35, artillery barrage (37) can go down too.
/// Neither has a use. Categories from 50 on fold into 50, as eu4save folds
/// them.
pub fn mana_use(minor: u16, index: i32) -> Option<ManaUse> {
    use ManaUse::*;
    // A negative index folds into 50 too, as eu4save's `as usize` cast sends it there.
    let index = if index < 0 { 50 } else { index.min(50) };
    let common = match index {
        0 => Some(Ideas),
        1 => Some(Tech),
        2 => Some(Stability),
        7 => Some(Develop),
        17 => Some(Cores),
        // Unjustified demands, harsh treatment, war exhaustion, war taxes.
        14 | 21 | 22 | 24 => Some(Peace),
        // Leaders, force march, assault, colonies and natives, scorched earth.
        3..=6 | 8..=13 => Some(Leaders),
        _ => None,
    };
    if let Some(found) = common {
        return Some(found);
    }
    if minor >= 35 {
        return match index {
            36 | 37 => None,
            // Siege sorties, naval barrage, force march, create leader.
            30 | 40 | 43 | 44 => Some(Leaders),
            _ => Some(Other),
        };
    }
    // Before 1.35, 1.31 to 1.34 dropped native advancement at 25.
    let offset = i32::from(minor >= 31);
    if index == 38 - offset {
        return None;
    }
    // Siege sorties, artillery and naval barrage, force march, create leader.
    let leaders = [31 - offset, 39 - offset, 43 - offset, 45, 46];
    Some(if leaders.contains(&index) {
        Leaders
    } else {
        Other
    })
}

/// The mana of the countries that a snapshot carries: played countries, their
/// rivals, and those with 50 or more owned development. All values are whole points.
/// One column each compresses smaller than rows of arrays.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CountryManaColumns {
    /// The pools on the save date. A pool can be negative, and above 999.
    pub pool_adm: Vec<i32>,
    pub pool_dip: Vec<i32>,
    pub pool_mil: Vec<i32>,
    /// The spend since 1444 of each type on each use.
    pub adm_tech: Vec<i32>,
    pub adm_ideas: Vec<i32>,
    pub adm_stability: Vec<i32>,
    pub adm_develop: Vec<i32>,
    pub adm_cores: Vec<i32>,
    pub adm_peace: Vec<i32>,
    pub adm_leaders: Vec<i32>,
    pub adm_other: Vec<i32>,
    pub dip_tech: Vec<i32>,
    pub dip_ideas: Vec<i32>,
    pub dip_stability: Vec<i32>,
    pub dip_develop: Vec<i32>,
    pub dip_cores: Vec<i32>,
    pub dip_peace: Vec<i32>,
    pub dip_leaders: Vec<i32>,
    pub dip_other: Vec<i32>,
    pub mil_tech: Vec<i32>,
    pub mil_ideas: Vec<i32>,
    pub mil_stability: Vec<i32>,
    pub mil_develop: Vec<i32>,
    pub mil_cores: Vec<i32>,
    pub mil_peace: Vec<i32>,
    pub mil_leaders: Vec<i32>,
    pub mil_other: Vec<i32>,
}
campaign_analysis::columns!(rows CountryManaColumns, "country_mana" {
    pool_adm,
    pool_dip,
    pool_mil,
    adm_tech,
    adm_ideas,
    adm_stability,
    adm_develop,
    adm_cores,
    adm_peace,
    adm_leaders,
    adm_other,
    dip_tech,
    dip_ideas,
    dip_stability,
    dip_develop,
    dip_cores,
    dip_peace,
    dip_leaders,
    dip_other,
    mil_tech,
    mil_ideas,
    mil_stability,
    mil_develop,
    mil_cores,
    mil_peace,
    mil_leaders,
    mil_other,
});

/// Each type's spend columns, in [`ManaUse`] order: the one list of them.
macro_rules! spend_fields {
    ($columns:expr, $ty:expr, $($borrow:tt)+) => {
        match $ty {
            ManaType::Adm => [
                $($borrow)+ $columns.adm_tech,
                $($borrow)+ $columns.adm_ideas,
                $($borrow)+ $columns.adm_stability,
                $($borrow)+ $columns.adm_develop,
                $($borrow)+ $columns.adm_cores,
                $($borrow)+ $columns.adm_peace,
                $($borrow)+ $columns.adm_leaders,
                $($borrow)+ $columns.adm_other,
            ],
            ManaType::Dip => [
                $($borrow)+ $columns.dip_tech,
                $($borrow)+ $columns.dip_ideas,
                $($borrow)+ $columns.dip_stability,
                $($borrow)+ $columns.dip_develop,
                $($borrow)+ $columns.dip_cores,
                $($borrow)+ $columns.dip_peace,
                $($borrow)+ $columns.dip_leaders,
                $($borrow)+ $columns.dip_other,
            ],
            ManaType::Mil => [
                $($borrow)+ $columns.mil_tech,
                $($borrow)+ $columns.mil_ideas,
                $($borrow)+ $columns.mil_stability,
                $($borrow)+ $columns.mil_develop,
                $($borrow)+ $columns.mil_cores,
                $($borrow)+ $columns.mil_peace,
                $($borrow)+ $columns.mil_leaders,
                $($borrow)+ $columns.mil_other,
            ],
        }
    };
}

impl CountryManaColumns {
    /// The pool of a row of one type.
    pub fn pool(&self, row: usize, ty: ManaType) -> i32 {
        match ty {
            ManaType::Adm => self.pool_adm[row],
            ManaType::Dip => self.pool_dip[row],
            ManaType::Mil => self.pool_mil[row],
        }
    }

    /// The columns of one type's spend, in [`ManaUse`] order.
    fn spend_columns(&mut self, ty: ManaType) -> [&mut Vec<i32>; MANA_USES] {
        spend_fields!(self, ty, &mut)
    }

    /// The spend of a row of one type, by use.
    pub fn spent(&self, row: usize, ty: ManaType) -> [i32; MANA_USES] {
        let columns: [&Vec<i32>; MANA_USES] = spend_fields!(self, ty, &);
        columns.map(|column| column[row])
    }

    /// Add a row: the pools and each type's spend by use.
    pub fn push(&mut self, pools: [i32; 3], spent: [[i32; MANA_USES]; 3]) {
        self.pool_adm.push(pools[0]);
        self.pool_dip.push(pools[1]);
        self.pool_mil.push(pools[2]);
        for (ty, uses) in [ManaType::Adm, ManaType::Dip, ManaType::Mil]
            .into_iter()
            .zip(spent)
        {
            for (column, value) in self.spend_columns(ty).into_iter().zip(uses) {
                column.push(value);
            }
        }
    }
}

/// A country's spend since 1444 by use, from the save's spend categories.
pub fn grouped_spend(minor: u16, spent: &[(i32, i32)]) -> [i32; MANA_USES] {
    let mut uses = [0; MANA_USES];
    for &(index, amount) in spent {
        if let Some(found) = mana_use(minor, index) {
            uses[found as usize] += amount;
        }
    }
    uses
}

/// Owned development at or above this carries a country's mana.
const MANA_DEVELOPMENT: f64 = 50.0;

#[derive(Debug, Clone, PartialEq)]
pub struct Eu4Payload {
    pub provinces: Table<ProvinceId, ProvinceColumns>,
    pub countries: Table<CountryTag, CountryColumns>,
    pub religions: Texts,
    pub country_religions: Table<CountryReligion, CountryReligionColumns, Prefixed>,
    /// Sorted by tag. Each key has a country row.
    pub country_mana: Table<CountryTag, CountryManaColumns>,
    /// Each country row's rivals on the save date.
    pub rivals: Table<CountryRival, CountryRivalColumns, Prefixed>,
    /// The tag switches that the save records, in date order.
    pub switches: Vec<TagSwitch>,
    /// The countries that the save marks as played, now or before, on their
    /// own records. Sorted.
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
        self.country_mana
            .encode_with(out, |keys, out| encode_tags(keys.iter(), out));
        self.rivals.encode_with(out, |keys, out| {
            encode_tags(keys.iter().map(|key| &key.tag), out);
            encode_tags(keys.iter().map(|key| &key.rival), out);
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
        let country_mana = Table::decode_sorted_with(input, decode_tags)?;
        let rivals = Table::decode_sorted_prefix_with(input, |input| {
            let tags = decode_tags(input)?;
            let rivals = decode_tags(input)?;
            check_length(rivals.len(), tags.len()).map_err(DecodeError::Column)?;
            Ok(tags
                .into_iter()
                .zip(rivals)
                .map(|(tag, rival)| CountryRival { tag, rival })
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
            country_mana,
            rivals,
            switches,
            played,
            connected,
        })
    }
    /// Keys and switches local to the snapshot count here.
    fn heap_bytes(&self) -> usize {
        self.provinces.columns().heap_bytes()
            + self.countries.columns().heap_bytes()
            + self.religions.heap_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().heap_bytes()
            + size_of_val(self.country_mana.keys())
            + self.country_mana.columns().heap_bytes()
            + size_of_val(self.switches.as_slice())
            + size_of_val(self.rivals.keys())
            + self.rivals.columns().heap_bytes()
    }
    fn allocated_bytes(&self) -> usize {
        self.provinces.columns().allocated_bytes()
            + self.countries.columns().allocated_bytes()
            + self.religions.allocated_bytes()
            + size_of_val(self.country_religions.keys())
            + self.country_religions.columns().allocated_bytes()
            + size_of_val(self.country_mana.keys())
            + self.country_mana.columns().allocated_bytes()
            + self.switches.capacity() * size_of::<TagSwitch>()
            + size_of_val(self.rivals.keys())
            + self.rivals.columns().allocated_bytes()
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

    /// The rivals of a country, in the game's order.
    pub fn rivals_of(&self, tag: &CountryTag) -> Vec<CountryTag> {
        let rows = self.rivals.prefix_range(tag);
        let mut rivals: Vec<_> = rows.keys().iter().zip(rows.values(|c| &c.order)).collect();
        rivals.sort_by_key(|(_, order)| **order);
        rivals.into_iter().map(|(key, _)| key.rival).collect()
    }

    /// The row of a country in the mana table, when the snapshot carries it.
    pub fn mana_row(&self, tag: &CountryTag) -> Option<usize> {
        self.country_mana.keys().binary_search(tag).ok()
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
/// The countries a save marks as played, now or before, on their own
/// records. The save's player list is left out: it can keep a tag that a
/// player once held and another country holds now. Sorted, each once.
fn played_countries(save: &eu4save::models::Eu4Save) -> Vec<CountryTag> {
    save.game
        .countries
        .iter()
        .filter(|(_, country)| country.human || country.was_player)
        .map(|(tag, _)| *tag)
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
        autonomy_development: records
            .iter()
            .map(|country| country.map(|country| country.development))
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

    let played = played_countries(save);
    let rivals = country_rivals(query, &tags)?;
    let country_mana = country_mana(query, &tags, &owner, &development, &played, &rivals)?;

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
            date,
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
            country_mana,
            rivals,
            switches: tag_switches(save),
            played,
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

/// Each country row's rivals, as the save records them.
fn country_rivals(
    query: &Query,
    tags: &[CountryTag],
) -> Result<Table<CountryRival, CountryRivalColumns, Prefixed>, TableError> {
    let mut rivals: Vec<_> = tags
        .iter()
        .filter_map(|tag| Some((tag, query.country(tag)?)))
        .flat_map(|(tag, country)| {
            country.rivals.iter().enumerate().map(|(order, rival)| {
                let key = CountryRival {
                    tag: *tag,
                    rival: rival.country,
                };
                (key, u8::try_from(order).unwrap_or(u8::MAX))
            })
        })
        .collect();
    rivals.sort_unstable_by_key(|(key, _)| *key);
    rivals.dedup_by_key(|(key, _)| *key);
    let (keys, order) = rivals.into_iter().unzip();
    Table::sorted_prefix(keys, CountryRivalColumns { order })
}

/// The mana of the played countries, their rivals, and of those with 50 or
/// more owned development, as the province list totals it. `tags` are the country rows,
/// and `owner` and `development` the province columns.
fn country_mana(
    query: &Query,
    tags: &[CountryTag],
    owner: &[CountryRow],
    development: &[f32],
    played: &[CountryTag],
    rivals: &Table<CountryRival, CountryRivalColumns, Prefixed>,
) -> Result<Table<CountryTag, CountryManaColumns>, TableError> {
    // A played country's rivals are carried too, so it can be set beside them.
    let rivals_of_played: BTreeSet<_> = rivals
        .keys()
        .iter()
        .filter(|key| played.binary_search(&key.tag).is_ok())
        .map(|key| key.rival)
        .collect();
    let mut owned = vec![0.0; tags.len()];
    for (row, value) in owner.iter().zip(development) {
        if let Some(row) = row.get() {
            owned[row] += f64::from(*value);
        }
    }
    let minor = query.save().meta.savegame_version.second;
    let mut keys = Vec::new();
    let mut columns = CountryManaColumns::default();
    for (tag, owned) in tags.iter().zip(owned) {
        let carried = owned >= MANA_DEVELOPMENT
            || played.binary_search(tag).is_ok()
            || rivals_of_played.contains(tag);
        let Some(country) = query.country(tag).filter(|_| carried) else {
            continue;
        };
        keys.push(*tag);
        columns.push(
            country.powers,
            [
                grouped_spend(minor, &country.adm_spent_indexed),
                grouped_spend(minor, &country.dip_spent_indexed),
                grouped_spend(minor, &country.mil_spent_indexed),
            ],
        );
    }
    Table::sorted(keys, columns)
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
    const BRANCHES: bool = true;
    type Detail = Eu4Detail;
    type Payload = Eu4Payload;
    type Shared = Eu4Shared;
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
            || [
                &countries.max_manpower,
                &countries.army_size,
                &countries.autonomy_development,
            ]
            .iter()
            .any(|column| column.iter().flatten().any(|x| !x.is_finite()))
        {
            return Err(PayloadError::NonFinite);
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
        if let Some(tag) = payload
            .country_mana
            .keys()
            .iter()
            .find(|tag| payload.country_offset(tag).is_none())
        {
            return Err(PayloadError::Invalid(format!(
                "Country mana of {tag} has no country row"
            )));
        }
        if let Some(key) = payload
            .rivals
            .keys()
            .iter()
            .find(|key| payload.country_offset(&key.tag).is_none())
        {
            return Err(PayloadError::Invalid(format!(
                "Rivals of {} have no country row",
                key.tag
            )));
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
    /// The game's development less autonomy, as Country Details shows it.
    AutonomyDevelopment,
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
        /// The autonomy-adjusted development of every country that owns a
        /// province, on each date.
        WorldAutonomyDevelopment => History = world_autonomy_development,
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
        /// The countries that each snapshot marks as played, now or before,
        /// in date order.
        PlayedCountries => Vec<Vec<CountryTag>> = played_by_snapshot,
        /// A mana figure of the lineages that hold the tags, as
        /// `CountrySeries` follows them.
        ManaSeries { tags: Vec<CountryTag>, figure: ManaFigure } => Vec<LineageValues> = mana_series,
        /// The spend by use of the lineages that hold the tags.
        ManaUses { tags: Vec<CountryTag>, types: Vec<ManaType> } => Vec<LineageUses> = mana_uses,
        /// The rivals of the lineages that hold the tags on each date, by the
        /// tags the rivals held then.
        Rivals { tags: Vec<CountryTag> } => Vec<LineageRivals> = lineage_rivals,
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

pub fn world_autonomy_development(view: &View<'_, Eu4Analysis>) -> History {
    view.series(|snapshot| {
        let payload = snapshot.payload();
        let adjusted = &payload.countries.columns().autonomy_development;
        let total = payload
            .province_development_by_country()
            .iter()
            .zip(adjusted.iter())
            .filter(|(owned, _)| owned.is_some())
            .filter_map(|(_, value)| value.map(f64::from))
            .sum();
        Some(total)
    })
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

/// A lineage with the value of each snapshot, the tag and held index with it.
struct Followed<T> {
    lineage: Lineage,
    values: Vec<Option<(CountryTag, usize, T)>>,
    played: bool,
}

/// The lineages of the tags, each with a value of each snapshot from `value`:
/// given the snapshot's index, its payload and the tag the lineage held there.
/// A lineage without any value is left out, unless its tag's holders cannot
/// be told apart, so the chart can say so.
fn follow<T>(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    mut value: impl FnMut(usize, &Eu4Payload, CountryTag) -> Option<T>,
) -> Vec<Followed<T>> {
    let switches = campaign_switches(view);
    // The game reuses a generated tag without a switch, so it is followed by no lineage.
    let found = lineages(tags, &switches, |tag| !is_generated_tag(tag));
    found
        .into_iter()
        .map(|lineage| {
            let values = view
                .snapshots()
                .iter()
                .enumerate()
                .map(|(i, snapshot)| {
                    let date = GameDate::from_date_sort(snapshot.descriptor().date_sort);
                    let payload = snapshot.payload();
                    let (held, &HeldTag { tag, .. }) = lineage.held_in(date, &payload.switches)?;
                    Some((tag, held, value(i, payload, tag)?))
                })
                .collect::<Vec<_>>();
            // A save that says the tag it held there was played counts, also
            // where the country has no figure, such as after an annexation.
            let played = view.snapshots().iter().any(|snapshot| {
                let date = GameDate::from_date_sort(snapshot.descriptor().date_sort);
                let payload = snapshot.payload();
                lineage
                    .held_in(date, &payload.switches)
                    .is_some_and(|(_, held)| payload.played.binary_search(&held.tag).is_ok())
            });
            Followed {
                lineage,
                values,
                played,
            }
        })
        .filter(|x| {
            x.lineage.kind() == LineageKind::Ambiguous || x.values.iter().any(Option::is_some)
        })
        .collect()
}

pub fn country_series(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    metric: CountryMetric,
) -> Vec<LineageValues> {
    let developments: Vec<_> = view
        .snapshots()
        .iter()
        .map(|snapshot| snapshot.payload().province_development_by_country())
        .collect();
    follow(view, tags, |i, payload, tag| {
        let row = payload.country_offset(&tag)?;
        let owned = developments[i][row]?;
        let columns = payload.countries.columns();
        let stored = |column: &NullableColumn<f32>| column.get(row).flatten().map(f64::from);
        Some(match metric {
            CountryMetric::ProvinceDevelopment => Some(owned),
            CountryMetric::MaxManpower => stored(&columns.max_manpower),
            CountryMetric::ArmySize => stored(&columns.army_size),
            CountryMetric::AutonomyDevelopment => stored(&columns.autonomy_development),
        })
    })
    .into_iter()
    .map(|x| LineageValues {
        lineage: x.lineage,
        values: x
            .values
            .into_iter()
            .map(|cell| {
                cell.map(|(tag, held, value)| match value {
                    Some(value) => LineageCell::Value { tag, held, value },
                    None => LineageCell::NoRecord { tag, held },
                })
            })
            .collect(),
        played: x.played,
    })
    .collect()
}

/// A mana figure of each country on each date.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ManaFigure {
    /// The spend since 1444 of these types on these uses.
    Spent {
        types: Vec<ManaType>,
        uses: Vec<ManaUse>,
    },
    /// The pool of one type on the save date.
    Pool {
        #[serde(rename = "type")]
        ty: ManaType,
    },
}

/// The mana figure of the lineages of the tags. A snapshot that does not
/// carry the country's mana gives no value there.
pub fn mana_series(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    figure: ManaFigure,
) -> Vec<LineageValues> {
    follow(view, tags, |_, payload, tag| {
        let row = payload.mana_row(&tag)?;
        let columns = payload.country_mana.columns();
        Some(match &figure {
            ManaFigure::Spent { types, uses } => types
                .iter()
                .map(|ty| {
                    let spent = columns.spent(row, *ty);
                    uses.iter()
                        .map(|x| f64::from(spent[*x as usize]))
                        .sum::<f64>()
                })
                .sum(),
            ManaFigure::Pool { ty } => f64::from(columns.pool(row, *ty)),
        })
    })
    .into_iter()
    .map(|x| LineageValues {
        lineage: x.lineage,
        values: x
            .values
            .into_iter()
            .map(|cell| cell.map(|(tag, held, value)| LineageCell::Value { tag, held, value }))
            .collect(),
        played: x.played,
    })
    .collect()
}

/// A lineage's rivals in each snapshot, or none where it has no row.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct LineageRivals {
    pub lineage: Lineage,
    pub values: Vec<Option<Vec<CountryTag>>>,
    pub played: bool,
}

/// The rivals of the lineages of the tags. A rival is named by the tag it
/// held on that date; the chart finds its lineage by that tag, so a rival
/// that formed another country is still the same line.
pub fn lineage_rivals(view: &View<'_, Eu4Analysis>, tags: Vec<CountryTag>) -> Vec<LineageRivals> {
    follow(view, tags, |_, payload, tag| {
        payload.country_offset(&tag)?;
        Some(payload.rivals_of(&tag))
    })
    .into_iter()
    .map(|x| LineageRivals {
        lineage: x.lineage,
        values: x
            .values
            .into_iter()
            .map(|cell| cell.map(|(_, _, rivals)| rivals))
            .collect(),
        played: x.played,
    })
    .collect()
}

/// A lineage's spend since 1444 by use in each snapshot, in [`ManaUse`] order.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct LineageUses {
    pub lineage: Lineage,
    pub values: Vec<Option<Vec<f64>>>,
    pub played: bool,
}

/// The spend by use of the types, for the lineages of the tags.
pub fn mana_uses(
    view: &View<'_, Eu4Analysis>,
    tags: Vec<CountryTag>,
    types: Vec<ManaType>,
) -> Vec<LineageUses> {
    follow(view, tags, |_, payload, tag| {
        let row = payload.mana_row(&tag)?;
        let columns = payload.country_mana.columns();
        let mut uses = vec![0.0; MANA_USES];
        for ty in &types {
            for (total, spent) in uses.iter_mut().zip(columns.spent(row, *ty)) {
                *total += f64::from(spent);
            }
        }
        Some(uses)
    })
    .into_iter()
    .map(|x| LineageUses {
        lineage: x.lineage,
        values: x
            .values
            .into_iter()
            .map(|cell| cell.map(|(_, _, uses)| uses))
            .collect(),
        played: x.played,
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
        let rows = payload.country_religions.prefix_range(&tag);
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
        let tags_for_mana = tags.clone();
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
                    autonomy_development: (1..=count).map(|i| Some(0.5 * i as f32)).collect(),
                },
            )
            .unwrap(),
            religions,
            country_religions: Table::sorted_prefix(keys, CountryReligionColumns { development })
                .unwrap(),
            // Each country spends i tech and 2i develop of admin, and banks 10i of each type.
            country_mana: Table::sorted(tags_for_mana, {
                let mut columns = CountryManaColumns::default();
                for i in 1..=count as i32 {
                    let none = [0; MANA_USES];
                    columns.push([10 * i; 3], [[i, 0, 0, 2 * i, 0, 0, 0, 0], none, none]);
                }
                columns
            })
            .unwrap(),
            rivals: Table::sorted_prefix(Vec::new(), CountryRivalColumns { order: Vec::new() })
                .unwrap(),
            switches: Vec::new(),
            played: Vec::new(),
            connected: Vec::new(),
        }
    }

    fn descriptor(hash: &str, date: (i16, u8, u8), layout: String) -> SnapshotDescriptor {
        SnapshotDescriptor::new::<Eu4Analysis>(
            SnapshotSource {
                campaign_id: String::from("campaign"),
                content_hash: String::from(hash),
                date: eu4save::Eu4Date::from_ymd(date.0, date.1, date.2),
                game_version: String::from("1.37.5.0"),
            },
            layout,
        )
    }

    fn observation(
        hash: &str,
        date: (i16, u8, u8),
        provinces: &[Spec],
    ) -> Observation<Eu4Analysis> {
        observation_with(hash, date, provinces, &[])
    }

    fn observation_with(
        hash: &str,
        date: (i16, u8, u8),
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
            Eu4Answer::WorldDevelopment(history)
            | Eu4Answer::WorldAutonomyDevelopment(history)
            | Eu4Answer::ProvinceDevelopment(history) => {
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
    fn world_autonomy_development_counts_only_countries_with_provinces() {
        // ENG, FRA and SCO carry 0.5, 1 and 1.5; SCO owns no province.
        let payload = payload(
            &[(1, 5.0, Some("ENG"), None), (2, 7.0, Some("FRA"), None)],
            &["SCO"],
        );
        let observation = Observation::new(
            descriptor("a", (1444, 11, 11), String::from("[1,2]")),
            Eu4Detail {},
            payload,
        );
        let mut store = Store::new();
        store.append(observation.unwrap(), usize::MAX).unwrap();
        assert_eq!(
            values(&store, Eu4Query::WorldAutonomyDevelopment),
            [Some(1.5)]
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
    fn a_country_without_a_record_has_gaps() {
        let mut payload = payload(&[(1, 5.0, Some("ENG"), None)], &[]);
        payload.countries = Table::sorted(
            vec![tag("ENG")],
            CountryColumns {
                max_manpower: [None].into_iter().collect(),
                army_size: [None].into_iter().collect(),
                autonomy_development: [None].into_iter().collect(),
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
                autonomy_development: [None, None].into_iter().collect(),
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

        // A later save lists FRA as played, though FRA owns nothing there.
        let mut later = Store::new();
        later
            .append(
                saved("a", 1445, &[p("ALO", 21.0), q("FRA", 5.0)], vec![]),
                usize::MAX,
            )
            .unwrap();
        let annexed = saved("b", 1460, &[p("ALO", 30.0)], vec![]);
        let annexed = {
            let mut payload = annexed.payload().clone();
            payload.played = vec![tag("FRA")];
            Observation::new(annexed.descriptor.clone(), Eu4Detail {}, payload).unwrap()
        };
        later.append(annexed, usize::MAX).unwrap();
        let Eu4Answer::CountrySeries(series) = super::tests::answer(
            &later,
            Eu4Query::CountrySeries {
                tags: vec![tag("FRA")],
                metric: CountryMetric::ProvinceDevelopment,
            },
        ) else {
            panic!("country series");
        };
        assert!(series[0].played);
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

    #[test]
    fn saves_of_one_date_on_two_branches_are_kept() {
        let mut store = store();
        let branch = observation("d", (1500, 1, 1), &[(1, 14.0, Some("ENG"), None)]);
        store.append(branch, usize::MAX).unwrap();
        let ids: Vec<_> = store
            .snapshots()
            .iter()
            .map(|x| x.descriptor().id.as_str())
            .collect();
        let id = |hash| campaign_analysis::snapshot_id("eu4", hash);
        assert_eq!(ids, [id("a"), id("b"), id("d"), id("c")]);
    }

    #[test]
    fn mana_series_read_the_carried_countries() {
        let store = store();
        let run = |figure| match answer(
            &store,
            Eu4Query::ManaSeries {
                tags: vec![tag("ENG"), tag("FRA")],
                figure,
            },
        ) {
            Eu4Answer::ManaSeries(answer) => histories(answer),
            other => panic!("{other:?}"),
        };
        // ENG is the first row in 1444 and 1500, FRA the second in 1500 and the first in 1600.
        let spent = ManaFigure::Spent {
            types: vec![ManaType::Adm, ManaType::Dip],
            uses: vec![ManaUse::Tech, ManaUse::Develop],
        };
        assert_eq!(
            run(spent),
            [
                ("ENG".into(), vec![cell("ENG", 3.0), cell("ENG", 3.0), None]),
                ("FRA".into(), vec![None, cell("FRA", 6.0), cell("FRA", 3.0)]),
            ]
        );
        let pool = ManaFigure::Pool { ty: ManaType::Mil };
        assert_eq!(
            run(pool)[0],
            (
                "ENG".into(),
                vec![cell("ENG", 10.0), cell("ENG", 10.0), None]
            )
        );
        let Eu4Answer::ManaUses(uses) = answer(
            &store,
            Eu4Query::ManaUses {
                tags: vec![tag("FRA")],
                types: vec![ManaType::Adm, ManaType::Mil],
            },
        ) else {
            panic!("mana uses");
        };
        assert_eq!(
            uses[0].values,
            [
                None,
                Some(vec![2.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0]),
                Some(vec![1.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0])
            ]
        );
    }

    #[test]
    fn mana_categories_group_by_game_version() {
        use ManaUse::*;
        // 1.35 and later: category 36 is a signed net counter, not spend.
        let latest = [
            (0, Ideas),
            (1, Tech),
            (2, Stability),
            (7, Develop),
            (17, Cores),
            (14, Peace),
            (22, Peace),
            (8, Leaders),
            (30, Leaders),
            (43, Leaders),
            (44, Leaders),
            (15, Other),
            (39, Other),
            (60, Other),
        ];
        for (index, found) in latest {
            assert_eq!(mana_use(37, index), Some(found), "{index}");
        }
        // The peace terms and war exhaustion, and every leader, army and
        // fleet action, of the 1.35 layout, as eu4save names them.
        for index in [14, 21, 22, 24] {
            assert_eq!(mana_use(35, index), Some(Peace), "{index}");
        }
        for index in [3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 30, 40, 43, 44] {
            assert_eq!(mana_use(35, index), Some(Leaders), "{index}");
        }
        assert_eq!(mana_use(35, 36), None);
        assert_eq!(mana_use(37, 37), None);
        // 1.31 to 1.34 dropped native advancement at 25, so later actions move down one.
        for (index, found) in [
            (30, Leaders),
            (38, Leaders),
            (42, Leaders),
            (45, Leaders),
            (46, Leaders),
            (24, Peace),
        ] {
            assert_eq!(mana_use(34, index), Some(found), "{index}");
        }
        assert_eq!(mana_use(34, 36), Some(Other));
        assert_eq!(mana_use(34, 43), Some(Other));
        assert_eq!(mana_use(34, 37), None);
        // Up to 1.30 it is still there.
        for (index, found) in [
            (31, Leaders),
            (39, Leaders),
            (43, Leaders),
            (21, Peace),
            (30, Other),
            (36, Other),
        ] {
            assert_eq!(mana_use(30, index), Some(found), "{index}");
        }
        assert_eq!(mana_use(29, 38), None);
        // A negative index folds into Other, as eu4save folds it.
        assert_eq!(mana_use(37, -1), Some(Other));
    }

    #[test]
    fn rivals_follow_the_lineages_of_both_countries() {
        // Alodia became Nubia in 1451; Makuria's rival is recorded by the tag it held.
        let switch = TagSwitch {
            from: tag("ALO"),
            to: tag("NBI"),
            date: GameDate::from_date_sort(14510101),
            country: tag("ALO"),
            country_since: GameDate::from_date_sort(14510101),
            order: 0,
            copy: 0,
            joins: true,
        };
        let saved = |hash, year, owners: [&'static str; 2], rival: &str| {
            let provinces: [Spec; 2] = [
                (1, 10.0, Some(owners[0]), None),
                (2, 10.0, Some(owners[1]), None),
            ];
            let observation = observation(hash, (year, 1, 1), &provinces);
            let mut payload = observation.payload().clone();
            payload.rivals = Table::sorted_prefix(
                vec![CountryRival {
                    tag: tag("MKU"),
                    rival: tag(rival),
                }],
                CountryRivalColumns { order: vec![0] },
            )
            .unwrap();
            payload.switches = if year > 1451 {
                vec![switch]
            } else {
                Vec::new()
            };
            Observation::new(observation.descriptor.clone(), Eu4Detail {}, payload).unwrap()
        };
        let mut store = Store::new();
        store
            .append(saved("a", 1450, ["ALO", "MKU"], "ALO"), usize::MAX)
            .unwrap();
        store
            .append(saved("b", 1460, ["NBI", "MKU"], "NBI"), usize::MAX)
            .unwrap();
        let Eu4Answer::Rivals(rivals) = answer(
            &store,
            Eu4Query::Rivals {
                tags: vec![tag("MKU")],
            },
        ) else {
            panic!("rivals");
        };
        assert_eq!(
            rivals[0].values,
            [Some(vec![tag("ALO")]), Some(vec![tag("NBI")])]
        );
        // Both rival tags are held by one lineage, so the chart draws one rival line.
        let Eu4Answer::CountrySeries(series) = answer(
            &store,
            Eu4Query::CountrySeries {
                tags: vec![tag("NBI")],
                metric: CountryMetric::ProvinceDevelopment,
            },
        ) else {
            panic!("series");
        };
        let held: Vec<_> = series[0]
            .values
            .iter()
            .map(|cell| match cell {
                Some(LineageCell::Value { tag, .. }) => Some(*tag),
                _ => None,
            })
            .collect();
        assert_eq!(held, [Some(tag("ALO")), Some(tag("NBI"))]);
    }
}
