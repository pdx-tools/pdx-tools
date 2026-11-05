//! Presentation infrastructure for data crossing the WASM boundary.
//!
//! Workspace aggregation should stay close to save/domain data. Presentation
//! converts those workspace results into owned UI-facing DTOs, including
//! localization enrichment. At the boundary, values are resolved via
//! [`LocalizationContext`] into owned [`Localized`] leaves that pair a stable
//! identity key with a display name.

use crate::insights::{DatedLand, RealmLabel, RealmLabels};
use eu5save::hash::{FxHashMap, FxHashSet};
use eu5save::models::{
    CountryId, CountryIdx, CountryName, CultureId, GoodName, LocationIdx, MarketId, PopulationType,
    ReligionId,
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
use crate::insights::control::presentation::{
    ControlInsightData, DatedRealms, PoliticalStanding, PoliticalWorldScoreboard,
};
use crate::insights::development::presentation::DevelopmentInsightData;
use crate::insights::markets::presentation::{
    MarketInsightData, MarketProductionLocationSummary, ScopedGoodSummary,
};
use crate::insights::population::presentation::PopulationInsightData;
use crate::insights::population_growth::presentation::PopulationGrowthInsightData;
use crate::insights::religion::presentation::ReligionInsightData;
use crate::insights::rgo::presentation::RgoInsightData;
use crate::insights::state_efficacy::presentation::StateEfficacyInsightData;
use crate::insights::tax::presentation::{UnrealizedTaxBaseInsightData, WealthInsightData};
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
            ctx: LocalizationContext {
                map_colors: Some(workspace.country_map_colors()),
                market_colors: Some(workspace.market_map_colors()),
                ..LocalizationContext::new(
                    localization,
                    workspace.game_data(),
                    workspace.gamestate(),
                )
            },
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

    pub fn calculate_wealth_insight(&self) -> WealthInsightData {
        self.workspace.calculate_wealth_insight().present(&self.ctx)
    }

    pub fn calculate_unrealized_tax_base_insight(&self) -> UnrealizedTaxBaseInsightData {
        self.workspace
            .calculate_unrealized_tax_base_insight()
            .present(&self.ctx)
    }

    pub fn calculate_population_insight(&self) -> PopulationInsightData {
        self.workspace
            .calculate_population_insight()
            .present(&self.ctx)
    }

    pub fn calculate_population_growth_insight(&self) -> PopulationGrowthInsightData {
        self.workspace
            .calculate_population_growth_insight()
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

    pub fn political_standing(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<PoliticalStanding> {
        self.workspace
            .calculate_political_standing(country_idx)
            .map(|x| x.present(&self.ctx))
    }

    /// The name of a country on the date the map shows. A key with no text keeps the
    /// live path's readable form, when the country lives.
    fn dated_name(
        &self,
        country: CountryId,
        identity: &crate::timeline::CountryIdentity<'_>,
    ) -> String {
        let name =
            OwnedCountryName::new(identity.name, identity.tag, identity.flag).present(&self.ctx);
        match self.workspace.live_country_of(country) {
            Some(idx) if is_unresolved_name(&name, self.ctx.localization) => {
                idx.present(&self.ctx).name
            }
            _ => name,
        }
    }

    /// One country on the date the map shows.
    pub fn dated_land(&self, country_idx: eu5save::models::CountryIdx) -> Option<DatedLand> {
        let (locations, rank, country_count, speaker) =
            self.workspace.dated_land_numbers(country_idx);
        let identity = self.workspace.country_identity_at_timeline_date(speaker)?;
        Some(DatedLand {
            locations,
            rank,
            country_count,
            name: self.dated_name(speaker, &identity),
            tag: identity.tag.to_string(),
            color_hex: Srgb(self.workspace.dated_country_color(speaker).rgb().into()),
            flag: identity.flag.unwrap_or(identity.tag).to_string(),
        })
    }

    /// Which countries of the scope hold one thing of a list. It reads the land in scope
    /// only, so each row adds up to the total.
    pub fn item_lens(&self, item: &crate::insights::LensItem) -> crate::insights::ItemLens {
        use crate::insights::{ItemLens, LensItem, LensRow};
        let gamestate = self.workspace.gamestate();
        let state = self.workspace.selection_state();
        let in_scope = |idx| state.is_empty() || state.contains(idx);
        let mut rows: FxHashMap<CountryIdx, (f64, FxHashSet<u32>)> = FxHashMap::default();
        let owner_of = |entry: &eu5save::models::Location<'_>| {
            let id = entry.owner.real_id()?;
            gamestate.countries.get(id.country_id())
        };
        match item {
            LensItem::RawMaterial(_) | LensItem::AllRawMaterials => {
                let wanted = match item {
                    LensItem::RawMaterial(key) => Some(key.as_str()),
                    _ => None,
                };
                for entry in gamestate.locations.iter() {
                    let loc = entry.location();
                    if !in_scope(entry.idx())
                        || loc.rgo_level <= 0.0
                        || wanted.is_some_and(|key| {
                            loc.raw_material.is_none_or(|good| good.to_str() != key)
                        })
                    {
                        continue;
                    }
                    if let Some(owner) = owner_of(loc) {
                        let row = rows.entry(owner).or_default();
                        row.0 += loc.rgo_level;
                        row.1.insert(entry.idx().value());
                    }
                }
            }
            // The map's measure, the same as a country's figure in each other view.
            LensItem::AllBuildings => {
                let levels = self.workspace.get_location_building_levels();
                for entry in gamestate.locations.iter() {
                    if !in_scope(entry.idx()) || levels[entry.idx()] <= 0.0 {
                        continue;
                    }
                    if let Some(owner) = owner_of(entry.location()) {
                        let row = rows.entry(owner).or_default();
                        row.0 += levels[entry.idx()];
                        row.1.insert(entry.idx().value());
                    }
                }
            }
            LensItem::Building(key) => {
                for building in gamestate.building_manager.database.iter() {
                    if building.kind.to_str() != key {
                        continue;
                    }
                    let Some(idx) = gamestate.locations.get(building.location) else {
                        continue;
                    };
                    if !in_scope(idx) {
                        continue;
                    }
                    if let Some(owner) = owner_of(gamestate.locations.index(idx).location()) {
                        let row = rows.entry(owner).or_default();
                        row.0 += building.level;
                        row.1.insert(idx.value());
                    }
                }
            }
            LensItem::Religion(key) => {
                for entry in gamestate.locations.iter() {
                    let loc = entry.location();
                    if !in_scope(entry.idx()) {
                        continue;
                    }
                    let Some(owner) = owner_of(loc) else { continue };
                    for &pop_id in loc.population.pops {
                        let Some(pop) = gamestate.population.database.lookup(pop_id) else {
                            continue;
                        };
                        if gamestate
                            .religion_manager
                            .lookup(pop.religion)
                            .is_some_and(|r| r.key.to_str() == key)
                        {
                            let row = rows.entry(owner).or_default();
                            row.0 += (pop.size * crate::population::POP_SIZE_SCALE).floor();
                            row.1.insert(entry.idx().value());
                        }
                    }
                }
            }
            LensItem::Market(id) => {
                for entry in gamestate.locations.iter() {
                    let loc = entry.location();
                    if !in_scope(entry.idx()) || loc.market.is_none_or(|m| m.value() != *id) {
                        continue;
                    }
                    if let Some(owner) = owner_of(loc) {
                        let row = rows.entry(owner).or_default();
                        row.0 += loc.tax;
                        row.1.insert(entry.idx().value());
                    }
                }
            }
        }
        let unit = match item {
            LensItem::RawMaterial(_) | LensItem::AllRawMaterials => "RGO levels",
            LensItem::Building(_) | LensItem::AllBuildings => "Levels",
            LensItem::Religion(_) => "Followers",
            LensItem::Market(_) => "Tax base",
        }
        .to_string();
        let mut location_ids: Vec<u32> = rows
            .values()
            .flat_map(|(_, at)| at.iter().copied())
            .collect();
        location_ids.sort_unstable();
        let total = rows.values().map(|(value, _)| value).sum();
        let mut rows: Vec<LensRow> = rows
            .into_iter()
            .map(|(country_idx, (value, at))| LensRow {
                country: CountryRefSource { country_idx }.present(&self.ctx),
                value,
                locations: at.len() as u32,
            })
            .collect();
        rows.sort_by(|a, b| b.value.total_cmp(&a.value));
        ItemLens {
            unit,
            rows,
            total,
            location_ids,
        }
    }

    /// The names to set on the map. A map of religions or markets names those, and
    /// another map names the realms with the most land on the date shown, and
    /// each player. The names are those of that date, as in the list of that date.
    pub fn realm_labels(&self) -> RealmLabels {
        const MOST: usize = 90;
        // The centres come from the map, so a label needs the map's id of a location.
        // A large realm has enough with a sample of them.
        const MOST_POINTS: usize = 400;
        let workspace = self.workspace;
        let sample = |points: Vec<u32>| {
            let stride = (points.len() / MOST_POINTS).max(1);
            points.into_iter().step_by(stride).collect::<Vec<_>>()
        };
        // A map of categories names those of the land in scope.
        let scope = workspace.selection_state();
        let in_scope = |idx| scope.is_empty() || scope.contains(idx);
        match workspace.get_map_mode() {
            crate::MapMode::Religion => {
                let mut groups: FxHashMap<ReligionId, Vec<u32>> = FxHashMap::default();
                for entry in workspace.gamestate().locations.iter() {
                    if !in_scope(entry.idx()) {
                        continue;
                    }
                    if let (Some(religion), Some(center)) =
                        (entry.location().religion, workspace.center_at(entry.idx()))
                    {
                        groups
                            .entry(religion)
                            .or_default()
                            .push(u32::from(center.value()));
                    }
                }
                let labels = groups
                    .into_iter()
                    .map(|(religion, points)| {
                        let count = points.len() as u32;
                        category_label(religion.present(&self.ctx).name, count, sample(points))
                    })
                    .collect();
                return RealmLabels { labels };
            }
            crate::MapMode::Markets => {
                let mut groups: FxHashMap<MarketId, Vec<u32>> = FxHashMap::default();
                for entry in workspace.gamestate().locations.iter() {
                    if workspace.location_terrain(entry.idx()).is_water() || !in_scope(entry.idx())
                    {
                        continue;
                    }
                    if let (Some(market), Some(center)) =
                        (entry.location().market, workspace.center_at(entry.idx()))
                        // A market belongs to a scope by its centre, as in the list of markets.
                        && workspace
                            .gamestate()
                            .market_manager
                            .get(market)
                            .and_then(|m| workspace.gamestate().locations.get(m.center))
                            .is_some_and(&in_scope)
                    {
                        groups
                            .entry(market)
                            .or_default()
                            .push(u32::from(center.value()));
                    }
                }
                let labels = groups
                    .into_iter()
                    .map(|(market, points)| {
                        let name = market.present(&self.ctx).name;
                        let short = name.strip_suffix(" Market").map(str::to_string);
                        let count = points.len() as u32;
                        category_label(short.unwrap_or(name), count, sample(points))
                    })
                    .collect();
                return RealmLabels { labels };
            }
            _ => {}
        }
        let mut land: FxHashMap<CountryId, Vec<u32>> = FxHashMap::default();
        for entry in workspace.gamestate().locations.iter() {
            let owner = workspace.owner_at_timeline_date(entry.idx());
            if owner.is_dummy() {
                continue;
            }
            if let Some(center) = workspace.center_at(entry.idx()) {
                land.entry(owner)
                    .or_default()
                    .push(u32::from(center.value()));
            }
        }
        let played: FxHashSet<CountryId> = workspace
            .gamestate()
            .played_countries
            .iter()
            .map(|played| played.country)
            .collect();
        // Two ids of one country are one label, as they are one row of the list. The
        // label has the name of the id with the most land.
        struct Group {
            speaker: CountryId,
            most: usize,
            points: Vec<u32>,
        }
        let mut groups: FxHashMap<Result<eu5save::models::CountryIdx, CountryId>, Group> =
            FxHashMap::default();
        for (country, points) in land {
            let key = workspace.live_country_of(country).ok_or(country);
            let group = groups.entry(key).or_insert(Group {
                speaker: country,
                most: 0,
                points: Vec::new(),
            });
            if points.len() > group.most {
                group.most = points.len();
                group.speaker = country;
            }
            group.points.extend(points);
        }
        let selected_owners: FxHashSet<eu5save::models::CountryIdx> = scope
            .selected_locations()
            .iter()
            .filter_map(|&idx| {
                let owner = workspace.gamestate().locations.index(idx).location().owner;
                workspace
                    .gamestate()
                    .countries
                    .get(owner.real_id()?.country_id())
            })
            .collect();
        let mut rows: Vec<Group> = groups.into_values().collect();
        rows.sort_by_key(|group| (std::cmp::Reverse(group.points.len()), group.speaker.value()));
        let labels = rows
            .into_iter()
            .enumerate()
            .filter_map(|(at, group)| {
                let live = workspace.live_country_of(group.speaker);
                let live_id = live.map(|idx| workspace.gamestate().countries.index(idx).id());
                let is_player = played.contains(&group.speaker)
                    || live_id.is_some_and(|id| played.contains(&id));
                // A small country of the selection has its name too.
                let selected = live.is_some_and(|idx| selected_owners.contains(&idx));
                if at >= MOST && !is_player && !selected {
                    return None;
                }
                let identity = workspace.country_identity_at_timeline_date(group.speaker)?;
                // A past date has no rank in the save, and the rank of the save date
                // does not speak for the country of that date.
                let data = live
                    .filter(|_| workspace.is_timeline_live())
                    .and_then(|idx| workspace.gamestate().countries.index(idx).data());
                Some(RealmLabel {
                    name: self.dated_name(group.speaker, &identity),
                    country_idx: live.map(|idx| idx.value()),
                    is_player,
                    great_power_rank: data.map_or(0, |d| d.great_power_rank.max(0) as u32),
                    location_count: group.points.len() as u32,
                    points: sample(group.points),
                })
            })
            .collect();
        RealmLabels { labels }
    }

    pub fn dated_realms(&self, include: Option<eu5save::models::CountryIdx>) -> DatedRealms {
        let mut realms = self
            .workspace
            .calculate_dated_realms(include)
            .present(&self.ctx);
        // A key with no text reads as the map names it: by the live country.
        for row in &mut realms.rows {
            if is_unresolved_name(&row.name, self.ctx.localization)
                && let Some(country) = &row.country
            {
                row.name = country.country.name.clone();
            }
        }
        realms
    }

    /// The country that a save with no human player was written from. The
    /// label of such a save ends with the name of the country, as in
    /// `1617.4.1 - Milan`. A name that more than one country has names none.
    pub fn viewpoint_country(&self, save_label: &str) -> Option<eu5save::models::CountryIdx> {
        if self.workspace.players().next().is_some() {
            return None;
        }
        let (_, name) = save_label.rsplit_once(" - ")?;
        let owners: FxHashSet<_> = self
            .workspace
            .gamestate()
            .locations
            .iter()
            .filter_map(|entry| entry.location().owner.real_id())
            .map(|id| id.country_id())
            .collect();
        let mut found = self
            .workspace
            .gamestate()
            .countries
            .iter()
            .filter(|entry| owners.contains(&entry.id()))
            .map(|entry| entry.idx())
            .filter(|idx| idx.present(&self.ctx).name == name);
        let first = found.next()?;
        found.next().is_none().then_some(first)
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
        let Some(anchor) = self.workspace.derived_entity_anchor() else {
            let country_idx = self.workspace.landless_followed_country()?;
            return Some(country_idx.present(&self.ctx).name);
        };
        match self.workspace.derived_entity_kind()? {
            EntityKind::Market => {
                let loc = self
                    .workspace
                    .gamestate()
                    .locations
                    .index(anchor)
                    .location();
                Some(loc.market?.present(&self.ctx).name)
            }
            EntityKind::Country => {
                let country_idx = self.workspace.scope_country(anchor)?;
                Some(country_idx.present(&self.ctx).name)
            }
        }
    }

    pub fn country_search_entries(&self) -> CountriesData {
        let gamestate = self.workspace.gamestate();
        let mut landed = gamestate.countries.create_index(false);
        for entry in gamestate.locations.iter() {
            let owner = entry.location().owner.real_id();
            if let Some(idx) = owner.and_then(|id| gamestate.countries.get(id.country_id())) {
                landed[idx] = true;
            }
        }
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
                    id: entry.id().into(),
                    tag,
                    color_hex: self.ctx.country_color(entry.idx()),
                    capital,
                    landed: landed[entry.idx()],
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
                owner_tag: entry
                    .location()
                    .owner
                    .real_id()
                    .and_then(|id| gamestate.countries.get(id.country_id()))
                    .map(|idx| gamestate.countries.index(idx).tag().to_str().to_string()),
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
        let color_hex = ctx.country_color(idx);
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
            flag: data.map(|data| match data.flag.as_ref() {
                Some(flag) => flag.to_str().to_string(),
                None => entry.tag().to_str().to_string(),
            }),
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
            // The key decodes the map, so it has the colour that the map paints.
            color_hex: ctx
                .market_colors
                .and_then(|colors| colors.get(&id).copied())
                .unwrap_or_else(|| market.color.into()),
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

/// The country ID in the save. The `UiCountryIdx` of a country can change
/// between saves, but this ID stays the same, also when the country changes
/// its tag. The game uses the low 24 bits again for new countries, but then it
/// increases the high 8 bits. Thus, an ID does not identify two countries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(transparent)]
#[cfg_attr(
    feature = "tsify",
    tsify(type = "number & { readonly __brand: \"UiCountryId\" }")
)]
pub struct UiCountryId(pub u32);

impl From<CountryId> for UiCountryId {
    fn from(id: CountryId) -> Self {
        UiCountryId(id.value())
    }
}
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
    /// The colour of each country on the map. A subject has a colour near its overlord's.
    pub map_colors: Option<&'a eu5save::models::CountryIndexedVecOwned<Srgb>>,
    /// The colour of each market on the map at full access.
    pub market_colors: Option<&'a FxHashMap<MarketId, Srgb>>,
}

impl<'a, 'bump> LocalizationContext<'a, 'bump> {
    /// The colour of a country as the map paints it, so a swatch matches the land.
    pub(crate) fn country_color(&self, idx: CountryIdx) -> Srgb {
        self.map_colors.map_or_else(
            || {
                self.gamestate
                    .countries
                    .index(idx)
                    .data()
                    .map(|data| data.color.into())
                    .unwrap_or_default()
            },
            |colors| colors[idx],
        )
    }

    pub fn new(
        localization: &'a Localization,
        game_data: &'a GameData,
        gamestate: &'a eu5save::models::Gamestate<'bump>,
    ) -> Self {
        Self {
            localization,
            game_data,
            gamestate,
            map_colors: None,
            market_colors: None,
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
        let flag = entry.data().and_then(|data| data.flag.as_ref());
        let name = CountryNameParts::new(entry.data().map(|data| &data.country_name), tag.to_str())
            .with_flag(flag.map(|flag| flag.to_str()))
            .present(ctx);
        let name = if is_unresolved_name(&name, ctx.localization) {
            entry
                .data()
                .and_then(|data| data.capital)
                .and_then(|capital| ctx.gamestate.locations.get(capital))
                .map(|capital| format!("Realm of {}", capital.present(ctx).name))
                .unwrap_or(name)
        } else {
            name
        };
        Localized::new(UiCountryIdx::from(self), name)
    }
}

/// The name of a religion or a market, as a label of its land.
fn category_label(name: String, location_count: u32, points: Vec<u32>) -> RealmLabel {
    RealmLabel {
        name,
        country_idx: None,
        is_player: false,
        great_power_rank: 0,
        location_count,
        points,
    }
}

/// True if the name of a country is a key that the localization does not hold,
/// such as `ABCHU`. The game's text for it is not known here, and the key is
/// no name for a reader. The capital is a true thing to say in its place.
fn is_unresolved_name(name: &str, localization: &Localization) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        && localization.get(name).is_none()
}

/// The pieces of a country name, borrowed from the save arena: the template
/// key, the tag that fills `$NAME$` and `$ADJ$`, and the other `$TOKEN$`
/// substitutions, each value a localization key.
struct CountryNameParts<'a> {
    /// The localization key of the name, or the raw name when unlocalized.
    key: &'a str,
    base: Option<&'a str>,
    variables: Vec<(&'a str, &'a str)>,
}

impl<'a> CountryNameParts<'a> {
    /// The parts of a country name from its save name record, or from its
    /// tag when the record is missing.
    fn new(name: Option<&'a CountryName<'a>>, tag: &'a str) -> Self {
        match name {
            Some(CountryName::Object(obj)) => {
                let (key, variables) = match obj.override_name.as_ref() {
                    Some(ov) => (ov.key.to_str(), ov.variables),
                    None => (obj.name.map(|b| b.to_str()).unwrap_or(tag), &[][..]),
                };
                Self {
                    key,
                    base: obj.bases.base.map(|b| b.to_str()),
                    variables: variables
                        .iter()
                        .map(|v| (v.key.to_str(), v.value.to_str()))
                        .collect(),
                }
            }
            Some(CountryName::Tag(t)) => Self {
                key: t.to_str(),
                base: None,
                variables: Vec::new(),
            },
            None => Self {
                key: tag,
                base: None,
                variables: Vec::new(),
            },
        }
    }

    /// A revolt's save record gives its source in a form that the model does not read, but
    /// the flag of the revolt starts with the source's tag: `TWS_REVOLT_218103988`.
    fn with_flag(mut self, flag: Option<&'a str>) -> Self {
        if self.base.is_none() {
            self.base = flag
                .and_then(|flag| flag.split_once("_REVOLT_"))
                .map(|(tag, _)| tag);
        }
        self
    }

    fn present(&self, ctx: &LocalizationContext<'_, '_>) -> String {
        let Some(template) = ctx.localization.get(self.key) else {
            if let Some(name) = readable_name_key(self.key) {
                return name;
            }
            return interpolate_country_name(
                self.key,
                self.base,
                &self.variables,
                ctx.localization,
            );
        };
        interpolate_country_name(template, self.base, &self.variables, ctx.localization)
    }
}

/// A readable name from a key of the families that the localization bundle
/// does not hold: a scripted country, an area, or a dynasty. The bundle has only
/// eight of the game's localization files, so a country that the game names with
/// such a key has no text. The stem of the key is the English name, so
/// `new_spain_scripted_country_name` becomes "New Spain".
fn readable_name_key(key: &str) -> Option<String> {
    let stem = ["_scripted_country_name", "_area", "_dynasty"]
        .iter()
        .find_map(|suffix| key.strip_suffix(suffix))
        .or_else(|| tag_prefixed_stem(key))?;
    let words: Vec<String> = stem
        .split('_')
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect(),
                None => String::new(),
            }
        })
        .collect();
    Some(words.join(" "))
}

/// The stem of a key that starts with a country tag, such as `SAR_piedmont`.
fn tag_prefixed_stem(key: &str) -> Option<&str> {
    let (tag, stem) = key.split_once('_')?;
    let is_tag = tag.len() == 3
        && tag
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit());
    (is_tag && !stem.is_empty()).then_some(stem)
}

/// A country name detached from the save arena.
///
/// A DTO without a lifetime can carry this where it cannot carry a
/// [`CountryName`]: the owner of a location on a past date can be a dead
/// country whose name lives only in the timeline archive. The live paths
/// keep to the borrowed [`present_country_name`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OwnedCountryName {
    key: String,
    base: Option<String>,
    variables: Vec<(String, String)>,
}

impl OwnedCountryName {
    pub(crate) fn new(name: Option<&CountryName<'_>>, tag: &str, flag: Option<&str>) -> Self {
        let parts = CountryNameParts::new(name, tag).with_flag(flag);
        Self {
            key: parts.key.to_string(),
            base: parts.base.map(str::to_string),
            variables: parts
                .variables
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }
}

impl Present for OwnedCountryName {
    type Output = String;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        CountryNameParts {
            key: &self.key,
            base: self.base.as_deref(),
            variables: self
                .variables
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str()))
                .collect(),
        }
        .present(ctx)
    }
}

/// Substitute `$TOKEN$` in a country-name template: `$NAME$`/`$ADJ$` from the
/// base tag (`<base>` / `<base>_ADJ`), other tokens from `variables` (value
/// treated as a loc key), and then the token as a loc key itself: a province's
/// name is `$sevilla$`. An area token reads from its key. A token with no text goes
/// away, because no name shows a raw token. Output is not rescanned.
fn interpolate_country_name(
    template: &str,
    base: Option<&str>,
    variables: &[(&str, &str)],
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
        } else if let Some(readable) = readable_name_key(token) {
            out.push_str(&readable);
        }
        rest = tail;
    }
    out.push_str(rest);
    let name = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        template.replace('$', "")
    } else {
        name
    }
}

/// A tag such as `AAA26`, which the game makes for a new country
fn is_generated_tag(tag: &str) -> bool {
    tag.len() > 3
        && tag
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn resolve_token<'a>(
    token: &str,
    base: Option<&'a str>,
    variables: &'a [(&'a str, &'a str)],
    localization: &'a Localization,
    lookup_key: &'a mut String,
) -> Option<&'a str> {
    // Base-tag tokens take precedence so a variable can't shadow $NAME$/$ADJ$.
    if let Some(b) = base {
        match token {
            // A tag that the game generated has no text, and it means nothing to a reader.
            "NAME" => return localization.get(b).or((!is_generated_tag(b)).then_some(b)),
            "ADJ" => {
                lookup_key.clear();
                lookup_key.push_str(b);
                lookup_key.push_str("_ADJ");
                return localization
                    .get(lookup_key)
                    .or((!is_generated_tag(b)).then_some(b));
            }
            _ => {}
        }
    }
    variables
        .iter()
        .find(|(key, _)| *key == token)
        .map(|(_, val)| localization.get(val).unwrap_or(val))
        .or_else(|| localization.get(token))
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
    fn interpolate_token_resolves_as_its_own_key() {
        let l = loc(&[("sevilla", "Sevilla")]);
        let out = interpolate_country_name("$sevilla$", None, &[], &l);
        assert_eq!(out, "Sevilla");
    }

    #[test]
    fn readable_name_key_uses_the_stem_of_known_families() {
        assert_eq!(
            readable_name_key("new_spain_scripted_country_name").as_deref(),
            Some("New Spain")
        );
        assert_eq!(
            readable_name_key("transoxiana_area").as_deref(),
            Some("Transoxiana")
        );
        assert_eq!(
            readable_name_key("toshima_dynasty").as_deref(),
            Some("Toshima")
        );
        assert_eq!(readable_name_key("AAA22"), None);
        assert_eq!(
            readable_name_key("SAR_piedmont").as_deref(),
            Some("Piedmont")
        );
        assert_eq!(readable_name_key("sar_piedmont"), None);
    }

    #[test]
    fn interpolate_unknown_token_goes_away() {
        let l = loc(&[]);
        let out = interpolate_country_name("$FOO$ Whatever", Some("TIM"), &[], &l);
        assert_eq!(out, "Whatever");
    }

    #[test]
    fn interpolate_area_token_reads_from_its_key() {
        let l = loc(&[]);
        assert_eq!(
            interpolate_country_name("$quhestan_area$", None, &[], &l),
            "Quhestan"
        );
    }

    #[test]
    fn interpolate_generated_base_says_nothing() {
        let l = loc(&[]);
        assert_eq!(
            interpolate_country_name("$ADJ$ Revolt", Some("AAA26"), &[], &l),
            "Revolt"
        );
    }

    #[test]
    fn revolt_takes_its_source_from_the_flag() {
        let parts = CountryNameParts::new(None, "AAA83").with_flag(Some("TWS_REVOLT_218103988"));
        assert_eq!(parts.base, Some("TWS"));
    }

    #[test]
    fn interpolate_no_dollar_returns_as_is() {
        let l = loc(&[]);
        let out = interpolate_country_name("Plain Name", Some("TIM"), &[], &l);
        assert_eq!(out, "Plain Name");
    }

    #[test]
    fn interpolate_without_base_drops_base_tokens() {
        let l = loc(&[("TIM_ADJ", "Timurid")]);
        let out = interpolate_country_name("$ADJ$ Rival", None, &[], &l);
        assert_eq!(out, "Rival");
    }

    #[test]
    fn interpolate_variables_substitute_from_override_variables() {
        let l = loc(&[("oyama_dynasty", "Oyama")]);
        let vars = [("NAME", "oyama_dynasty")];
        let out = interpolate_country_name("$NAME$ House", None, &vars, &l);
        assert_eq!(out, "Oyama House");
    }

    #[test]
    fn interpolate_variables_fall_back_to_literal_value() {
        let l = loc(&[]);
        let vars = [("PREFIX", "Mc"), ("SUFFIX", "son")];
        let out = interpolate_country_name("$PREFIX$Donald$SUFFIX$", None, &vars, &l);
        assert_eq!(out, "McDonaldson");
    }

    #[test]
    fn interpolate_base_tokens_win_over_variables() {
        // $NAME$ resolves from base tag, not from a variable named NAME.
        let l = loc(&[("TIM", "Timurid")]);
        let vars = [("NAME", "should_not_be_used")];
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
