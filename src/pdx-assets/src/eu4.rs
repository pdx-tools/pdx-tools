use jomini::{Windows1252Encoding, text::syntax};
use serde::Deserialize;

pub mod compiler;
pub mod data;

fn deserialize<'a, T: Deserialize<'a>>(data: &'a [u8]) -> Result<T, syntax::de::Error> {
    syntax::parse(data).deserialize(Windows1252Encoding::new())
}
