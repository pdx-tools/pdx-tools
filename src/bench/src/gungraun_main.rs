#[cfg(not(target_family = "wasm"))]
use bench::benchmarks::map::gungraun::map_gungraun_benches;

#[cfg(not(target_family = "wasm"))]
use bench::benchmarks::schema::gungraun::schema_gungraun_benches;

#[cfg(not(target_family = "wasm"))]
use gungraun::main;

#[cfg(not(target_family = "wasm"))]
main!(library_benchmark_groups = [map_gungraun_benches, schema_gungraun_benches]);

#[cfg(target_family = "wasm")]
fn main() {}
