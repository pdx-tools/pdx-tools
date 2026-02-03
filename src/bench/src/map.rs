use criterion::{Criterion, criterion_group};
use pdx_map::{AABB, MapData, R16, WorldPoint, build_location_adjacencies};
use std::{
    hint::black_box,
    path::{Path, PathBuf},
};

const PROVINCES_WIDTH: u32 = 5632;

fn bench_asset_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join(name)
}

fn load_r16_zst(path: &Path) -> Vec<R16> {
    let compressed = std::fs::read(path)
        .unwrap_or_else(|err| panic!("Failed to read {}: {err}", path.display()));
    let decompressed = zstd::stream::decode_all(compressed.as_slice())
        .unwrap_or_else(|err| panic!("Failed to decompress {}: {err}", path.display()));
    assert_eq!(decompressed.len() % 2, 0, "r16 data must be even length");

    decompressed
        .chunks_exact(2)
        .map(|chunk| R16::new(u16::from_le_bytes([chunk[0], chunk[1]])))
        .collect()
}

pub fn aabb_index_benchmark(c: &mut Criterion) {
    let west = load_r16_zst(&bench_asset_path("provinces-0.r16.zst"));
    let east = load_r16_zst(&bench_asset_path("provinces-1.r16.zst"));
    let half_width = PROVINCES_WIDTH / 2;
    let map_data = MapData::new(west, east, half_width);
    let height = map_data.height();
    assert!(height > 0, "map height must be greater than 0");

    let mut group = c.benchmark_group("map/aabb");
    group.bench_function("build", |b| {
        b.iter(|| black_box(map_data.build_aabb_index()))
    });

    let index = map_data.build_aabb_index();
    let max_x = u16::try_from(PROVINCES_WIDTH - 1).expect("world width exceeds u16 range");
    let max_y = u16::try_from(height - 1).expect("world height exceeds u16 range");

    let small_min_x = u16::try_from(PROVINCES_WIDTH / 4).expect("small min x exceeds u16 range");
    let small_min_y = u16::try_from(height / 4).expect("small min y exceeds u16 range");
    let small_max_x = small_min_x.saturating_add(32).min(max_x);
    let small_max_y = small_min_y.saturating_add(32).min(max_y);

    let small_query = AABB::new(
        WorldPoint::new(small_min_x, small_min_y),
        WorldPoint::new(small_max_x, small_max_y),
    );
    let large_query = AABB::new(WorldPoint::new(0, 0), WorldPoint::new(max_x, max_y));

    group.bench_function("query_small", |b| {
        b.iter(|| black_box(index.query(small_query).count()))
    });
    group.bench_function("query_large", |b| {
        b.iter(|| black_box(index.query(large_query).count()))
    });

    group.finish();
}

pub fn adjacency_benchmark(c: &mut Criterion) {
    let west = load_r16_zst(&bench_asset_path("provinces-0.r16.zst"));
    let east = load_r16_zst(&bench_asset_path("provinces-1.r16.zst"));
    let half_width = PROVINCES_WIDTH / 2;
    let map_data = MapData::new(west, east, half_width);

    let mut group = c.benchmark_group("map/adjacency");
    group.bench_function("build", |b| {
        b.iter(|| black_box(build_location_adjacencies(&map_data)))
    });

    let adjacency = build_location_adjacencies(&map_data);

    // Benchmark queries for province IDs: 1, 21, 41, 61, ..., up to 2000
    group.bench_function("query_provinces", |b| {
        b.iter(|| {
            for province_id in (1..=2000).step_by(20) {
                black_box(adjacency.neighbors_of_index(province_id).len());
            }
        })
    });

    group.finish();
}

criterion_group!(map_benches, aabb_index_benchmark, adjacency_benchmark);
