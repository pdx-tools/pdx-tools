# Bumpalo serde

Bumpalo serde extends [serde](https://serde.rs/)'s deserialization capabilities to work with [bumpalo](https://github.com/fitzgen/bumpalo). It provides an `ArenaDeserialize` trait, which is similar to serde's `Deserialize`, but allocates data into a provided bump allocator instead of using the global heap allocator.

Bump allocators and deserialization are a natural fit:

- A single drop for the deserialized model, means that no matter how many strings a model may have, it will always be constant time to free the data.
- Bumpalo allows one to pre-allocate the capacity expected for deserialization
- Amortizes allocation costs of many fields that require allocations
- Minimizes the volatility of the system allocator. Especially well suited for Wasm where one may have minimal control of the underyling allocator.
- Allows for efficient views into the underlying data without requiring the entire input to be kept around unlike borrowed deserialization
- Less brittle in performance than serde's `deserialize_in_place`.

This crate is highly experimental and is not published on crates.io, but can be once stabilized.

The code for Bumpalo serde is licensed under MIT.

## Benchmarks

The `bench` crate measures the two models on `twitter.json`, the standard
corpus from serde's `json-benchmark`. The heap model owns each field in a
`String` or a `Vec`. The arena model has the same fields, but keeps only
`&str` and slices, and puts all data in a `Bump`.

The same document is also written in the Paradox binary format, so that the
effect of the arena can be seen against a text format and against a binary
format. The translation gives each of the 90 distinct keys a 16 bit token and
hands back the table, which the deserializer then reads as its token resolver,
as a game ships one. The binary corpus is read through a reader, because a
slice lets a model borrow each string from the input, which no allocator can
beat. A save arrives as a stream out of a zip entry, where every string must be
copied, and the arena and the heap are the two places to copy it to.

```bash
# wall clock, all variants
cargo bench -p bench --bench pdx-bench-criterion -- twitter

# instruction counts (needs valgrind and a matching gungraun-runner)
cargo bench -p bench --bench pdx-bench-gungraun -- 'pdx_bench_gungraun::twitter_gungraun_benches::*'
```

Results on a Ryzen 9 5900X. The JSON corpus is 631 KiB and the binary corpus
is 289 KiB.

| Format        | Parser       | Model | Parse  | Release | Parse and release |
| ------------- | ------------ | ----- | ------ | ------- | ----------------- |
| JSON          | `serde_json` | heap  | 961 µs | 58 µs   | 1025 µs           |
| JSON          | `serde_json` | arena | 798 µs | 0.26 µs | 791 µs            |
| JSON          | `sonic-rs`   | heap  | 757 µs | 58 µs   | 845 µs            |
| JSON          | `sonic-rs`   | arena | 658 µs | 0.28 µs | 646 µs            |
| jomini binary | `jomini`     | heap  | 447 µs | 64 µs   | 515 µs            |
| jomini binary | `jomini`     | arena | 326 µs | 0.22 µs | 324 µs            |

The arena removes 13-27% of the parse time, because the deserializer makes one
bump pointer move instead of one `malloc` for each string and each sequence.
It also makes the release of the model nearly free: a quarter of a microsecond
instead of about 60 µs, because the arena frees a few chunks and not thousands
of allocations. For the full cycle the arena model is 23% faster on JSON and
37% faster on the binary format.

The binary format gains more, and for the reason that the arena predicts: the
model holds the same 5800 allocations no matter which format it came from, but
the binary format spends much less work to find them, so the allocator is a
larger part of what is left. The instruction counts show the same order. With
`serde_json` the parse goes from 11.75 M to 10.23 M instructions (-13%); with
the binary format it goes from 5.94 M to 4.76 M (-20%), of a total that is half
the size. The release goes from about 885 K instructions to 1.2 K in both.

## Quick Example

```rust
use arena_deserializer::{ArenaDeserialize, ArenaSeed};
use bumpalo::Bump;
use serde::de::DeserializeSeed;

#[derive(ArenaDeserialize)]
struct User<'bump> {
    name: &'bump str,
    tags: bumpalo::collections::Vec<'bump, &'bump str>,
    id: u64,
}

let arena = Bump::new();
let json = r#"{"name": "Alice", "email": "alice@example.com", "tags": ["admin", "verified"], "id": 42}"#;
let mut deserializer = serde_json::Deserializer::from_str(json);

let user: User = ArenaSeed::new(&arena)
    .deserialize(&mut deserializer)
    .unwrap();

// All string data is allocated in the arena and freed when `arena` is dropped
```
