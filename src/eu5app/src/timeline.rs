//! Campaign timeline: who owned each location on a given date, and what a
//! country was called and colored on that date.
//!
//! The save keeps a dated ownership history for each location, and a
//! `timeline_manager` with the renames of live countries and an archive of
//! dead ones. This module folds those into two structures:
//!
//! - [`BorderIndex`], a flat list of ownership changes grouped by date, so a
//!   full state or a step between two dates is one linear pass.
//! - [`CountryIdentities`], which answers "what did this country look like on
//!   this date" for live, renamed, and dead countries alike.

use eu5save::Eu5Date;
use eu5save::hash::FxHashMap;
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

/// Every ownership change in the campaign, grouped by date.
///
/// The index is small: a 24 year campaign has about 18,000 changes over 555
/// dates. Every location is unowned before its first entry, so the state at
/// any date is the sum of the changes at or before it.
#[derive(Debug, Clone, Default)]
pub struct BorderIndex {
    /// Distinct dates of change, ascending, at 08:00.
    dates: Vec<Eu5Date>,
    /// `changes[offsets[i]..offsets[i + 1]]` are the changes on `dates[i]`.
    offsets: Vec<u32>,
    changes: Vec<OwnerChange>,
}

impl BorderIndex {
    /// Build the index from the ownership history of every location.
    ///
    /// `save_date` is the date the save was written. A location whose replayed
    /// owner differs from its current `owner` gets a final change on the save
    /// date, so the index at the save date agrees with the current state. The
    /// game omits an entry when a civil war swaps two country ids under one
    /// tag, and this reconciliation covers that case.
    pub fn from_locations(locations: &Locations<'_>, save_date: Eu5Date) -> Self {
        let save_date = save_date.start_of_day();
        let mut entries: Vec<(Eu5Date, OwnerChange)> = Vec::new();
        for entry in locations.iter() {
            let loc = entry.location();
            let mut prev = CountryId::default();
            for owned in loc.ownership_history {
                let date = owned.date.start_of_day().min(save_date);
                entries.push((
                    date,
                    OwnerChange {
                        location: entry.idx(),
                        from: prev,
                        to: owned.owner,
                    },
                ));
                prev = owned.owner;
            }

            if prev != loc.owner {
                entries.push((
                    save_date,
                    OwnerChange {
                        location: entry.idx(),
                        from: prev,
                        to: loc.owner,
                    },
                ));
            }
        }

        Self::from_entries(entries)
    }

    /// Build the index from dated changes. Entries for one location must be in
    /// campaign order; the sort is stable, so that order survives.
    fn from_entries(mut entries: Vec<(Eu5Date, OwnerChange)>) -> Self {
        entries.sort_by_key(|(date, _)| *date);

        let mut dates = Vec::new();
        let mut offsets = Vec::new();
        let mut changes = Vec::with_capacity(entries.len());
        for (date, change) in entries {
            if dates.last() != Some(&date) {
                dates.push(date);
                offsets.push(changes.len() as u32);
            }
            changes.push(change);
        }
        offsets.push(changes.len() as u32);

        Self {
            dates,
            offsets,
            changes,
        }
    }

    /// The first date on which any location was owned. Usually the start of
    /// the campaign.
    pub fn first_date(&self) -> Option<Eu5Date> {
        self.dates.first().copied()
    }

    /// Every date on which at least one location changed hands.
    pub fn dates(&self) -> &[Eu5Date] {
        &self.dates
    }

    /// The number of locations that changed hands on each of [`Self::dates`].
    pub fn change_counts(&self) -> impl ExactSizeIterator<Item = u32> + '_ {
        self.offsets.windows(2).map(|pair| pair[1] - pair[0])
    }

    fn changes_on(&self, date_idx: usize) -> &[OwnerChange] {
        let start = self.offsets[date_idx] as usize;
        let end = self.offsets[date_idx + 1] as usize;
        &self.changes[start..end]
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
            for change in self.changes_on(date_idx) {
                owners[change.location] = change.to;
            }
        }
        owners
    }

    /// Move `owners`, which holds the state on `from`, to the state on `to`.
    ///
    /// A step forward applies the changes in `(from, to]`. A step backward
    /// undoes the changes in `(to, from]` in reverse, which restores the owner
    /// each change replaced. Every location written is appended to `touched`,
    /// possibly more than once, so a caller can repaint only those.
    pub fn step(
        &self,
        owners: &mut LocationIndexedVec<CountryId>,
        from: Eu5Date,
        to: Eu5Date,
        touched: &mut Vec<LocationIdx>,
    ) {
        let from_pos = self.position(from);
        let to_pos = self.position(to);
        if to_pos >= from_pos {
            for date_idx in from_pos..to_pos {
                for change in self.changes_on(date_idx) {
                    owners[change.location] = change.to;
                    touched.push(change.location);
                }
            }
        } else {
            for date_idx in (to_pos..from_pos).rev() {
                for change in self.changes_on(date_idx).iter().rev() {
                    owners[change.location] = change.from;
                    touched.push(change.location);
                }
            }
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

    fn change(location: u32, from: u32, to: u32) -> OwnerChange {
        OwnerChange {
            location: LocationIdx::new(location),
            from: CountryId::new(from),
            to: CountryId::new(to),
        }
    }

    /// Location 134 of the reference save: Denmark from the campaign start,
    /// Skane from 1338.6.3. Location 7 is never owned. Location 0 changes
    /// hands twice on one day.
    fn sample_index() -> BorderIndex {
        BorderIndex::from_entries(vec![
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
        assert_eq!(index.changes_on(1), &[change(134, 4, 5)]);
        assert_eq!(index.change_counts().collect::<Vec<_>>(), [2, 1, 2]);
        assert_eq!(index.first_date(), Some(date("1337.4.1")));
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
                index.step(&mut owners, from, to, &mut Vec::new());
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
        let mut touched = Vec::new();
        index.step(
            &mut owners,
            date("1340.1.1"),
            date("1339.1.1"),
            &mut touched,
        );
        assert_eq!(touched, [LocationIdx::new(0), LocationIdx::new(0)]);
        assert_eq!(owner(&owners, 0), 4);
    }

    #[test]
    fn empty_index() {
        let index = BorderIndex::from_entries(Vec::new());
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
