use super::{fixtures, utils};
use eu5app::{Eu5AnySaveLoader, Eu5DebugSaveLoader};
use jomini::common::PdsDate;
use std::io::Read;

#[test]
fn streaming_checksum_and_history_match_the_regular_parser() {
    let mut bytes = Vec::new();
    fixtures::request_file("debug-1.0.eu5")
        .read_to_end(&mut bytes)
        .unwrap();
    let resolver = std::collections::HashMap::<u16, String>::new();
    let mut regular =
        Eu5AnySaveLoader::open_with(&bytes, &resolver, eu5app::SaveCheckSummer::new())
            .unwrap()
            .parse()
            .unwrap();
    let expected = eu5app::map_projection::extract(&regular.take_gamestate()).unwrap();
    let checksum = regular.into_observer().finish();
    let mut streaming = Eu5DebugSaveLoader::open_with(
        fixtures::request_file("debug-1.0.eu5"),
        eu5app::SaveCheckSummer::new(),
    )
    .unwrap()
    .parse()
    .unwrap();
    assert_eq!(
        eu5app::map_projection::extract(&streaming.take_gamestate()).unwrap(),
        expected
    );
    assert_eq!(streaming.into_observer().finish(), checksum);
    let compressed = pdx_save_codec::Compression::new(bytes)
        .unwrap()
        .compress()
        .unwrap();
    let mut loaded =
        Eu5AnySaveLoader::open_with(&compressed, &resolver, eu5app::SaveCheckSummer::new())
            .unwrap()
            .parse()
            .unwrap();
    assert_eq!(
        eu5app::map_projection::extract(&loaded.take_gamestate()).unwrap(),
        expected
    );
    assert_eq!(loaded.into_observer().finish(), checksum);
}

#[test]
fn random_access_import_matches_buffered_text_binary_and_zstd() {
    use std::io::Write;
    let resolver = utils::tokens();
    for name in [
        "debug-1.0.eu5",
        "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5",
    ] {
        let mut bytes = Vec::new();
        fixtures::request_file(name)
            .read_to_end(&mut bytes)
            .unwrap();
        let mut buffered =
            Eu5AnySaveLoader::open_with(&bytes, resolver, eu5app::SaveCheckSummer::new())
                .unwrap()
                .parse()
                .unwrap();
        let expected = eu5app::map_projection::extract(&buffered.take_gamestate()).unwrap();
        let checksum = buffered.into_observer().finish();
        // Both an on-disk file and its compressed form use the same ReaderAt loader.
        let compressed = pdx_save_codec::Compression::new(bytes.clone())
            .unwrap()
            .compress()
            .unwrap();
        for content in [bytes, compressed] {
            let mut file = tempfile::tempfile().unwrap();
            file.write_all(&content).unwrap();
            let mut loaded = Eu5AnySaveLoader::open_at_with(
                rawzip::FileReader::from(file),
                content.len() as u64,
                resolver,
                eu5app::SaveCheckSummer::new(),
            )
            .unwrap()
            .parse()
            .unwrap();
            assert_eq!(
                eu5app::map_projection::extract(&loaded.take_gamestate()).unwrap(),
                expected,
                "{name}"
            );
            assert_eq!(loaded.into_observer().finish(), checksum, "{name}");
        }
    }
}

/// Paint each mode from an extracted frame and compare it with the live map.
/// The u16 fractions of the frame permit a difference of 1 in a color channel.
#[test]
fn map_projection_preserves_all_modes_and_leaves_the_full_save_unchanged() {
    let save = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";
    let Some(mut loaded) = utils::build_workspace(save) else {
        return;
    };
    let ws = &mut loaded.workspace;
    ws.clear_selection();
    let mut frame = eu5app::map_projection::extract(ws.gamestate()).unwrap();
    assert_eq!(frame.layout_key, ws.map_projection_layout_key());
    // The store keeps the binary form, and the map paints from it.
    let bytes = eu5app::analysis::observation(
        eu5app::map_projection::extract(ws.gamestate()).unwrap(),
        eu5app::map_projection::world_summary(ws.gamestate()),
        campaign_analysis::SnapshotSource {
            campaign_id: String::from("campaign"),
            content_hash: String::from(save),
            date: campaign_analysis::SaveDate {
                year: 1617,
                month: 4,
                day: 1,
            },
            game_version: String::from("1.0.0"),
        },
    )
    .encode();
    let stored =
        campaign_analysis::Observation::<eu5app::analysis::Eu5Analysis>::decode(&bytes).unwrap();
    use eu5app::MapMode::*;
    for mode in crate::ALL_MAP_MODES {
        ws.set_map_mode(mode);
        let original = ws.location_arrays().as_data().to_vec();
        let groups: Vec<u32> = ws
            .build_grouping_table()
            .iter()
            .map(|(_, group)| group.raw())
            .collect();
        let paint = ws.paint_map_projection(frame.as_data(), mode).unwrap();
        let from_bytes = ws
            .paint_map_projection(
                stored
                    .payload
                    .data(&stored.descriptor.layout_key, &stored.ids),
                mode,
            )
            .unwrap();
        assert_eq!(from_bytes.groups, paint.groups, "{mode:?} stored groups");
        assert_eq!(
            from_bytes.arrays.color_data(),
            paint.arrays.color_data(),
            "{mode:?} stored colors"
        );
        assert_eq!(paint.groups, groups, "{mode:?} groups");
        assert_eq!(ws.location_arrays().as_data(), original, "{mode:?} live");
        let live = ws.location_arrays().buffers();
        let painted = paint.arrays.buffers();
        for (index, (a, b)) in live
            .border_colors()
            .iter()
            .zip(painted.border_colors())
            .enumerate()
        {
            assert_eq!(a, b, "{mode:?} border {index}");
        }
        for (index, (a, b)) in live
            .state_flags()
            .iter()
            .zip(painted.state_flags())
            .enumerate()
        {
            assert_eq!(a, b, "{mode:?} flag {index}");
        }
        for (expected, actual) in [
            (live.primary_colors(), painted.primary_colors()),
            (live.secondary_colors(), painted.secondary_colors()),
        ] {
            for (index, (a, b)) in expected.iter().zip(actual).enumerate() {
                for shift in [0, 8, 16, 24] {
                    let diff = (((a.packed() >> shift) & 255) as i16
                        - ((b.packed() >> shift) & 255) as i16)
                        .abs();
                    assert!(
                        diff <= if matches!(mode, Political | Religion) {
                            0
                        } else {
                            1
                        },
                        "{mode:?} location {index} channel {shift}: {a:?} vs {b:?}"
                    );
                }
            }
        }
    }
    // Validation does not depend on the mode.
    let mut invalid = frame.as_data();
    invalid.layout_key = "wrong-layout";
    assert_eq!(
        ws.paint_map_projection(invalid, Control).err(),
        Some(eu5app::map_projection::MapProjectionError::LayoutMismatch)
    );
    let mut invalid = frame.as_data();
    invalid.metrics = &frame.metrics[..1];
    assert!(matches!(
        ws.paint_map_projection(invalid, Control),
        Err(eu5app::map_projection::MapProjectionError::ColumnLength {
            column: "metrics",
            actual: 1,
            ..
        })
    ));
    let mut ids = frame.location_ids.clone();
    ids[0] = ids[0].wrapping_add(1);
    let mut invalid = frame.as_data();
    invalid.location_ids = &ids;
    assert!(matches!(
        ws.paint_map_projection(invalid, Control),
        Err(eu5app::map_projection::MapProjectionError::LocationMismatch { index: 0, .. })
    ));
    let mut measurements = frame.metrics.clone();
    measurements[0] = f32::NAN;
    let mut invalid = frame.as_data();
    invalid.metrics = &measurements;
    assert_eq!(
        ws.paint_map_projection(invalid, Control).err(),
        Some(eu5app::map_projection::MapProjectionError::NonFinite {
            location: frame.location_ids[0]
        })
    );
    let mut invalid = frame.as_data();
    invalid.countries = &frame.countries[..1];
    assert!(matches!(
        ws.paint_map_projection(invalid, Control),
        Err(eu5app::map_projection::MapProjectionError::TableWidth {
            table: "countries",
            ..
        })
    ));
    // A frame with other owners does not change the loaded save.
    ws.set_map_mode(Control);
    let original = ws.location_arrays().as_data().to_vec();
    frame.owners.fill(u32::MAX);
    let paint = ws.paint_map_projection(frame.as_data(), Control).unwrap();
    assert!(paint.groups.iter().all(|owner| *owner == u32::MAX));
    assert_eq!(ws.location_arrays().as_data(), original);
}

/// The world population of the map observations: the population of each
/// owned location, as the world summary counts it.
fn observed_world_population(projection: &eu5app::map_projection::MapProjection) -> u32 {
    let width = eu5app::map_projection::Metric::ALL.len();
    let population = eu5app::map_projection::Metric::ALL
        .iter()
        .position(|metric| *metric == eu5app::map_projection::Metric::Population)
        .unwrap();
    projection
        .owners
        .iter()
        .enumerate()
        .filter(|(_, owner)| **owner != u32::MAX)
        .map(|(row, _)| projection.metrics[row * width + population] as u32)
        .sum()
}

#[test]
fn world_population_of_the_map_observations_agrees_with_the_world_summary() {
    use campaign_analysis::{Query, SaveDate, Selection, Session, SnapshotSource, View};
    use eu5app::analysis::{Eu5Analysis, Eu5Answer, Eu5Query};
    let mut layouts = Vec::new();
    let mut session = Session::<Eu5Analysis>::new();
    for (save, date, population) in [
        ("Poland_1339-02-03.eu5", (1339, 2, 3), 355_459_580),
        ("Poland_1455-01-01.eu5", (1455, 1, 1), 358_275_487),
    ] {
        let file = eu5save::Eu5File::from_file(fixtures::request_file(save)).unwrap();
        if file.header().kind().is_binary()
            && jomini::binary::TokenResolver::is_empty(utils::tokens())
        {
            assert!(
                !utils::require_test_assets(),
                "{save}: EU5 binary tokens not loaded"
            );
            return;
        }
        let mut loaded = eu5app::Eu5SaveLoader::open(file, utils::tokens())
            .unwrap()
            .parse()
            .unwrap();
        let game = loaded.take_gamestate();
        let meta_date = game.metadata().date;
        assert_eq!(
            (meta_date.year(), meta_date.month(), meta_date.day()),
            date,
            "{save}"
        );
        let projection = eu5app::map_projection::extract(&game).unwrap();
        let summary = eu5app::map_projection::world_summary(&game);
        assert_eq!(summary.total_population, population, "{save}");
        assert_eq!(
            observed_world_population(&projection),
            summary.total_population,
            "{save}"
        );
        layouts.push(projection.layout_key.clone());

        let source = SnapshotSource {
            campaign_id: String::from("poland"),
            content_hash: String::from(save),
            date: SaveDate {
                year: i32::from(date.0),
                month: date.1,
                day: date.2,
            },
            game_version: String::from("1.0.0"),
        };
        let observed = eu5app::analysis::observation(projection, summary, source);
        // The store reads the binary form that JavaScript moves.
        session.append(0, &observed.encode(), usize::MAX).unwrap();
    }
    assert_eq!(layouts[0], layouts[1]);
    let view = View::select(session.store(), "poland", &Selection::All);
    let Eu5Answer::WorldPopulation(world) = Eu5Query::WorldPopulation.answer(&view) else {
        panic!("another answer kind");
    };
    let values: Vec<_> = world.rows.iter().map(|row| row.value).collect();
    assert_eq!(values, [Some(355_459_580.0), Some(358_275_487.0)]);
    assert_eq!(session.memory().layouts, 1);
}
