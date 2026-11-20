//! Countries tracked over time through the tag switches that saves record.
//!
//! A tag names a country only between switches. When Alodia forms Nubia,
//! one country holds ALO and then NBI: one lineage. When Ulm forms
//! Byzantium after the first Byzantium was annexed, BYZ names two countries:
//! the first is a lineage of its own, an earlier holder of the tag. A tag
//! whose switches share a date cannot be split by date, so it is one
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

/// A country that changed its tag on a date, as the nation events of a save
/// record it.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct TagSwitch {
    pub from: CountryTag,
    pub to: CountryTag,
    #[cfg_attr(feature = "tsify", tsify(type = "string"))]
    pub date: GameDate,
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
    switches.sort();
    switches
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
    froms
        .iter()
        .zip(tos)
        .map(|(&(date, from), to)| TagSwitch { from, to, date })
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
    pub kind: LineageKind,
    /// The switches of the campaign that touch these tags, for [`Lineage::held_in`].
    #[serde(skip)]
    switches: Vec<TagSwitch>,
}
impl Lineage {
    /// The tags that the country held, in date order. `held_in` gives an index into them.
    pub fn tags(&self) -> &[HeldTag] {
        &self.tags
    }

    /// The tag that the country held in a save, with its index in `tags`, or
    /// None when the country is not in the save. `date` is the save's date
    /// and `recorded` the switches that the save records.
    ///
    /// A save records its own past switches. One that lacks a switch of a
    /// tag while the country held it is on another branch of the campaign,
    /// and the country is not in it. A save on the day of a switch can be
    /// from before it, so on that day a holding that the switch ends or
    /// starts follows whether the save records a switch of its tag that day.
    pub fn held_in(&self, date: GameDate, recorded: &[TagSwitch]) -> Option<(usize, &HeldTag)> {
        let switched = |tag: CountryTag| {
            recorded
                .iter()
                .any(|x| x.date == date && (x.from == tag || x.to == tag))
        };
        let index = self.tags.iter().position(|held| {
            if held.until == Some(date) {
                !switched(held.tag)
            } else if held.from == Some(date) {
                held.contains(date) && switched(held.tag)
            } else {
                held.contains(date)
            }
        })?;
        let on_branch = self.tags[..=index].iter().all(|seg| {
            self.switches
                .iter()
                .filter(|x| x.from == seg.tag || x.to == seg.tag)
                .filter(|x| seg.from.is_none_or(|from| from <= x.date))
                .filter(|x| seg.until.is_none_or(|until| x.date <= until) && x.date < date)
                .all(|x| recorded.contains(x))
        });
        on_branch.then(|| (index, &self.tags[index]))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Event {
    /// Another tag switched to this one.
    Into(CountryTag),
    /// This tag switched to another one.
    Out(CountryTag),
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
    let switches: BTreeSet<_> = switches.iter().filter(|x| x.from != x.to).collect();
    let mut events = BTreeMap::<CountryTag, Vec<(GameDate, Event)>>::new();
    for switch in &switches {
        events
            .entry(switch.to)
            .or_default()
            .push((switch.date, Event::Into(switch.from)));
        events
            .entry(switch.from)
            .or_default()
            .push((switch.date, Event::Out(switch.to)));
    }
    let tags: BTreeSet<_> = tags.into_iter().filter(|tag| tracked(tag)).collect();
    let mut segments = Vec::new();
    for tag in tags.iter().chain(events.keys()).collect::<BTreeSet<_>>() {
        segments.extend(segments_of(*tag, events.get(tag).map_or(&[][..], |x| &**x)));
    }

    // The segment that a switch starts, by its tag and date.
    let starts: BTreeMap<_, _> = segments
        .iter()
        .enumerate()
        .filter_map(|(at, x)| match x.start {
            Some(Event::Into(from)) if !x.ambiguous => {
                Some(((x.held.tag, x.held.from?), (at, from)))
            }
            _ => None,
        })
        .collect();
    let next = |at: usize| -> Option<usize> {
        let segment: &Segment = &segments[at];
        let Some(Event::Out(to)) = segment.end else {
            return None;
        };
        let (next, from) = *starts.get(&(to, segment.held.until?))?;
        let linked = from == segment.held.tag && tracked(&from) && tracked(&to);
        (linked && !segment.ambiguous).then_some(next)
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

/// The stretches of a tag between its switch dates.
fn segments_of(tag: CountryTag, events: &[(GameDate, Event)]) -> Vec<Segment> {
    let mut events = events.to_vec();
    events.sort_by_key(|(date, _)| *date);
    if events.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        // The order of two switches on one date is unknown.
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
    for (date, event) in events {
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
    fn switch(from: &str, to: &str, year: i32) -> TagSwitch {
        TagSwitch {
            from: tag(from),
            to: tag(to),
            date: date(year),
        }
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
        assert_eq!(tag_in(nubia, 1451, &switches), Some(tag("NBI")));
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
            [switch("BRA", "PRU", 1525), switch("PRU", "GER", 1700)]
        );
    }

    #[test]
    fn a_save_on_the_day_of_a_switch_can_be_from_before_it() {
        let switches = [switch("ALO", "NBI", 1451)];
        let found = lineages([tag("NBI")], &switches, |_| true);
        let nubia = found
            .iter()
            .find(|x| x.kind == LineageKind::Country)
            .unwrap();
        let earlier = found
            .iter()
            .find(|x| x.kind == LineageKind::EarlierHolder)
            .unwrap();
        // Saved before the switch that day: still Alodia.
        assert_eq!(tag_in(nubia, 1451, &[]), Some(tag("ALO")));
        assert_eq!(nubia.held_in(date(1451), &[]).map(|x| x.0), Some(0));
        // A later save without the switch is on another branch.
        assert_eq!(nubia.held_in(date(1452), &[]), None);
        // The NBI that existed before the switch is not in a save after it.
        assert_eq!(earlier.held_in(date(1451), &switches), None);
        assert_eq!(earlier.held_in(date(1451), &[]).map(|x| x.0), Some(0));

        // ALO is released again after it formed NBI: a save from before the
        // switch that day is Alodia's, not the released Alodia's.
        let released = lineages([tag("ALO"), tag("NBI")], &switches, |_| true);
        let held: Vec<_> = released
            .iter()
            .filter_map(|x| Some((x.tags.len(), x.held_in(date(1451), &[])?.1.tag)))
            .collect();
        assert_eq!(held, [(2, tag("ALO")), (1, tag("NBI"))]);
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
}
