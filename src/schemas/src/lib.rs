#[allow(non_snake_case, unused_imports, clippy::all, clippy::as_pointer_underscore, mismatched_lifetime_syntaxes, missing_debug_implementations, unused_lifetimes, unsafe_op_in_unsafe_fn)]
#[rustfmt::skip]
mod eu4_generated;

pub mod resolver;

pub use eu4_generated::rakaly::eu_4 as eu4;
pub use flatbuffers;
pub use resolver::{BREAKPOINT, FlatResolver};
