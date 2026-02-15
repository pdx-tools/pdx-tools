use jomini::binary::TokenResolver;
use rand::{Rng, rng};
use schemas::FlatResolver;
use std::path::PathBuf;
#[cfg(not(target_family = "wasm"))]
use std::sync::OnceLock;

fn token_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../assets/tokens/eu4-raw.bin")
}

pub fn setup_token_data() -> Vec<u8> {
    std::fs::read(token_path()).expect("Failed to read token file")
}

pub fn setup_token_inputs() -> [u16; 1024] {
    let mut arr = [0u16; 1024];
    rng().fill(&mut arr);
    for x in &mut arr {
        *x %= 10000_u16;
    }
    arr
}

#[cfg(not(target_family = "wasm"))]
pub fn setup_static_flat_resolver() -> FlatResolver<'static> {
    FlatResolver::from_slice(static_token_data())
}

#[cfg(not(target_family = "wasm"))]
fn resolve_sampled_tokens(resolver: &FlatResolver<'_>) -> usize {
    static_token_inputs()
        .iter()
        .filter_map(|&token| resolver.resolve(token))
        .map(str::len)
        .sum()
}

#[cfg(not(target_family = "wasm"))]
fn static_token_data() -> &'static [u8] {
    static DATA: OnceLock<&'static [u8]> = OnceLock::new();
    DATA.get_or_init(|| Box::leak(setup_token_data().into_boxed_slice()))
}

#[cfg(not(target_family = "wasm"))]
fn static_token_inputs() -> &'static [u16; 1024] {
    static INPUTS: OnceLock<[u16; 1024]> = OnceLock::new();
    INPUTS.get_or_init(setup_token_inputs)
}

fn token_resolve_current<'a>(resolver: &'a FlatResolver<'a>, token: u16) -> Option<&'a str> {
    resolver.resolve(token)
}

fn create_flat_resolver(data: &[u8]) -> FlatResolver<'_> {
    FlatResolver::from_slice(data)
}

pub mod criterion {
    use criterion::Criterion;

    pub fn token_benchmark(c: &mut Criterion) {
        let data = super::setup_token_data();
        let arr = super::setup_token_inputs();

        let mut group = c.benchmark_group("resolve");
        group.bench_function("current", |b| {
            let mut i = 0;
            let resolver = super::create_flat_resolver(&data);

            b.iter(|| {
                let res = super::token_resolve_current(&resolver, arr[i % 1024]);
                i += 1;
                res
            })
        });

        group.finish();
    }

    pub fn token_creation_benchmark(c: &mut Criterion) {
        let data = super::setup_token_data();
        c.bench_function("creation", |b| {
            b.iter(|| super::create_flat_resolver(&data))
        });
    }
}

#[cfg(not(target_family = "wasm"))]
pub mod gungraun {
    use gungraun::{library_benchmark, library_benchmark_group};
    use schemas::FlatResolver;

    #[library_benchmark(setup = crate::benchmarks::schema::setup_static_flat_resolver)]
    #[bench::current()]
    fn token_resolve_benchmark(resolver: FlatResolver<'static>) -> usize {
        crate::benchmarks::schema::resolve_sampled_tokens(&resolver)
    }

    #[library_benchmark(setup = crate::benchmarks::schema::setup_token_data)]
    #[bench::creation()]
    fn token_creation_benchmark(data: Vec<u8>) -> usize {
        crate::benchmarks::schema::create_flat_resolver(&data)
            .values
            .len()
    }

    library_benchmark_group!(
        name = schema_gungraun_benches,
        benchmarks = [token_resolve_benchmark, token_creation_benchmark]
    );
}
