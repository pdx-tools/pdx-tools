mod utils;

use std::collections::BTreeMap;

use eu5app::{Eu5Workspace, MapMode};
use eu5save::models::LocationIdx;

const ALL_MAP_MODES: [MapMode; 11] = [
    MapMode::Political,
    MapMode::Control,
    MapMode::Development,
    MapMode::Population,
    MapMode::Markets,
    MapMode::RgoLevel,
    MapMode::BuildingLevels,
    MapMode::PossibleTax,
    MapMode::TaxGap,
    MapMode::Religion,
    MapMode::StateEfficacy,
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
        MapMode::PossibleTax => "possible_tax",
        MapMode::TaxGap => "tax_gap",
        MapMode::Religion => "religion",
        MapMode::StateEfficacy => "state_efficacy",
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
        let owner_data = owner.data().unwrap();

        let snapshot = serde_json::json!({
            "save_version": ws.gamestate().metadata().version.to_string(),
            "map_mode_colors": color_hashes,
            "location": [{
                "id": location.id().value(),
                "name": ws.location_name(location.idx()),
                "owner": {
                    "id": owner.id().value(),
                    "tag": owner_tag.to_str(),
                    "name": ws.localized_country_name(&owner_data.country_name)
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
