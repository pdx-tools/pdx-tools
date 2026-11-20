use super::*;
use crate::map_names::{MapNameSource, MapNameText, MapNamesSource};
use crate::presentation::OwnedCountryName;
use crate::selection::SelectionPreset;
use eu5save::models::{CountryId, LocationIdx};
use std::cmp::Reverse;

/// With no selection, the map names this many realms with the most land, and each player.
const MOST_REALMS: usize = 90;
/// Great powers up to this rank always try to show their names.
const MUST_SHOW_GREAT_POWERS: i32 = 10;
/// A map of religions or markets always tries to show this many of the largest.
const MUST_SHOW_CATEGORIES: usize = 8;

impl<'bump> Eu5Workspace<'bump> {
    /// The names to set on the map, the most important first. A map of
    /// religions or markets names those. Other maps name the realms of the
    /// map date. With a selection, only the names of the selection show.
    pub(crate) fn map_names(&self) -> MapNamesSource {
        let names = match self.current_map_mode {
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
                must_show: !selection.is_empty() || at < MUST_SHOW_CATEGORIES,
                leader_line: false,
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

        let mut land = Vec::new();
        for entry in self.gamestate.locations.iter() {
            let idx = entry.idx();
            let owner = self.owner_at_timeline_date(idx);
            if let Some(color) = self.center_at(idx).filter(|_| !owner.is_dummy()) {
                land.push((owner, color.value()));
            }
        }
        let selected: FxHashSet<CountryId> = selection
            .selected_locations()
            .iter()
            .map(|&idx| self.owner_at_timeline_date(idx))
            .collect();

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
                let wanted = if selection.is_empty() {
                    by_land < MOST_REALMS || player || great_power
                } else {
                    selected.contains(&realm.owner) && (player || !players_only)
                };
                if !wanted {
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
                    must_show: !selection.is_empty() || is_home || player || great_power,
                    leader_line: is_home,
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
