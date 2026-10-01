mod utils;

use std::collections::BTreeMap;

use eu5app::{Eu5SaveLoader, Eu5Workspace, MapMode};
use eu5save::models::LocationIdx;
use eu5save::{Eu5File, JominiFileKind};
use jomini::binary::TokenResolver;

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

        ws.clear_selection();
        ws.clear_focus();
        ws.set_map_mode(MapMode::Political);

        let mut color_hashes: BTreeMap<&'static str, String> = BTreeMap::new();
        for mode in ALL_MAP_MODES {
            ws.set_map_mode(mode);
            color_hashes.insert(
                mode_name(mode),
                utils::hash_location_arrays(ws.location_arrays()),
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
        let localized = ws.localized(&localization);
        let snapshot = serde_json::json!({
            "save_version": ws.gamestate().metadata().version.to_string(),
            "map_mode_colors": color_hashes,
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
        });

        insta::assert_json_snapshot!(snapshot);
    });
}

/// The border index at the save date must agree with the current owner of
/// every location, and a round trip through the past must restore the live
/// map exactly. Saves from before the campaign timeline have no history, so
/// for them the timeline reports unavailable and the map never changes.
#[test]
fn timeline_round_trip_restores_the_live_map() {
    insta::glob!("saves.d/*.save", |path| {
        let save_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("pointer file stem is UTF-8");
        let Some(mut loaded) = utils::build_workspace(save_name) else {
            return;
        };
        let ws = &mut loaded.workspace;

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

        // A mode without a history cannot show a past date.
        ws.set_timeline_date(summary.start);
        ws.set_map_mode(MapMode::Population);
        assert!(ws.is_timeline_live());
        assert_eq!(ws.get_map_mode(), MapMode::Population);
    });
}

/// Playback steps between past dates repaint only the locations that
/// changed hands and the surrounded terrain next to them. After a walk
/// through the campaign, that incremental map must equal a full repaint of
/// the same date.
#[test]
fn incremental_timeline_steps_match_a_full_repaint() {
    insta::glob!("saves.d/*.save", |path| {
        let save_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("pointer file stem is UTF-8");
        let Some(mut loaded) = utils::build_workspace(save_name) else {
            return;
        };
        let ws = &mut loaded.workspace;
        let summary = ws.timeline_summary();
        if !summary.available {
            return;
        }

        ws.set_map_mode(MapMode::Political);
        ws.set_timeline_date(summary.start);
        assert!(!ws.is_timeline_live());

        // Walk forward through the dates with changes, and then back again,
        // so that fills form and dissolve in both directions.
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
    });
}

/// The browser uploads saves after `pdx-save-codec` remuxes the zip entries to
/// zstd. The permalink page opens that upload with the same feature set as
/// this crate's defaults, so the zstd zip path must work without the C
/// backend.
#[test]
fn opens_a_zstd_remuxed_zip_save() {
    let mut file = utils::request_file("Clandeboye.eu5");
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
        eprintln!("EU5 binary tokens not loaded; skipping gamestate parse");
        return;
    }
    let mut loaded = loader.parse().unwrap();
    assert!(loaded.take_gamestate().locations.iter().next().is_some());
}
