//! Campaign timeline: who owned each location on a given date, and what a
//! country was called and colored on that date.
//!
//! The save keeps a dated ownership history for each location, and a
//! `timeline_manager` with the renames of live countries and an archive of
//! dead ones. This module folds those into two structures:
//!
//! - [`TimelineIndex`], one flat list of dated events, so a full state or a
//!   step between two dates is one linear pass. Every input to a location's
//!   political color that changes with the date has an event kind here: the
//!   owner of a location, and the identity of a country.
//! - [`CountryIdentities`], which answers "what did this country look like on
//!   this date" for live, renamed, and dead countries alike.

use eu5save::Eu5Date;
use eu5save::hash::{FxHashMap, FxHashSet};
use eu5save::models::{
    Color, CountryId, CountryName, CountryRename, DeadCountry, Gamestate, LocationIdx,
    LocationIndexedVec, Locations,
};

/// One location changing hands.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OwnerChange {
    pub location: LocationIdx,
    /// The owner before the change. Dummy when the location was unowned.
    pub from: CountryId,
    /// The owner after the change. Dummy when the location became unowned.
    pub to: CountryId,
}

/// Something that changes the political map on a date.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimelineEvent {
    /// A location changed hands.
    Owner(OwnerChange),
    /// A country took a new identity: name, tag, or color. Its land did not
    /// move, but every location it owns shows the new color from this date.
    Recolor(CountryId),
}

/// The locations and countries a step wrote, so a caller can repaint only
/// those. A location may appear more than once.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StepChanges {
    pub locations: Vec<LocationIdx>,
    pub countries: Vec<CountryId>,
}

/// Every event in the campaign, grouped by date.
///
/// The index is small: a 24 year campaign has about 18,000 changes over 555
/// dates. Every location is unowned before its first entry, so the state at
/// any date is the sum of the changes at or before it.
#[derive(Debug, Clone, Default)]
pub struct TimelineIndex {
    /// Distinct dates of change, ascending, at the start of the day.
    dates: Vec<Eu5Date>,
    /// `events[offsets[i]..offsets[i + 1]]` are the events on `dates[i]`.
    offsets: Vec<u32>,
    events: Vec<TimelineEvent>,
    /// The first date with an owner change. A recolor before it does not
    /// start the campaign.
    first_date: Option<Eu5Date>,
}

impl TimelineIndex {
    /// Build the index from the ownership history of every location and the
    /// rename records of every country.
    ///
    /// `save_date` is the date the save was written. A location whose replayed
    /// owner differs from its current `owner` gets a final change on the save
    /// date, so the index at the save date agrees with the current state. The
    /// game omits an entry when a civil war swaps two country ids under one
    /// tag, and this reconciliation covers that case.
    pub fn from_save(
        locations: &Locations<'_>,
        renames: &[CountryRename<'_>],
        save_date: Eu5Date,
    ) -> Self {
        let save_date = save_date.start_of_day();
        let mut entries: Vec<(Eu5Date, TimelineEvent)> = Vec::new();
        for entry in locations.iter() {
            let loc = entry.location();
            let mut prev = CountryId::default();
            for owned in loc.ownership_history {
                let date = owned.date.start_of_day().min(save_date);
                entries.push((
                    date,
                    TimelineEvent::Owner(OwnerChange {
                        location: entry.idx(),
                        from: prev,
                        to: owned.owner,
                    }),
                ));
                prev = owned.owner;
            }

            if prev != loc.owner {
                entries.push((
                    save_date,
                    TimelineEvent::Owner(OwnerChange {
                        location: entry.idx(),
                        from: prev,
                        to: loc.owner,
                    }),
                ));
            }
        }

        for rename in renames {
            let date = rename.date.start_of_day().min(save_date);
            entries.push((date, TimelineEvent::Recolor(rename.country_id)));
        }

        Self::from_entries(entries)
    }

    /// Build the index from dated events. Entries for one location must be in
    /// campaign order; the sort is stable, so that order survives.
    fn from_entries(mut entries: Vec<(Eu5Date, TimelineEvent)>) -> Self {
        entries.sort_by_key(|(date, _)| *date);

        let mut dates = Vec::new();
        let mut offsets = Vec::new();
        let mut events = Vec::with_capacity(entries.len());
        let mut first_date = None;
        for (date, event) in entries {
            if dates.last() != Some(&date) {
                dates.push(date);
                offsets.push(events.len() as u32);
            }
            if first_date.is_none() && matches!(event, TimelineEvent::Owner(_)) {
                first_date = Some(date);
            }
            events.push(event);
        }
        offsets.push(events.len() as u32);

        Self {
            dates,
            offsets,
            events,
            first_date,
        }
    }

    /// The first date on which any location was owned. Usually the start of
    /// the campaign.
    pub fn first_date(&self) -> Option<Eu5Date> {
        self.first_date
    }

    /// Every date on which something changed.
    pub fn dates(&self) -> &[Eu5Date] {
        &self.dates
    }

    /// The dates on which a location changed hands between two countries,
    /// with the number of locations that did, in the same measure as EU4.
    ///
    /// The index holds every change, but a player reads only some of them
    /// as history. Changes on the first date are the scenario's setup: every
    /// location gets its initial owner then, which is nine in ten of all the
    /// changes in a short campaign, and it would flatten the rest of the
    /// strip. A location settled or abandoned has no country on one side of
    /// the change, and colonization fills the map with those for centuries.
    /// A location that changes hands twice on one day counts once.
    pub fn history_changes(&self) -> Vec<(Eu5Date, u32)> {
        let setup = self.first_date();
        let mut result = Vec::new();
        let mut seen = FxHashSet::default();
        for (idx, date) in self.dates.iter().enumerate() {
            if Some(*date) <= setup {
                continue;
            }
            seen.clear();
            let count = self
                .events_on(idx)
                .iter()
                .filter_map(TimelineEvent::owner_change)
                .filter(|change| !change.from.is_dummy() && !change.to.is_dummy())
                .filter(|change| seen.insert(change.location))
                .count();
            if count > 0 {
                result.push((*date, count as u32));
            }
        }
        result
    }

    fn events_on(&self, date_idx: usize) -> &[TimelineEvent] {
        let start = self.offsets[date_idx] as usize;
        let end = self.offsets[date_idx + 1] as usize;
        &self.events[start..end]
    }

    /// The number of change dates at or before `date`.
    fn position(&self, date: Eu5Date) -> usize {
        self.dates.partition_point(|d| *d <= date)
    }

    /// The owner of every one of `location_count` locations on `date`.
    /// Locations without an owner on that date hold the dummy country.
    pub fn owners_at(&self, location_count: usize, date: Eu5Date) -> LocationIndexedVec<CountryId> {
        let mut owners = LocationIndexedVec::filled(location_count, CountryId::default());
        let end = self.position(date);
        for date_idx in 0..end {
            for change in self
                .events_on(date_idx)
                .iter()
                .filter_map(TimelineEvent::owner_change)
            {
                owners[change.location] = change.to;
            }
        }
        owners
    }

    /// Move `owners`, which holds the state on `from`, to the state on `to`,
    /// and return what the step changed.
    ///
    /// A step forward applies the events in `(from, to]`. A step backward
    /// undoes the events in `(to, from]` in reverse, which restores the owner
    /// each change replaced. A recolor has no state to move: the identity
    /// lookup is by date. Crossing one in either direction reports the
    /// country, because its color differs on the two sides of the date.
    pub fn step(
        &self,
        owners: &mut LocationIndexedVec<CountryId>,
        from: Eu5Date,
        to: Eu5Date,
    ) -> StepChanges {
        let mut changes = StepChanges::default();
        let from_pos = self.position(from);
        let to_pos = self.position(to);
        if to_pos >= from_pos {
            for date_idx in from_pos..to_pos {
                for event in self.events_on(date_idx) {
                    match event {
                        TimelineEvent::Owner(change) => {
                            owners[change.location] = change.to;
                            changes.locations.push(change.location);
                        }
                        TimelineEvent::Recolor(country) => changes.countries.push(*country),
                    }
                }
            }
        } else {
            for date_idx in (to_pos..from_pos).rev() {
                for event in self.events_on(date_idx).iter().rev() {
                    match event {
                        TimelineEvent::Owner(change) => {
                            owners[change.location] = change.from;
                            changes.locations.push(change.location);
                        }
                        TimelineEvent::Recolor(country) => changes.countries.push(*country),
                    }
                }
            }
        }
        changes
    }
}

impl TimelineEvent {
    fn owner_change(&self) -> Option<&OwnerChange> {
        match self {
            TimelineEvent::Owner(change) => Some(change),
            TimelineEvent::Recolor(_) => None,
        }
    }
}

/// What a country was called and colored on a date.
#[derive(Debug, Clone, Copy)]
pub struct CountryIdentity<'a> {
    pub tag: &'a str,
    pub name: Option<&'a CountryName<'a>>,
    pub color: Color,
    /// True when the country has no live record: it exists only in the dead
    /// country archive of the timeline.
    pub dead: bool,
}

/// Country names, tags, and colors as they were on a date.
///
/// A rename record holds the identity a country had *before* the record's
/// date, so the identity on a date is the earliest rename dated after it, and
/// otherwise the current record, live or dead.
#[derive(Debug, Default)]
pub struct CountryIdentities<'bump> {
    renames: FxHashMap<CountryId, Vec<&'bump CountryRename<'bump>>>,
    dead: FxHashMap<CountryId, &'bump DeadCountry<'bump>>,
}

impl<'bump> CountryIdentities<'bump> {
    pub fn new(gamestate: &Gamestate<'bump>) -> Self {
        let timeline = &gamestate.timeline_manager;
        let mut renames: FxHashMap<CountryId, Vec<&'bump CountryRename<'bump>>> =
            FxHashMap::default();
        for rename in timeline.country_renames {
            renames.entry(rename.country_id).or_default().push(rename);
        }
        for list in renames.values_mut() {
            list.sort_by_key(|rename| rename.date);
        }

        let dead = timeline
            .dead_countries
            .iter()
            .map(|country| (country.country_id, country))
            .collect();

        Self { renames, dead }
    }

    /// The identity of `country` on `date`, or `None` when the save has no
    /// record of the country at all.
    pub fn identity_at<'a>(
        &'a self,
        gamestate: &'a Gamestate<'bump>,
        country: CountryId,
        date: Eu5Date,
    ) -> Option<CountryIdentity<'a>> {
        if let Some(renames) = self.renames.get(&country)
            && let Some(rename) = renames.iter().find(|rename| rename.date > date)
        {
            return Some(CountryIdentity {
                tag: rename.tag.as_str(),
                name: Some(&rename.name),
                color: color_from_hex(rename.map_color_hex),
                dead: false,
            });
        }

        if let Some(idx) = gamestate.countries.get(country) {
            let entry = gamestate.countries.index(idx);
            let data = entry.data()?;
            return Some(CountryIdentity {
                tag: entry.tag().as_str(),
                name: Some(&data.country_name),
                color: data.color,
                dead: false,
            });
        }

        let dead = self.dead.get(&country)?;
        Some(CountryIdentity {
            tag: dead.tag.as_str(),
            name: Some(&dead.name),
            color: color_from_hex(dead.map_color_hex),
            dead: true,
        })
    }
}

/// The timeline stores a map color as `0xAARRGGBB`.
fn color_from_hex(hex: u32) -> Color {
    Color([(hex >> 16) as u8, (hex >> 8) as u8, hex as u8])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(s: &str) -> Eu5Date {
        Eu5Date::parse(s).unwrap()
    }

    fn change(location: u32, from: u32, to: u32) -> TimelineEvent {
        TimelineEvent::Owner(OwnerChange {
            location: LocationIdx::new(location),
            from: CountryId::new(from),
            to: CountryId::new(to),
        })
    }

    fn recolor(country: u32) -> TimelineEvent {
        TimelineEvent::Recolor(CountryId::new(country))
    }

    /// Location 134 of the reference save: Denmark from the campaign start,
    /// Skane from 1338.6.3. Location 7 is never owned. Location 0 changes
    /// hands twice on one day.
    fn sample_index() -> TimelineIndex {
        TimelineIndex::from_entries(vec![
            (date("1337.4.1"), change(0, 0, 4)),
            (date("1337.4.1"), change(134, 0, 4)),
            (date("1338.6.3"), change(134, 4, 5)),
            (date("1340.1.1"), change(0, 4, 5)),
            (date("1340.1.1"), change(0, 5, 6)),
        ])
    }

    fn owner(owners: &LocationIndexedVec<CountryId>, location: u32) -> u32 {
        owners[LocationIdx::new(location)].value()
    }

    #[test]
    fn groups_changes_by_date() {
        let index = sample_index();
        assert_eq!(
            index.dates(),
            &[date("1337.4.1"), date("1338.6.3"), date("1340.1.1")]
        );
        assert_eq!(index.events_on(1), &[change(134, 4, 5)]);
        assert_eq!(index.events_on(2).len(), 2);
        assert_eq!(index.first_date(), Some(date("1337.4.1")));
    }

    /// The first date is setup, a change to or from no owner is settlement,
    /// and a location counts once per date.
    #[test]
    fn history_changes_count_locations_that_changed_hands() {
        let index = TimelineIndex::from_entries(vec![
            (date("1337.4.1"), change(0, 0, 4)),
            (date("1337.4.1"), change(134, 0, 4)),
            (date("1338.6.3"), change(134, 4, 5)),
            (date("1338.6.3"), change(7, 0, 5)),
            (date("1339.1.1"), change(7, 5, 0)),
            (date("1339.6.1"), recolor(5)),
            (date("1340.1.1"), change(0, 4, 5)),
            (date("1340.1.1"), change(0, 5, 6)),
            (date("1340.1.1"), change(134, 5, 6)),
        ]);
        assert_eq!(
            index.history_changes(),
            [(date("1338.6.3"), 1), (date("1340.1.1"), 2)]
        );
    }

    #[test]
    fn owner_changes_on_the_recorded_date() {
        let index = sample_index();
        let at = |d: &str| index.owners_at(200, date(d));
        assert_eq!(owner(&at("1337.3.31"), 134), 0);
        assert_eq!(owner(&at("1337.4.1"), 134), 4);
        assert_eq!(owner(&at("1338.6.2"), 134), 4);
        assert_eq!(owner(&at("1338.6.3"), 134), 5);
        assert_eq!(owner(&at("1350.1.1"), 134), 5);
        assert_eq!(owner(&at("1350.1.1"), 7), 0);
    }

    #[test]
    fn stepping_forward_and_backward_agree_with_the_full_state() {
        let index = sample_index();
        let dates = [
            "1337.1.1",
            "1337.4.1",
            "1338.1.1",
            "1338.6.3",
            "1339.12.31",
            "1340.1.1",
            "1341.1.1",
        ]
        .map(date);

        for &from in &dates {
            for &to in &dates {
                let mut owners = index.owners_at(200, from);
                index.step(&mut owners, from, to);
                let expected = index.owners_at(200, to);
                assert!(owners.iter().eq(expected.iter()), "step {from:?} -> {to:?}");
            }
        }
    }

    /// Two changes to one location on the same day undo in reverse order.
    #[test]
    fn stepping_back_over_a_same_day_double_change_restores_the_first_owner() {
        let index = sample_index();
        let mut owners = index.owners_at(200, date("1340.1.1"));
        assert_eq!(owner(&owners, 0), 6);
        let changes = index.step(&mut owners, date("1340.1.1"), date("1339.1.1"));
        assert_eq!(
            changes.locations,
            [LocationIdx::new(0), LocationIdx::new(0)]
        );
        assert!(changes.countries.is_empty());
        assert_eq!(owner(&owners, 0), 4);
    }

    /// A recolor takes effect on its date. A step from the day before to the
    /// day of the recolor crosses it, and so does the step back. It moves no
    /// owner, and it is not a change of hands for the timeline strip.
    #[test]
    fn stepping_over_a_recolor_reports_the_country() {
        let index = TimelineIndex::from_entries(vec![
            (date("1337.4.1"), change(0, 0, 4)),
            (date("1400.1.1"), recolor(4)),
            (date("1400.1.1"), change(0, 4, 5)),
            (date("1420.1.1"), recolor(5)),
        ]);
        let countries = |from: &str, to: &str| {
            let mut owners = index.owners_at(1, date(from));
            let changes = index.step(&mut owners, date(from), date(to));
            changes
                .countries
                .iter()
                .map(|id| id.value())
                .collect::<Vec<_>>()
        };

        assert_eq!(countries("1399.12.31", "1400.1.1"), [4]);
        assert_eq!(countries("1400.1.1", "1399.12.31"), [4]);
        assert_eq!(countries("1400.1.1", "1410.1.1"), Vec::<u32>::new());
        assert_eq!(countries("1400.1.1", "1420.1.1"), [5]);
        assert_eq!(countries("1337.4.1", "1500.1.1"), [4, 5]);
        assert_eq!(countries("1420.1.1", "1420.1.1"), Vec::<u32>::new());

        assert_eq!(index.first_date(), Some(date("1337.4.1")));
        assert_eq!(index.history_changes(), [(date("1400.1.1"), 1)]);
    }

    /// A recolor before the first owned location does not move the campaign
    /// start.
    #[test]
    fn first_date_is_the_first_owner_change() {
        let index = TimelineIndex::from_entries(vec![
            (date("1337.1.1"), recolor(4)),
            (date("1337.4.1"), change(0, 0, 4)),
        ]);
        assert_eq!(index.first_date(), Some(date("1337.4.1")));
        assert!(index.history_changes().is_empty());
    }

    #[test]
    fn empty_index() {
        let index = TimelineIndex::from_entries(Vec::new());
        assert!(index.dates().is_empty());
        assert_eq!(index.first_date(), None);
        assert_eq!(index.position(date("1400.1.1")), 0);
        let owners = index.owners_at(3, date("1400.1.1"));
        assert!(owners.iter().all(|c| c.is_dummy()));
    }

    #[test]
    fn map_color_hex_is_argb() {
        // STC in the reference save: 0xffbfbf0d is rgb(191, 191, 13).
        assert_eq!(color_from_hex(0xffbfbf0d), Color([191, 191, 13]));
        assert_eq!(color_from_hex(0xffe8791e), Color([232, 121, 30]));
    }
}
