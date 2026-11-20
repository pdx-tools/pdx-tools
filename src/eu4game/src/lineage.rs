//! Countries followed over time through the tag switches that saves record.
//!
//! A tag names a country only between switches. When Alodia forms Nubia,
//! one country holds ALO and then NBI: one lineage. When Ulm forms
//! Byzantium after the first Byzantium was annexed, BYZ names two countries:
//! the first is a lineage of its own, an earlier holder of the tag. A tag
//! whose switches share a date cannot be split by date, so it is one
//! lineage, flagged, and joined to no other.

use eu4save::{CountryTag, PdsDate, query::NationEvents};
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
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
pub struct TagSwitch {
    pub from: CountryTag,
    pub to: CountryTag,
    #[cfg_attr(feature = "tsify", tsify(type = "string"))]
    pub date: GameDate,
}

/// The tag switches of the nation events of a save, in date order.
pub fn tag_switches(events: &[NationEvents]) -> Vec<TagSwitch> {
    let mut switches: Vec<_> = events
        .iter()
        .flat_map(|nation| {
            let mut current = nation.initial;
            nation.events.iter().filter_map(move |event| {
                let (date, to) = event.as_tag_switch()?;
                let from = std::mem::replace(&mut current, to);
                Some(TagSwitch {
                    from,
                    to,
                    date: GameDate::from_eu4(date),
                })
            })
        })
        .collect();
    switches.sort_by_key(|switch| switch.date);
    switches
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
    pub tags: Vec<HeldTag>,
    pub kind: LineageKind,
}
impl Lineage {
    /// The tag that the country held on a date, if it existed then.
    pub fn tag_at(&self, date: GameDate) -> Option<CountryTag> {
        let held = self.tags.iter().find(|held| held.contains(date))?;
        Some(held.tag)
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
/// tag held until its date to the tag held from it. Pass only the switches
/// that are safe to follow: a tag that the game reuses without a switch,
/// such as a colonial nation's, joins unrelated countries.
pub fn lineages(
    tags: impl IntoIterator<Item = CountryTag>,
    switches: &[TagSwitch],
) -> Vec<Lineage> {
    let mut events = BTreeMap::<CountryTag, Vec<(GameDate, Event)>>::new();
    for switch in switches.iter().filter(|x| x.from != x.to) {
        events
            .entry(switch.to)
            .or_default()
            .push((switch.date, Event::Into(switch.from)));
        events
            .entry(switch.from)
            .or_default()
            .push((switch.date, Event::Out(switch.to)));
    }
    let tags: BTreeSet<_> = tags.into_iter().collect();
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
        (from == segment.held.tag && !segment.ambiguous).then_some(next)
    };
    let followed: BTreeSet<_> = (0..segments.len()).filter_map(next).collect();

    let mut result = Vec::new();
    for first in (0..segments.len()).filter(|at| !followed.contains(at)) {
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
        result.push(Lineage {
            tags: chain.iter().map(|at| segments[*at].held).collect(),
            kind,
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
    /// Each lineage as its tags and their first years.
    fn chains(tags: &[&str], switches: &[TagSwitch]) -> Vec<(Vec<String>, LineageKind)> {
        let mut result: Vec<_> = lineages(tags.iter().map(|x| tag(x)), switches)
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
        let found = lineages([tag("FRA")], &[]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].tag_at(date(1444)), Some(tag("FRA")));
        assert_eq!(found[0].kind, LineageKind::Country);
    }

    #[test]
    fn a_switch_and_a_chain_are_one_country() {
        let switches = [switch("ALO", "NBI", 1451)];
        let found = lineages([tag("NBI")], &switches);
        let nubia = found
            .iter()
            .find(|x| x.kind == LineageKind::Country)
            .unwrap();
        assert_eq!(nubia.tag_at(date(1450)), Some(tag("ALO")));
        assert_eq!(nubia.tag_at(date(1451)), Some(tag("NBI")));
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
}
