mod map;
mod schema;

use criterion::criterion_main;

criterion_main!(schema::schema_benches, map::map_benches);
