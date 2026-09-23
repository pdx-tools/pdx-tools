#[cfg(any(feature = "eu4", feature = "eu5"))]
mod encode;
#[cfg(feature = "eu4")]
pub mod eu4;
#[cfg(feature = "eu5")]
pub mod eu5;
