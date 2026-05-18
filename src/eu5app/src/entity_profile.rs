/// Data types for entity profiles (single-entity insight panel).
/// All types use owned data (String, Vec) for clean WASM boundary crossing.
/// Aggregation logic lives on Eu5Workspace; these are plain data containers.
use eu5save::models::{CountryIdx, GoodName, LocationIdx, MarketId};
use serde::{Deserialize, Serialize};

use crate::color::Srgb;
use crate::insights::{PopulationRankSegment, PopulationTypeProfileRow};
use crate::presentation::{
    LocalizationContext, Localized, Present, UiCountryIdx, UiLocationIdx, UiMarketId, present_dto,
};

pub mod country {
    pub(crate) mod workspace {
        pub(crate) use super::super::{
            ActiveProfileIdentitySource as ActiveProfileIdentity,
            CountryPopulationProfileSource as CountryPopulationProfile,
            CountryProfileSource as CountryProfile,
            CountryReligionSectionSource as CountryReligionSection,
            ReligionShareSource as ReligionShare,
        };
    }

    pub mod presentation {
        pub use super::super::{
            ActiveProfileIdentity, CountryPopulationProfile, CountryProfile,
            CountryReligionSection, DiplomacySection, EntityHeader, LocationPopRow,
            LocationsSection, ReligionShare, SubjectRef,
        };
    }
}

pub mod location {
    pub(crate) mod workspace {
        pub(crate) use super::super::{
            BuildingEntrySource as BuildingEntry, EntityHeaderSource as EntityHeader,
            LocationHeaderSource as LocationHeader, LocationPopRowSource as LocationPopRow,
            LocationProfileSource as LocationProfile, LocationRowSource as LocationRow,
            LocationStatsSource as LocationStats, LocationsSectionSource as LocationsSection,
        };
    }

    pub mod presentation {
        pub use super::super::{
            BuildingEntry, EntityHeader, LocationHeader, LocationPopRow, LocationProfile,
            LocationRow, LocationStats, LocationsSection,
        };
    }
}

pub mod market {
    pub(crate) mod workspace {
        pub(crate) use super::super::{
            MarketGoodEntrySource as MarketGoodEntry,
            MarketGoodsSectionSource as MarketGoodsSection,
            MarketMemberCountrySource as MarketMemberCountry, MarketProfileSource as MarketProfile,
        };
    }

    pub mod presentation {
        pub use super::super::{
            EntityHeader, MarketGoodEntry, MarketGoodsSection, MarketMemberCountry, MarketProfile,
        };
    }
}

pub mod diplomacy {
    pub(crate) mod workspace {
        pub(crate) use super::super::{
            DiplomacySectionSource as DiplomacySection, SubjectRefSource as SubjectRef,
        };
    }

    pub mod presentation {
        pub use super::super::{DiplomacySection, SubjectRef};
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum EntityKind {
    Country,
    Market,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ActiveProfileIdentity {
    Country { country: Localized<UiCountryIdx> },
    Market { market: Localized<UiMarketId> },
    Location { location: Localized<UiLocationIdx> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountrySearchEntry {
    pub country: Localized<UiCountryIdx>,
    pub tag: String,
    pub capital: Option<UiLocationIdx>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountriesData {
    pub countries: Vec<CountrySearchEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationSearchEntry {
    pub location: Localized<UiLocationIdx>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct LocationsData {
    pub locations: Vec<LocationSearchEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct EntityHeader {
    pub kind: EntityKind,
    pub name: String,
    pub tag: Option<String>,
    pub color_hex: Srgb,
    pub anchor_location_idx: u32,
    pub headline: HeadlineStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct HeadlineStats {
    pub location_count: u32,
    pub total_development: f64,
    pub total_population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryOverviewSection {
    pub gold: f64,
    pub manpower: f64,
    pub stability: f64,
    pub prestige: f64,
    pub government_power: f64,
    pub income: f64,
    pub expense: f64,
    pub monthly_gold: Vec<f64>,
    pub recent_balance: Vec<f64>,
    pub historical_tax_base: Vec<f64>,
    pub historical_population: Vec<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "PascalCase")]
pub enum DiplomacySubjectType {
    Dominion,
    Fiefdom,
    Vassal,
    Tributary,
    #[serde(rename = "Hanseatic Member")]
    HanseaticMember,
    Samanta,
    Appanage,
    Tusi,
    March,
    #[serde(rename = "Maha Samanta")]
    MahaSamanta,
    #[serde(rename = "Colonial Nation")]
    ColonialNation,
    Conquistador,
    #[serde(rename = "Trade Company")]
    TradeCompany,
    #[serde(rename = "Subject")]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryMetrics {
    pub great_power_rank: i32,
    pub total_state_efficacy: f64,
    pub active_state_capacity: f64,
    pub total_population: u32,
    pub tax_trade_income: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct CountryRef {
    pub country: Localized<UiCountryIdx>,
    pub anchor_location_idx: UiLocationIdx,
    pub tag: String,
    pub color_hex: Srgb,
    pub is_player: bool,
}

impl CountryRef {
    pub fn anchor_location_idx(&self) -> u32 {
        self.anchor_location_idx.value()
    }

    pub fn name(&self) -> &str {
        &self.country.name
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct MarketRef {
    pub market: Localized<UiMarketId>,
    pub anchor_location_idx: UiLocationIdx,
    pub color_hex: Srgb,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct BuildingEntry {
    pub building: Localized<String>,
    pub level: f64,
}

#[derive(Debug, Clone)]
pub(crate) enum ActiveProfileIdentitySource {
    Country(CountryIdx),
    Market(MarketId),
    Location(LocationIdx),
}

impl Present for ActiveProfileIdentitySource {
    type Output = ActiveProfileIdentity;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        match self {
            ActiveProfileIdentitySource::Country(idx) => ActiveProfileIdentity::Country {
                country: ctx.resolve_country(idx),
            },
            ActiveProfileIdentitySource::Market(id) => ActiveProfileIdentity::Market {
                market: ctx.resolve_market(id),
            },
            ActiveProfileIdentitySource::Location(idx) => ActiveProfileIdentity::Location {
                location: ctx.resolve_location(idx),
            },
        }
    }
}

/// Workspace entity-header source. Resolves into the full [`EntityHeader`] at the
/// presentation boundary by joining the localized name with the precomputed
/// `headline` numerics.
#[derive(Debug, Clone)]
pub(crate) struct EntityHeaderSource {
    pub kind: EntityHeaderKindSource,
    pub headline: HeadlineStats,
}

#[derive(Debug, Clone)]
pub(crate) enum EntityHeaderKindSource {
    Country(CountryIdx),
    Market(MarketId),
}

impl Present for EntityHeaderSource {
    type Output = EntityHeader;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        match self.kind {
            EntityHeaderKindSource::Country(idx) => {
                let cref = ctx.resolve_country_ref(idx);
                EntityHeader {
                    kind: EntityKind::Country,
                    name: cref.country.name,
                    tag: Some(cref.tag),
                    color_hex: cref.color_hex,
                    anchor_location_idx: cref.anchor_location_idx.value(),
                    headline: self.headline,
                }
            }
            EntityHeaderKindSource::Market(id) => {
                let mref = ctx.resolve_market_ref(id);
                EntityHeader {
                    kind: EntityKind::Market,
                    name: mref.market.name,
                    tag: None,
                    color_hex: mref.color_hex,
                    anchor_location_idx: mref.anchor_location_idx.value(),
                    headline: self.headline,
                }
            }
        }
    }
}

present_dto! {
    pub(crate) workspace LocationStatsSource<'bump> => pub LocationStats {
        development: f64,
        population: u32,
        control: f64,
        terrain: String,
        religion: Option<eu5save::models::ReligionId> => Option<Localized<String>>,
        raw_material: Option<GoodName<'bump>> => Option<Localized<String>>,
        tax: f64,
        possible_tax: f64,
        rgo_level: f64,
        market_access: f64,
    }
}

#[derive(Debug, Clone)]
pub(crate) struct BuildingEntrySource {
    pub building_key: String,
    pub level: f64,
}

impl Present for BuildingEntrySource {
    type Output = BuildingEntry;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        BuildingEntry {
            building: ctx.resolve_building(crate::presentation::BuildingKeyRef(&self.building_key)),
            level: self.level,
        }
    }
}

present_dto! {
    pub(crate) workspace LocationPopRowSource => pub LocationPopRow {
        kind: eu5save::models::PopulationType => String,
        culture: Option<eu5save::models::CultureId> => Option<Localized<String>>,
        culture_color_hex: Srgb,
        religion: eu5save::models::ReligionId => Localized<String>,
        religion_color_hex: Srgb,
        size: u32,
        satisfaction: f64,
        literacy: f64,
    }
}

present_dto! {
    pub(crate) workspace MarketGoodEntrySource<'bump> => pub MarketGoodEntry {
        good: GoodName<'bump> => Localized<String>,
        price: f64,
        supply: f64,
        demand: f64,
    }
}

present_dto! {
    pub(crate) workspace ReligionShareSource => pub ReligionShare {
        religion: eu5save::models::ReligionId => Localized<String>,
        location_count: u32,
        population: u32,
        color_hex: Srgb,
    }
}

present_dto! {
    pub(crate) workspace CountryReligionSectionSource => pub CountryReligionSection {
        religion_breakdown: Vec<ReligionShareSource> => Vec<ReligionShare>,
    }
}

present_dto! {
    pub(crate) workspace MarketMemberCountrySource => pub MarketMemberCountry {
        country: crate::presentation::CountryRefSource => CountryRef,
        trade_advantage: f64,
        trade_capacity: f64,
    }
}

present_dto! {
    pub(crate) workspace MarketGoodsSectionSource<'bump> => pub MarketGoodsSection {
        market_value: f64,
        total_building_levels: f64,
        total_possible_tax: f64,
        top_goods: Vec<MarketGoodEntrySource<'bump>> => Vec<MarketGoodEntry>,
    }
}

present_dto! {
    pub(crate) workspace SubjectRefSource => pub SubjectRef {
        entity: crate::presentation::CountryRefSource => CountryRef,
        subject_type: DiplomacySubjectType,
        liberty_desire: f64,
        metrics: CountryMetrics,
    }
}

present_dto! {
    pub(crate) workspace DiplomacySectionSource => pub DiplomacySection {
        overlord: Option<crate::presentation::CountryRefSource> => Option<CountryRef>,
        overlord_subject_type: Option<DiplomacySubjectType>,
        overlord_metrics: Option<CountryMetrics>,
        subjects: Vec<SubjectRefSource> => Vec<SubjectRef>,
    }
}

present_dto! {
    pub(crate) workspace LocationRowSource => pub LocationRow {
        location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
        development: f64,
        population: u32,
        control: f64,
        tax: f64,
        possible_tax: f64,
        owner: Option<crate::presentation::CountryRefSource> => Option<CountryRef>,
        market: Option<crate::presentation::MarketRefSource> => Option<MarketRef>,
    }
}

present_dto! {
    pub(crate) workspace LocationsSectionSource => pub LocationsSection {
        locations: Vec<LocationRowSource> => Vec<LocationRow>,
    }
}

present_dto! {
    pub(crate) workspace LocationHeaderSource => pub LocationHeader {
        location: eu5save::models::LocationIdx => Localized<UiLocationIdx>,
        owner: Option<crate::presentation::CountryRefSource> => Option<CountryRef>,
        market: Option<crate::presentation::MarketRefSource> => Option<MarketRef>,
    }
}

present_dto! {
    pub(crate) workspace LocationProfileSource<'bump> => pub LocationProfile {
        header: LocationHeaderSource => LocationHeader,
        stats: LocationStatsSource<'bump> => LocationStats,
        buildings: Vec<BuildingEntrySource> => Vec<BuildingEntry>,
        population_profile: Vec<LocationPopRowSource> => Vec<LocationPopRow>,
    }
}

present_dto! {
    pub(crate) workspace MarketProfileSource => pub MarketProfile {
        header: EntityHeaderSource => EntityHeader,
        market_value: f64,
        owner_country: Option<crate::presentation::CountryRefSource> => Option<CountryRef>,
        location_market_access: Vec<f64>,
        location_market_attraction: Vec<f64>,
        member_countries: Vec<MarketMemberCountrySource> => Vec<MarketMemberCountry>,
    }
}

present_dto! {
    pub(crate) workspace CountryProfileSource => pub CountryProfile {
        header: EntityHeaderSource => EntityHeader,
        overview: CountryOverviewSection,
        religion: CountryReligionSectionSource => CountryReligionSection,
        locations: LocationsSectionSource => LocationsSection,
        diplomacy: DiplomacySectionSource => DiplomacySection,
    }
}

present_dto! {
    pub(crate) workspace CountryPopulationProfileSource => pub CountryPopulationProfile {
        type_profile: Vec<PopulationTypeProfileRow>,
        rank_totals: Vec<PopulationRankSegment>,
        sankey_rows: Vec<LocationPopRowSource> => Vec<LocationPopRow>,
    }
}
