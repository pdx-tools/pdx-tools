use criterion::{criterion_group, criterion_main, Criterion};
use jomini::binary::TokenResolver;
use rand::{rng, Rng};
use schemas::FlatResolver;

fn token_benchmark(c: &mut Criterion) {
    let data = std::fs::read("assets/tokens/eu4-raw.bin").expect("Failed to read token file");

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

fn token_creation_benchmark(c: &mut Criterion) {
    let data = std::fs::read("assets/tokens/eu4-raw.bin").expect("Failed to read token file");

    c.bench_function("creation", |b| b.iter(|| FlatResolver::from_slice(&data)));
}

criterion_group!(benches, token_benchmark, token_creation_benchmark);
criterion_main!(benches);
