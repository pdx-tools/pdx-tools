use criterion::{Criterion, criterion_group};
use pdx_map::{Aabb, R16, World, WorldLength, WorldPoint};
use std::{
    hint::black_box,
    path::{Path, PathBuf},
    sync::LazyLock,
};

const PROVINCES_WIDTH: u32 = 5632;

fn bench_asset_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join(name)
}

fn load_rgb_zst(path: &Path) -> Vec<u8> {
    let compressed = std::fs::read(path)
        .unwrap_or_else(|err| panic!("Failed to read {}: {err}", path.display()));
    zstd::stream::decode_all(compressed.as_slice())
        .unwrap_or_else(|err| panic!("Failed to decompress {}: {err}", path.display()))
}

static RGB_DATA: LazyLock<Vec<u8>> =
    LazyLock::new(|| load_rgb_zst(&bench_asset_path("provinces.rgb.zst")));

static WORLD: LazyLock<World<R16>> = LazyLock::new(|| {
    let (world, _palette) = World::from_rgb8(&RGB_DATA, WorldLength::new(PROVINCES_WIDTH));
    world
});

pub fn from_rgb8_benchmark(c: &mut Criterion) {
    let rgb_data: &[u8] = &RGB_DATA;

    let mut group = c.benchmark_group("map/parse");
    group.bench_function("from_rgb8", |b| {
        b.iter(|| {
            black_box(World::from_rgb8(
                rgb_data,
                WorldLength::new(PROVINCES_WIDTH),
            ))
        })
    });

    group.finish();
}

pub fn aabb_index_benchmark(c: &mut Criterion) {
    let world: &World<R16> = &WORLD;
    let height = world.size().height;
    assert!(height > 0, "map height must be greater than 0");

    let mut group = c.benchmark_group("map/aabb");
    group.bench_function("build", |b| {
        b.iter(|| black_box(world.build_spatial_index()))
    });

    let index = world.build_spatial_index();
    let max_x = u16::try_from(PROVINCES_WIDTH - 1).expect("world width exceeds u16 range");
    let max_y = u16::try_from(height - 1).expect("world height exceeds u16 range");

    let small_min_x = u16::try_from(PROVINCES_WIDTH / 4).expect("small min x exceeds u16 range");
    let small_min_y = u16::try_from(height / 4).expect("small min y exceeds u16 range");
    let small_max_x = small_min_x.saturating_add(32).min(max_x);
    let small_max_y = small_min_y.saturating_add(32).min(max_y);

    let small_query = Aabb::new(
        WorldPoint::new(small_min_x, small_min_y),
        WorldPoint::new(small_max_x, small_max_y),
    );
    let large_query = Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(max_x, max_y));

    group.bench_function("query_small", |b| {
        b.iter(|| black_box(index.query(small_query).count()))
    });
    group.bench_function("query_large", |b| {
        b.iter(|| black_box(index.query(large_query).count()))
    });

    group.finish();
}

pub fn adjacency_benchmark(c: &mut Criterion) {
    let world: &World<R16> = &WORLD;

    let mut group = c.benchmark_group("map/adjacency");
    group.bench_function("build", |b| {
        b.iter(|| black_box(world.build_topology_index()))
    });

    let adjacency = world.build_topology_index();

    // Benchmark queries for province IDs: 1, 21, 41, 61, ..., up to 2000
    group.bench_function("query_provinces", |b| {
        b.iter(|| {
            for province_id in (1..=2000).step_by(20) {
                black_box(adjacency.neighbors_of(R16::new(province_id)).len());
            }
        })
    });

    group.finish();
}

pub fn center_of_benchmark(c: &mut Criterion) {
    let world: &World<R16> = &WORLD;

    let mut group = c.benchmark_group("map/center_of");

    // Benchmark a single center_of call for a specific province
    group.bench_function("single", |b| {
        b.iter(|| black_box(world.center_of(R16::new(1000))))
    });

    group.finish();
}

criterion_group!(
    map_benches,
    from_rgb8_benchmark,
    aabb_index_benchmark,
    adjacency_benchmark,
    center_of_benchmark
);
