use super::*;
use crate::timeline::{CountryIdentities, CountryIdentity, TimelineIndex};
use eu5save::Eu5Date;

/// The date the map shows, and the owners on that date.
///
/// The workspace starts at the save date, where the historical owners equal
/// the current `owner` of every location. Moving the date steps the owners
/// through the [`TimelineIndex`], so a one day step touches few locations.
pub(super) struct TimelineState<'bump> {
    index: TimelineIndex,
    identities: CountryIdentities<'bump>,
    save_date: Eu5Date,
    date: Eu5Date,
    owners: LocationIndexedVec<CountryId>,
    /// The dead ids of a live country, and the live country of a dead id. A
    /// country that dies and returns under its tag gets a new id. For a reader
    /// the two are one country: Hungary at 1337 is Hungary at the save.
    earlier_ids: FxHashMap<CountryIdx, Vec<CountryId>>,
    returned_as: FxHashMap<CountryId, CountryIdx>,
}

impl<'bump> TimelineState<'bump> {
    pub(super) fn new(gamestate: &Gamestate<'bump>) -> Self {
        let save_date = gamestate.metadata().date.start_of_day();
        let index = TimelineIndex::from_save(
            &gamestate.locations,
            gamestate.timeline_manager.country_renames,
            save_date,
        );
        let owners = index.owners_at(gamestate.locations.len(), save_date);
        let identities = CountryIdentities::new(gamestate);
        let live_by_tag: FxHashMap<&str, CountryIdx> = gamestate
            .countries
            .iter()
            .filter(|entry| entry.data().is_some())
            .map(|entry| (entry.tag().as_str(), entry.idx()))
            .collect();
        let mut earlier_ids: FxHashMap<CountryIdx, Vec<CountryId>> = FxHashMap::default();
        let mut returned_as = FxHashMap::default();
        for (id, dead) in identities.dead_countries() {
            if let Some(&live) = live_by_tag.get(dead.tag.as_str()) {
                earlier_ids.entry(live).or_default().push(id);
                returned_as.insert(id, live);
            }
        }
        Self {
            index,
            identities,
            save_date,
            date: save_date,
            owners,
            earlier_ids,
            returned_as,
        }
    }
}

/// A named event on the timeline, ready for a control to mark.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimelineNote {
    /// The localization key of the event, such as `timeline_note_black_death`.
    pub key: String,
    pub date: Eu5Date,
}

/// What a timeline control needs to draw itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimelineSummary {
    /// False when the save carries no ownership history. The control should
    /// not show at all.
    pub available: bool,
    /// The first date any location was owned. Usually the campaign start.
    pub start: Eu5Date,
    /// The save date. The map cannot go past it.
    pub end: Eu5Date,
    /// Every date on which a location changed hands between two countries.
    /// Setup on the first date and settlement do not count; see
    /// [`TimelineIndex::history_changes`].
    pub change_dates: Vec<Eu5Date>,
    /// The number of locations that changed hands on each of `change_dates`.
    pub change_counts: Vec<u32>,
    pub notes: Vec<TimelineNote>,
}

impl<'bump> Eu5Workspace<'bump> {
    /// The date the map shows.
    pub fn timeline_date(&self) -> Eu5Date {
        self.timeline.date
    }

    /// True when the map shows the save date, so every map mode is valid.
    pub fn is_timeline_live(&self) -> bool {
        self.timeline.date == self.timeline.save_date
    }

    /// True when the map mode can be drawn for a date other than the save
    /// date. Only ownership has a history in the save.
    pub fn is_historical_map_mode(mode: MapMode) -> bool {
        matches!(mode, MapMode::Political)
    }

    pub fn timeline_summary(&self) -> TimelineSummary {
        let index = &self.timeline.index;
        let notes = self
            .gamestate
            .timeline_manager
            .timeline_notes
            .iter()
            .map(|note| TimelineNote {
                key: note.key.to_str().to_string(),
                date: note.date.start_of_day(),
            })
            .collect();

        // Reconciliation puts a change on the save date for every owned
        // location of a save without a history, so availability means a
        // change before the save date, not any change at all.
        let available = index
            .first_date()
            .is_some_and(|first| first < self.timeline.save_date);

        let (change_dates, change_counts) = index.history_changes().into_iter().unzip();
        TimelineSummary {
            available,
            start: index.first_date().unwrap_or(self.timeline.save_date),
            end: self.timeline.save_date,
            change_dates,
            change_counts,
            notes,
        }
    }

    /// The live country that an owner on any date is now: itself, or the country
    /// that came back under its tag. None for a country that did not return.
    pub(crate) fn live_country_of(&self, country: CountryId) -> Option<CountryIdx> {
        self.gamestate
            .countries
            .get(country)
            .or_else(|| self.timeline.returned_as.get(&country).copied())
    }

    /// Each id that a live country has had, itself first.
    pub(crate) fn lineage_ids(&self, country_idx: CountryIdx) -> Vec<CountryId> {
        let mut ids = vec![self.gamestate.countries.index(country_idx).id()];
        if let Some(earlier) = self.timeline.earlier_ids.get(&country_idx) {
            ids.extend_from_slice(earlier);
        }
        ids
    }

    /// A country's land on each year of the campaign, with its peak and its
    /// largest change in one year. None when the save has no history. The
    /// first year is left out of the changes, because it holds the setup.
    pub fn land_history(&self, country_idx: CountryIdx) -> Option<LandHistory> {
        let index = &self.timeline.index;
        if !index
            .first_date()
            .is_some_and(|first| first < self.timeline.save_date)
        {
            return None;
        }
        let ids = self.lineage_ids(country_idx);
        let points: Vec<LandPoint> = index
            .land_by_year(&ids, self.timeline.save_date)
            .into_iter()
            .map(|(year, locations)| LandPoint { year, locations })
            .collect();
        let peak = *points
            .iter()
            .rev()
            .max_by_key(|point| point.locations)
            .filter(|point| point.locations > 0)?;
        let changes = || {
            points.windows(2).map(|pair| LandChange {
                year: pair[1].year,
                change: pair[1].locations as i32 - pair[0].locations as i32,
            })
        };
        Some(LandHistory {
            biggest_gain: changes().filter(|c| c.change > 0).max_by_key(|c| c.change),
            biggest_loss: changes().filter(|c| c.change < 0).min_by_key(|c| c.change),
            peak,
            points,
        })
    }

    /// The countries with the most land on the date the map shows: the first
    /// ten, each player, and `include`.
    pub(crate) fn calculate_dated_realms(&self, include: Option<CountryIdx>) -> DatedRealms {
        const TOP: usize = 10;
        let mut land: FxHashMap<CountryId, u32> = FxHashMap::default();
        for owner in self.timeline.owners.iter() {
            if !owner.is_dummy() {
                *land.entry(*owner).or_default() += 1;
            }
        }
        let mut at_save: FxHashMap<CountryId, u32> = FxHashMap::default();
        for entry in self.gamestate.locations.iter() {
            if let Some(owner) = entry.location().owner.real_id() {
                *at_save.entry(owner.country_id()).or_default() += 1;
            }
        }
        let played: FxHashSet<CountryId> = self
            .gamestate
            .played_countries
            .iter()
            .map(|played| played.country)
            .collect();
        let include = include.map(|idx| self.gamestate.countries.index(idx).id());
        // Two ids of one tag can hold land at once, and they are one row. The row
        // has the name and the colour of the id with the most land.
        let mut merged: FxHashMap<Result<CountryIdx, CountryId>, (CountryId, u32, u32)> =
            FxHashMap::default();
        for (country, locations) in land {
            let key = self.live_country_of(country).ok_or(country);
            let row = merged.entry(key).or_insert((country, 0, 0));
            row.1 += locations;
            if locations > row.2 {
                row.0 = country;
                row.2 = locations;
            }
        }
        let country_count = merged.len() as u32;
        let mut ranked: Vec<(CountryId, u32)> = merged
            .into_values()
            .map(|(country, locations, _)| (country, locations))
            .collect();
        ranked.sort_by_key(|(country, locations)| (std::cmp::Reverse(*locations), country.value()));
        let rows = ranked
            .into_iter()
            .enumerate()
            .filter_map(|(at, (country, locations))| {
                let live = self.live_country_of(country);
                let live_id = live.map(|idx| self.gamestate.countries.index(idx).id());
                let wanted = at < TOP
                    || played.contains(&country)
                    || live_id.is_some_and(|id| played.contains(&id) || include == Some(id));
                if !wanted {
                    return None;
                }
                let identity = self.country_identity_at_timeline_date(country)?;
                Some(DatedRealm {
                    name: crate::presentation::OwnedCountryName::new(
                        identity.name,
                        identity.tag,
                        identity.flag,
                    ),
                    tag: identity.tag.to_string(),
                    color_hex: crate::color::Srgb(
                        self.country_color_at_timeline_date(country).rgb().into(),
                    ),
                    country: live
                        .map(|country_idx| crate::presentation::CountryRefSource { country_idx }),
                    locations,
                    rank: at as u32 + 1,
                    locations_at_save: live_id
                        .and_then(|id| at_save.get(&id).copied())
                        .unwrap_or(0),
                })
            })
            .collect();
        DatedRealms {
            rows,
            country_count,
        }
    }

    /// The land of one country on the date the map shows, its place by land, and the
    /// id that speaks for it on that date: the id of the country's lineage with the
    /// most land.
    pub fn dated_land_numbers(&self, country_idx: CountryIdx) -> (u32, u32, u32, CountryId) {
        let mut land: FxHashMap<CountryId, u32> = FxHashMap::default();
        for owner in self.timeline.owners.iter() {
            if !owner.is_dummy() {
                *land.entry(*owner).or_default() += 1;
            }
        }
        let own_id = self.gamestate.countries.index(country_idx).id();
        let speaker = self
            .lineage_ids(country_idx)
            .into_iter()
            .max_by_key(|id| land.get(id).copied().unwrap_or(0))
            .filter(|id| land.contains_key(id))
            .unwrap_or(own_id);
        let mut merged: FxHashMap<Result<CountryIdx, CountryId>, u32> = FxHashMap::default();
        for (country, locations) in land {
            *merged
                .entry(self.live_country_of(country).ok_or(country))
                .or_default() += locations;
        }
        let locations = merged.get(&Ok(country_idx)).copied().unwrap_or(0);
        let above = merged.values().filter(|count| **count > locations).count() as u32;
        (locations, above + 1, merged.len() as u32, speaker)
    }

    /// Show the map on `date`.
    ///
    /// The date is clamped to the campaign. A date other than the save date
    /// forces the political map mode, because no other mode has a history.
    /// Returns the map changes caused by the date update.
    pub fn set_timeline_date(&mut self, date: Eu5Date) -> MapChange {
        let start = self
            .timeline
            .index
            .first_date()
            .unwrap_or(self.timeline.save_date);
        let date = date.start_of_day().clamp(start, self.timeline.save_date);

        let was_live = self.is_timeline_live();
        let was_political = self.current_map_mode == MapMode::Political;
        let had_focus = self.selection_state.has_focus();
        let touched = self.step_timeline_to(date);

        // A step between two past dates in the political mode repaints only
        // the locations that changed hands. Playback steps one day at a time,
        // and a day rarely moves more than a few locations. Entering or
        // leaving the save date repaints everything, because the live map
        // also carries controller stripes.
        if was_political && !was_live && !self.is_timeline_live() {
            let mut change = self.repaint_locations(&touched);
            if had_focus && !self.selection_state.has_focus() {
                // The focused location left the selection.
                self.apply_interaction_flags();
                change.dirty = change.dirty | MapDirty::FLAGS;
            }
            return change;
        }

        let mode = if self.is_timeline_live() || Self::is_historical_map_mode(self.current_map_mode)
        {
            self.current_map_mode
        } else {
            MapMode::Political
        };
        self.apply_map_mode(mode)
    }

    /// Move the owners to `date` and return the locations that changed:
    /// those that changed hands, every location of a country that was
    /// recolored, and the surrounded terrain next to them.
    ///
    /// A recolored country keeps its land, so its locations do not change
    /// hands. Without this repaint they keep the old color, and the owner
    /// borders read the color difference between them and the land the
    /// country gained later as a frontier.
    ///
    /// The owner color of each changed location is refreshed here, because
    /// the owner borders read it in every map mode, and the map mode passes
    /// do not write it. Water and impassable terrain keep the border color
    /// and flags that `build_location_arrays` gives them, because they have
    /// no owner border. The map mode repaints only their fill.
    pub(super) fn step_timeline_to(&mut self, date: Eu5Date) -> Vec<LocationIdx> {
        let from = self.timeline.date;
        if date == from {
            return Vec::new();
        }

        let changes = self
            .timeline
            .index
            .step(&mut self.timeline.owners, from, date);
        self.timeline.date = date;

        if !self.selection_state.is_empty()
            && self
                .selection_state
                .apply_owner_changes(changes.net_owner_changes())
        {
            // The anchor can be a location that left the selection, or the
            // land can now be one country. Markets have no history.
            let kind = self.derived_entity_kind().unwrap_or(EntityKind::Country);
            self.recompute_scope_anchor(kind);
        }

        let mut touched: Vec<LocationIdx> = changes.locations().collect();
        let recolored = self.with_subjects(&changes.countries);
        if !recolored.is_empty() {
            touched.extend(
                self.timeline
                    .owners
                    .iter()
                    .enumerate()
                    .filter(|(_, owner)| recolored.contains(owner))
                    .map(|(idx, _)| LocationIdx::new(idx as u32)),
            );
        }
        touched.sort_unstable();
        touched.dedup();
        self.refill_around(&mut touched);
        for &location_idx in &touched {
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };
            if !self.location_terrain(location_idx).is_passable() {
                continue;
            }
            let color = super::map_painter::border_color(
                &self.live_values(),
                &self.map_layout(),
                location_idx,
            );
            let unowned = self.owner_at_timeline_date(location_idx).is_dummy();
            let mut gpu_location = self.location_arrays.get_mut(gpu_index);
            gpu_location.set_border_color(color);
            super::map_render::set_unowned_flag(gpu_location.flags_mut(), unowned);
        }
        touched
    }

    /// `countries` and their subjects, because a subject's color is blended
    /// toward its overlord's.
    fn with_subjects(&self, countries: &[CountryId]) -> FxHashSet<CountryId> {
        let mut result: FxHashSet<CountryId> = countries.iter().copied().collect();
        if result.is_empty() {
            return result;
        }

        let all = &self.gamestate.countries;
        let changed: FxHashSet<CountryIdx> = result.iter().filter_map(|&id| all.get(id)).collect();
        for entry in all.iter() {
            let mut overlord = self.overlord_of[entry.idx()];
            while let Some(idx) = overlord {
                if changed.contains(&idx) {
                    result.insert(entry.id());
                    break;
                }
                overlord = self.overlord_of[idx];
            }
        }
        result
    }

    /// Resolve the fill of the surrounded terrain next to the locations in
    /// `touched` again, and add that terrain to `touched`.
    ///
    /// Only the land around a component decides its fill, so a day that
    /// moves a few locations resolves a few components, each from its own
    /// boundary.
    fn refill_around(&mut self, touched: &mut Vec<LocationIdx>) {
        let mut components = Vec::new();
        for &location_idx in touched.iter() {
            let Some(gpu_index) = self.gpu_indices[location_idx] else {
                continue;
            };
            let neighbors = self
                .game_data
                .topology
                .neighbors_of_index(gpu_index.value());
            components.extend(
                neighbors
                    .iter()
                    .filter_map(|&nb| self.fill_components.component_of_color(nb)),
            );
        }
        components.sort_unstable();
        components.dedup();

        for component in components {
            let donor = self
                .fill_components
                .resolve(component, |loc| self.owner_at_timeline_date(loc).real_id());
            for &member in self.fill_components.members(component) {
                self.fill_donors[member] = donor;
                touched.push(member);
            }
        }
    }

    pub(super) fn save_date(&self) -> Eu5Date {
        self.timeline.save_date
    }

    /// The owner of a location on the timeline date. The index is reconciled
    /// to the save, so at the save date this equals the current `owner`.
    pub fn owner_at_timeline_date(&self, idx: LocationIdx) -> CountryId {
        self.timeline.owners[idx]
    }

    /// The name, tag, and color a country had on the timeline date.
    pub fn country_identity_at_timeline_date(
        &self,
        country: CountryId,
    ) -> Option<CountryIdentity<'_>> {
        self.timeline
            .identities
            .identity_at(&self.gamestate, country, self.timeline.date)
    }

    pub(crate) fn dated_country_color(&self, country: CountryId) -> GpuColor {
        self.country_color_at_timeline_date(country)
    }

    /// The political color of a country on the timeline date: its color on
    /// that date, blended toward its current overlord when it is a subject
    /// today. The save keeps no history of subject relations.
    pub(super) fn country_color_at_timeline_date(&self, country: CountryId) -> GpuColor {
        let Some(identity) = self.country_identity_at_timeline_date(country) else {
            return GpuColor::UNOWNED;
        };

        let Some(country_idx) = self.gamestate.countries.get(country) else {
            return GpuColor::from(identity.color.0);
        };

        self.subject_blended_color(country_idx, identity.color, |idx| {
            let id = self.gamestate.countries.index(idx).id();
            self.country_identity_at_timeline_date(id)
                .map(|identity| identity.color)
        })
    }
}

/// A readable label for a timeline note without a localization entry:
/// `timeline_note_black_death` becomes `Black Death`.
pub fn humanize_note_key(key: &str) -> String {
    let stem = key.strip_prefix("timeline_note_").unwrap_or(key);
    stem.split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_key_humanizes() {
        assert_eq!(
            humanize_note_key("timeline_note_black_death"),
            "Black Death"
        );
        assert_eq!(humanize_note_key("great_plague"), "Great Plague");
        assert_eq!(humanize_note_key(""), "");
    }

    #[test]
    fn political_is_the_only_historical_mode() {
        assert!(Eu5Workspace::is_historical_map_mode(MapMode::Political));
        assert!(!Eu5Workspace::is_historical_map_mode(MapMode::Population));
        assert!(!Eu5Workspace::is_historical_map_mode(MapMode::Control));
    }
}
