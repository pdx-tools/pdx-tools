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

#[test]
fn map_projection_preserves_all_modes_and_restores_the_full_save() {
    let save = "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5";
    let Some(mut loaded) = utils::build_workspace(save) else {
        return;
    };
    let ws = &mut loaded.workspace;
    ws.clear_selection();
    let mut frame = eu5app::map_projection::extract(ws.gamestate()).unwrap();
    assert_eq!(frame.layout_key, ws.map_projection_layout_key());
    use eu5app::MapMode::*;
    for mode in [
        Political,
        Control,
        Development,
        Population,
        Markets,
        RgoLevel,
        BuildingLevels,
        Wealth,
        UnrealizedTaxBase,
        Religion,
        StateEfficacy,
        PopulationGrowth,
    ] {
        ws.restore_map_projection();
        ws.set_map_mode(mode);
        let original = ws.location_arrays().as_data().to_vec();
        let borders = ws.location_arrays().buffers().border_colors().to_vec();
        let flags = ws.location_arrays().buffers().state_flags().to_vec();
        let primary = ws.location_arrays().buffers().primary_colors().to_vec();
        let secondary = ws.location_arrays().buffers().secondary_colors().to_vec();
        let groups: Vec<u32> = ws
            .build_grouping_table()
            .iter()
            .map(|(_, group)| group.raw())
            .collect();
        assert_eq!(
            ws.apply_map_projection(frame.as_data(), mode).unwrap(),
            groups,
            "{mode:?} groups"
        );
        for (index, (a, b)) in borders
            .iter()
            .zip(ws.location_arrays().buffers().border_colors())
            .enumerate()
        {
            assert_eq!(a, b, "{mode:?} border {index}");
        }
        for (index, (a, b)) in flags
            .iter()
            .zip(ws.location_arrays().buffers().state_flags())
            .enumerate()
        {
            assert_eq!(a, b, "{mode:?} flag {index}");
        }
        for (expected, actual) in [
            (primary, ws.location_arrays().buffers().primary_colors()),
            (secondary, ws.location_arrays().buffers().secondary_colors()),
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
        let preview = ws.location_arrays().as_data().to_vec();
        let mut invalid = frame.as_data();
        invalid.layout_key = "wrong-layout";
        assert_eq!(
            ws.apply_map_projection(invalid, mode).unwrap_err(),
            eu5app::map_projection::MapProjectionError::LayoutMismatch
        );
        assert_eq!(ws.location_arrays().as_data(), preview);
        let mut invalid = frame.as_data();
        invalid.metrics = &frame.metrics[..1];
        assert!(matches!(
            ws.apply_map_projection(invalid, mode),
            Err(eu5app::map_projection::MapProjectionError::ColumnLength {
                column: "metrics",
                actual: 1,
                ..
            })
        ));
        assert_eq!(ws.location_arrays().as_data(), preview);
        let mut ids = frame.location_ids.clone();
        ids[0] = ids[0].wrapping_add(1);
        let mut invalid = frame.as_data();
        invalid.location_ids = &ids;
        assert!(matches!(
            ws.apply_map_projection(invalid, mode),
            Err(eu5app::map_projection::MapProjectionError::LocationMismatch { index: 0, .. })
        ));
        assert_eq!(ws.location_arrays().as_data(), preview);
        let mut measurements = frame.metrics.clone();
        measurements[0] = f32::NAN;
        let mut invalid = frame.as_data();
        invalid.metrics = &measurements;
        assert_eq!(
            ws.apply_map_projection(invalid, mode).unwrap_err(),
            eu5app::map_projection::MapProjectionError::NonFinite {
                location: frame.location_ids[0]
            }
        );
        assert_eq!(ws.location_arrays().as_data(), preview);
        let mut invalid = frame.as_data();
        invalid.countries = &frame.countries[..1];
        assert!(matches!(
            ws.apply_map_projection(invalid, mode),
            Err(eu5app::map_projection::MapProjectionError::TableWidth {
                table: "countries",
                ..
            })
        ));
        assert_eq!(ws.location_arrays().as_data(), preview);
        ws.restore_map_projection();
        assert_eq!(ws.location_arrays().as_data(), original, "{mode:?} restore");
    }
    // Projection ownership changes never mutate the retained full model.
    ws.set_map_mode(Control);
    let original = ws.location_arrays().as_data().to_vec();
    frame.owners.fill(u32::MAX);
    let groups = ws.apply_map_projection(frame.as_data(), Control).unwrap();
    assert!(groups.iter().all(|owner| *owner == u32::MAX));
    ws.restore_map_projection();
    assert_eq!(ws.location_arrays().as_data(), original);
}
