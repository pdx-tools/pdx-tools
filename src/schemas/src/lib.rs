#[allow(non_snake_case, unused_imports, clippy::all)]
#[path = "../target/flatbuffers/eu4_generated.rs"]
mod eu4_flatbuffers;

pub mod resolver;

pub use eu4_flatbuffers::rakaly::eu_4 as eu4;
pub use flatbuffers;
pub use resolver::{FlatResolver, BREAKPOINT};
