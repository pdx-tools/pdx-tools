mod utils;

use std::collections::BTreeMap;

use eu5app::{Eu5SaveLoader, Eu5Workspace, MapMode};
use eu5save::models::{CountryIdx, LocationIdx};
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
        let localized = ws.localized(&localization);
        let snapshot = serde_json::json!({
            "save_version": ws.gamestate().metadata().version.to_string(),
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

/// A timeline round trip must restore all map buffers for impassable terrain.
#[test]
fn timeline_round_trip_keeps_impassable_terrain_borders() {
    let save_name = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";
    let Some(mut loaded) = utils::build_workspace(save_name) else {
        return;
    };
    let ws = &mut loaded.workspace;
    ws.set_map_mode(MapMode::Political);
    let live = utils::hash_location_arrays(ws.location_arrays());
    let summary = ws.timeline_summary();
    assert!(summary.available);
    ws.set_timeline_date(summary.start);
    assert_ne!(utils::hash_location_arrays(ws.location_arrays()), live);
    ws.set_timeline_date(summary.end);
    assert!(ws.is_timeline_live());
    assert_eq!(utils::hash_location_arrays(ws.location_arrays()), live);
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
fn good_producers_add_up_to_market_production() {
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

        let markets: Vec<_> = ws
            .gamestate()
            .market_manager
            .database
            .iter_with_id()
            .map(|(id, market)| (id, market.center))
            .collect();
        let goods: Vec<String> = ws
            .gamestate()
            .market_manager
            .produced_goods
            .iter()
            .map(|(good, _)| good.to_str().to_string())
            .collect();

        let localized = ws.localized(&loaded.localization);
        let presenter = localized.presenter();
        for good in &goods {
            let world = presenter.calculate_good_producers(good, None);
            let sources = world.raw_material_units + world.building_units + world.other_units;
            assert!(
                (world.total_units - sources).abs() < 1e-6 * world.total_units.max(1.0),
                "{save_name}: {good} sources {sources} do not add up to {}",
                world.total_units
            );
            let attributed: f64 = world.countries.iter().map(|c| c.units).sum();
            assert!(
                attributed <= world.total_units * (1.0 + 1e-9) + 1e-9,
                "{save_name}: {good} attributes {attributed} of {}",
                world.total_units
            );
            assert!(
                world
                    .countries
                    .windows(2)
                    .all(|pair| pair[0].units >= pair[1].units),
                "{save_name}: {good} producers are not sorted"
            );

            // The world is the sum of its markets.
            let by_market: f64 = markets
                .iter()
                .map(|(id, _)| {
                    presenter
                        .calculate_good_producers(good, Some(*id))
                        .total_units
                })
                .sum();
            assert!(
                (by_market - world.total_units).abs() < 1e-6 * world.total_units.max(1.0),
                "{save_name}: {good} markets sum to {by_market}, world is {}",
                world.total_units
            );

            // Building output is a base value, so it is never negative.
            assert!(
                world.building_base_output >= 0.0 && world.world_building_base_output >= 0.0,
                "{save_name}: {good} has a negative building base output"
            );
            // A good with building production and no known producing method
            // has no base output in the game data. Such goods are printed, and
            // the test does not fail on them.
            if world.building_units > 0.0 && world.world_building_base_output <= 0.0 {
                eprintln!(
                    "{save_name}: {good} has {} building units but no known producing method",
                    world.building_units
                );
            }
        }
    });
}

/// The production value of each country adds up to the market records. Each
/// country profile agrees with the world list.
#[test]
fn production_value_by_country_adds_up_to_world_production() {
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

        let markets: Vec<_> = ws
            .gamestate()
            .market_manager
            .database
            .iter_with_id()
            .map(|(id, _)| id)
            .collect();

        let localized = ws.localized(&loaded.localization);
        let presenter = localized.presenter();
        let tolerance = |value: f64| 1e-6 * value.abs().max(1.0);

        let world = presenter.calculate_production_by_country(None);
        assert!(
            (world.total_base_value - world.world_base_value).abs()
                <= tolerance(world.world_base_value),
            "{save_name}: an empty selection should cover the world base value"
        );
        assert!(
            (world.total_market_value - world.world_market_value).abs()
                <= tolerance(world.world_market_value),
            "{save_name}: an empty selection should cover the world market value"
        );

        let attributed: f64 = world.countries.iter().map(|c| c.base_value).sum();
        assert!(
            attributed <= world.total_base_value + tolerance(world.total_base_value),
            "{save_name}: countries attribute {attributed} of {}",
            world.total_base_value
        );
        assert!(
            world
                .countries
                .windows(2)
                .all(|pair| pair[0].base_value >= pair[1].base_value),
            "{save_name}: countries are not sorted by base value"
        );
        assert!(
            world.countries.iter().all(|c| c.top_goods.len() <= 3),
            "{save_name}: a country lists more than 3 top goods"
        );

        let by_market: f64 = markets
            .iter()
            .map(|id| {
                presenter
                    .calculate_production_by_country(Some(*id))
                    .total_base_value
            })
            .sum();
        assert!(
            (by_market - world.world_base_value).abs() <= tolerance(world.world_base_value),
            "{save_name}: markets sum to {by_market}, world is {}",
            world.world_base_value
        );

        let distinct = world
            .countries
            .windows(2)
            .all(|pair| pair[0].base_value != pair[1].base_value);
        for (position, country) in world.countries.iter().take(20).enumerate() {
            let idx = CountryIdx::from_value(country.country.country.key.value())
                .expect("a listed country has a valid index");
            let profile = presenter
                .country_production_profile_for(idx)
                .unwrap_or_else(|| panic!("{save_name}: no profile for country {}", idx.value()));

            let goods_base: f64 = profile.goods.iter().map(|g| g.base_value).sum();
            assert!(
                (goods_base - profile.base_value).abs() <= tolerance(profile.base_value),
                "{save_name}: country {} goods sum to {goods_base}, profile is {}",
                idx.value(),
                profile.base_value
            );
            assert!(
                (profile.base_value - country.base_value).abs() <= tolerance(country.base_value),
                "{save_name}: country {} profile is {}, world list is {}",
                idx.value(),
                profile.base_value,
                country.base_value
            );
            if distinct {
                assert_eq!(
                    profile.world_rank,
                    position as u32 + 1,
                    "{save_name}: country {} rank",
                    idx.value()
                );
            }
            for good in &profile.goods {
                assert!(
                    good.rank >= 1 && good.rank <= good.producer_count,
                    "{save_name}: country {} rank {} of {} for {}",
                    idx.value(),
                    good.rank,
                    good.producer_count,
                    good.good.key
                );
                assert!(
                    good.units <= good.world_units + tolerance(good.world_units),
                    "{save_name}: country {} makes {} of {} for {}",
                    idx.value(),
                    good.units,
                    good.world_units,
                    good.good.key
                );
            }
        }
    });
}

#[test]
fn opens_a_zstd_remuxed_zip_save() {
    let mut file =
        utils::request_file("SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5");
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
fn metadata_prefix_matches_the_full_file() {
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
        let mut start = vec![0u8; eu5app::SAVE_HEADER_MAX_LEN];
        std::io::Read::read_exact(&mut file, &mut start).unwrap();
        let len = eu5app::metadata_prefix_len(&start)
            .unwrap_or_else(|| panic!("{save_name}: no metadata length"));
        let mut prefix = vec![0u8; len];
        std::io::Seek::rewind(&mut file).unwrap();
        std::io::Read::read_exact(&mut file, &mut prefix).unwrap();

        let actual = eu5app::read_metadata_prefix(&prefix, resolver)
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
