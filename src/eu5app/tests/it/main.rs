mod analysis;
mod fixtures;
mod utils;

use std::collections::{BTreeMap, BTreeSet};

use eu5app::game_data::Localization;
use eu5app::hover::presentation::DisplayData as HoverDisplayData;
use eu5app::{EntityKind, Eu5SaveLoader, Eu5Workspace, MapMode};
use eu5save::hash::FnvHashSet;
use eu5save::models::{CountryId, LocationIdx, MarketId};
use eu5save::{Eu5File, JominiFileKind};
use jomini::binary::TokenResolver;

const MLO_SAVE: &str = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";

const ALL_MAP_MODES: [MapMode; 12] = [
    MapMode::Political,
    MapMode::Control,
    MapMode::Development,
    MapMode::Population,
    MapMode::Markets,
    MapMode::RgoLevel,
    MapMode::BuildingLevels,
    MapMode::Wealth,
    MapMode::UnrealizedTaxBase,
    MapMode::Religion,
    MapMode::StateEfficacy,
    MapMode::PopulationGrowth,
];

fn mode_name(mode: MapMode) -> &'static str {
    match mode {
        MapMode::Political => "political",
        MapMode::Control => "control",
        MapMode::Development => "development",
        MapMode::Population => "population",
        MapMode::Markets => "markets",
        MapMode::RgoLevel => "rgo_level",
        MapMode::BuildingLevels => "building_levels",
        MapMode::Wealth => "wealth",
        MapMode::UnrealizedTaxBase => "unrealized_tax_base",
        MapMode::Religion => "religion",
        MapMode::StateEfficacy => "state_efficacy",
        MapMode::PopulationGrowth => "population_growth",
    }
}

fn find_owned_location(workspace: &Eu5Workspace) -> Option<LocationIdx> {
    for entry in workspace.gamestate().locations.iter() {
        let idx = entry.idx();
        let loc = entry.location();
        if !loc.owner.is_dummy() {
            let terrain = workspace.location_terrain(idx);
            if !terrain.is_water() && terrain.is_passable() {
                return Some(idx);
            }
        }
    }
    None
}

fn find_different_owner_location(
    workspace: &Eu5Workspace,
    first: LocationIdx,
) -> Option<LocationIdx> {
    let first_owner = workspace
        .gamestate()
        .locations
        .iter()
        .find(|entry| entry.idx() == first)?
        .location()
        .owner;
    for entry in workspace.gamestate().locations.iter() {
        let idx = entry.idx();
        let loc = entry.location();
        if loc.owner != first_owner && !loc.owner.is_dummy() {
            let terrain = workspace.location_terrain(idx);
            if !terrain.is_water() && terrain.is_passable() {
                return Some(idx);
            }
        }
    }
    None
}

fn find_owned_market_anchor(workspace: &Eu5Workspace) -> Option<(MarketId, LocationIdx)> {
    workspace
        .gamestate()
        .market_manager
        .database
        .iter_with_id()
        .find_map(|(id, market)| {
            let idx = workspace.gamestate().locations.get(market.center)?;
            let loc = workspace.gamestate().locations.index(idx).location();
            (loc.market == Some(id) && !loc.owner.is_dummy()).then_some((id, idx))
        })
}

fn find_location_without_market(workspace: &Eu5Workspace) -> Option<LocationIdx> {
    workspace
        .gamestate()
        .locations
        .iter()
        .find(|entry| entry.location().market.is_none())
        .map(|entry| entry.idx())
}

/// Load each save once and run all workspace scenarios.
/// Cargo test filters select this test, not individual scenarios.
/// A failed scenario stops the current save. The glob continues with other saves
/// unless INSTA_GLOB_FAIL_FAST is set.
#[test]
fn workspace_scenarios() {
    insta::glob!("saves.d/*.save", |path| {
        let save_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("pointer file stem is UTF-8");
        let Some(mut loaded) = utils::build_workspace(save_name) else {
            return;
        };
        let localization = loaded.localization;
        let ws = &mut loaded.workspace;

        let mut snapshot = run_workspace_scenario(save_name, "snapshot", ws, |ws| {
            workspace_snapshot(ws, &localization)
        });
        snapshot["returning_countries"] =
            run_workspace_scenario(save_name, "returning countries", ws, |ws| {
                returning_countries_stay_one_country(ws, &localization, save_name)
            });
        snapshot["largest_stability_tie"] =
            run_workspace_scenario(save_name, "country ranks", ws, |ws| {
                country_ranks_count_ties(ws, &localization)
            });
        insta::assert_json_snapshot!(snapshot);

        run_workspace_scenario(save_name, "market selection", ws, |ws| {
            market_selection_uses_location_anchors(ws, &localization)
        });
        run_workspace_scenario(save_name, "location focus", ws, |ws| {
            focused_locations_have_location_profiles(ws, &localization)
        });
        run_workspace_scenario(save_name, "selection outside markets", ws, |ws| {
            market_selection_without_a_market_stays_empty(ws)
        });
        run_workspace_scenario(save_name, "timeline round trip", ws, |ws| {
            timeline_round_trip_restores_the_live_map(ws, save_name)
        });
        run_workspace_scenario(save_name, "incremental timeline", ws, |ws| {
            incremental_timeline_steps_match_a_full_repaint(ws, save_name)
        });
        run_workspace_scenario(save_name, "selection follows the timeline", ws, |ws| {
            country_selection_follows_the_timeline(ws, &localization, save_name)
        });
        run_workspace_scenario(save_name, "market scope across the timeline", ws, |ws| {
            market_scope_survives_the_timeline(ws, save_name)
        });
        run_workspace_scenario(save_name, "no name shows a token", ws, |ws| {
            no_name_shows_a_token(ws, &localization)
        });
    });
}

// Restore public state before each scenario. Internal caches can retain data.
fn run_workspace_scenario<'bump, T>(
    save_name: &str,
    scenario_name: &str,
    ws: &mut Eu5Workspace<'bump>,
    scenario: impl FnOnce(&mut Eu5Workspace<'bump>) -> T,
) -> T {
    eprintln!("{save_name}: {scenario_name}");
    ws.set_timeline_date(ws.timeline_summary().end);
    ws.clear_selection();
    ws.set_map_mode(MapMode::Political);
    scenario(ws)
}

fn workspace_snapshot(ws: &mut Eu5Workspace, localization: &Localization) -> serde_json::Value {
    let map_modes = map_mode_summaries(ws);

    // The same modes with one country selected: dimming and the domains of
    // the selected locations change.
    let selected = find_owned_location(ws).map(|location| {
        ws.select_country_at(location);
        let mut locations: Vec<u32> = ws
            .selection_state()
            .selected_locations()
            .iter()
            .map(|idx| idx.value())
            .collect();
        locations.sort_unstable();
        serde_json::json!({
            "locations": utils::hash_u32s(&locations),
            "map_modes": map_mode_summaries(ws),
        })
    });
    ws.clear_selection();

    // The political mode on a past date, when the save has a history.
    let timeline = ws.timeline_summary();
    // Reconciliation can put changes on the save date, which is not a past date.
    let past_dates: Vec<_> = timeline
        .change_dates
        .iter()
        .copied()
        .filter(|&date| date < timeline.end)
        .collect();
    let past_political = timeline.available.then(|| {
        let date = past_dates[past_dates.len() / 2];
        ws.set_map_mode(MapMode::Political);
        ws.set_timeline_date(date);
        let summary = map_mode_summary(ws, ws.no_map_change().legend);
        ws.set_timeline_date(timeline.end);
        summary
    });
    ws.set_map_mode(MapMode::Political);

    let projection = eu5app::map_projection::extract(ws.gamestate()).unwrap();
    assert_eq!(ws.selection_state().selected_locations().len(), 0);

    let mut after_select = 0;
    let mut after_add = 0;
    let mut after_remove = 0;
    if let Some(a) = find_owned_location(ws) {
        ws.select_country_at(a);
        after_select = ws.selection_state().selected_locations().len();
        assert!(after_select > 0, "select_country_at should add locations");

        if let Some(b) = find_different_owner_location(ws, a) {
            ws.add_country_at(b);
            after_add = ws.selection_state().selected_locations().len();
            assert!(
                after_add > after_select,
                "add_country_at should grow the selection"
            );

            ws.remove_country_at(a);
            after_remove = ws.selection_state().selected_locations().len();
            assert!(
                after_remove < after_add,
                "remove_country_at should shrink the selection"
            );
        }

        ws.clear_selection();
        assert!(
            ws.selection_state().selected_locations().is_empty(),
            "clear_selection should empty the selection"
        );
    }

    let location = ws.gamestate().locations.iter().next().unwrap();
    let owner_idx = ws
        .gamestate()
        .countries
        .get(location.location().owner)
        .unwrap();
    let owner = ws.gamestate().countries.index(owner_idx);
    let owner_tag = owner.tag();
    let localized = ws.localized(localization);
    let great_powers: Vec<_> = localized
        .presenter()
        .political_world_scoreboard()
        .rows
        .iter()
        .take(3)
        .map(|row| format!("{} {:.0}", row.country.tag, row.tax_trade_income))
        .collect();
    let timeline = ws.timeline_summary();
    serde_json::json!({
        "save_version": ws.gamestate().metadata().version.to_string(),
        "timeline": {
            "available": timeline.available,
            "change_dates": timeline.change_dates.len(),
        },
        "selection_cases": {
            "owned_location": find_owned_location(ws).is_some(),
            "owned_market_anchor": find_owned_market_anchor(ws).is_some(),
            "location_without_market": find_location_without_market(ws).is_some(),
        },
        "great_powers": great_powers,
        "map_modes": map_modes,
        "selected": selected,
        "past_political": past_political,
        "projection": utils::hash_projection(&projection),
        "location": [{
            "id": location.id().value(),
            "name": localized.presenter().location_display_name(location.idx()),
            "owner": {
                "id": owner.id().value(),
                "tag": owner_tag.to_str(),
                "name": localized.presenter().country_display_name(owner_idx)
            },
        }],
        "selection_counts": {
            "after_select": after_select,
            "after_add": after_add,
            "after_remove": after_remove,
        },
    })
}

/// Paint each map mode and summarize its buffers, grouping table and legend.
fn map_mode_summaries(ws: &mut Eu5Workspace) -> BTreeMap<&'static str, serde_json::Value> {
    ALL_MAP_MODES
        .into_iter()
        .map(|mode| {
            let change = ws.set_map_mode(mode);
            (mode_name(mode), map_mode_summary(ws, change.legend))
        })
        .collect()
}

fn map_mode_summary(ws: &Eu5Workspace, legend: eu5app::gradient::MapLegend) -> serde_json::Value {
    let groups: Vec<u32> = ws
        .build_grouping_table()
        .iter()
        .map(|(_, group)| group.raw())
        .collect();
    let mut summary = utils::summarize_location_arrays(ws.location_arrays());
    summary["groups"] = utils::hash_u32s(&groups).into();
    summary["legend"] = format!("{legend:?}").into();
    summary
}

fn market_selection_uses_location_anchors(ws: &mut Eu5Workspace, localization: &Localization) {
    let Some((market_id, anchor)) = find_owned_market_anchor(ws) else {
        eprintln!("No owned market anchor; skip market selection");
        return;
    };
    let header = ws
        .localized(localization)
        .presenter()
        .market_profile_for(market_id)
        .unwrap()
        .header;
    assert_eq!(header.anchor_location_idx, anchor.value());

    for mode in [MapMode::Political, MapMode::Markets, MapMode::Population] {
        ws.clear_selection();
        ws.set_map_mode(mode);
        ws.select_market_at(LocationIdx::new(header.anchor_location_idx));
        let profile = ws
            .localized(localization)
            .presenter()
            .active_profile_identity();
        assert!(matches!(
            profile,
            Some(eu5app::entity_profile::ActiveProfileIdentity::Market { market })
                if market.key.value() == market_id.value()
        ));
        assert!(ws.selection_state().focused_location().is_none());
    }
}

/// A rank counts the countries that own land and have more, and a tie counts those
/// that have the same. A country that no longer exists keeps its values in the save,
/// so it must not count. Returns the largest tie found, so the snapshot shows that the
/// fixture covers a tie.
fn country_ranks_count_ties(
    ws: &mut Eu5Workspace,
    localization: &Localization,
) -> serde_json::Value {
    let gamestate = ws.gamestate();
    let owners: BTreeSet<_> = gamestate
        .locations
        .iter()
        .filter_map(|entry| entry.location().owner.real_id())
        .filter_map(|id| gamestate.countries.get(id.country_id()))
        .collect();
    let stabilities: Vec<f64> = owners
        .iter()
        .filter_map(|idx| gamestate.countries.index(*idx).data())
        .map(|data| data.currency_data.stability)
        .collect();

    // A profile takes time, so a sample of the countries is enough.
    let presenter = ws.localized(localization).presenter();
    let mut largest_tie = 0;
    for idx in owners.iter().step_by(50) {
        let overview = presenter
            .country_profile_for(*idx)
            .expect("a land owner has a profile")
            .overview;
        let ranks = overview.ranks;
        let own = overview.stability;
        assert_eq!(ranks.cohort as usize, stabilities.len());
        let above = stabilities.iter().filter(|x| **x > own).count();
        let tied = stabilities.iter().filter(|x| **x == own).count();
        assert_eq!(ranks.stability as usize, above + 1);
        assert_eq!(ranks.ties.stability as usize, tied);
        largest_tie = largest_tie.max(ranks.ties.stability);
    }

    // A country with no land is not in the cohort, but it is one of its own tie.
    let landless = gamestate
        .countries
        .iter()
        .find(|entry| entry.data().is_some() && !owners.contains(&entry.idx()))
        .expect("a save has countries with no land");
    let overview = presenter
        .country_profile_for(landless.idx())
        .expect("a country with data has a profile")
        .overview;
    let tied = stabilities
        .iter()
        .filter(|x| **x == overview.stability)
        .count();
    assert_eq!(overview.ranks.ties.stability as usize, tied + 1);

    largest_tie.into()
}

fn focused_locations_have_location_profiles(ws: &mut Eu5Workspace, localization: &Localization) {
    let Some(anchor) = find_owned_location(ws) else {
        eprintln!("No owned location; skip location focus");
        return;
    };
    ws.clear_selection();
    ws.set_map_mode(MapMode::Political);
    ws.select_country_at(anchor);
    assert!(matches!(
        ws.localized(localization)
            .presenter()
            .active_profile_identity(),
        Some(eu5app::entity_profile::ActiveProfileIdentity::Country { .. })
    ));
    ws.set_focused_location(anchor);
    assert!(matches!(
        ws.localized(localization).presenter().active_profile_identity(),
        Some(eu5app::entity_profile::ActiveProfileIdentity::Location { location })
            if location.key.value() == anchor.value()
    ));

    for mode in [MapMode::Political, MapMode::Markets, MapMode::Population] {
        let anchor = if mode == MapMode::Markets {
            let Some((_, market_anchor)) = find_owned_market_anchor(ws) else {
                eprintln!("No owned market anchor; skip location focus in markets mode");
                continue;
            };
            market_anchor
        } else {
            anchor
        };
        ws.clear_selection();
        ws.set_map_mode(mode);
        ws.set_focused_location(anchor);
        assert_eq!(ws.selection_state().focused_location(), Some(anchor));
        assert!(matches!(
            ws.localized(localization).presenter().active_profile_identity(),
            Some(eu5app::entity_profile::ActiveProfileIdentity::Location { location })
                if location.key.value() == anchor.value()
        ));
    }
}

fn market_selection_without_a_market_stays_empty(ws: &mut Eu5Workspace) {
    let Some(outside_market) = find_location_without_market(ws) else {
        eprintln!("No location outside markets; skip selection outside markets");
        return;
    };
    ws.clear_selection();
    ws.select_market_at(outside_market);
    assert!(ws.selection_state().is_empty());
}

/// Check current owners and all map buffers before and after a timeline round trip.
/// Saves without history must keep the map at the save date.
fn timeline_round_trip_restores_the_live_map(ws: &mut Eu5Workspace, save_name: &str) {
    for entry in ws.gamestate().locations.iter() {
        assert_eq!(
            ws.owner_at_timeline_date(entry.idx()),
            entry.location().owner,
            "{save_name}: location {:?} owner at the save date",
            entry.id()
        );
    }

    ws.set_map_mode(MapMode::Political);
    let live = utils::hash_location_arrays(ws.location_arrays());
    let summary = ws.timeline_summary();
    assert!(ws.is_timeline_live());

    ws.set_timeline_date(summary.start);
    let past = utils::hash_location_arrays(ws.location_arrays());
    if summary.available {
        assert!(
            !ws.is_timeline_live(),
            "{save_name}: the start is a past date"
        );
        assert_ne!(
            past, live,
            "{save_name}: borders differ at the campaign start"
        );
    } else {
        assert!(
            ws.is_timeline_live(),
            "{save_name}: no history keeps the map live"
        );
        assert_eq!(past, live);
    }

    ws.set_timeline_date(summary.end);
    assert!(ws.is_timeline_live());
    assert_eq!(
        utils::hash_location_arrays(ws.location_arrays()),
        live,
        "{save_name}: the save date restores the live map"
    );

    // A map mode without history must show the save date.
    ws.set_timeline_date(summary.start);
    ws.set_map_mode(MapMode::Population);
    assert!(ws.is_timeline_live());
    assert_eq!(ws.get_map_mode(), MapMode::Population);
}

/// Compare incremental timeline updates with a full map update at the same date.
/// Each step updates locations with changed owners and the adjacent surrounded terrain.
fn incremental_timeline_steps_match_a_full_repaint(ws: &mut Eu5Workspace, save_name: &str) {
    let summary = ws.timeline_summary();
    if !summary.available {
        return;
    }

    ws.set_map_mode(MapMode::Political);
    ws.set_timeline_date(summary.start);
    assert!(!ws.is_timeline_live());

    // Move forward through the dates with changes, then move back through them.
    let past_dates: Vec<_> = summary
        .change_dates
        .iter()
        .copied()
        .filter(|&date| date < summary.end)
        .collect();
    for &date in past_dates.iter().chain(past_dates.iter().rev()).skip(1) {
        ws.set_timeline_date(date);
        assert!(
            !ws.is_timeline_live(),
            "{save_name}: {date:?} is a past date"
        );
    }
    let incremental = utils::hash_location_arrays(ws.location_arrays());

    ws.set_map_mode(MapMode::Political);
    let full = utils::hash_location_arrays(ws.location_arrays());
    assert_eq!(
        incremental, full,
        "{save_name}: incremental steps drift from a full repaint"
    );
}

/// The locations a country owns on the timeline date.
fn land_on_timeline_date(ws: &Eu5Workspace, country: CountryId) -> FnvHashSet<LocationIdx> {
    ws.gamestate()
        .locations
        .iter()
        .map(|entry| entry.idx())
        .filter(|&idx| ws.owner_at_timeline_date(idx) == country)
        .collect()
}

/// The country of the active profile.
fn active_country(ws: &Eu5Workspace, localization: &Localization) -> Option<u32> {
    match ws
        .localized(localization)
        .presenter()
        .active_profile_identity()
    {
        Some(eu5app::entity_profile::ActiveProfileIdentity::Country { country }) => {
            Some(country.key.value())
        }
        _ => None,
    }
}

/// A selected country keeps its selection through the timeline, and the
/// selected locations are its land on each date. A click on a past date
/// selects the country that held the land on that date.
fn country_selection_follows_the_timeline(
    ws: &mut Eu5Workspace,
    localization: &Localization,
    save_name: &str,
) {
    let profile_country = |ws: &Eu5Workspace| active_country(ws, localization);
    let summary = ws.timeline_summary();
    if !summary.available {
        return;
    }

    // The country whose land changed the most between the start and the save date.
    ws.set_timeline_date(summary.start);
    let start_owners: Vec<CountryId> = ws
        .gamestate()
        .locations
        .iter()
        .map(|entry| ws.owner_at_timeline_date(entry.idx()))
        .collect();
    ws.set_timeline_date(summary.end);
    let mut moved: BTreeMap<u32, usize> = BTreeMap::new();
    for (entry, &start) in ws.gamestate().locations.iter().zip(&start_owners) {
        let owner = entry.location().owner;
        if owner != start && !owner.is_dummy() {
            *moved.entry(owner.value()).or_default() += 1;
        }
    }
    let Some((&country, _)) = moved.iter().max_by_key(|(_, count)| **count) else {
        return;
    };
    let country = CountryId::new(country);
    let country_idx = ws.gamestate().countries.get(country).unwrap();

    ws.select_country_by_idx(country_idx);
    let live = ws.selection_state().selected_locations().clone();
    assert_eq!(live, land_on_timeline_date(ws, country));
    assert_eq!(profile_country(ws), Some(country_idx.value()));

    let past_dates: Vec<_> = summary
        .change_dates
        .iter()
        .copied()
        .filter(|&date| date < summary.end)
        .collect();
    let checked = past_dates.len().div_ceil(40).max(1);
    for (i, &date) in past_dates.iter().rev().enumerate() {
        ws.set_timeline_date(date);
        assert!(
            !ws.selection_state().is_empty(),
            "{save_name}: {date:?} keeps the selection"
        );
        if i % checked == 0 {
            assert_eq!(
                ws.selection_state().selected_locations(),
                &land_on_timeline_date(ws, country),
                "{save_name}: {date:?} selects the land of the country"
            );
            assert_eq!(
                profile_country(ws),
                Some(country_idx.value()),
                "{save_name}: {date:?} keeps the country profile"
            );
        }
    }

    ws.set_timeline_date(summary.end);
    assert_eq!(
        ws.selection_state().selected_locations(),
        &live,
        "{save_name}: the save date restores the selection"
    );

    // A location that changed hands selects its owner at the start.
    ws.set_timeline_date(summary.start);
    let Some(clicked) = ws.gamestate().locations.iter().find_map(|entry| {
        let start = ws.owner_at_timeline_date(entry.idx());
        let terrain = ws.location_terrain(entry.idx());
        (start != entry.location().owner && !start.is_dummy() && terrain.is_passable())
            .then_some(entry.idx())
    }) else {
        return;
    };
    let start_owner = ws.owner_at_timeline_date(clicked);
    ws.clear_selection();
    ws.select_entity(clicked);
    assert_eq!(
        ws.selection_state().selected_locations(),
        &land_on_timeline_date(ws, start_owner),
        "{save_name}: a click selects the owner on the timeline date"
    );
}

/// The land of each id on the timeline date, and how many of the ids hold land.
fn land_of_ids(ws: &Eu5Workspace, ids: &[CountryId]) -> (FnvHashSet<LocationIdx>, usize) {
    let mut land = FnvHashSet::default();
    let mut holders = 0;
    for &id in ids {
        let held = land_on_timeline_date(ws, id);
        holders += usize::from(!held.is_empty());
        land.extend(held);
    }
    (land, holders)
}

/// A country that dies and returns has a new id, and its ids are one country on each
/// date. A dead id that did not return reads as dead. The result goes in the snapshot,
/// so a save that stops covering a case shows in the diff.
fn returning_countries_stay_one_country(
    ws: &mut Eu5Workspace,
    localization: &Localization,
    save_name: &str,
) -> serde_json::Value {
    let summary = ws.timeline_summary();
    if !summary.available {
        return serde_json::Value::Null;
    }
    let reads_as_dead = |ws: &Eu5Workspace, location: LocationIdx| {
        matches!(
            ws.localized(localization).presenter().hover_data(location),
            HoverDisplayData::HistoricalCountry { dead: true, .. }
        )
    };

    let past_dates: Vec<_> = summary
        .change_dates
        .iter()
        .copied()
        .filter(|&date| date < summary.end)
        .collect();
    let every = past_dates.len().div_ceil(40).max(1);
    let dates: Vec<_> = past_dates
        .into_iter()
        .step_by(every)
        .chain([summary.end])
        .collect();

    let returning: Vec<_> = ws
        .gamestate()
        .countries
        .iter()
        .filter(|entry| entry.data().is_some())
        .map(|entry| {
            (
                entry.idx(),
                entry.tag().as_str().to_owned(),
                ws.lineage_ids(entry.idx()),
            )
        })
        .filter(|(_, _, ids)| ids.len() > 1)
        .collect();

    let (mut one_id_dates, mut two_id_dates) = (0, 0);
    for (country, _, ids) in &returning {
        let country = *country;
        let mut one_id_date = None;
        let mut no_land_date = None;
        for &date in &dates {
            ws.set_timeline_date(date);
            ws.clear_selection();
            let (land, holders) = land_of_ids(ws, ids);
            ws.select_country_by_idx(country);
            assert_eq!(
                ws.selection_state().selected_locations(),
                &land,
                "{save_name}: {date:?} selects the land of each id"
            );
            // With no land, there is nothing to select. Two ids with land count as two
            // countries, so these dates have no profile.
            if holders == 1 {
                assert_eq!(
                    active_country(ws, localization),
                    Some(country.value()),
                    "{save_name}: {date:?} keeps the country profile"
                );
            }
            if let Some(&location) = land.iter().next() {
                assert!(
                    !reads_as_dead(ws, location),
                    "{save_name}: {date:?} a returning country lives"
                );
            }
            ws.remove_country_by_idx(country);
            assert!(
                ws.selection_state().is_empty(),
                "{save_name}: {date:?} a removal takes the land of each id"
            );
            ws.add_country_by_idx(country);
            assert_eq!(
                ws.selection_state().selected_locations(),
                &land,
                "{save_name}: {date:?} an addition takes the land of each id"
            );
            match holders {
                0 => {
                    no_land_date.get_or_insert(date);
                }
                1 => {
                    one_id_dates += 1;
                    one_id_date.get_or_insert(date);
                }
                _ => two_id_dates += 1,
            }
        }

        let Some(start) = one_id_date else {
            continue;
        };
        ws.set_timeline_date(start);
        ws.clear_selection();
        ws.select_country_by_idx(country);
        for &date in dates.iter().chain(dates.iter().rev()) {
            ws.set_timeline_date(date);
            let (land, holders) = land_of_ids(ws, ids);
            assert_eq!(
                ws.selection_state().selected_locations(),
                &land,
                "{save_name}: a step to {date:?} keeps the land when it changes id"
            );
            // A selection follows the country on dates when it has no land.
            if holders < 2 {
                assert_eq!(
                    active_country(ws, localization),
                    Some(country.value()),
                    "{save_name}: a step to {date:?} keeps the country profile"
                );
            }
        }

        ws.set_timeline_date(start);
        let location = *ws
            .selection_state()
            .selected_locations()
            .iter()
            .next()
            .unwrap();
        ws.remove_country_at(location);
        assert!(
            ws.selection_state().is_empty(),
            "{save_name}: no id of the country stays selected without its land"
        );

        // A removal on a date with no land holds when the land comes back. Another
        // country keeps the selection from being empty.
        let Some(no_land) = no_land_date else {
            continue;
        };
        ws.clear_selection();
        ws.select_country_by_idx(country);
        ws.set_timeline_date(no_land);
        let other = ws.gamestate().locations.iter().find_map(|entry| {
            let owner = ws.owner_at_timeline_date(entry.idx());
            ws.gamestate().countries.get(owner)
        });
        let Some(other) = other else {
            continue;
        };
        ws.add_country_by_idx(other);
        ws.remove_country_by_idx(country);
        ws.set_timeline_date(start);
        let (land, _) = land_of_ids(ws, ids);
        assert!(
            ws.selection_state().selected_locations().is_disjoint(&land),
            "{save_name}: a removed country does not come back with its land"
        );
    }

    ws.set_timeline_date(summary.start);
    let dead_id = ws
        .gamestate()
        .locations
        .iter()
        .map(|entry| entry.idx())
        .find(|&idx| {
            let owner = ws.owner_at_timeline_date(idx);
            !owner.is_dummy()
                && ws.gamestate().countries.get(owner).is_none()
                && !returning.iter().any(|(_, _, ids)| ids.contains(&owner))
        });
    if let Some(location) = dead_id {
        assert!(
            reads_as_dead(ws, location),
            "{save_name}: a dead id that did not return reads as dead"
        );
    }

    let countries: Vec<_> = returning
        .iter()
        .map(|(_, tag, ids)| {
            let mut ids: Vec<u32> = ids.iter().map(|id| id.value()).collect();
            ids.sort_unstable();
            serde_json::json!({ "tag": tag, "ids": ids })
        })
        .collect();
    serde_json::json!({
        "countries": countries,
        "one_id_dates": one_id_dates,
        "two_id_dates": two_id_dates,
        "dead_id_checked": dead_id.is_some(),
    })
}

/// Markets have no history, so a market scope stays on a past date.
fn market_scope_survives_the_timeline(ws: &mut Eu5Workspace, save_name: &str) {
    let summary = ws.timeline_summary();
    let Some((_, anchor)) = find_owned_market_anchor(ws) else {
        return;
    };
    ws.set_map_mode(MapMode::Markets);
    ws.select_market_at(anchor);
    assert_eq!(ws.derived_entity_kind(), Some(EntityKind::Market));

    for date in [summary.start, summary.end] {
        ws.set_timeline_date(date);
        assert_eq!(
            ws.derived_entity_kind(),
            Some(EntityKind::Market),
            "{save_name}: {date:?} keeps the market scope"
        );
    }
}

/// The search list has the live countries. Only the hover of a past date has the dead
/// countries, and the names that they had before a rename.
fn no_name_shows_a_token(ws: &mut Eu5Workspace, localization: &Localization) {
    let mut names: Vec<String> = ws
        .localized(localization)
        .presenter()
        .country_search_entries()
        .countries
        .into_iter()
        .map(|entry| entry.country.name)
        .collect();

    let live_names = names.len();
    let summary = ws.timeline_summary();
    let stride = (summary.change_dates.len() / 32).max(1);
    for &date in summary.change_dates.iter().step_by(stride) {
        ws.set_timeline_date(date);
        if ws.is_timeline_live() {
            continue;
        }
        let presenter = ws.localized(localization).presenter();
        names.extend(ws.gamestate().locations.iter().filter_map(|entry| {
            match presenter.hover_data(entry.idx()) {
                HoverDisplayData::HistoricalCountry { name, .. } => Some(name),
                _ => None,
            }
        }));
    }
    ws.set_timeline_date(summary.end);
    assert!(
        !summary.available || names.len() > live_names,
        "the hover of a past date reads no names"
    );

    names.retain(|name| name.is_empty() || name.contains(['$', '[', '_']));
    names.sort();
    names.dedup();
    assert!(names.is_empty(), "names with a raw key or token: {names:?}");
}

/// The browser uploads saves after `pdx-save-codec` remuxes the zip entries to
/// zstd. The permalink page opens that upload with the same feature set as
/// this crate's defaults, so the zstd zip path must work without the C
/// backend.
#[test]
fn opens_a_zstd_remuxed_zip_save() {
    let mut file = utils::request_file(MLO_SAVE);
    let mut data = Vec::new();
    std::io::Read::read_to_end(&mut file, &mut data).unwrap();
    let original = Eu5File::from_slice(data.clone()).unwrap();
    assert!(
        matches!(original.kind(), JominiFileKind::Zip(_)),
        "fixture must be a zip save for this test to cover the remux path"
    );

    let compressed = pdx_save_codec::compress(data).expect("remux EU5 fixture");
    assert!(!pdx_zstd::is_zstd_compressed(&compressed));

    let file = Eu5File::from_slice(compressed).unwrap();
    assert!(matches!(file.kind(), JominiFileKind::Zip(_)));
    let loader = Eu5SaveLoader::open(file, utils::tokens()).unwrap();
    assert_eq!(loader.meta().version.major, 1);
    assert!(!loader.meta().playthrough_name.is_empty());
    if utils::tokens().is_empty() {
        assert!(
            !utils::require_test_assets(),
            "EU5 binary tokens are required for this test run"
        );
        eprintln!("EU5 binary tokens not loaded; skipping gamestate parse");
        return;
    }
    let mut loaded = loader.parse().unwrap();
    assert!(loaded.take_gamestate().locations.iter().next().is_some());
}

#[test]
fn metadata_read_matches_the_full_file() {
    insta::glob!("saves.d/*.save", |path| {
        let save_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("pointer file stem is UTF-8");
        let resolver = utils::tokens();
        let mut file = utils::request_file(save_name);
        let full = Eu5File::from_file(file.try_clone().unwrap())
            .unwrap_or_else(|e| panic!("{save_name}: {e}"));
        if full.header().kind().is_binary() && resolver.is_empty() {
            assert!(
                !utils::require_test_assets(),
                "{save_name}: EU5 binary tokens not loaded"
            );
            return;
        }
        let expected = Eu5SaveLoader::open(full, resolver)
            .unwrap_or_else(|e| panic!("{save_name}: {e}"))
            .meta();

        // The clone shares the position of the file, which the full read moved.
        std::io::Seek::rewind(&mut file).unwrap();
        let mut data = Vec::new();
        std::io::Read::read_to_end(&mut file, &mut data).unwrap();

        let actual = eu5app::read_metadata_at(data.as_slice(), data.len() as u64, resolver)
            .unwrap_or_else(|e| panic!("{save_name}: {e}"));
        assert_eq!(
            actual.playthrough_id, expected.playthrough_id,
            "{save_name}"
        );
        assert_eq!(
            actual.playthrough_name, expected.playthrough_name,
            "{save_name}"
        );
        assert_eq!(actual.date, expected.date, "{save_name}");
        assert_eq!(actual.version, expected.version, "{save_name}");
    });
}
