use pdx_map::{Aabb, R16, R16Palette, SpatialIndex, TopologyIndex, World, WorldLength, WorldPoint};
use std::path::{Path, PathBuf};

pub const PROVINCES_WIDTH: u32 = 5632;
pub const PROVINCES_ASSET: &str = "provinces.rgb.zst";

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

pub fn setup_rgb_data(asset_name: &str) -> Vec<u8> {
    load_rgb_zst(&bench_asset_path(asset_name))
}

fn build_world_from_rgb(rgb_data: &[u8]) -> (World, R16Palette) {
    World::from_rgb8(rgb_data, WorldLength::new(PROVINCES_WIDTH))
}

pub fn setup_world(asset_name: &str) -> World {
    let rgb_data = setup_rgb_data(asset_name);
    build_world_from_rgb(&rgb_data).0
}

pub fn setup_adjacency(asset_name: &str) -> TopologyIndex {
    setup_world(asset_name).build_topology_index()
}

fn sampled_neighbor_count(adjacency: &TopologyIndex) -> usize {
    (1..=2000)
        .step_by(20)
        .map(|province_id| adjacency.neighbors_of(R16::new(province_id)).len())
        .sum()
}

#[derive(Debug)]
pub struct SpatialQueryInput {
    pub index: SpatialIndex,
    pub query: Aabb,
}

pub fn setup_small_query(asset_name: &str) -> SpatialQueryInput {
    setup_query(asset_name, true)
}

pub fn setup_large_query(asset_name: &str) -> SpatialQueryInput {
    setup_query(asset_name, false)
}

fn setup_query(asset_name: &str, small: bool) -> SpatialQueryInput {
    let world = setup_world(asset_name);
    let index = world.build_spatial_index();
    let height = world.size().height;
    assert!(height > 0, "map height must be greater than 0");

    let max_x = u16::try_from(PROVINCES_WIDTH - 1).expect("world width exceeds u16 range");
    let max_y = u16::try_from(height - 1).expect("world height exceeds u16 range");

    let query = if small {
        let small_min_x =
            u16::try_from(PROVINCES_WIDTH / 4).expect("small min x exceeds u16 range");
        let small_min_y = u16::try_from(height / 4).expect("small min y exceeds u16 range");
        let small_max_x = small_min_x.saturating_add(32).min(max_x);
        let small_max_y = small_min_y.saturating_add(32).min(max_y);

        Aabb::new(
            WorldPoint::new(small_min_x, small_min_y),
            WorldPoint::new(small_max_x, small_max_y),
        )
    } else {
        Aabb::new(WorldPoint::new(0, 0), WorldPoint::new(max_x, max_y))
    };

    SpatialQueryInput { index, query }
}

fn from_rgb8(rgb_data: &[u8]) -> (World, pdx_map::R16Palette) {
    build_world_from_rgb(rgb_data)
}

fn aabb_index_build(world: &World) -> SpatialIndex {
    world.build_spatial_index()
}

fn aabb_index_query(input: &SpatialQueryInput) -> usize {
    input.index.query(input.query).count()
}

fn adjacency_build(world: &World) -> TopologyIndex {
    world.build_topology_index()
}

fn adjacency_query(adjacency: &TopologyIndex) -> usize {
    sampled_neighbor_count(adjacency)
}

fn center_of(world: &World) -> WorldPoint<u32> {
    world.center_of(R16::new(1000))
}

pub mod criterion {
    use criterion::Criterion;
    use std::hint::black_box;

    pub fn map_from_rgb8_benchmark(c: &mut Criterion) {
        let rgb_data = super::setup_rgb_data(super::PROVINCES_ASSET);

        let mut group = c.benchmark_group("map/parse");
        group.bench_function("from_rgb8", |b| {
            b.iter(|| black_box(super::from_rgb8(&rgb_data)))
        });
        group.finish();
    }

    pub fn map_aabb_index_benchmark(c: &mut Criterion) {
        let world = super::setup_world(super::PROVINCES_ASSET);
        let small_query = super::setup_small_query(super::PROVINCES_ASSET);
        let large_query = super::setup_large_query(super::PROVINCES_ASSET);

        let mut group = c.benchmark_group("map/aabb");
        group.bench_function("build", |b| {
            b.iter(|| black_box(super::aabb_index_build(&world)))
        });
        group.bench_function("query_small", |b| {
            b.iter(|| black_box(super::aabb_index_query(&small_query)))
        });
        group.bench_function("query_large", |b| {
            b.iter(|| black_box(super::aabb_index_query(&large_query)))
        });
        group.finish();
    }

    pub fn map_adjacency_benchmark(c: &mut Criterion) {
        let world = super::setup_world(super::PROVINCES_ASSET);
        let adjacency = super::setup_adjacency(super::PROVINCES_ASSET);

        let mut group = c.benchmark_group("map/adjacency");
        group.bench_function("build", |b| {
            b.iter(|| black_box(super::adjacency_build(&world)))
        });
        group.bench_function("query_provinces", |b| {
            b.iter(|| black_box(super::adjacency_query(&adjacency)))
        });
        group.finish();
    }

    pub fn map_center_of_benchmark(c: &mut Criterion) {
        let world = super::setup_world(super::PROVINCES_ASSET);

        let mut group = c.benchmark_group("map/center_of");
        group.bench_function("single", |b| b.iter(|| black_box(super::center_of(&world))));
        group.finish();
    }
}

#[cfg(not(target_family = "wasm"))]
pub mod gungraun {
    use gungraun::{library_benchmark, library_benchmark_group};
    use pdx_map::{SpatialIndex, TopologyIndex, World, WorldPoint};

    #[library_benchmark(setup = crate::benchmarks::map::setup_rgb_data)]
    #[bench::from_rgb8(crate::benchmarks::map::PROVINCES_ASSET)]
    fn from_rgb8_benchmark(rgb_data: Vec<u8>) -> (World, pdx_map::R16Palette) {
        crate::benchmarks::map::from_rgb8(&rgb_data)
    }

    #[library_benchmark(setup = crate::benchmarks::map::setup_world)]
    #[bench::build(crate::benchmarks::map::PROVINCES_ASSET)]
    fn aabb_index_build_benchmark(world: World) -> SpatialIndex {
        crate::benchmarks::map::aabb_index_build(&world)
    }

    #[library_benchmark]
    #[bench::query_small(args = (crate::benchmarks::map::PROVINCES_ASSET), setup = crate::benchmarks::map::setup_small_query)]
    #[bench::query_large(args = (crate::benchmarks::map::PROVINCES_ASSET), setup = crate::benchmarks::map::setup_large_query)]
    fn aabb_index_query_benchmark(input: crate::benchmarks::map::SpatialQueryInput) -> usize {
        crate::benchmarks::map::aabb_index_query(&input)
    }

    #[library_benchmark(setup = crate::benchmarks::map::setup_world)]
    #[bench::build(crate::benchmarks::map::PROVINCES_ASSET)]
    fn adjacency_build_benchmark(world: World) -> TopologyIndex {
        crate::benchmarks::map::adjacency_build(&world)
    }

    #[library_benchmark(setup = crate::benchmarks::map::setup_adjacency)]
    #[bench::query_provinces(crate::benchmarks::map::PROVINCES_ASSET)]
    fn adjacency_query_benchmark(adjacency: TopologyIndex) -> usize {
        crate::benchmarks::map::adjacency_query(&adjacency)
    }

    #[library_benchmark(setup = crate::benchmarks::map::setup_world)]
    #[bench::single(crate::benchmarks::map::PROVINCES_ASSET)]
    fn center_of_benchmark(world: World) -> WorldPoint<u32> {
        crate::benchmarks::map::center_of(&world)
    }

    library_benchmark_group!(
        name = map_gungraun_benches,
        benchmarks = [
            from_rgb8_benchmark,
            aabb_index_build_benchmark,
            aabb_index_query_benchmark,
            adjacency_build_benchmark,
            adjacency_query_benchmark,
            center_of_benchmark,
        ]
    );
}
