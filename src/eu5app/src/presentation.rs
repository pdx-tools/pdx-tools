//! Presentation infrastructure for data crossing the WASM boundary.
//!
//! Workspace aggregation should stay close to save/domain data. Presentation
//! converts those workspace results into owned UI-facing DTOs, including
//! localization enrichment. At the boundary, values are resolved via
//! [`LocalizationContext`] into owned [`Localized`] leaves that pair a stable
//! identity key with a display name.

use eu5save::models::{
    CountryIdx, CountryName, CultureId, GoodName, LocationIdx, MarketId, PopulationType, ReligionId,
};
use serde::{Deserialize, Serialize};

use crate::color::Srgb;
use crate::entity_profile::country::presentation::{
    ActiveProfileIdentity, CountryPopulationProfile, CountryProfile, DiplomacySection,
    EntityHeader, LocationsSection,
};
use crate::entity_profile::location::presentation::LocationProfile;
use crate::entity_profile::market::presentation::{MarketGoodsSection, MarketProfile};
use crate::entity_profile::{
    CountriesData, CountryRef, CountrySearchEntry, EntityKind, LocationSearchEntry, LocationsData,
    MarketRef,
};
use crate::game_data::{GameData, Localization};
use crate::hover::presentation::DisplayData as HoverDisplayData;
use crate::insights::buildings::presentation::BuildingLevelsInsightData;
use crate::insights::control::presentation::{ControlInsightData, PoliticalWorldScoreboard};
use crate::insights::development::presentation::DevelopmentInsightData;
use crate::insights::markets::presentation::{
    MarketInsightData, MarketProductionLocationSummary, ScopedGoodSummary,
};
use crate::insights::population::presentation::PopulationInsightData;
use crate::insights::religion::presentation::ReligionInsightData;
use crate::insights::rgo::presentation::RgoInsightData;
use crate::insights::state_efficacy::presentation::StateEfficacyInsightData;
use crate::insights::tax::presentation::{PossibleTaxInsightData, TaxGapInsightData};
use crate::overlay::OverlayBodyConfig;
use crate::session::Eu5Workspace;

mod present_dto;

pub(crate) use present_dto::present_dto;

pub struct Eu5Presenter<'a, 'bump> {
    workspace: &'a Eu5Workspace<'bump>,
    ctx: LocalizationContext<'a, 'bump>,
}

impl<'a, 'bump> Eu5Presenter<'a, 'bump> {
    pub(crate) fn new(workspace: &'a Eu5Workspace<'bump>, localization: &'a Localization) -> Self {
        Self {
            workspace,
            ctx: LocalizationContext::new(
                localization,
                workspace.game_data(),
                workspace.gamestate(),
            ),
        }
    }

    pub fn calculate_market_insight(&self) -> MarketInsightData {
        self.workspace.calculate_market_insight().present(&self.ctx)
    }

    pub fn calculate_development_insight(&self) -> DevelopmentInsightData {
        self.workspace
            .calculate_development_insight()
            .present(&self.ctx)
    }

    pub fn calculate_state_efficacy_insight(&self) -> StateEfficacyInsightData {
        self.workspace
            .calculate_state_efficacy_insight()
            .present(&self.ctx)
    }

    pub fn calculate_possible_tax_insight(&self) -> PossibleTaxInsightData {
        self.workspace
            .calculate_possible_tax_insight()
            .present(&self.ctx)
    }

    pub fn calculate_tax_gap_insight(&self) -> TaxGapInsightData {
        self.workspace
            .calculate_tax_gap_insight()
            .present(&self.ctx)
    }

    pub fn calculate_population_insight(&self) -> PopulationInsightData {
        self.workspace
            .calculate_population_insight()
            .present(&self.ctx)
    }

    pub fn calculate_religion_insight(&self) -> ReligionInsightData {
        self.workspace
            .calculate_religion_insight()
            .present(&self.ctx)
    }

    pub fn calculate_building_levels_insight(&self) -> BuildingLevelsInsightData {
        self.workspace
            .calculate_building_levels_insight()
            .present(&self.ctx)
    }

    pub fn calculate_rgo_insight(&self) -> RgoInsightData {
        self.workspace.calculate_rgo_insight().present(&self.ctx)
    }

    pub fn calculate_control_insight(&self) -> ControlInsightData {
        self.workspace
            .calculate_control_insight()
            .present(&self.ctx)
    }

    pub fn political_world_scoreboard(&self) -> PoliticalWorldScoreboard {
        self.workspace
            .calculate_political_world_scoreboard()
            .present(&self.ctx)
    }

    pub fn active_profile_identity(&self) -> Option<ActiveProfileIdentity> {
        self.workspace
            .active_profile_identity()
            .map(|r| r.present(&self.ctx))
    }

    pub fn entity_header(&self) -> Option<EntityHeader> {
        self.workspace.entity_header().map(|r| r.present(&self.ctx))
    }

    pub fn entity_header_for(&self, anchor_location_idx: LocationIdx) -> Option<EntityHeader> {
        self.workspace
            .entity_header_for(anchor_location_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn country_profile_for(&self, country_idx: CountryIdx) -> Option<CountryProfile> {
        self.workspace
            .country_profile_for(country_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn country_population_profile_for(
        &self,
        country_idx: CountryIdx,
    ) -> Option<CountryPopulationProfile> {
        self.workspace
            .country_population_profile_for(country_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn market_profile_for(&self, market_id: MarketId) -> Option<MarketProfile> {
        self.workspace
            .market_profile_for(market_id)
            .map(|r| r.present(&self.ctx))
    }

    pub fn market_goods_section(&self) -> Option<MarketGoodsSection> {
        self.workspace
            .market_goods_section()
            .map(|r| r.present(&self.ctx))
    }

    pub fn market_goods_section_for(
        &self,
        anchor_location_idx: LocationIdx,
    ) -> Option<MarketGoodsSection> {
        self.workspace
            .market_goods_section_for(anchor_location_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn market_goods_profile(&self, market_id: MarketId) -> Vec<ScopedGoodSummary> {
        self.workspace
            .market_goods_profile(market_id)
            .present(&self.ctx)
    }

    pub fn market_locations_profile(
        &self,
        market_id: MarketId,
    ) -> Vec<MarketProductionLocationSummary> {
        self.workspace
            .market_locations_profile(market_id)
            .present(&self.ctx)
    }

    pub fn locations_section(&self) -> Option<LocationsSection> {
        self.workspace
            .locations_section()
            .map(|r| r.present(&self.ctx))
    }

    pub fn locations_section_for(
        &self,
        anchor_location_idx: LocationIdx,
    ) -> Option<LocationsSection> {
        self.workspace
            .locations_section_for(anchor_location_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn diplomacy_section(&self) -> Option<DiplomacySection> {
        self.workspace
            .diplomacy_section()
            .map(|r| r.present(&self.ctx))
    }

    pub fn diplomacy_section_for(
        &self,
        anchor_location_idx: LocationIdx,
    ) -> Option<DiplomacySection> {
        self.workspace
            .diplomacy_section_for(anchor_location_idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn location_profile_for(&self, idx: LocationIdx) -> Option<LocationProfile> {
        self.workspace
            .location_profile_for(idx)
            .map(|r| r.present(&self.ctx))
    }

    pub fn hover_data(&self, location_idx: LocationIdx) -> HoverDisplayData {
        self.workspace.hover_data(location_idx).present(&self.ctx)
    }

    pub fn focused_location_display_name(&self) -> Option<String> {
        self.workspace
            .selection_state()
            .focused_location()
            .map(|idx| self.location_display_name(idx))
    }

    pub fn location_display_name(&self, idx: LocationIdx) -> String {
        idx.present(&self.ctx).name
    }

    pub fn country_display_name(&self, idx: CountryIdx) -> String {
        idx.present(&self.ctx).name
    }

    pub fn scope_display_name(&self) -> Option<String> {
        let anchor = self.workspace.derived_entity_anchor()?;
        let loc = self
            .workspace
            .gamestate()
            .locations
            .index(anchor)
            .location();
        match self.workspace.derived_entity_kind()? {
            EntityKind::Market => {
                let market_id = loc.market?;
                Some(market_id.present(&self.ctx).name)
            }
            EntityKind::Country => {
                let owner_id = loc.owner.real_id()?;
                let country_id = owner_id.country_id();
                let country_idx = self.workspace.gamestate().countries.get(country_id)?;
                Some(country_idx.present(&self.ctx).name)
            }
        }
    }

    pub fn get_overlay_data(&self) -> OverlayBodyConfig {
        self.workspace.get_overlay_data().present(&self.ctx)
    }

    pub fn country_search_entries(&self) -> CountriesData {
        let gamestate = self.workspace.gamestate();
        let countries = gamestate
            .countries
            .iter()
            .filter_map(|entry| {
                let data = entry.data()?;
                let country = entry.idx().present(&self.ctx);
                let tag = entry.tag().to_str().to_string();
                let capital = data
                    .capital
                    .and_then(|id| gamestate.locations.get(id))
                    .map(UiLocationIdx::from);
                Some(CountrySearchEntry {
                    country,
                    tag,
                    capital,
                })
            })
            .collect();
        CountriesData { countries }
    }

    pub fn location_search_entries(&self) -> LocationsData {
        let gamestate = self.workspace.gamestate();
        let locations = gamestate
            .locations
            .iter()
            .map(|entry| LocationSearchEntry {
                location: entry.idx().present(&self.ctx),
            })
            .collect();
        LocationsData { locations }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct CountryRefSource {
    pub country_idx: CountryIdx,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct MarketRefSource {
    pub market_id: MarketId,
}

impl Present for CountryRefSource {
    type Output = CountryRef;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let idx = self.country_idx;
        let entry = ctx.gamestate.countries.index(idx);
        let data = entry.data();
        let owner = entry.id().real_id();
        let color_hex = data.map(|data| data.color.into()).unwrap_or_default();
        let anchor_location_idx = data
            .and_then(|data| {
                let owner = owner?;
                Some((data, owner))
            })
            .and_then(|(data, owner)| {
                data.capital
                    .and_then(|id| ctx.gamestate.locations.get(id))
                    .or_else(|| {
                        ctx.gamestate
                            .locations
                            .iter()
                            .find(|entry| entry.location().owner.real_id() == Some(owner))
                            .map(|entry| entry.idx())
                    })
            })
            .map(UiLocationIdx::from)
            .unwrap_or(UiLocationIdx(0));
        let is_player = owner
            .map(|owner| owner.country_id())
            .is_some_and(|country_id| {
                ctx.gamestate
                    .played_countries
                    .iter()
                    .any(|p| p.country == country_id)
            });
        CountryRef {
            country: idx.present(ctx),
            anchor_location_idx,
            tag: data
                .map(|_| entry.tag().to_str().to_string())
                .unwrap_or_else(|| "---".to_string()),
            color_hex,
            is_player,
        }
    }
}

impl Present for MarketRefSource {
    type Output = MarketRef;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let id = self.market_id;
        let market = ctx
            .gamestate
            .market_manager
            .get(id)
            .expect("market id should resolve to a saved market");
        let center_idx = ctx
            .gamestate
            .locations
            .get(market.center)
            .unwrap_or_default();
        MarketRef {
            market: id.present(ctx),
            anchor_location_idx: UiLocationIdx::from(center_idx),
            color_hex: market.color.into(),
        }
    }
}

/// Generic owned localized leaf. `key` is the stable identity (string key or UI id);
/// `name` is the resolved display name.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct Localized<K> {
    pub key: K,
    pub name: String,
}

impl<K> Localized<K> {
    pub fn new(key: K, name: String) -> Self {
        Self { key, name }
    }
}

macro_rules! ui_id {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
        #[serde(transparent)]
        #[cfg_attr(feature = "tsify", tsify(type = "number"))]
        pub struct $name(pub u32);

        impl $name {
            pub fn value(self) -> u32 {
                self.0
            }
        }

        impl From<$name> for u32 {
            fn from(id: $name) -> Self {
                id.0
            }
        }
    };
}

ui_id!(UiCountryIdx);
ui_id!(UiLocationIdx);
ui_id!(UiLocationId);
ui_id!(UiMarketId);
ui_id!(UiReligionId);
ui_id!(UiCultureId);

impl From<CountryIdx> for UiCountryIdx {
    fn from(idx: CountryIdx) -> Self {
        UiCountryIdx(idx.value())
    }
}

impl From<LocationIdx> for UiLocationIdx {
    fn from(idx: LocationIdx) -> Self {
        UiLocationIdx(idx.value())
    }
}

impl From<MarketId> for UiMarketId {
    fn from(id: MarketId) -> Self {
        UiMarketId(id.value())
    }
}

impl From<ReligionId> for UiReligionId {
    fn from(id: ReligionId) -> Self {
        UiReligionId(id.value())
    }
}

impl From<CultureId> for UiCultureId {
    fn from(id: CultureId) -> Self {
        UiCultureId(id.value())
    }
}

pub struct LocalizationContext<'a, 'bump> {
    pub localization: &'a Localization,
    pub game_data: &'a GameData,
    pub gamestate: &'a eu5save::models::Gamestate<'bump>,
}

impl<'a, 'bump> LocalizationContext<'a, 'bump> {
    pub fn new(
        localization: &'a Localization,
        game_data: &'a GameData,
        gamestate: &'a eu5save::models::Gamestate<'bump>,
    ) -> Self {
        Self {
            localization,
            game_data,
            gamestate,
        }
    }

    fn raw_location_key(&self, idx: LocationIdx) -> &str {
        let index = idx.value() as usize;
        self.gamestate
            .metadata
            .compatibility
            .locations
            .get(index)
            .map(|x| x.to_str())
            .unwrap_or("Unknown")
    }
}

/// Convert workspace output into an owned, UI-facing presentation DTO.
pub trait Present {
    type Output;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output;
}

impl Present for GoodName<'_> {
    type Output = Localized<String>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let key = self.to_str();
        let name = ctx.localization.get(key).unwrap_or(key).to_string();
        Localized::new(key.to_string(), name)
    }
}

impl Present for CountryIdx {
    type Output = Localized<UiCountryIdx>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let entry = ctx.gamestate.countries.index(self);
        let tag = entry.tag();
        let tag = tag.to_str();
        let name = match entry.data().map(|data| &data.country_name) {
            Some(CountryName::Object(obj)) => {
                let (key, variables) = match obj.override_name.as_ref() {
                    Some(ov) => (ov.key.to_str(), ov.variables),
                    None => (obj.name.map(|b| b.to_str()).unwrap_or(tag), &[][..]),
                };
                let template = ctx.localization.get(key).unwrap_or(key);
                let base = obj.bases.base.map(|b| b.to_str());
                interpolate_country_name(template, base, variables, ctx.localization)
            }
            Some(CountryName::Tag(t)) => {
                let key = t.to_str();
                ctx.localization.get(key).unwrap_or(key).to_string()
            }
            None => ctx.localization.get(tag).unwrap_or(tag).to_string(),
        };
        Localized::new(UiCountryIdx::from(self), name)
    }
}

/// Substitute `$TOKEN$` in a country-name template: `$NAME$`/`$ADJ$` from the
/// base tag (`<base>` / `<base>_ADJ`), other tokens from `variables` (value
/// treated as a loc key). Unknown tokens are left intact; output is not rescanned.
fn interpolate_country_name(
    template: &str,
    base: Option<&str>,
    variables: &[eu5save::models::CountryNameVariable<'_>],
    localization: &Localization,
) -> String {
    if !template.contains('$') {
        return template.to_string();
    }

    let mut out = String::with_capacity(template.len());
    let mut lookup_key = String::new();
    let mut rest = template;
    while let Some((prefix, after_start)) = rest.split_once('$') {
        out.push_str(prefix);
        let Some((token, tail)) = after_start.split_once('$') else {
            out.push('$');
            out.push_str(after_start);
            return out;
        };
        if let Some(sub) = resolve_token(token, base, variables, localization, &mut lookup_key) {
            out.push_str(sub);
        } else {
            out.push('$');
            out.push_str(token);
            out.push('$');
        }
        rest = tail;
    }
    out.push_str(rest);
    out
}

fn resolve_token<'a>(
    token: &str,
    base: Option<&'a str>,
    variables: &'a [eu5save::models::CountryNameVariable<'_>],
    localization: &'a Localization,
    lookup_key: &'a mut String,
) -> Option<&'a str> {
    // Base-tag tokens take precedence so a variable can't shadow $NAME$/$ADJ$.
    if let Some(b) = base {
        match token {
            "NAME" => return Some(localization.get(b).unwrap_or(b)),
            "ADJ" => {
                lookup_key.clear();
                lookup_key.push_str(b);
                lookup_key.push_str("_ADJ");
                return Some(localization.get(lookup_key).unwrap_or(b));
            }
            _ => {}
        }
    }
    variables.iter().find(|v| v.key.to_str() == token).map(|v| {
        let val = v.value.to_str();
        localization.get(val).unwrap_or(val)
    })
}

/// Workspace-side source for a good's rich presentation form.
#[derive(Debug, Clone, Copy)]
pub struct GoodRefSource<'a>(pub GoodName<'a>);

/// UI-facing rich presentation of a good's stable identity
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct GoodRef {
    pub key: String,
    pub name: String,
    pub color_hex: Srgb,
}

impl Present for GoodRefSource<'_> {
    type Output = GoodRef;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let good = self.0.present(ctx);
        let color_hex = ctx
            .game_data
            .good(good.key.as_str())
            .map(|g| g.color_hex)
            .unwrap_or_default();
        GoodRef {
            key: good.key,
            name: good.name,
            color_hex,
        }
    }
}

/// Borrowed building-kind key carried through aggregation. Resolves to
/// `Localized<String>` at presentation time by looking up the localization map.
#[derive(Debug, Clone, Copy)]
pub struct BuildingKeyRef<'a>(pub &'a str);

impl Present for BuildingKeyRef<'_> {
    type Output = Localized<String>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let key = self.0;
        let name = ctx.localization.get(key).unwrap_or(key).to_string();
        Localized::new(key.to_string(), name)
    }
}

impl<T> Present for Vec<T>
where
    T: Present,
{
    type Output = Vec<T::Output>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        self.into_iter().map(|item| item.present(ctx)).collect()
    }
}

impl<T> Present for Option<T>
where
    T: Present,
{
    type Output = Option<T::Output>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        self.map(|item| item.present(ctx))
    }
}

impl Present for LocationIdx {
    type Output = Localized<UiLocationIdx>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let raw = ctx.raw_location_key(self);
        let name = ctx.localization.get(raw).unwrap_or(raw).to_string();
        Localized::new(UiLocationIdx::from(self), name)
    }
}

impl Present for MarketId {
    type Output = Localized<UiMarketId>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let name = ctx
            .gamestate
            .market_manager
            .get(self)
            .and_then(|market| {
                let idx = ctx.gamestate.locations.get(market.center)?;
                let center = idx.present(ctx);
                Some(format!("{} Market", center.name))
            })
            .unwrap_or_else(|| format!("market_{}", self.value()));
        Localized::new(UiMarketId::from(self), name)
    }
}

impl Present for ReligionId {
    type Output = Localized<String>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let Some(religion) = ctx.gamestate.religion_manager.lookup(self) else {
            let fallback = format!("religion_{}", self.value());
            return Localized::new(fallback.clone(), fallback);
        };
        let key = religion.key.to_str().to_string();
        let name = ctx.localization.get(&key).unwrap_or(&key).to_string();
        Localized::new(key, name)
    }
}

impl Present for PopulationType {
    type Output = String;

    fn present(self, _ctx: &LocalizationContext<'_, '_>) -> String {
        match self {
            PopulationType::Burghers => "Burghers",
            PopulationType::Clergy => "Clergy",
            PopulationType::Laborers => "Laborers",
            PopulationType::Nobles => "Nobles",
            PopulationType::Peasants => "Peasants",
            PopulationType::Slaves => "Slaves",
            PopulationType::Soldiers => "Soldiers",
            PopulationType::Tribesmen => "Tribesmen",
            PopulationType::Other => "Other",
        }
        .to_string()
    }
}

impl Present for CultureId {
    type Output = Localized<String>;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let Some(culture) = ctx.gamestate.culture_manager.lookup(self) else {
            let fallback = format!("culture_{}", self.value());
            return Localized::new(fallback.clone(), fallback);
        };
        let key = culture.name.key().to_str().to_string();
        let name = ctx.localization.get(&key).unwrap_or(&key).to_string();
        Localized::new(key, name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn localized_serializes_to_camel_case() {
        let value = Localized::new("good_key".to_string(), "Good Name".to_string());
        let json = serde_json::to_string(&value).unwrap();
        assert_eq!(json, r#"{"key":"good_key","name":"Good Name"}"#);
    }

    #[test]
    fn ui_id_is_transparent_over_u32() {
        let id = UiLocationIdx(42);
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "42");
        let parsed: UiLocationIdx = serde_json::from_str("42").unwrap();
        assert_eq!(parsed, UiLocationIdx(42));
    }

    #[test]
    fn ui_id_value_round_trip() {
        let id = UiMarketId(7);
        assert_eq!(id.value(), 7);
        assert_eq!(u32::from(id), 7);
    }

    fn loc(pairs: &[(&str, &str)]) -> Localization {
        let mut entries = eu5save::hash::FxHashMap::default();
        for (k, v) in pairs {
            entries.insert((*k).to_string(), (*v).to_string());
        }
        Localization::new(entries)
    }

    fn var<'a>(k: &'a [u8], v: &'a [u8]) -> eu5save::models::CountryNameVariable<'a> {
        eu5save::models::CountryNameVariable {
            key: eu5save::models::BStr::new(k),
            value: eu5save::models::BStr::new(v),
        }
    }

    #[test]
    fn interpolate_adj_resolves_from_base_tag() {
        let l = loc(&[("TIM_ADJ", "Timurid")]);
        let out = interpolate_country_name("$ADJ$ Rival Warlord", Some("TIM"), &[], &l);
        assert_eq!(out, "Timurid Rival Warlord");
    }

    #[test]
    fn interpolate_adj_falls_back_to_base_tag_when_missing() {
        let l = loc(&[]);
        let out = interpolate_country_name("$ADJ$ Clergy", Some("DNS"), &[], &l);
        assert_eq!(out, "DNS Clergy");
    }

    #[test]
    fn interpolate_name_resolves_from_base_tag() {
        let l = loc(&[("TIM", "Timurid")]);
        let out = interpolate_country_name("$NAME$ Successor", Some("TIM"), &[], &l);
        assert_eq!(out, "Timurid Successor");
    }

    #[test]
    fn interpolate_unknown_token_is_preserved() {
        let l = loc(&[]);
        let out = interpolate_country_name("$FOO$ Whatever", Some("TIM"), &[], &l);
        assert_eq!(out, "$FOO$ Whatever");
    }

    #[test]
    fn interpolate_no_dollar_returns_as_is() {
        let l = loc(&[]);
        let out = interpolate_country_name("Plain Name", Some("TIM"), &[], &l);
        assert_eq!(out, "Plain Name");
    }

    #[test]
    fn interpolate_without_base_leaves_base_tokens_intact() {
        let l = loc(&[("TIM_ADJ", "Timurid")]);
        let out = interpolate_country_name("$ADJ$ Rival", None, &[], &l);
        assert_eq!(out, "$ADJ$ Rival");
    }

    #[test]
    fn interpolate_variables_substitute_from_override_variables() {
        let l = loc(&[("oyama_dynasty", "Oyama")]);
        let vars = [var(b"NAME", b"oyama_dynasty")];
        let out = interpolate_country_name("$NAME$ House", None, &vars, &l);
        assert_eq!(out, "Oyama House");
    }

    #[test]
    fn interpolate_variables_fall_back_to_literal_value() {
        let l = loc(&[]);
        let vars = [var(b"PREFIX", b"Mc"), var(b"SUFFIX", b"son")];
        let out = interpolate_country_name("$PREFIX$Donald$SUFFIX$", None, &vars, &l);
        assert_eq!(out, "McDonaldson");
    }

    #[test]
    fn interpolate_base_tokens_win_over_variables() {
        // $NAME$ resolves from base tag, not from a variable named NAME.
        let l = loc(&[("TIM", "Timurid")]);
        let vars = [var(b"NAME", b"should_not_be_used")];
        let out = interpolate_country_name("$NAME$ Empire", Some("TIM"), &vars, &l);
        assert_eq!(out, "Timurid Empire");
    }

    /// Raw ref structs carry identity only — adding a `String`/`Srgb` field to
    /// `CountryRefSource`/`MarketRefSource` would break this at the type level.
    #[test]
    fn workspace_refs_carry_identity_only() {
        let country_ref = CountryRefSource {
            country_idx: eu5save::models::CountryIdx::from_value(1).unwrap(),
        };
        let _idx: eu5save::models::CountryIdx = country_ref.country_idx;

        let market_ref = MarketRefSource {
            market_id: eu5save::models::MarketId::default(),
        };
        let _id: eu5save::models::MarketId = market_ref.market_id;
    }
}
