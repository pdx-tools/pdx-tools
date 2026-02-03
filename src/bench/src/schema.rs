use criterion::{Criterion, criterion_group};
use jomini::binary::TokenResolver;
use rand::{Rng, rng};
use schemas::FlatResolver;
use std::path::PathBuf;

fn token_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/tokens/eu4-raw.bin")
}

pub fn token_benchmark(c: &mut Criterion) {
    let data = std::fs::read(token_path()).expect("Failed to read token file");

    let mut arr = [0u16; 1024];
    rng().fill(&mut arr);
    for x in &mut arr {
        *x %= 10000_u16;
    }

    let mut group = c.benchmark_group("resolve");
    group.bench_function("current", |b| {
        let mut i = 0;
        let resolver = schemas::FlatResolver::from_slice(&data);

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.finish();
}

pub fn token_creation_benchmark(c: &mut Criterion) {
    let data = std::fs::read(token_path()).expect("Failed to read token file");

    c.bench_function("creation", |b| b.iter(|| FlatResolver::from_slice(&data)));
}

criterion_group!(schema_benches, token_benchmark, token_creation_benchmark);
