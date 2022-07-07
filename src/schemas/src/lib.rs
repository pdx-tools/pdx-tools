#[allow(non_snake_case, unused_imports, clippy::all)]
#[path = "../target/flatbuffers/eu4_generated.rs"]
mod eu4_flatbuffers;

#[allow(non_snake_case, unused_imports, clippy::all)]
#[path = "../target/flatbuffers/tokens_generated.rs"]
mod tokens_flatbuffers;

mod resolver;

pub use eu4_flatbuffers::rakaly::eu_4 as eu4;
pub use flatbuffers;
pub use resolver::FlatBufferResolver;
pub use tokens_flatbuffers::rakaly::tokens;
