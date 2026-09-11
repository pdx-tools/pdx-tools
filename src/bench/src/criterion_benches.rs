use crate::benchmarks::{map, schema, twitter};

use criterion::criterion_group;

criterion_group!(
    criterion_benches,
    twitter::criterion::twitter_benchmark,
    schema::criterion::token_benchmark,
    schema::criterion::token_creation_benchmark,
    map::criterion::map_from_rgb8_benchmark,
    map::criterion::map_aabb_index_benchmark,
    map::criterion::map_adjacency_benchmark,
    map::criterion::map_center_of_benchmark
);
