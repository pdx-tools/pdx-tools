use super::{fixtures, utils};
use eu5app::{Eu5AnySaveLoader, Eu5DebugSaveLoader};
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
