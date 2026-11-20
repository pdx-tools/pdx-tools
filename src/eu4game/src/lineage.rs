//! Countries tracked over time through the tag switches that saves record.
//!
//! A tag names a country only between switches. When Alodia forms Nubia,
//! one country holds ALO and then NBI: one lineage. When Ulm forms
//! Byzantium after the first Byzantium was annexed, BYZ names two countries:
//! the first is a lineage of its own, an earlier holder of the tag.
//!
//! A country's history lists its switches in order, so one country's
//! switches on one day keep that order: a tag it passes through that day is
//! a holding of no length between its neighbors. When switches of two
//! countries touch a tag on one day, their order is unknown; that tag is one
//! lineage, flagged, and joined to no other.

use eu4save::{
    CountryTag, PdsDate,
    models::{CountryEvent, Eu4Save},
};
use std::collections::{BTreeMap, BTreeSet};

/// A game date, written `YYYY-MM-DD`. It orders like the `date_sort` of a
/// snapshot descriptor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GameDate(i32);
impl GameDate {
    pub fn from_eu4(date: eu4save::Eu4Date) -> Self {
        Self::from_date_sort(
            i32::from(date.year()) * 10000 + i32::from(date.month()) * 100 + i32::from(date.day()),
        )
    }
    /// The date of a snapshot `date_sort`, such as 14441111.
    pub fn from_date_sort(date_sort: i32) -> Self {
        Self(date_sort)
    }
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
        let text = <String as serde::Deserialize>::deserialize(deserializer)?;
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

/// A country that changed its tag on a date, as its history in a save
/// records it.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct TagSwitch {
    pub from: CountryTag,
    pub to: CountryTag,
    #[cfg_attr(feature = "tsify", tsify(type = "string"))]
    pub date: GameDate,
    /// The first tag of the country that switched. With the date of its
    /// first switch, this names the country across the saves of a campaign.
    pub country: CountryTag,
    /// The date of that country's first switch.
    #[cfg_attr(feature = "tsify", tsify(type = "string"))]
    pub country_since: GameDate,
    /// The place of the switch in that country's history, which orders its
    /// switches on one day.
    pub order: u16,
    /// Which one this is of switches that one save records alike for
    /// different countries. Usually 0.
    pub copy: u8,
}
impl TagSwitch {
    /// The country that made the switch, as its history names it.
    fn maker(&self) -> (CountryTag, GameDate) {
        (self.country, self.country_since)
    }
}
impl TagSwitch {
    /// False for a recorded switch to the same tag, which changes nothing.
    pub fn changes_tag(&self) -> bool {
        self.from != self.to
    }
}

/// The tag switches that a save records, from each country's history. Each
/// country is read on its own: a released country that takes an earlier
/// tag back does not hide the switches of the country that held it.
pub fn tag_switches(save: &Eu4Save) -> Vec<TagSwitch> {
    let mut switches: Vec<_> = save
        .game
        .countries
        .iter()
        .flat_map(|(tag, country)| {
            let froms = country
                .history
                .events
                .iter()
                .filter_map(|(date, event)| match *event {
                    CountryEvent::ChangedTagFrom(from) => Some((GameDate::from_eu4(*date), from)),
                    _ => None,
                });
            country_switches(*tag, froms, &country.previous_country_tags)
        })
        .collect();
    number_alike(&mut switches);
    switches
}

/// Sort switches and number apart the alike ones that two countries record,
/// so that neither hides the other.
fn number_alike(switches: &mut [TagSwitch]) {
    switches.sort();
    for at in 1..switches.len() {
        let before = switches[at - 1];
        let alike = TagSwitch {
            copy: before.copy,
            ..switches[at]
        };
        if alike == before {
            switches[at].copy = before.copy.saturating_add(1);
        }
    }
}

/// The switches of one country: the tags it changed from, with their dates,
/// and the tags that the save lists as its earlier ones.
fn country_switches(
    tag: CountryTag,
    froms: impl Iterator<Item = (GameDate, CountryTag)>,
    previous: &[CountryTag],
) -> Vec<TagSwitch> {
    let froms: Vec<_> = froms.collect();
    // The tag after the last switch, as eu4save reads it.
    let latest = previous.get(froms.len()).copied().unwrap_or(tag);
    let tos = froms
        .iter()
        .skip(1)
        .map(|(_, from)| *from)
        .chain(std::iter::once(latest));
    // A switch to the same tag changes nothing, so it neither names the
    // country nor takes a place in its order.
    let changes: Vec<_> = froms
        .iter()
        .zip(tos)
        .map(|(&(date, from), to)| (date, from, to))
        .filter(|(_, from, to)| from != to)
        .collect();
    let Some(&(country_since, country, _)) = changes.first() else {
        return Vec::new();
    };
    changes
        .iter()
        .enumerate()
        .map(|(order, &(date, from, to))| TagSwitch {
            from,
            to,
            date,
            country,
            country_since,
            order: u16::try_from(order).unwrap_or(u16::MAX),
            copy: 0,
        })
        .collect()
}

/// A tag over the dates that one country held it: from `from`, until
/// before `until`. A missing end is open.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct HeldTag {
    pub tag: CountryTag,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "tsify", tsify(optional, type = "string"))]
    pub from: Option<GameDate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "tsify", tsify(optional, type = "string"))]
    pub until: Option<GameDate>,
}
impl HeldTag {
    pub fn contains(&self, date: GameDate) -> bool {
        self.from.is_none_or(|from| from <= date) && self.until.is_none_or(|until| date < until)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum LineageKind {
    Country,
    /// A country that held its last tag before another country took it.
    EarlierHolder,
    /// A tag whose holders cannot be told apart. It joins no other tag.
    Ambiguous,
}

/// One country over time: the tags it held, in date order.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct Lineage {
    tags: Vec<HeldTag>,
    kind: LineageKind,
    /// The switches of the campaign that touch these tags, for [`Lineage::held_in`].
    #[serde(skip)]
    switches: Vec<TagSwitch>,
}
impl Lineage {
    /// The tags that the country held, in date order. `held_in` gives an index into them.
    pub fn tags(&self) -> &[HeldTag] {
        &self.tags
    }

    pub fn kind(&self) -> LineageKind {
        self.kind
    }

    /// The tag that the country held in a save, with its index in `tags`, or
    /// None when that cannot be told. `date` is the save's date and
    /// `recorded` the switches that the save records.
    ///
    /// - A tag whose holders cannot be told apart resolves no save.
    /// - A save records its own past switches, up to and including its own
    ///   day. One that lacks a switch of a tag while the country held it is on
    ///   another branch of the campaign, or from before that switch on the
    ///   day of it, and resolves to nothing.
    /// - Build the lineages from the switches of every save that this reads:
    ///   a save with a switch of a held tag that they lack is not resolved.
    pub fn held_in(&self, date: GameDate, recorded: &[TagSwitch]) -> Option<(usize, &HeldTag)> {
        if self.kind == LineageKind::Ambiguous {
            return None;
        }
        let index = self.tags.iter().position(|held| held.contains(date))?;
        let touches = |tag: CountryTag, x: &TagSwitch| x.from == tag || x.to == tag;
        let recorded: Vec<_> = recorded.iter().filter(|x| x.changes_tag()).collect();
        let during = |seg: &HeldTag, x: &TagSwitch| {
            touches(seg.tag, x)
                && seg.from.is_none_or(|from| from <= x.date)
                && seg.until.is_none_or(|until| x.date <= until)
                && x.date <= date
        };
        let on_branch = self.tags[..=index].iter().all(|seg| {
            let known = self.switches.iter().filter(|x| during(seg, x));
            let seen = recorded.iter().filter(|x| during(seg, x));
            known.clone().all(|x| recorded.contains(&x))
                && seen.clone().all(|x| self.switches.contains(x))
        });
        on_branch.then(|| (index, &self.tags[index]))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Event {
    /// Another tag switched to this one.
    Into(TagSwitch),
    /// This tag switched to another one.
    Out(TagSwitch),
}
impl Event {
    fn switch(self) -> TagSwitch {
        match self {
            Event::Into(x) | Event::Out(x) => x,
        }
    }
}

/// One stretch of one tag between its switch dates.
#[derive(Debug, Clone, Copy)]
struct Segment {
    held: HeldTag,
    start: Option<Event>,
    end: Option<Event>,
    ambiguous: bool,
}

/// The lineages that hold any of the tags on some date. A switch joins the
/// tag held until its date to the tag held from it when `tracked` accepts
/// both tags. A tag that `tracked` rejects, such as a colonial nation's,
/// which the game gives to another country without a switch, is in no
/// lineage: its switches only end the holding of the tag on their other side.
pub fn lineages(
    tags: impl IntoIterator<Item = CountryTag>,
    switches: &[TagSwitch],
    tracked: impl Fn(&CountryTag) -> bool,
) -> Vec<Lineage> {
    // Saves of one campaign record the same switch, so each counts once.
    let switches: BTreeSet<_> = switches.iter().filter(|x| x.changes_tag()).collect();
    let mut events = BTreeMap::<CountryTag, Vec<Event>>::new();
    for switch in &switches {
        events
            .entry(switch.to)
            .or_default()
            .push(Event::Into(**switch));
        events
            .entry(switch.from)
            .or_default()
            .push(Event::Out(**switch));
    }
    let tags: BTreeSet<_> = tags.into_iter().filter(|tag| tracked(tag)).collect();
    let mut segments = Vec::new();
    for tag in tags.iter().chain(events.keys()).collect::<BTreeSet<_>>() {
        segments.extend(segments_of(*tag, events.get(tag).map_or(&[][..], |x| &**x)));
    }

    // The segment that a switch starts.
    let starts: BTreeMap<_, _> = segments
        .iter()
        .enumerate()
        .filter_map(|(at, x)| match x.start {
            Some(Event::Into(switch)) if !x.ambiguous => Some((switch, at)),
            _ => None,
        })
        .collect();
    let next = |at: usize| -> Option<usize> {
        let segment: &Segment = &segments[at];
        let Some(Event::Out(switch)) = segment.end else {
            return None;
        };
        let linked = !segment.ambiguous && tracked(&switch.from) && tracked(&switch.to);
        linked.then(|| starts.get(&switch).copied()).flatten()
    };
    let continued: BTreeSet<_> = (0..segments.len()).filter_map(next).collect();

    let mut result = Vec::new();
    for first in (0..segments.len()).filter(|at| !continued.contains(at)) {
        let mut chain = vec![first];
        while let Some(at) = next(*chain.last().expect("a chain has a segment")) {
            chain.push(at);
        }
        if !chain
            .iter()
            .any(|at| tags.contains(&segments[*at].held.tag))
        {
            continue;
        }
        let last = &segments[*chain.last().expect("a chain has a segment")];
        let kind = if last.ambiguous {
            LineageKind::Ambiguous
        } else if matches!(last.end, Some(Event::Into(_))) {
            LineageKind::EarlierHolder
        } else {
            LineageKind::Country
        };
        let tags: Vec<_> = chain.iter().map(|at| segments[*at].held).collect();
        let switches = switches
            .iter()
            .filter(|x| {
                tags.iter()
                    .any(|held| held.tag == x.from || held.tag == x.to)
            })
            .map(|x| **x)
            .collect();
        result.push(Lineage {
            tags,
            kind,
            switches,
        });
    }
    result
}

/// The stretches of a tag between its switches. A tag that a country passes
/// through on one day has a stretch of no length.
fn segments_of(tag: CountryTag, events: &[Event]) -> Vec<Segment> {
    let mut events = events.to_vec();
    events.sort_by_key(|x| (x.switch().date, x.switch().order));
    // Switches of two countries on one day have no known order. Two
    // switches at one place of one history are of two countries too.
    let unordered = events.windows(2).any(|pair| {
        let (a, b) = (pair[0].switch(), pair[1].switch());
        a.date == b.date && (a.maker() != b.maker() || a.order == b.order)
    });
    if unordered {
        return vec![Segment {
            held: HeldTag {
                tag,
                from: None,
                until: None,
            },
            start: None,
            end: None,
            ambiguous: true,
        }];
    }
    let mut segments = Vec::with_capacity(events.len() + 1);
    let mut from = None;
    let mut start = None;
    for event in events {
        let date = event.switch().date;
        segments.push(Segment {
            held: HeldTag {
                tag,
                from,
                until: Some(date),
            },
            start,
            end: Some(event),
            ambiguous: false,
        });
        from = Some(date);
        start = Some(event);
    }
    segments.push(Segment {
        held: HeldTag {
            tag,
            from,
            until: None,
        },
        start,
        end: None,
        ambiguous: false,
    });
    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(tag: &str) -> CountryTag {
        tag.parse().unwrap()
    }
    fn date(year: i32) -> GameDate {
        GameDate::from_date_sort(year * 10000 + 101)
    }
    /// The first switch of a country, from its first tag.
    fn switch(from: &str, to: &str, year: i32) -> TagSwitch {
        TagSwitch {
            from: tag(from),
            to: tag(to),
            date: date(year),
            country: tag(from),
            country_since: date(year),
            order: 0,
            copy: 0,
        }
    }
    /// The switches of one country in its order: `chain[i]` is (from, to, date_sort).
    fn history(chain: &[(&str, &str, i32)]) -> Vec<TagSwitch> {
        chain
            .iter()
            .enumerate()
            .map(|(order, &(from, to, day))| TagSwitch {
                from: tag(from),
                to: tag(to),
                date: GameDate::from_date_sort(day),
                country: tag(chain[0].0),
                country_since: GameDate::from_date_sort(chain[0].2),
                order: order as u16,
                copy: 0,
            })
            .collect()
    }
    /// The tag of a lineage in a save of a year that records `switches`.
    fn tag_in(lineage: &Lineage, year: i32, switches: &[TagSwitch]) -> Option<CountryTag> {
        let (_, held) = lineage.held_in(date(year), switches)?;
        Some(held.tag)
    }

    /// Each lineage as its tags and their first years.
    fn chains(tags: &[&str], switches: &[TagSwitch]) -> Vec<(Vec<String>, LineageKind)> {
        let mut result: Vec<_> = lineages(tags.iter().map(|x| tag(x)), switches, |_| true)
            .into_iter()
            .map(|lineage| {
                let tags = lineage
                    .tags
                    .iter()
                    .map(|x| format!("{}@{}", x.tag, x.from.map_or(0, |x| x.date_sort() / 10000)))
                    .collect();
                (tags, lineage.kind)
            })
            .collect();
        result.sort();
        result
    }

    #[test]
    fn a_tag_without_switches_is_one_country() {
        let found = lineages([tag("FRA")], &[], |_| true);
        assert_eq!(found.len(), 1);
        assert_eq!(tag_in(&found[0], 1444, &[]), Some(tag("FRA")));
        assert_eq!(found[0].kind, LineageKind::Country);
    }

    #[test]
    fn a_switch_and_a_chain_are_one_country() {
        let switches = [switch("ALO", "NBI", 1451)];
        let found = lineages([tag("NBI")], &switches, |_| true);
        let nubia = found
            .iter()
            .find(|x| x.kind == LineageKind::Country)
            .unwrap();
        assert_eq!(tag_in(nubia, 1450, &switches), Some(tag("ALO")));
        assert_eq!(tag_in(nubia, 1452, &switches), Some(tag("NBI")));
        // NBI before the switch would be another country; it has no value
        // in a real campaign, and a chart drops a lineage without values.
        assert_eq!(found.len(), 2);

        let chain = [switch("BRA", "PRU", 1525), switch("PRU", "GER", 1700)];
        assert_eq!(
            chains(&["BRA"], &chain),
            [
                (
                    vec!["BRA@0".into(), "PRU@1525".into(), "GER@1700".into()],
                    LineageKind::Country
                ),
                (vec!["BRA@1525".into()], LineageKind::Country),
            ]
        );
    }

    #[test]
    fn a_reused_tag_names_two_countries() {
        // The first BYZ is annexed, and ULM forms BYZ in 1550.
        let formed = [switch("ULM", "BYZ", 1550)];
        assert_eq!(
            chains(&["BYZ"], &formed),
            [
                (vec!["BYZ@0".into()], LineageKind::EarlierHolder),
                (
                    vec!["ULM@0".into(), "BYZ@1550".into()],
                    LineageKind::Country
                ),
            ]
        );
        // POL forms PLC in 1519, and another POL appears later: POL after
        // the switch is another country.
        let released = [switch("POL", "PLC", 1519)];
        assert_eq!(
            chains(&["POL"], &released),
            [
                (
                    vec!["POL@0".into(), "PLC@1519".into()],
                    LineageKind::Country
                ),
                (vec!["POL@1519".into()], LineageKind::Country),
            ]
        );
        // BYZ forms ROM in 1500 and TRE takes BYZ in 1550: three countries.
        let both = [switch("BYZ", "ROM", 1500), switch("TRE", "BYZ", 1550)];
        assert_eq!(
            chains(&["BYZ"], &both),
            [
                (
                    vec!["BYZ@0".into(), "ROM@1500".into()],
                    LineageKind::Country
                ),
                (vec!["BYZ@1500".into()], LineageKind::EarlierHolder),
                (
                    vec!["TRE@0".into(), "BYZ@1550".into()],
                    LineageKind::Country
                ),
            ]
        );
    }

    #[test]
    fn holders_that_cannot_be_told_apart_join_nothing() {
        // Two switches into BYZ on one date.
        let switches = [switch("ULM", "BYZ", 1550), switch("TRE", "BYZ", 1550)];
        assert_eq!(
            chains(&["BYZ", "ULM"], &switches),
            [
                (vec!["BYZ@0".into()], LineageKind::Ambiguous),
                (vec!["ULM@0".into()], LineageKind::Country),
                (vec!["ULM@1550".into()], LineageKind::Country),
            ]
        );
    }

    #[test]
    fn a_switch_not_tracked_still_ends_a_holding() {
        // A colonial nation forms BYZ: the two holders of BYZ stay apart and
        // the colonial tag is in no lineage.
        let switches = [switch("C01", "BYZ", 1700)];
        let found = lineages([tag("BYZ")], &switches, |x| *x != tag("C01"));
        let held: Vec<_> = found
            .iter()
            .map(|x| {
                (
                    x.tags.iter().map(|x| x.tag.to_string()).collect::<Vec<_>>(),
                    x.kind,
                )
            })
            .collect();
        assert_eq!(
            held,
            [
                (vec!["BYZ".to_owned()], LineageKind::EarlierHolder),
                (vec!["BYZ".to_owned()], LineageKind::Country),
            ]
        );
        assert_eq!(found[1].tags[0].from, Some(date(1700)));
    }

    #[test]
    fn each_country_keeps_its_switches() {
        // BYZ forms ROM, and a released country takes BYZ back.
        let rome = country_switches(tag("ROM"), [(date(1600), tag("BYZ"))].into_iter(), &[]);
        let byzantium = country_switches(tag("BYZ"), std::iter::empty(), &[]);
        assert_eq!(rome, [switch("BYZ", "ROM", 1600)]);
        assert_eq!(byzantium, []);

        // A chain: BRA to PRU to GER.
        let germany = country_switches(
            tag("GER"),
            [(date(1525), tag("BRA")), (date(1700), tag("PRU"))].into_iter(),
            &[],
        );
        assert_eq!(
            germany,
            history(&[("BRA", "PRU", 15250101), ("PRU", "GER", 17000101)])
        );
    }

    #[test]
    fn a_save_on_the_day_of_a_switch_needs_to_record_it() {
        // ALO forms NBI in 1451, and a released ALO can appear that day.
        let switches = [switch("ALO", "NBI", 1451)];
        let found = lineages([tag("ALO"), tag("NBI")], &switches, |_| true);
        let nubia = found.iter().find(|x| x.tags.len() == 2).unwrap();
        // Saved that day before the switch, or on another branch: nothing.
        assert!(found.iter().all(|x| x.held_in(date(1451), &[]).is_none()));
        // Saved that day after the switch: the new tag, and the released ALO.
        assert_eq!(tag_in(nubia, 1451, &switches), Some(tag("NBI")));
        let mut held: Vec<_> = found
            .iter()
            .filter_map(|x| Some((x.tags.len(), x.held_in(date(1451), &switches)?.1.tag)))
            .collect();
        held.sort();
        assert_eq!(held, [(1, tag("ALO")), (2, tag("NBI"))]);
        // A later save without the switch is on another branch.
        assert_eq!(nubia.held_in(date(1452), &[]), None);
    }

    #[test]
    fn a_recorded_switch_to_the_same_tag_changes_nothing() {
        let found = lineages([tag("FRA")], &[switch("FRA", "FRA", 1500)], |_| true);
        assert_eq!(found.len(), 1);
        let same = [switch("FRA", "FRA", 1500)];
        assert_eq!(tag_in(&found[0], 1500, &same), Some(tag("FRA")));
        assert_eq!(tag_in(&found[0], 1600, &same), Some(tag("FRA")));
        assert!(
            country_switches(tag("FRA"), [(date(1500), tag("FRA"))].into_iter(), &[]).is_empty()
        );
    }

    #[test]
    fn switches_of_two_countries_on_one_day_join_nothing() {
        // A00 forms B00, and C00 also forms B00, on one day.
        let switches = [switch("A00", "B00", 1600), switch("C00", "B00", 1600)];
        let found = lineages([tag("B00")], &switches, |_| true);
        let b = found.iter().find(|x| x.tags[0].tag == tag("B00")).unwrap();
        assert_eq!(b.kind, LineageKind::Ambiguous);
        assert_eq!(b.held_in(date(1500), &[]), None);
        assert_eq!(b.held_in(date(1610), &switches), None);
    }

    #[test]
    fn one_country_passes_through_tags_on_one_day() {
        // A00 forms B00, and that country forms C00, on one day.
        let switches = history(&[("A00", "B00", 16000101), ("B00", "C00", 16000101)]);
        let found = lineages([tag("B00")], &switches, |_| true);
        let country = found
            .iter()
            .find(|x| {
                x.tags
                    .iter()
                    .map(|h| h.tag)
                    .eq([tag("A00"), tag("B00"), tag("C00")])
            })
            .unwrap();
        assert_eq!(country.kind, LineageKind::Country);
        assert_eq!(tag_in(country, 1610, &switches), Some(tag("C00")));
        // The first B00 is its own country.
        let first = found
            .iter()
            .find(|x| x.kind == LineageKind::EarlierHolder)
            .unwrap();
        assert_eq!(tag_in(first, 1500, &[]), Some(tag("B00")));
        assert_eq!(first.held_in(date(1610), &switches), None);
    }

    #[test]
    fn a_long_chain_of_one_country_is_one_lineage() {
        // The player of a world conquest, as one save records it: 33
        // switches, TIM held twice, and five days with more than one switch.
        let chain = [
            ("TIM", "ISR", 14501017),
            ("ISR", "GEO", 14501020),
            ("GEO", "MAM", 14571113),
            ("MAM", "YEM", 14590929),
            ("YEM", "HUN", 14591019),
            ("HUN", "HAB", 14591028),
            ("HAB", "SOM", 14591117),
            ("SOM", "LXA", 14600103),
            ("LXA", "HAU", 14600103),
            ("HAU", "MAL", 14600103),
            ("MAL", "TIM", 14600103),
            ("TIM", "ALG", 14600105),
            ("ALG", "MSI", 14600107),
            ("MSI", "KOJ", 14600108),
            ("KOJ", "NPL", 14600111),
            ("NPL", "ARM", 14600113),
            ("ARM", "TUN", 14600114),
            ("TUN", "MCH", 14600114),
            ("MCH", "KON", 14600115),
            ("KON", "MOR", 14600115),
            ("MOR", "DLH", 14600115),
            ("DLH", "CRO", 14600323),
            ("CRO", "TIB", 14600414),
            ("TIB", "ENG", 14600414),
            ("ENG", "KLK", 14600414),
            ("KLK", "DAI", 14600521),
            ("DAI", "INC", 14600729),
            ("INC", "SCO", 14600805),
            ("SCO", "JAP", 14600806),
            ("JAP", "ROM", 14600919),
            ("ROM", "AOT", 14611012),
            ("AOT", "VIT", 14611024),
            ("VIT", "UHW", 14611024),
        ];
        let switches = history(&chain);
        let tags = chain.iter().map(|x| tag(x.0)).chain([tag("UHW")]);
        let found = lineages(tags, &switches, |_| true);
        assert!(found.iter().all(|x| x.kind != LineageKind::Ambiguous));
        let player = found.iter().find(|x| x.tags.len() > 2).unwrap();
        assert_eq!(player.tags.len(), 34);
        assert_eq!(player.kind, LineageKind::Country);
        assert_eq!(
            player.tags.iter().filter(|h| h.tag == tag("TIM")).count(),
            2
        );
        let at = |day| GameDate::from_date_sort(day);
        let held = |day| player.held_in(at(day), &switches).map(|x| x.1.tag);
        assert_eq!(held(14710309), Some(tag("UHW")));
        assert_eq!(held(14600104), Some(tag("TIM")));
        assert_eq!(held(14450101), Some(tag("TIM")));
        // A save from a day of several switches, after them, holds the
        // last tag of the day; a tag passed through that day holds no date.
        assert_eq!(held(14600414), Some(tag("KLK")));
        assert_eq!(held(14600103), Some(tag("TIM")));
        assert!(
            player
                .tags
                .iter()
                .filter(|h| h.from.is_some() && h.from == h.until)
                .count()
                == 9
        );

        // A Tibet released after the player passed through TIB is its own
        // country and has its value.
        let tibet = found
            .iter()
            .find(|x| x.tags.len() == 1 && x.tags[0].tag == tag("TIB") && x.tags[0].from.is_some())
            .unwrap();
        assert_eq!(tibet.kind, LineageKind::Country);
        assert_eq!(tag_in(tibet, 1471, &switches), Some(tag("TIB")));
    }

    #[test]
    fn a_save_with_an_unknown_switch_is_not_resolved() {
        // Built from a save without switches, then given a save after POL
        // formed PLC and a new POL appeared.
        let found = lineages([tag("POL")], &[], |_| true);
        let later = [switch("POL", "PLC", 1519)];
        assert_eq!(found[0].held_in(date(1500), &[]).map(|x| x.0), Some(0));
        assert_eq!(found[0].held_in(date(1520), &later), None);
    }

    #[test]
    fn a_switch_recorded_twice_counts_once() {
        let switches = [switch("ALO", "NBI", 1451), switch("ALO", "NBI", 1451)];
        assert_eq!(
            chains(&["NBI"], &switches),
            [
                (
                    vec!["ALO@0".into(), "NBI@1451".into()],
                    LineageKind::Country
                ),
                (vec!["NBI@0".into()], LineageKind::EarlierHolder),
            ]
        );
    }

    #[test]
    fn countries_that_share_a_first_tag_are_told_apart() {
        // AAA forms TTT. A released AAA forms TTT again on the day that the
        // first forms BBB. Both histories start at AAA, but on other dates.
        let first = history(&[("AAA", "TTT", 15000101), ("TTT", "BBB", 15200101)]);
        let released = history(&[("AAA", "TTT", 15200101)]);
        let switches: Vec<_> = first.iter().chain(&released).copied().collect();
        let found = lineages([tag("AAA"), tag("TTT"), tag("BBB")], &switches, |_| true);
        let ttt = found.iter().find(|x| x.tags[0].tag == tag("TTT")).unwrap();
        assert_eq!(ttt.kind, LineageKind::Ambiguous);
        // No row joins the released AAA to the first country's BBB.
        assert!(found.iter().all(|x| x.tags.len() == 1));
    }

    #[test]
    fn alike_switches_of_two_countries_both_count() {
        // AAA forms BBB and then CCC on one day; a released AAA forms BBB
        // later that day. Both records hold the same AAA to BBB switch.
        let mut switches = history(&[("AAA", "BBB", 15000101), ("BBB", "CCC", 15000101)]);
        switches.push(switches[0]);
        number_alike(&mut switches);
        assert_eq!(switches.iter().map(|x| x.copy).max(), Some(1));
        let found = lineages([tag("BBB")], &switches, |_| true);
        let bbb = found.iter().find(|x| x.tags[0].tag == tag("BBB")).unwrap();
        assert_eq!(bbb.kind, LineageKind::Ambiguous);
    }

    #[test]
    fn a_switch_to_the_same_tag_does_not_change_a_country_name() {
        // A later save that also records an earlier switch to the same tag
        // names and orders the country's real switch the same way.
        let plain = country_switches(tag("BBB"), [(date(1500), tag("AAA"))].into_iter(), &[]);
        let with_noop = country_switches(
            tag("BBB"),
            [(date(1400), tag("AAA")), (date(1500), tag("AAA"))].into_iter(),
            &[],
        );
        assert_eq!(plain, [switch("AAA", "BBB", 1500)]);
        assert_eq!(with_noop, plain);
    }
}
