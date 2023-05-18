use schemas::FlatResolver;
use criterion::{criterion_group, criterion_main, Criterion};
use jomini::binary::TokenResolver;
use rand::{thread_rng, Rng};

fn token_benchmark(c: &mut Criterion) {
    let data = include_bytes!("../../../assets/tokens/eu4-raw.bin");

    let mut arr = [0u16; 1024];
    thread_rng().fill(&mut arr);
    for x in &mut arr {
        *x %= 10000 as u16;
    }

    let mut group = c.benchmark_group("resolve");
    group.bench_function("current", |b| {
        let mut i = 0;
        let resolver = schemas::FlatResolver::from_slice(data);

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.bench_function("compile", |b| {
        let mut i = 0;
        let resolver = eu4save::EnvTokens;

        if !matches!(resolver.resolve(0x337f), Some("campaign_id")) {
            panic!("EU4 compile tokens missing");
        }

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.finish();
}

fn token_creation_benchmark(c: &mut Criterion) {
    let data = include_bytes!("../../../assets/tokens/eu4-raw.bin");

    c.bench_function("creation", |b| b.iter(|| FlatResolver::from_slice(data)));
}

criterion_group!(benches, token_benchmark, token_creation_benchmark);
criterion_main!(benches);
