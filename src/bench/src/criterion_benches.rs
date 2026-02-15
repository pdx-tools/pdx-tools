use crate::benchmarks::{map, schema};

use criterion::criterion_group;

criterion_group!(
    criterion_benches,
    schema::criterion::token_benchmark,
    schema::criterion::token_creation_benchmark,
    map::criterion::map_from_rgb8_benchmark,
    map::criterion::map_aabb_index_benchmark,
    map::criterion::map_adjacency_benchmark,
    map::criterion::map_center_of_benchmark
);
