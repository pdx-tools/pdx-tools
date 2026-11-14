mod analysis;
mod fixtures;
mod utils;

use std::collections::{BTreeMap, BTreeSet};

use eu5app::game_data::Localization;
use eu5app::gradient::{GradientPalette, MapLegend};
use eu5app::hover::presentation::DisplayData as HoverDisplayData;
use eu5app::population::PopulationHistory;
use eu5app::{
    EntityKind, Eu5SaveLoader, Eu5Workspace, LocationData, MapMode, SelectionOp, SelectionSet,
    SelectionTarget,
};
use eu5save::hash::FnvHashSet;
use eu5save::models::{CountryId, LocationIdx, MarketId};
use eu5save::{Eu5File, JominiFileKind};
use jomini::binary::TokenResolver;
use jomini::common::PdsDate;

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
        snapshot["selection_targets"] =
            run_workspace_scenario(save_name, "selection targets", ws, |ws| {
                selection_targets_select_the_same_land(ws, save_name)
            });
        snapshot["box_on_filled_terrain"] =
            run_workspace_scenario(save_name, "box on filled terrain", ws, |ws| {
                a_box_on_filled_terrain_adds_its_country(ws, save_name)
            });
        snapshot["most_foreign_building"] =
            run_workspace_scenario(save_name, "foreign owner cells", ws, |ws| {
                foreign_owner_cells_hold_the_most_foreign_building(ws, &localization)
            })
            .into();
        snapshot["swatches"] =
            run_workspace_scenario(save_name, "swatches match the map", ws, |ws| {
                swatches_match_the_map(ws, &localization)
            });
        snapshot["land_by_fifth"] =
            run_workspace_scenario(save_name, "sequential maps spread their land", ws, |ws| {
                sequential_maps_spread_their_land(ws)
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
        run_workspace_scenario(save_name, "population history is in people", ws, |ws| {
            population_history_is_in_people(ws, &localization)
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
        ws.change_selection(SelectionOp::Replace, countries_at(ws, location));
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
        ws.change_selection(SelectionOp::Replace, countries_at(ws, a));
        after_select = ws.selection_state().selected_locations().len();
        assert!(after_select > 0, "select_country_at should add locations");

        if let Some(b) = find_different_owner_location(ws, a) {
            ws.change_selection(SelectionOp::Add, countries_at(ws, b));
            after_add = ws.selection_state().selected_locations().len();
            assert!(
                after_add > after_select,
                "add_country_at should grow the selection"
            );

            ws.change_selection(SelectionOp::Remove, countries_at(ws, a));
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

fn map_mode_summary(ws: &Eu5Workspace, legend: MapLegend) -> serde_json::Value {
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

/// The primary color that the map paints at each location in the map texture.
fn painted_colors(ws: &Eu5Workspace) -> BTreeMap<LocationIdx, [u8; 3]> {
    let colors = ws.location_arrays().buffers().primary_colors();
    ws.gamestate()
        .locations
        .iter()
        .filter_map(|entry| {
            let slot = ws.center_at(entry.idx())?;
            let (r, g, b) = colors[usize::from(slot.value())].rgb();
            Some((entry.idx(), [r, g, b]))
        })
        .collect()
}

/// A few extreme places must not squeeze most land into one fifth of a
/// sequential map's gradient, at either end. Its key shows the land above the
/// top. Returns the share of land in each fifth of each mode. A color gives
/// its place on the gradient to within 1/64.
fn sequential_maps_spread_their_land(ws: &mut Eu5Workspace) -> serde_json::Value {
    let samples = eu5app::gradient::palette_stops(GradientPalette::Eu5);
    let position = |[r, g, b]: [u8; 3]| {
        let distance = |(sr, sg, sb): (u8, u8, u8)| {
            [(r, sr), (g, sg), (b, sb)]
                .map(|(x, y)| (i32::from(x) - i32::from(y)).pow(2))
                .iter()
                .sum::<i32>()
        };
        samples
            .iter()
            .min_by_key(|(_, rgb)| distance(*rgb))
            .map_or(0.0, |(offset, _)| *offset)
    };
    let mut spread = serde_json::Map::new();
    for mode in ALL_MAP_MODES {
        let MapLegend::Quantitative(legend) = ws.set_map_mode(mode).legend else {
            continue;
        };
        if let Some(clip) = legend.clip {
            assert_ne!(mode, MapMode::Control, "a share has a true top");
            assert!(clip.highest > legend.max_value, "{mode:?}: {clip:?}");
            assert!(
                clip.share > 0.0 && clip.share <= 0.051,
                "{mode:?}: {clip:?}"
            );
        }
        let painted = painted_colors(ws);
        let mut fifths = [0usize; 5];
        for entry in ws.gamestate().locations.iter() {
            let terrain = ws.location_terrain(entry.idx());
            if entry.location().owner.real_id().is_none()
                || terrain.is_water()
                || !terrain.is_passable()
            {
                continue;
            }
            if let Some(&color) = painted.get(&entry.idx()) {
                fifths[((position(color) * 5.0) as usize).min(4)] += 1;
            }
        }
        let land = fifths.iter().sum::<usize>().max(1);
        let largest = fifths.iter().copied().max().unwrap_or(0);
        // Growth keeps a bottom at zero, and most land grows at about one rate.
        if mode != MapMode::PopulationGrowth {
            assert!(
                largest * 10 < land * 6,
                "{mode:?}: one fifth holds {largest} of {land} locations"
            );
        }
        let shares = fifths.map(|count| (count as f64 / land as f64 * 100.0).round() / 100.0);
        spread.insert(mode_name(mode).to_string(), serde_json::json!(shares));
    }
    spread.into()
}

/// A swatch has the color that the map paints. The land of a country has the color
/// of the country's swatch, and a location with full market access has the color of
/// its market's swatch. Returns what the save covers: swatches with a subject's
/// blend, and markets checked.
fn swatches_match_the_map(ws: &mut Eu5Workspace, localization: &Localization) -> serde_json::Value {
    let painted = painted_colors(ws);
    let presenter = ws.localized(localization).presenter();
    let mut owners = BTreeSet::new();
    let mut blended_countries = 0;
    for entry in ws.gamestate().locations.iter() {
        let Some(owner) = entry.location().owner.real_id() else {
            continue;
        };
        let Some(&color) = painted.get(&entry.idx()) else {
            continue;
        };
        let terrain = ws.location_terrain(entry.idx());
        if terrain.is_water() || !terrain.is_passable() || !owners.insert(owner.country_id()) {
            continue;
        }
        let HoverDisplayData::Country { country, .. } = presenter.hover_data(entry.idx()) else {
            panic!("owned land names its owner");
        };
        assert_eq!(country.color_hex.0, color, "{} swatch", country.tag);
        let countries = &ws.gamestate().countries;
        let saved = countries
            .get(owner)
            .and_then(|idx| countries.index(idx).data());
        if saved.is_some_and(|data| data.color.0 != country.color_hex.0) {
            blended_countries += 1;
        }
    }

    ws.set_map_mode(MapMode::Markets);
    let painted = painted_colors(ws);
    let swatches: BTreeMap<u32, [u8; 3]> = ws
        .localized(localization)
        .presenter()
        .calculate_market_insight()
        .markets
        .iter()
        .map(|row| (row.market.market.key.value(), row.market.color_hex.0))
        .collect();
    let mut checked_markets = BTreeSet::new();
    for entry in ws.gamestate().locations.iter() {
        let location = entry.location();
        let (Some(market), Some(&color)) = (location.market, painted.get(&entry.idx())) else {
            continue;
        };
        if location.market_access < 1.0 {
            continue;
        }
        let swatch = swatches[&market.value()];
        assert_eq!(swatch, color, "market {} swatch", market.value());
        checked_markets.insert(market.value());
    }

    serde_json::json!({
        "blended_countries": blended_countries,
        "checked_markets": checked_markets.len(),
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
        ws.change_selection(
            SelectionOp::Replace,
            markets_at(ws, LocationIdx::new(header.anchor_location_idx)),
        );
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
    ws.change_selection(SelectionOp::Replace, countries_at(ws, anchor));
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
    ws.set_map_mode(MapMode::Markets);
    ws.click(SelectionOp::Replace, outside_market);
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

/// The selection's target selects the same land again, for each kind of target.
/// The result goes in the snapshot, so a save that stops covering a case shows
/// in the diff.
fn selection_targets_select_the_same_land(
    ws: &mut Eu5Workspace,
    save_name: &str,
) -> serde_json::Value {
    let replace_restores =
        |ws: &mut Eu5Workspace, what: &str| target_selects_the_same_land(ws, save_name, what);

    // The three countries and the three markets with the most land.
    let mut country_land: BTreeMap<u32, usize> = BTreeMap::new();
    let mut market_land: BTreeMap<u32, usize> = BTreeMap::new();
    for entry in ws.gamestate().locations.iter() {
        let info = ws.location_info(entry.idx());
        if let Some(owner) = info.owner {
            *country_land.entry(owner.country_id().value()).or_default() += 1;
        }
        if let Some(market) = info.market {
            *market_land.entry(market.value()).or_default() += 1;
        }
    }
    let largest = |land: BTreeMap<u32, usize>| {
        let mut land: Vec<_> = land.into_iter().collect();
        land.sort_by_key(|&(id, count)| (std::cmp::Reverse(count), id));
        let mut ids: Vec<_> = land.into_iter().take(3).map(|(id, _)| id).collect();
        assert_eq!(ids.len(), 3, "{save_name}: three entities hold land");
        ids.sort_unstable();
        ids
    };
    let owners: Vec<_> = largest(country_land)
        .into_iter()
        .map(CountryId::new)
        .collect();
    let mut countries: Vec<_> = owners
        .iter()
        .map(|&id| ws.gamestate().countries.get(id).unwrap())
        .collect();
    countries.sort_unstable_by_key(|idx| idx.value());
    let markets: Vec<_> = largest(market_land)
        .into_iter()
        .map(MarketId::new)
        .collect();

    let set = SelectionSet::Countries(countries.clone());
    ws.change_selection(SelectionOp::Replace, set.clone());
    let land: FnvHashSet<_> = owners
        .iter()
        .flat_map(|&id| land_on_timeline_date(ws, id))
        .collect();
    assert_eq!(ws.selection_state().selected_locations(), &land);
    assert_eq!(
        replace_restores(ws, "countries"),
        SelectionTarget::Set(set.clone())
    );

    // A step through the markets mode does not make the countries a set of locations.
    ws.set_map_mode(MapMode::Markets);
    ws.change_selection(SelectionOp::Add, SelectionSet::Locations(Vec::new()));
    ws.set_map_mode(MapMode::Political);
    assert_eq!(
        replace_restores(ws, "countries after markets"),
        SelectionTarget::Set(set)
    );

    // Part of a country is its locations.
    let one = *land_on_timeline_date(ws, owners[0]).iter().next().unwrap();
    ws.change_selection(SelectionOp::Remove, SelectionSet::Locations(vec![one]));
    let target = replace_restores(ws, "part of a country");
    assert!(matches!(
        target,
        SelectionTarget::Set(SelectionSet::Locations(_))
    ));

    // A market carries by the id of its center location.
    for &market in &markets {
        let center = ws.market_center_id(market).unwrap();
        assert_eq!(ws.market_at_center_id(center), Some(market));
    }
    ws.set_map_mode(MapMode::Markets);
    let set = SelectionSet::Markets(markets);
    ws.change_selection(SelectionOp::Replace, set.clone());
    assert_eq!(replace_restores(ws, "markets"), SelectionTarget::Set(set));
    ws.set_map_mode(MapMode::Political);

    ws.clear_selection();
    ws.select_players();
    // Only some saves have players, so the snapshot shows if this ran.
    let players = ws.selection_state().preset().is_some();
    if players {
        assert_eq!(replace_restores(ws, "players"), SelectionTarget::Players);
    }

    // A step keeps a focus on land that has no owner at the start. A replace
    // with the target, then a focus inside it, gives the same focus again.
    let summary = ws.timeline_summary();
    let mut focus_on_unowned_land = false;
    if summary.available {
        ws.set_timeline_date(summary.start);
        let unowned: FnvHashSet<_> = ws
            .gamestate()
            .locations
            .iter()
            .map(|entry| entry.idx())
            .filter(|&idx| ws.owner_at_timeline_date(idx).is_dummy())
            .collect();
        ws.set_timeline_date(summary.end);
        let candidates: Vec<_> = ws
            .gamestate()
            .locations
            .iter()
            .filter(|entry| unowned.contains(&entry.idx()))
            .filter_map(|entry| {
                let country = ws.gamestate().countries.get(entry.location().owner)?;
                Some((entry.idx(), country))
            })
            .collect();
        // A location in the country's land on the map.
        let found = candidates.into_iter().find(|&(location, country)| {
            ws.change_selection(SelectionOp::Replace, SelectionSet::Countries(vec![country]));
            ws.selection_state().contains(location)
        });
        if let Some((location, _)) = found {
            ws.focus_in_selection(location);
            ws.set_timeline_date(summary.start);
            if ws.selection_state().focused_location() == Some(location) {
                focus_on_unowned_land = true;
                replace_restores(ws, "a focus on unowned land");
                ws.focus_in_selection(location);
                assert_eq!(
                    ws.selection_state().focused_location(),
                    Some(location),
                    "{save_name}: a focus on unowned land comes back"
                );
            }
        }
    }

    // A removal that takes out the last followed country leaves nothing.
    ws.set_timeline_date(summary.end);
    let landless = ws.gamestate().countries.iter().find_map(|entry| {
        entry.data()?;
        let ids = ws.lineage_ids(entry.idx());
        land_of_ids(ws, &ids).0.is_empty().then_some(entry.idx())
    });
    if let Some(landless) = landless {
        let both = vec![landless, countries[0]];
        ws.clear_selection();
        ws.change_selection(SelectionOp::Add, SelectionSet::Countries(vec![landless]));
        ws.change_selection(SelectionOp::Remove, SelectionSet::Countries(both));
        assert!(
            ws.selection_state().is_empty(),
            "{save_name}: removing every selected country leaves nothing"
        );
    }
    serde_json::json!({
        "players": players,
        "focus_on_unowned_land": focus_on_unowned_land,
        "remove_with_a_landless_country": landless.is_some(),
    })
}

/// A box on filled terrain, as from a Shift-click, covers the country it
/// takes its color from, as a hover does, and adds that country as a whole
/// country. The map finds the area of a box from the grouping table, so this
/// does the same.
fn a_box_on_filled_terrain_adds_its_country(
    ws: &mut Eu5Workspace,
    save_name: &str,
) -> serde_json::Value {
    ws.set_map_mode(MapMode::Political);
    ws.clear_selection();
    let filled = ws
        .gamestate()
        .locations
        .iter()
        .map(|entry| entry.idx())
        .find(|&idx| {
            ws.owner_at_timeline_date(idx).real_id().is_none()
                && ws.location_info(idx).owner.is_some()
        });
    let Some(filled) = filled else {
        return false.into();
    };

    let groups = ws.build_grouping_table();
    let location_ids = ws.location_arrays().buffers().location_ids();
    let (_, hit) = groups
        .iter()
        .find(|&(gpu, _)| location_ids[gpu.value() as usize].value() == filled.value())
        .expect("filled terrain is on the map");
    let area: Vec<_> = groups
        .iter()
        .filter(|&(_, group)| group == hit)
        .map(|(gpu, _)| gpu)
        .collect();
    let area_locations: Vec<_> = area
        .iter()
        .map(|gpu| LocationIdx::new(location_ids[gpu.value() as usize].value()))
        .collect();

    ws.change_selection(SelectionOp::Add, SelectionSet::Locations(area_locations));
    let owner = ws.location_info(filled).owner.unwrap();
    let country = ws.gamestate().countries.get(owner.country_id());
    assert_eq!(
        ws.selection_target(),
        Some(SelectionTarget::Set(SelectionSet::Countries(
            country.into_iter().collect()
        ))),
        "{save_name}: a box on filled terrain adds the country around it"
    );
    let flags = ws.location_arrays().buffers().state_flags();
    assert!(
        area.iter()
            .all(|gpu| !flags[gpu.value() as usize].contains(pdx_map::LocationFlags::DIMMED)),
        "{save_name}: the selection shows all of the area that the box covered"
    );
    true.into()
}

/// Replace with the selection's target and check that the land is the same.
fn target_selects_the_same_land(
    ws: &mut Eu5Workspace,
    save_name: &str,
    what: &str,
) -> SelectionTarget {
    let land = ws.selection_state().selected_locations().clone();
    let target = ws.selection_target().expect("a selection has a target");
    ws.clear_selection();
    match target.clone() {
        SelectionTarget::Players => ws.select_players(),
        SelectionTarget::Set(set) => ws.change_selection(SelectionOp::Replace, set),
    };
    assert_eq!(
        ws.selection_state().selected_locations(),
        &land,
        "{save_name}: {what} selects the same land again"
    );
    target
}

/// The country that owns `location` on the timeline date.
fn countries_at(ws: &Eu5Workspace, location: LocationIdx) -> SelectionSet {
    let owner = ws.owner_at_timeline_date(location);
    SelectionSet::Countries(ws.gamestate().countries.get(owner).into_iter().collect())
}

/// The market of `location`.
fn markets_at(ws: &Eu5Workspace, location: LocationIdx) -> SelectionSet {
    SelectionSet::Markets(ws.location_info(location).market.into_iter().collect())
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

    ws.change_selection(
        SelectionOp::Replace,
        SelectionSet::Countries(vec![country_idx]),
    );
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
    ws.click(SelectionOp::Replace, clicked);
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
            ws.change_selection(SelectionOp::Replace, SelectionSet::Countries(vec![country]));
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
                // A click selects the land of one id, which is not the whole country
                // when another id also holds land.
                ws.clear_selection();
                ws.click(SelectionOp::Replace, location);
                target_selects_the_same_land(ws, save_name, &format!("{date:?} one id"));
            }
            ws.change_selection(SelectionOp::Remove, SelectionSet::Countries(vec![country]));
            assert!(
                ws.selection_state().is_empty(),
                "{save_name}: {date:?} a removal takes the land of each id"
            );
            ws.change_selection(SelectionOp::Add, SelectionSet::Countries(vec![country]));
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
        ws.change_selection(SelectionOp::Replace, SelectionSet::Countries(vec![country]));
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
        ws.change_selection(SelectionOp::Remove, SelectionSet::Countries(vec![country]));
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
        ws.change_selection(SelectionOp::Replace, SelectionSet::Countries(vec![country]));
        ws.set_timeline_date(no_land);
        let other = ws.gamestate().locations.iter().find_map(|entry| {
            let owner = ws.owner_at_timeline_date(entry.idx());
            ws.gamestate().countries.get(owner)
        });
        let Some(other) = other else {
            continue;
        };
        ws.change_selection(SelectionOp::Add, SelectionSet::Countries(vec![other]));
        ws.change_selection(SelectionOp::Remove, SelectionSet::Countries(vec![country]));
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
    ws.change_selection(SelectionOp::Replace, markets_at(ws, anchor));
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

/// The table of foreign owners by building type holds the type that foreign
/// countries own the most levels of, although that type is often not in the
/// top types by all levels.
fn foreign_owner_cells_hold_the_most_foreign_building(
    ws: &mut Eu5Workspace,
    localization: &Localization,
) -> Option<String> {
    let insight = ws
        .localized(localization)
        .presenter()
        .calculate_building_levels_insight();
    let most_foreign = insight
        .types
        .iter()
        .filter(|t| t.foreign_levels > 0.0)
        .max_by(|a, b| a.foreign_levels.total_cmp(&b.foreign_levels))?;
    assert!(
        insight
            .foreign_owner_cells
            .iter()
            .any(|cell| cell.building.key == most_foreign.building.key),
        "no foreign owner cell for {}",
        most_foreign.building.key
    );
    Some(format!(
        "{} {:.0}",
        most_foreign.building.key, most_foreign.foreign_levels
    ))
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

/// The middle ratio of each history's last sample to the country's population now.
/// The save writes a sample each year and a country can gain land after it, so one
/// country can differ, but the middle cannot. A history in thousands gives 0.001.
fn middle_history_ratio(
    save_year: i16,
    rows: impl Iterator<Item = (f64, PopulationHistory)>,
) -> Option<f64> {
    let mut ratios: Vec<f64> = rows
        .filter_map(|(now, history)| {
            let last = history.people.last().copied()?;
            assert!(history.last_year <= save_year, "a sample after the save");
            (now >= 100_000.0 && last > 0.0).then_some(last / now)
        })
        .collect();
    ratios.sort_by(f64::total_cmp);
    ratios.get(ratios.len() / 2).copied()
}

fn population_history_is_in_people(ws: &mut Eu5Workspace, localization: &Localization) {
    let save_year = ws.gamestate().metadata().date.year();
    let countries: Vec<_> = ws
        .gamestate()
        .countries
        .iter()
        .filter_map(|entry| entry.data().map(|_| entry.idx()))
        // A sample of the countries keeps the scenario fast.
        .step_by(10)
        .collect();
    let presenter = ws.localized(localization).presenter();
    let mut profiles: Vec<_> = countries
        .into_iter()
        .filter_map(|idx| Some((idx, presenter.country_profile_for(idx)?.overview)))
        .collect();
    let in_profiles = middle_history_ratio(
        save_year,
        profiles.iter().map(|(_, overview)| {
            let now = f64::from(overview.total_population);
            (now, overview.historical_population.clone())
        }),
    );

    let growth = presenter.calculate_population_growth_insight();
    let in_world = middle_history_ratio(
        save_year,
        growth
            .countries
            .into_iter()
            .map(|c| (f64::from(c.total_population), c.historical_population)),
    );

    // A selection of whole countries keeps their history.
    profiles.sort_by_key(|(_, overview)| std::cmp::Reverse(overview.total_population));
    let largest = profiles.iter().take(9).map(|(idx, _)| *idx).collect();
    ws.change_selection(SelectionOp::Replace, SelectionSet::Countries(largest));
    let selected = ws
        .localized(localization)
        .presenter()
        .calculate_population_growth_insight();
    let in_selection = middle_history_ratio(
        save_year,
        selected
            .countries
            .into_iter()
            .map(|c| (f64::from(c.total_population), c.historical_population)),
    );

    for (scope, ratio) in [
        ("profiles", in_profiles),
        ("world", in_world),
        ("selection", in_selection),
    ] {
        let ratio = ratio.unwrap_or_else(|| panic!("{scope}: no population history"));
        assert!(
            (0.8..1.25).contains(&ratio),
            "{scope}: middle ratio {ratio}"
        );
    }
}

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
