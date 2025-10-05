#[allow(non_snake_case, unused_imports, clippy::all, mismatched_lifetime_syntaxes)]
#[rustfmt::skip]
mod eu4_generated;

pub mod resolver;

pub use eu4_generated::rakaly::eu_4 as eu4;
pub use flatbuffers;
pub use resolver::{FlatResolver, BREAKPOINT};
