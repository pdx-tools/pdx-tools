/*!

A no-nonense, no-std, no-dependency, low level crate for parsing BMP files

Nothing is hidden and nothing is provided, so seek higher level crates if
ergonomics is the top priority.

*/

mod bmp;
mod errors;
mod utils;

pub use bmp::*;
pub use errors::*;
