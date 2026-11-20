use super::*;
use crate::map_names::{MapNameSource, MapNameText, MapNamesSource, NamePlacement};
use crate::presentation::OwnedCountryName;
use crate::selection::SelectionPreset;
use eu5save::models::{CountryId, LocationIdx};
use pdx_map::TopologyIndex;
use std::cmp::Reverse;

/// Great powers up to this rank always try to show their names.
const MUST_SHOW_GREAT_POWERS: i32 = 10;
/// A map of religions or markets always tries to show this many of the largest.
const MUST_SHOW_CATEGORIES: usize = 8;

impl<'bump> Eu5Workspace<'bump> {
    /// The names to set on the map, the most important first. A map of
    /// religions or markets names those. Other maps name the realms of the
    /// map date. With a selection, only the names of the selection show.
    pub(crate) fn map_names(&self) -> MapNamesSource {
        let mut names = match self.current_map_mode {
            MapMode::Religion => {
                self.category_names(|_, location| location.religion, MapNameText::Religion)
            }
            MapMode::Markets => self.category_names(
                |idx, location| {
                    if self.location_terrain(idx).is_water() {
                        return None;
                    }
                    let market = location.market?;
                    let center = self.gamestate.market_manager.get(market)?.center;
                    let center = self.gamestate.locations.get(center)?;
                    // A market is in scope by its center, as in the list of markets.
                    let scope = &self.selection_state;
                    (scope.is_empty() || scope.contains(center)).then_some(center)
                },
                MapNameText::Market,
            ),
            _ => self.realm_names(),
        };
        // A name stands on the main body of its land, so that an enclave or
        // land overseas does not stretch it across land of another realm.
        let mut bodies = MainBody::new(&self.game_data.topology);
        for name in &mut names {
            name.locations = bodies.of(&name.locations);
        }
        MapNamesSource { names }
    }

    /// The categories of the land in scope, the largest first. A category
    /// that the selection only touches is named for that land only.
    fn category_names<K: Copy + Ord>(
        &self,
        category_of: impl Fn(LocationIdx, &eu5save::models::Location<'_>) -> Option<K>,
        text: impl Fn(K) -> MapNameText,
    ) -> Vec<MapNameSource> {
        let selection = &self.selection_state;
        let mut land = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !selection.is_empty() && !selection.contains(idx) {
                continue;
            }
            let (Some(key), Some(color)) =
                (category_of(idx, entry.location()), self.center_at(idx))
            else {
                continue;
            };
            land.push((key, color.value()));
        }

        let mut groups = group_land(land);
        // Locations come in order, so the first one breaks a tie the same way each time.
        groups.sort_by_key(|(_, locations)| (Reverse(locations.len()), locations[0]));
        groups
            .into_iter()
            .enumerate()
            .map(|(at, (key, locations))| MapNameSource {
                text: text(key),
                placement: if !selection.is_empty() {
                    NamePlacement::LeaderLine
                } else if at < MUST_SHOW_CATEGORIES {
                    NamePlacement::NearLand
                } else {
                    NamePlacement::OnLand
                },
                locations,
            })
            .collect()
    }

    /// The realms of the map date. The player's own country comes first, then
    /// the players and the great powers by rank, then the realms with the most
    /// land. A past date has no ranks, because the save keeps only the ranks
    /// of the save date.
    fn realm_names(&self) -> Vec<MapNameSource> {
        let selection = &self.selection_state;
        let live = self.is_timeline_live();
        let players: FnvHashSet<CountryIdx> = self.players().map(|player| player.country).collect();
        let home = (players.len() == 1)
            .then(|| players.iter().next().copied())
            .flatten();

        // With a selection, a realm is named for its land in the selection.
        let mut land = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            if !selection.is_empty() && !selection.contains(idx) {
                continue;
            }
            let owner = self.owner_at_timeline_date(idx);
            if let Some(color) = self.center_at(idx).filter(|_| !owner.is_dummy()) {
                land.push((owner, color.value()));
            }
        }

        struct Realm {
            owner: CountryId,
            live: Option<CountryIdx>,
            locations: Vec<u16>,
        }
        let mut realms: Vec<Realm> = group_land(land)
            .into_iter()
            .map(|(owner, locations)| Realm {
                owner,
                live: self.live_country_of(owner),
                locations,
            })
            .collect();
        realms.sort_by_key(|realm| (Reverse(realm.locations.len()), realm.owner.value()));

        let is_player = |realm: &Realm| realm.live.is_some_and(|idx| players.contains(&idx));
        let great_power_rank = |realm: &Realm| {
            let rank = realm
                .live
                .filter(|_| live)
                .and_then(|idx| self.gamestate.countries.index(idx).data())
                .map_or(0, |data| data.great_power_rank);
            (rank > 0).then_some(rank)
        };
        let players_only = selection.preset() == Some(SelectionPreset::Players);

        let mut names: Vec<(_, MapNameSource)> = realms
            .into_iter()
            .enumerate()
            .filter_map(|(by_land, realm)| {
                let player = is_player(&realm);
                let rank = great_power_rank(&realm);
                let great_power = rank.is_some_and(|rank| rank <= MUST_SHOW_GREAT_POWERS);
                let is_home = realm.live.is_some() && realm.live == home;
                // Each realm has a name, and it shows where its land has room for it.
                if players_only && !player {
                    return None;
                }

                let text = match realm.live.filter(|_| live) {
                    Some(idx) => MapNameText::Country(idx),
                    None => {
                        let identity = self.country_identity_at_timeline_date(realm.owner)?;
                        MapNameText::DatedCountry(OwnedCountryName::new(
                            identity.name,
                            identity.tag,
                            identity.flag,
                        ))
                    }
                };
                let tier = match () {
                    _ if is_home => (0, 0),
                    _ if player => (1, rank.unwrap_or(i32::MAX)),
                    _ if great_power => (2, rank.unwrap_or_default()),
                    _ => (3, 0),
                };
                let name = MapNameSource {
                    text,
                    // A selected name can stand away from crowded land, with a line to it.
                    placement: if is_home || !selection.is_empty() {
                        NamePlacement::LeaderLine
                    } else if player || great_power {
                        NamePlacement::NearLand
                    } else {
                        NamePlacement::OnLand
                    },
                    locations: realm.locations,
                };
                Some(((tier, by_land), name))
            })
            .collect();
        names.sort_by_key(|(order, _)| *order);
        names.into_iter().map(|(_, name)| name).collect()
    }
}

/// The locations of each key, in the order of the locations. A sort groups
/// them in a fraction of the time that a map of lists takes.
fn group_land<K: Copy + Ord>(mut land: Vec<(K, u16)>) -> Vec<(K, Vec<u16>)> {
    land.sort_by_key(|(key, _)| *key);
    land.chunk_by(|a, b| a.0 == b.0)
        .map(|group| (group[0].0, group.iter().map(|(_, color)| *color).collect()))
        .collect()
}

/// Finds the largest piece of a list of land whose locations touch.
struct MainBody<'a> {
    topology: &'a TopologyIndex,
    /// The number of the list that a location is in, by color id
    member: Vec<u32>,
    /// The number of the list in which a location was reached, by color id
    reached: Vec<u32>,
    list: u32,
}

impl<'a> MainBody<'a> {
    fn new(topology: &'a TopologyIndex) -> Self {
        Self {
            topology,
            member: vec![0; topology.len()],
            reached: vec![0; topology.len()],
            list: 0,
        }
    }

    /// The largest piece of `land`, in the order of the color ids.
    fn of(&mut self, land: &[u16]) -> Vec<u16> {
        self.list += 1;
        let list = self.list;
        let len = self.member.len();
        let ids: Vec<usize> = land
            .iter()
            .map(|&id| id as usize)
            .filter(|&id| id < len)
            .collect();
        for &id in &ids {
            self.member[id] = list;
        }
        let mut best: Vec<u16> = Vec::new();
        let mut stack = Vec::new();
        for start in ids {
            if self.reached[start] == list {
                continue;
            }
            self.reached[start] = list;
            let mut piece = vec![start as u16];
            stack.push(start as u16);
            while let Some(at) = stack.pop() {
                for next in self.topology.neighbors_of_index(at) {
                    let next = next.value();
                    let index = next as usize;
                    if self.member[index] == list && self.reached[index] != list {
                        self.reached[index] = list;
                        piece.push(next);
                        stack.push(next);
                    }
                }
            }
            if piece.len() > best.len() {
                best = piece;
            }
        }
        best.sort_unstable();
        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pdx_map::{Hemisphere, HemisphereLength, R16, World};

    fn topology(rows: &[[u16; 8]]) -> TopologyIndex {
        let (mut west, mut east) = (Vec::new(), Vec::new());
        for row in rows {
            west.extend(row[..4].iter().map(|&id| R16::new(id)));
            east.extend(row[4..].iter().map(|&id| R16::new(id)));
        }
        World::builder(
            Hemisphere::new(west, HemisphereLength::new(4)),
            Hemisphere::new(east, HemisphereLength::new(4)),
        )
        .build()
        .build_topology_index()
    }

    #[test]
    fn a_name_stands_on_the_largest_piece_of_its_land() {
        // Location 0 is sea. Location 1 is an enclave, apart from 2 and 4, which touch.
        let topology = topology(&[[0, 1, 0, 2, 4, 0, 3, 0], [0, 0, 0, 2, 4, 0, 0, 0]]);
        let mut bodies = MainBody::new(&topology);
        assert_eq!(bodies.of(&[1, 2, 3, 4]), [2, 4]);
        // The next list does not see the marks of the last one.
        assert_eq!(bodies.of(&[3]), [3]);
    }
}
