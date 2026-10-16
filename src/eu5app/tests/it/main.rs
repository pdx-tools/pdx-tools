mod analysis;
mod fixtures;
mod utils;

use std::collections::BTreeMap;

use eu5app::game_data::Localization;
use eu5app::{Eu5SaveLoader, Eu5Workspace, MapMode};
use eu5save::models::{LocationIdx, MarketId};
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
    let mut map_modes: BTreeMap<&'static str, serde_json::Value> = BTreeMap::new();
    for mode in ALL_MAP_MODES {
        ws.set_map_mode(mode);
        map_modes.insert(
            mode_name(mode),
            utils::summarize_location_arrays(ws.location_arrays()),
        );
    }

    ws.clear_selection();
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
