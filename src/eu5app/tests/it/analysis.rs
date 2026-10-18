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

/// The country table and the location columns come from the same save, so
/// the population of each country must agree.
#[test]
fn snapshot_tables_agree_with_the_location_columns() {
    use eu5app::snapshot::{CountryMetric, MarketMetric};
    let resolver = utils::tokens();
    for name in [
        "debug-1.0.eu5",
        "SP_MLO_1617_04_01_166d38a1-bffb-4182-9e37-9540b0c2ac4f.eu5",
        "Clandeboye.eu5",
    ] {
        let mut bytes = Vec::new();
        fixtures::request_file(name)
            .read_to_end(&mut bytes)
            .unwrap();
        let mut loaded =
            Eu5AnySaveLoader::open_with(&bytes, resolver, eu5app::SaveCheckSummer::new())
                .unwrap()
                .parse()
                .unwrap();
        let game = loaded.take_gamestate();
        let tables = eu5app::snapshot::extract(&game);
        let projection = eu5app::map_projection::extract(&game).unwrap();

        let countries = tables.country_ids.len();
        assert!(countries > 0, "{name}");
        assert!(tables.country_ids.is_sorted(), "{name}");
        assert_eq!(tables.country_tags.len(), countries, "{name}");
        assert_eq!(tables.country_locations.len(), countries, "{name}");
        assert_eq!(
            tables.country_values.len(),
            countries * CountryMetric::ALL.len(),
            "{name}"
        );
        assert_eq!(
            tables.breakdown_offsets.len(),
            countries * eu5app::snapshot::Breakdown::ALL.len() + 1,
            "{name}"
        );
        assert_eq!(
            *tables.breakdown_offsets.last().unwrap() as usize,
            tables.breakdown_values.len(),
            "{name}"
        );
        assert_eq!(
            tables.breakdown_keys.len(),
            tables.breakdown_values.len(),
            "{name}"
        );
        assert_eq!(tables.country_market_offsets.len(), countries + 1, "{name}");
        let markets = tables.market_centers.len();
        assert!(markets > 0, "{name}");
        assert_eq!(tables.market_goods.len(), markets, "{name}");
        assert_eq!(
            tables.market_values.len(),
            markets * MarketMetric::ALL.len(),
            "{name}"
        );

        let width = eu5app::map_projection::Metric::ALL.len();
        let population = eu5app::map_projection::Metric::Population as usize;
        let mut from_locations = std::collections::HashMap::<u32, (f64, u32)>::new();
        for (i, &owner) in projection.owners.iter().enumerate() {
            if owner == u32::MAX {
                continue;
            }
            let total = from_locations.entry(owner).or_default();
            total.0 += f64::from(projection.metrics[i * width + population]);
            total.1 += 1;
        }
        assert_eq!(from_locations.len(), countries, "{name}");
        for (row, &id) in tables.country_ids.iter().enumerate() {
            let (expected, locations) = from_locations[&id];
            let actual = tables.country(id).unwrap()[CountryMetric::Population as usize];
            assert_eq!(tables.country_locations[row], locations, "{name} {id}");
            assert!(
                (actual - expected).abs() <= expected.abs() * 1e-5 + 1.0,
                "{name} {id}: {actual} vs {expected}"
            );
        }

        let projection_bytes = 4
            * (projection.location_ids.len()
                + projection.owners.len()
                + projection.controllers.len()
                + projection.religions.len()
                + projection.markets.len()
                + projection.metrics.len()
                + projection.countries.len()
                + projection.religion_colors.len()
                + projection.market_colors.len())
            + 2 * projection.fractions.len();
        let string_bytes: usize = tables.strings.iter().map(|s| s.len()).sum();
        eprintln!(
            "{name}: locations {} countries {countries} market rows {markets} breakdown rows {} \
             strings {} ({string_bytes} B) | location columns {projection_bytes} B, \
             tables {} B",
            projection.location_ids.len(),
            tables.breakdown_values.len(),
            tables.strings.len(),
            tables.column_bytes(),
        );
    }
}
