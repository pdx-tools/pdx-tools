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
