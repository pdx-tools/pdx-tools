use criterion::{criterion_group, criterion_main, Criterion};
use jomini::binary::TokenResolver;
use rand::{thread_rng, Rng};
use schemas::FlatResolver;
use std::path::PathBuf;

const BREAKPOINT: u16 = 10000;

fn find_token_file() -> Vec<u8> {
    let paths = vec![
        PathBuf::from("assets/tokens/eu4-raw.bin"),
        PathBuf::from("../../assets/tokens/eu4-raw.bin"),
        PathBuf::from("../../../../assets/tokens/eu4-raw.bin"),
    ];

    for path in paths {
        if let Ok(data) = std::fs::read(&path) {
            return data;
        }
    }
    panic!("Failed to find token file in any of the expected locations")
}

#[derive(rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]
struct OwnedFlatResolver {
    values: Box<[Box<str>]>,
    breakpoint: u16,
}

impl<'a> From<&schemas::FlatResolver<'a>> for OwnedFlatResolver {
    fn from(resolver: &schemas::FlatResolver<'a>) -> Self {
        OwnedFlatResolver {
            values: resolver.values.iter()
                .map(|s| s.to_string().into_boxed_str())
                .collect(),
            breakpoint: resolver.breakpoint,
        }
    }
}

impl TokenResolver for rkyv::Archived<OwnedFlatResolver> {
    fn resolve(&self, token: u16) -> Option<&str> {
        let breakpoint: u16 = self.breakpoint.into();
        if token < breakpoint {
            self.values.as_ref().get(usize::from(token))
                .and_then(|x| (!x.is_empty()).then_some(x.as_ref()))
        } else if token >= BREAKPOINT {
            self.values
                .as_ref()
                .get(usize::from(token - BREAKPOINT + breakpoint))
                .and_then(|x| (!x.is_empty()).then_some(x.as_ref()))
        } else {
            None
        }
    }
}

fn token_benchmark(c: &mut Criterion) {
    let data = find_token_file();

    let mut arr = [0u16; 1024];
    thread_rng().fill(&mut arr);
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
    let data = find_token_file();

    c.bench_function("creation", |b| b.iter(|| FlatResolver::from_slice(&data)));
}

fn token_creation_rkyv_benchmark(c: &mut Criterion) {
    let data = find_token_file();
    let resolver = schemas::FlatResolver::from_slice(&data);
    let owned = OwnedFlatResolver::from(&resolver);

    c.bench_function("creation_rkyv_serialize", |b| {
        b.iter(|| rkyv::to_bytes::<rkyv::rancor::Error>(&owned))
    });
}

fn token_creation_rkyv_access_benchmark(c: &mut Criterion) {
    let data = find_token_file();
    let resolver = schemas::FlatResolver::from_slice(&data);
    let owned = OwnedFlatResolver::from(&resolver);
    let rkyv_bytes = rkyv::to_bytes::<rkyv::rancor::Error>(&owned).expect("Failed to serialize");

    c.bench_function("creation_rkyv_access", |b| {
        b.iter(|| unsafe {
            rkyv::access_unchecked::<rkyv::Archived<OwnedFlatResolver>>(&rkyv_bytes)
        })
    });
}

fn token_rkyv_benchmark(c: &mut Criterion) {
    let data = find_token_file();
    let resolver = schemas::FlatResolver::from_slice(&data);
    let owned = OwnedFlatResolver::from(&resolver);
    let rkyv_bytes = rkyv::to_bytes::<rkyv::rancor::Error>(&owned).expect("Failed to serialize");

    let mut arr = [0u16; 1024];
    thread_rng().fill(&mut arr);
    for x in &mut arr {
        *x %= 10000_u16;
    }

    let mut group = c.benchmark_group("resolve");
            let archived = unsafe {
            rkyv::access_unchecked::<rkyv::Archived<OwnedFlatResolver>>(&rkyv_bytes)
        };
    group.bench_function("rkyv", |b| {
        let mut i = 0;


        b.iter(|| {
            let res = archived.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });
    group.finish();
}

criterion_group!(benches, token_benchmark, token_creation_benchmark, token_creation_rkyv_benchmark, token_creation_rkyv_access_benchmark, token_rkyv_benchmark);
criterion_main!(benches);
