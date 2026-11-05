mod analysis;
mod fixtures;
mod utils;

use std::collections::{BTreeMap, BTreeSet};

use eu5app::game_data::Localization;
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

        let snapshot = run_workspace_scenario(save_name, "snapshot", ws, |ws| {
            workspace_snapshot(ws, &localization)
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
        run_workspace_scenario(save_name, "past realms agree with the save", ws, |ws| {
            past_realms_agree_with_the_save(ws, &localization)
        });
        run_workspace_scenario(save_name, "map names are those of the date", ws, |ws| {
            map_names_are_those_of_the_date(ws, &localization)
        });
        run_workspace_scenario(save_name, "mode and scope matrix", ws, |ws| {
            mode_scope_matrix(ws, &localization)
        });
        run_workspace_scenario(save_name, "sequential maps stay readable", ws, |ws| {
            sequential_maps_keep_their_land_readable(ws)
        });
        run_workspace_scenario(save_name, "market key has the map colours", ws, |ws| {
            market_key_has_the_map_colours(ws, &localization)
        });
        run_workspace_scenario(save_name, "country figures agree", ws, |ws| {
            country_figures_agree(ws, &localization)
        });
        run_workspace_scenario(save_name, "no name shows a token", ws, |ws| {
            no_name_shows_a_token(ws, &localization)
        });
        run_workspace_scenario(save_name, "population history is in people", ws, |ws| {
            population_history_is_in_people(ws, &localization)
        });
        run_workspace_scenario(save_name, "market scope across the timeline", ws, |ws| {
            market_scope_survives_the_timeline(ws, save_name)
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

/// A selected country keeps its selection through the timeline, and the
/// selected locations are its land on each date. A click on a past date
/// selects the country that held the land on that date.
fn country_selection_follows_the_timeline(
    ws: &mut Eu5Workspace,
    localization: &Localization,
    save_name: &str,
) {
    let profile_country = |ws: &Eu5Workspace| match ws
        .localized(localization)
        .presenter()
        .active_profile_identity()
    {
        Some(eu5app::entity_profile::ActiveProfileIdentity::Country { country }) => {
            Some(country.key.value())
        }
        _ => None,
    };
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

/// Markets have no history, so a market scope stays on a past date.
/// Each row of the list of a past date agrees with the save and with a selection of it:
/// a country that lives at the save has its land there, and a click on the row
/// selects the land that the row counts.
fn past_realms_agree_with_the_save(ws: &mut Eu5Workspace, localization: &Localization) {
    let summary = ws.timeline_summary();
    if !summary.available {
        return;
    }
    ws.set_timeline_date(summary.start);
    let live_tags: BTreeMap<String, u32> = ws
        .gamestate()
        .countries
        .iter()
        .filter(|entry| entry.data().is_some())
        .map(|entry| (entry.tag().as_str().to_string(), entry.idx().value()))
        .collect();
    let realms = ws.localized(localization).presenter().dated_realms(None);
    assert!(!realms.rows.is_empty());
    for row in realms.rows {
        let Some(country) = row.country else {
            assert!(
                !live_tags.contains_key(&row.tag),
                "{} lives at the save but reads as gone",
                row.tag
            );
            assert_eq!(row.locations_at_save, 0);
            continue;
        };
        let idx = eu5save::models::CountryIdx::from_value(country.country.key.value()).unwrap();
        let at_save = ws
            .gamestate()
            .locations
            .iter()
            .filter(|entry| {
                Some(entry.location().owner) == Some(ws.gamestate().countries.index(idx).id())
            })
            .count() as u32;
        assert_eq!(row.locations_at_save, at_save, "{} at the save", row.tag);
        assert_eq!(
            ws.dated_land_numbers(idx).0,
            row.locations,
            "{} land",
            row.tag
        );

        ws.select_country_by_idx(idx);
        assert_eq!(
            ws.selection_state().selected_locations().len() as u32,
            row.locations,
            "{} selection",
            row.tag
        );
        ws.clear_selection();
    }
}

/// A name on the map and a row of the list of that date say one thing.
fn map_names_are_those_of_the_date(ws: &mut Eu5Workspace, localization: &Localization) {
    let summary = ws.timeline_summary();
    if !summary.available {
        return;
    }
    for date in [summary.start, summary.end] {
        ws.set_timeline_date(date);
        let presenter = ws.localized(localization).presenter();
        let labels = presenter.realm_labels();
        let realms = presenter.dated_realms(None);
        for row in &realms.rows {
            let Some(country) = &row.country else {
                continue;
            };
            let idx = u32::from(country.country.key);
            let label = labels
                .labels
                .iter()
                .find(|label| label.country_idx == Some(idx))
                .unwrap_or_else(|| panic!("{} has no label on {date:?}", row.name));
            assert_eq!(label.name, row.name, "{date:?}");
            assert_eq!(label.location_count, row.locations, "{} {date:?}", row.name);
            let dated = presenter
                .dated_land(eu5save::models::CountryIdx::from_value(idx).unwrap())
                .unwrap();
            assert_eq!(dated.name, row.name, "{date:?}");
            assert_eq!(dated.rank, row.rank, "{} {date:?}", row.name);
        }
    }
    ws.set_timeline_date(summary.end);
}

/// No name shows a raw token of the game's text, on any date and in any list.
fn no_name_shows_a_token(ws: &mut Eu5Workspace, localization: &Localization) {
    let summary = ws.timeline_summary();
    let dates: Vec<_> = if summary.available {
        vec![summary.start, summary.end]
    } else {
        vec![]
    };
    let mut bad: Vec<String> = Vec::new();
    for date in dates {
        ws.set_timeline_date(date);
        let presenter = ws.localized(localization).presenter();
        bad.extend(
            presenter
                .realm_labels()
                .labels
                .into_iter()
                .map(|label| label.name)
                .filter(|name| name.contains('$')),
        );
        bad.extend(
            presenter
                .dated_realms(None)
                .rows
                .into_iter()
                .map(|row| row.name)
                .filter(|name| name.contains('$')),
        );
    }
    if summary.available {
        ws.set_timeline_date(summary.end);
    }
    bad.sort();
    bad.dedup();
    assert!(bad.is_empty(), "names with a token: {bad:?}");
}

/// Each map mode crossed with each scope. Rows are of the land in scope, each total adds up
/// from its rows, names are of the land in scope, and the key has the colours of the map.
fn mode_scope_matrix(ws: &mut Eu5Workspace, localization: &Localization) {
    let by_rank: Vec<_> = {
        let mut rows: Vec<_> = ws
            .gamestate()
            .countries
            .iter()
            .filter_map(|entry| {
                let data = entry.data()?;
                (data.great_power_rank > 0).then_some((data.great_power_rank, entry.idx()))
            })
            .collect();
        rows.sort_by_key(|(rank, _)| *rank);
        rows.into_iter().map(|(_, idx)| idx).collect()
    };
    let owners: BTreeSet<_> = ws
        .gamestate()
        .locations
        .iter()
        .filter_map(|entry| entry.location().owner.real_id())
        .map(|id| id.country_id())
        .collect();
    let landed: Vec<_> = by_rank
        .into_iter()
        .filter(|idx| owners.contains(&ws.gamestate().countries.index(*idx).id()))
        .collect();
    let has_players = ws.players().next().is_some();
    for scope in ["all", "players", "top ten", "pair"] {
        ws.clear_selection();
        match scope {
            "players" if !has_players => continue,
            "players" => {
                ws.select_players();
            }
            "top ten" => {
                ws.select_countries(&landed[..10]);
            }
            "pair" => {
                ws.select_countries(&landed[20..22]);
            }
            _ => {}
        }
        let state = ws.selection_state();
        let in_scope: BTreeSet<u32> = ws
            .gamestate()
            .locations
            .iter()
            .filter(|entry| state.is_empty() || state.contains(entry.idx()))
            .filter_map(|entry| entry.location().owner.real_id())
            .filter_map(|id| ws.gamestate().countries.get(id.country_id()))
            .map(|idx| idx.value())
            .collect();
        if scope == "players" {
            let played: BTreeSet<u32> = ws.players().map(|p| p.country.value()).collect();
            assert!(
                in_scope.is_subset(&played),
                "the players scope holds a non-player"
            );
        }
        let presenter = ws.localized(localization).presenter();
        let check = |what: &str, rows: Vec<u32>| {
            let outside: Vec<_> = rows.iter().filter(|key| !in_scope.contains(key)).collect();
            assert!(
                outside.is_empty(),
                "{scope}/{what}: rows out of scope {outside:?}"
            );
        };
        let dev = presenter.calculate_development_insight();
        check(
            "development",
            dev.countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );
        let sum: f64 = dev.countries.iter().map(|r| r.total_development).sum();
        assert!(
            (sum - dev.scope.total_development).abs() < 1.0,
            "{scope}: development total {} against rows {sum}",
            dev.scope.total_development
        );
        check(
            "efficacy",
            presenter
                .calculate_state_efficacy_insight()
                .countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );
        check(
            "wealth",
            presenter
                .calculate_wealth_insight()
                .countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );
        check(
            "tax gap",
            presenter
                .calculate_unrealized_tax_base_insight()
                .countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );
        check(
            "population",
            presenter
                .calculate_population_insight()
                .countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );
        check(
            "control",
            presenter
                .calculate_control_insight()
                .scatter_countries
                .iter()
                .map(|r| u32::from(r.country.country.key))
                .collect(),
        );

        // The followers add up to the people of the land in scope.
        let scope_population: f64 = dev
            .countries
            .iter()
            .map(|r| f64::from(r.total_population))
            .sum();
        let followers: f64 = presenter
            .calculate_religion_insight()
            .religions
            .iter()
            .map(|r| f64::from(r.follower_population))
            .sum();
        assert!(
            (followers - scope_population).abs() <= scope_population * 0.01 + 1000.0,
            "{scope}: followers {followers} against people {scope_population}"
        );

        // A lens on a thing of a list adds up to that row, and stays in scope.
        let presenter = ws.localized(localization).presenter();
        let religions = presenter.calculate_religion_insight();
        if let Some(top) = religions.religions.first() {
            let lens = presenter.item_lens(&eu5app::insights::LensItem::Religion(
                top.religion.key.clone(),
            ));
            check(
                "religion lens",
                lens.rows
                    .iter()
                    .map(|r| u32::from(r.country.country.key))
                    .collect(),
            );
            assert!(
                (lens.total - f64::from(top.follower_population)).abs() <= 2.0 + lens.total * 0.01,
                "{scope}: lens {} against row {}",
                lens.total,
                top.follower_population
            );
        }

        // A list by country has each country's own figure of the other views.
        if scope == "pair" {
            let presenter = ws.localized(localization).presenter();
            for (item, figure) in [
                (eu5app::insights::LensItem::AllBuildings, "buildings"),
                (eu5app::insights::LensItem::AllRawMaterials, "rgo"),
            ] {
                for row in presenter.item_lens(&item).rows {
                    let idx =
                        eu5save::models::CountryIdx::from_value(u32::from(row.country.country.key))
                            .unwrap();
                    let overview = presenter.country_profile_for(idx).unwrap().overview;
                    let own = if figure == "rgo" {
                        overview.rgo_levels
                    } else {
                        overview.building_levels
                    };
                    assert!(
                        (row.value - own).abs() < 0.01,
                        "{figure}: list {} against the country's {own}",
                        row.value
                    );
                }
            }
        }

        for mode in ALL_MAP_MODES {
            ws.set_map_mode(mode);
            let labels = ws.localized(localization).presenter().realm_labels().labels;
            if mode == MapMode::Political && scope == "pair" {
                let chosen: Vec<_> = landed[20..22].iter().map(|idx| idx.value()).collect();
                for idx in chosen {
                    assert!(
                        labels.iter().any(|label| label.country_idx == Some(idx)),
                        "a selected country has no name on the map"
                    );
                }
            }
            if matches!(mode, MapMode::Religion | MapMode::Markets) {
                let land = ws
                    .gamestate()
                    .locations
                    .iter()
                    .filter(|entry| {
                        let state = ws.selection_state();
                        state.is_empty() || state.contains(entry.idx())
                    })
                    .count() as u32;
                let named: u32 = labels.iter().map(|label| label.location_count).sum();
                assert!(
                    named <= land,
                    "{scope}/{mode:?}: names cover {named} of {land}"
                );
                assert!(!labels.is_empty(), "{scope}/{mode:?}: no names");
            }
        }
    }
    ws.clear_selection();
    ws.set_map_mode(MapMode::Political);
}

/// One clip rule for the sequential maps: the key says where the scale stops and the true
/// highest value, and most land with a value is not near black.
fn sequential_maps_keep_their_land_readable(ws: &mut Eu5Workspace) {
    use eu5app::gradient::MapLegend;
    ws.clear_selection();
    for mode in [
        MapMode::Development,
        MapMode::StateEfficacy,
        MapMode::Wealth,
        MapMode::UnrealizedTaxBase,
        MapMode::BuildingLevels,
        MapMode::RgoLevel,
        MapMode::Population,
    ] {
        let change = ws.set_map_mode(mode);
        let MapLegend::Quantitative(config) = change.legend else {
            panic!("{mode:?} has no scale");
        };
        assert!(config.clamped, "{mode:?} has no clip");
        assert!(
            config.true_max >= config.max_value,
            "{mode:?}: true top under the clip"
        );
        let painted: Vec<u32> =
            bytemuck::cast_slice(ws.location_arrays().buffers().primary_colors()).to_vec();
        let black = |color: u32| {
            let [b, g, r, _] = color.to_le_bytes();
            u32::from(r.max(g).max(b)) < 40
        };
        let mut land = 0;
        let mut dark = 0;
        for entry in ws.gamestate().locations.iter() {
            if entry.location().owner.is_dummy() {
                continue;
            }
            let Some(gpu) = ws.gpu_index_of(entry.idx()) else {
                continue;
            };
            land += 1;
            dark += u32::from(black(painted[gpu]));
        }
        let share = f64::from(dark) / f64::from(land.max(1));
        // A new campaign has land with no buildings at all.
        if mode != MapMode::BuildingLevels || config.true_max >= 100.0 {
            assert!(
                share < 0.3,
                "{mode:?}: {share:.3} of the land is near black"
            );
        }
    }
    ws.set_map_mode(MapMode::Political);
}

/// The key of the markets map has the colour that the painter gives at full access.
fn market_key_has_the_map_colours(ws: &mut Eu5Workspace, localization: &Localization) {
    ws.clear_selection();
    ws.set_map_mode(MapMode::Markets);
    let key: BTreeMap<u32, [u8; 3]> = ws
        .localized(localization)
        .presenter()
        .calculate_market_insight()
        .markets
        .iter()
        .map(|row| (u32::from(row.market.market.key), row.market.color_hex.0))
        .collect();
    let painted: Vec<u32> =
        bytemuck::cast_slice(ws.location_arrays().buffers().primary_colors()).to_vec();
    let mut checked = 0;
    let mut found: BTreeMap<u32, BTreeSet<[u8; 3]>> = BTreeMap::new();
    for (entry, _) in ws.gamestate().locations.iter().zip(0..) {
        let location = entry.location();
        if location.market_access < 0.75 || ws.location_terrain(entry.idx()).is_water() {
            continue;
        }
        let Some(market) = location.market else {
            continue;
        };
        let Some(gpu) = ws.gpu_index_of(entry.idx()) else {
            continue;
        };
        let [b, g, r, _] = painted[gpu].to_le_bytes();
        found.entry(market.value()).or_default().insert([r, g, b]);
        checked += 1;
    }
    assert!(checked > 0 || key.is_empty());
    for (market, colors) in found {
        let Some(swatch) = key.get(&market) else {
            continue;
        };
        assert!(
            colors.contains(swatch),
            "market {market}: key {swatch:?}, map {colors:?}"
        );
    }
    ws.set_map_mode(MapMode::Political);
}

/// The figures of one country agree: its yearly tax base record sums the same thing as
/// the table, some months earlier, and its score places have no gap.
fn country_figures_agree(ws: &mut Eu5Workspace, localization: &Localization) {
    let owners: BTreeSet<_> = ws
        .gamestate()
        .locations
        .iter()
        .filter_map(|entry| entry.location().owner.real_id())
        .map(|id| id.country_id())
        .collect();
    let mut places: Vec<(u32, u32)> = owners.iter().filter_map(|id| ws.score_place(*id)).collect();
    places.sort();
    places.dedup();
    let mut next = 1;
    for (place, tied) in places {
        assert_eq!(place, next, "score places skip");
        next = place + tied;
    }

    // A profile takes time, so a sample of the countries is enough.
    let presenter = ws.localized(localization).presenter();

    // The control list has each country of size, so its first row leads the whole world.
    let control = presenter.calculate_control_insight();
    let large: BTreeMap<_, u32> =
        ws.gamestate()
            .locations
            .iter()
            .fold(BTreeMap::new(), |mut land, entry| {
                if let Some(id) = entry.location().owner.real_id() {
                    *land.entry(id.country_id()).or_default() += 1;
                }
                land
            });
    let large = large.values().filter(|count| **count >= 10).count();
    assert!(
        control.scatter_countries.len() >= large,
        "control list has {} of {large} countries",
        control.scatter_countries.len()
    );

    let mut gaps: Vec<f64> = owners
        .iter()
        .step_by(20)
        .filter_map(|id| {
            let idx = ws.gamestate().countries.get(*id)?;
            let overview = presenter.country_profile_for(idx)?.overview;
            let last = overview.historical_tax_base.last().copied()?;
            // A new campaign has no record to speak of.
            (overview.tax_base > 20.0 && overview.historical_tax_base.len() > 10)
                .then_some((last - overview.tax_base).abs() / overview.tax_base)
        })
        .collect();
    if !gaps.is_empty() {
        gaps.sort_by(f64::total_cmp);
        let middle = gaps[gaps.len() / 2];
        assert!(
            middle < 0.1,
            "tax base record is {middle} away from the locations, n={}",
            gaps.len()
        );
    }
}

/// The last sample of a yearly population series is in people, as the current figure is.
fn population_history_is_in_people(ws: &mut Eu5Workspace, localization: &Localization) {
    let countries: Vec<_> = ws
        .gamestate()
        .countries
        .iter()
        .filter_map(|entry| entry.data().map(|_| entry.idx()))
        .collect();
    let presenter = ws.localized(localization).presenter();
    let mut ratios: Vec<f64> = countries
        .into_iter()
        .step_by(20)
        .filter_map(|idx| {
            let overview = presenter.country_profile_for(idx)?.overview;
            let last = overview.historical_population.last().copied()?;
            let now = f64::from(overview.total_population);
            (now >= 100_000.0 && last > 0.0).then_some(last / now)
        })
        .collect();
    assert!(!ratios.is_empty(), "no country had a population history");
    // The save writes the sample at the turn of a year, and a country can gain land after
    // it, so one country can differ. The middle of them must not.
    ratios.sort_by(f64::total_cmp);
    let middle = ratios[ratios.len() / 2];
    assert!((0.8..1.25).contains(&middle), "middle ratio {middle}");
}

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
