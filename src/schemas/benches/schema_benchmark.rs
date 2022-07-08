use std::{
    collections::HashMap,
    hash::{BuildHasherDefault, Hasher},
};

use criterion::{criterion_group, criterion_main, Criterion};
use flatbuffers::{ForwardsUOffset, Vector};
use jomini::binary::TokenResolver;
use rand::{thread_rng, Rng};

pub struct FlatbufferResolver<'a> {
    data: Vec<&'a str>,
}

impl<'a> FlatbufferResolver<'a> {
    pub fn from_slice(data: &'a [u8]) -> Self {
        let xb = schemas::tokens::root_as_tokens(data).unwrap();
        let values = xb.values().unwrap();
        let tokens = values.iter().collect::<Vec<_>>();
        Self { data: tokens }
    }
}

impl<'a> jomini::binary::TokenResolver for FlatbufferResolver<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.data
            .get(usize::from(token))
            .and_then(|x| (!x.is_empty()).then(|| *x))
    }
}

pub struct FlatbufferResolverRaw<'a> {
    data: Vector<'a, ForwardsUOffset<&'a str>>,
}

impl<'a> FlatbufferResolverRaw<'a> {
    pub fn from_slice(data: &'a [u8]) -> Self {
        let xb = schemas::tokens::root_as_tokens(data).unwrap();
        let values = xb.values().unwrap();
        Self { data: values }
    }
}

impl<'a> jomini::binary::TokenResolver for FlatbufferResolverRaw<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        let s = self.data.get(usize::from(token));

        (!s.is_empty()).then(|| s)
    }
}

pub struct FnvHasher(u64);

impl Default for FnvHasher {
    #[inline]
    fn default() -> FnvHasher {
        FnvHasher(0xcbf29ce484222325)
    }
}

impl FnvHasher {
    /// Create an FNV hasher starting with a state corresponding
    /// to the hash `key`.
    #[inline]
    pub fn with_key(key: u64) -> FnvHasher {
        FnvHasher(key)
    }
}

impl Hasher for FnvHasher {
    #[inline]
    fn finish(&self) -> u64 {
        self.0
    }

    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        let FnvHasher(mut hash) = *self;

        for byte in bytes.iter() {
            hash = hash ^ (*byte as u64);
            hash = hash.wrapping_mul(0x100000001b3);
        }

        *self = FnvHasher(hash);
    }
}

/// A builder for default FNV hashers.
pub type FnvBuildHasher = BuildHasherDefault<FnvHasher>;

fn token_benchmark(c: &mut Criterion) {
    let data = include_bytes!("../../../assets/tokens/eu4-raw.bin");
    let xb = schemas::tokens::root_as_tokens(data).unwrap();
    let values = xb.values().unwrap();

    let mut arr = [0u16; 1024];
    thread_rng().fill(&mut arr);
    for x in &mut arr {
        *x %= values.len() as u16;
    }

    let mut group = c.benchmark_group("resolve");
    group.bench_function("vec", |b| {
        let mut i = 0;
        let resolver = FlatbufferResolver::from_slice(data);

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.bench_function("current", |b| {
        let mut i = 0;
        let resolver = schemas::FlatBufferResolver::from_slice(data);

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.bench_function("raw", |b| {
        let mut i = 0;
        let resolver = FlatbufferResolverRaw::from_slice(data);

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.bench_function("compile", |b| {
        let mut i = 0;
        let resolver = eu4save::EnvTokens;

        b.iter(|| {
            let res = resolver.resolve(arr[i % 1024]);
            i += 1;
            res
        })
    });

    group.bench_function("fnv", |b| {
        let mut i = 0;
        let map: HashMap<u16, _, FnvBuildHasher> = values
            .iter()
            .enumerate()
            .filter(|(_, x)| !x.is_empty())
            .map(|(i, x)| (i as u16, x))
            .collect();

        b.iter(|| {
            let res = TokenResolver::resolve(&map, arr[i % 1024]);
            i += 1;
            res
        })
    });
    group.finish();
}

criterion_group!(benches, token_benchmark);
criterion_main!(benches);
