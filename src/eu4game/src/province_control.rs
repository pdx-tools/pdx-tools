use eu4save::{
    CountryTag, Eu4Date, ProvinceId, TagResolver, TagResolverDated,
    models::{ProvinceEvent, WarEvent},
    query::{ProvinceOwners, Query},
};
use std::collections::HashMap;

/// The province data that [ProvinceControl] keeps current.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProvinceTracking {
    OnlyOwner,
    OwnerAndController,
}

/// A tag and the date on which the save recorded it. Give the two to a tag
/// resolver to find the tag that the country has later.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DatedTag {
    pub date: Eu4Date,
    pub tag: CountryTag,
}

impl DatedTag {
    /// Return the tag that the country has on the date of the resolver
    pub fn current(self, resolver: &TagResolverDated) -> CountryTag {
        resolver
            .resolve(self.tag, self.date)
            .map(|x| x.current)
            .unwrap_or(self.tag)
    }
}

/// Saves do not record when a rebel occupation ends
const REBELS: CountryTag = CountryTag::new(*b"REB");

/// Replays the owner and controller history of all provinces up to a date.
///
/// Saves do not record when an occupation ends at the end of a war. To find
/// it, the replay keeps the occupations of each pair of nations at war, and
/// gives the provinces back to their owners when a war between the pair ends.
#[derive(Debug)]
pub struct ProvinceControl {
    owners: Vec<Owner>,
    controllers: Vec<DatedTag>,
    conflicts: HashMap<(CountryTag, CountryTag), Vec<ProvinceId>>,
    tracking: ProvinceTracking,
    events: Vec<ControlEvent>,
    event_index: usize,

    /// The state at the start date, kept so a rewind is a copy and not a
    /// second pass over the save.
    initial_owners: Vec<Owner>,
    initial_controllers: Vec<DatedTag>,
}

#[derive(Debug, Clone, Copy)]
struct Owner {
    recorded: DatedTag,
    nation: CountryTag,
}

#[derive(Debug)]
struct ControlEvent {
    date: Eu4Date,
    kind: ControlEventKind,
}

#[derive(Debug)]
enum ControlEventKind {
    Owner {
        province: ProvinceId,
        new_owner: CountryTag,
        nation: CountryTag,
    },
    Controller {
        province: ProvinceId,
        new_controller: CountryTag,
        nation: CountryTag,
    },
    WarEnded {
        participants: Vec<(CountryTag, CountryTag)>,
    },
}

/// Return the tag that the nation which has the tag on the date is stored
/// under. The stored tag does not change when the nation switches tags, so
/// it identifies the nation across the full history.
fn nation(tag_resolver: &TagResolver, tag: CountryTag, date: Eu4Date) -> CountryTag {
    tag_resolver
        .resolve(tag, date)
        .map(|x| x.stored)
        .unwrap_or(tag)
}

fn slot(province: ProvinceId) -> usize {
    usize::from(province.as_u16())
}

/// Return the index of the first event after the date
fn events_until(events: &[ControlEvent], date: Eu4Date) -> usize {
    events.partition_point(|event| event.date <= date)
}

fn nation_pair(a: CountryTag, b: CountryTag) -> (CountryTag, CountryTag) {
    if a > b { (b, a) } else { (a, b) }
}

impl ProvinceControl {
    pub fn new(
        query: &Query,
        province_owners: &ProvinceOwners,
        tag_resolver: &TagResolver,
        tracking: ProvinceTracking,
    ) -> Self {
        let start = Eu4Date::from_ymd(1, 1, 1);
        let owners: Vec<_> = province_owners
            .initial
            .iter()
            .map(|tag| Owner {
                recorded: DatedTag {
                    date: start,
                    tag: *tag,
                },
                nation: nation(tag_resolver, *tag, start),
            })
            .collect();

        let controllers = if tracking == ProvinceTracking::OwnerAndController {
            owners.iter().map(|x| x.recorded).collect()
        } else {
            Vec::new()
        };

        let owner_changes = province_owners.changes.iter().map(|change| ControlEvent {
            date: change.date,
            kind: ControlEventKind::Owner {
                province: change.province,
                new_owner: change.to,
                nation: nation(tag_resolver, change.to, change.date),
            },
        });

        let mut events: Vec<_> = if tracking == ProvinceTracking::OwnerAndController {
            let controller_changes = query
                .save()
                .game
                .provinces
                .iter()
                .flat_map(|(id, p)| {
                    p.history
                        .events
                        .iter()
                        .map(move |(date, event)| (id, date, event))
                })
                .filter_map(|(id, date, event)| match event {
                    ProvinceEvent::Controller(x) if x.tag != REBELS => Some((*id, *date, x.tag)),
                    _ => None,
                })
                .map(|(id, date, tag)| ControlEvent {
                    date,
                    kind: ControlEventKind::Controller {
                        province: id,
                        new_controller: tag,
                        nation: nation(tag_resolver, tag, date),
                    },
                });

            let wars = query.save().game.previous_wars.iter().map(|war| {
                let ended = war
                    .history
                    .events
                    .last()
                    .map(|(date, _)| *date)
                    .unwrap_or(query.save().meta.date);

                // Use the nation and not the tag. A tag switch during the
                // war gives the war end a different tag than the
                // occupation, and the occupation then stays forever.
                let mut attackers = Vec::new();
                let mut defenders = Vec::new();
                for (date, event) in &war.history.events {
                    match event {
                        WarEvent::AddAttacker(x) => attackers.push(nation(tag_resolver, *x, *date)),
                        WarEvent::AddDefender(x) => defenders.push(nation(tag_resolver, *x, *date)),
                        _ => {}
                    }
                }

                let participants: Vec<_> = attackers
                    .iter()
                    .flat_map(|attacker| {
                        defenders
                            .iter()
                            .map(|defender| nation_pair(*attacker, *defender))
                    })
                    .collect();

                ControlEvent {
                    date: ended,
                    kind: ControlEventKind::WarEnded { participants },
                }
            });

            owner_changes
                .chain(controller_changes)
                .chain(wars)
                .collect()
        } else {
            owner_changes.collect()
        };

        // The sort must be stable: on the same date, an owner change must
        // come before a controller change.
        events.sort_by_key(|a| a.date);

        ProvinceControl {
            initial_owners: owners.clone(),
            initial_controllers: controllers.clone(),
            owners,
            controllers,
            conflicts: HashMap::new(),
            tracking,
            events,
            event_index: 0,
        }
    }

    /// Return the owner of the province
    pub fn owner(&self, province: ProvinceId) -> Option<DatedTag> {
        self.owners.get(slot(province)).map(|x| x.recorded)
    }

    /// Return the controller of the province. There is no controller when
    /// only the owner is tracked.
    pub fn controller(&self, province: ProvinceId) -> Option<DatedTag> {
        self.controllers.get(slot(province)).copied()
    }

    /// Return the number of province slots, which is one more than the
    /// largest province id
    pub fn province_slots(&self) -> usize {
        self.owners.len()
    }

    /// Go back to the start date. The sorted events stay; only the running
    /// state is restored.
    pub fn rewind(&mut self) {
        self.owners.clone_from(&self.initial_owners);
        self.controllers.clone_from(&self.initial_controllers);
        self.conflicts.clear();
        self.event_index = 0;
    }

    /// Apply all events up to and including the date. The date must not be
    /// before the date of the last call, unless there was a rewind.
    pub fn advance_to(&mut self, date: Eu4Date) {
        let remaining_events = &self.events[self.event_index..];
        let pos = events_until(remaining_events, date);
        let events = &remaining_events[..pos];
        self.event_index += pos;

        for event in events {
            match &event.kind {
                ControlEventKind::Owner {
                    province,
                    new_owner,
                    nation,
                } => {
                    // Assume controllership changes on ownership change This is
                    // backed up by two edge case scenarios. One is the
                    // surrender of maine, where a common enemy loses control
                    // ```
                    // date 1445.1.1
                    // tag FRA
                    // declare_war BUR FRA no
                    // tag ENG
                    // declare_war ENG BUR no
                    // control 177 BUR
                    // event flavor_fra.6
                    // ```
                    // The other case is inheriting a PU while at war. The
                    // province controller doesn't change, but the save
                    // re-records controller change after the inheritance
                    // happens.
                    // ```
                    // tag SAX
                    // date 1544.1.1
                    // declare_war SAX BRA no
                    // control 63 BRA
                    // date 1544.1.2
                    // kill
                    // ```
                    let ind = slot(*province);
                    self.owners[ind] = Owner {
                        recorded: DatedTag {
                            date: event.date,
                            tag: *new_owner,
                        },
                        nation: *nation,
                    };

                    if self.tracking == ProvinceTracking::OwnerAndController {
                        self.controllers[ind] = DatedTag {
                            date: event.date,
                            tag: *new_owner,
                        };
                    }
                }
                ControlEventKind::Controller {
                    province,
                    new_controller,
                    nation,
                } => {
                    let ind = slot(*province);
                    let controller = &mut self.controllers[ind];

                    // Require at least one day of separation controllership as
                    // the save records all the tag switches as controlling the
                    // province even if the tag switch hadn't happened yet,
                    // which plays havoc for saves where the player tag switches
                    // into a previously AI run tag.
                    if controller.date == event.date {
                        continue;
                    }

                    *controller = DatedTag {
                        date: event.date,
                        tag: *new_controller,
                    };

                    let owner = self.owners[ind].nation;
                    if owner != *nation {
                        let provs = self
                            .conflicts
                            .entry(nation_pair(owner, *nation))
                            .or_default();
                        provs.push(*province);
                    }
                }
                ControlEventKind::WarEnded { participants } => {
                    for combo in participants {
                        if let Some(provinces) = self.conflicts.remove(combo) {
                            for province in provinces {
                                let ind = slot(province);
                                let latest_owner = self.owners[ind].recorded.tag;
                                if self.controllers[ind].tag != latest_owner {
                                    self.controllers[ind] = DatedTag {
                                        date: event.date,
                                        tag: latest_owner,
                                    };
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
