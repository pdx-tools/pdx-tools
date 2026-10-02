//! HOI4 map data that is shared between the asset compiler and the web
//! client.

mod bundle;
mod color;
mod game_data;
#[cfg(feature = "game-install")]
pub mod game_install;
mod world;

pub use bundle::*;
pub use color::{fallback_color, hsv_to_rgb};
pub use game_data::*;
pub use world::*;

/// The asset bundle version (major.minor) of a save's game version.
///
/// ```
/// assert_eq!(
///     hoi4app::bundle_version("Operation Postern v1.19.3.0.c01a (5632)"),
///     Some(String::from("1.19"))
/// );
/// assert_eq!(
///     hoi4app::bundle_version("Avalanche v1.12.14.f0ae (6347)"),
///     Some(String::from("1.12"))
/// );
/// assert_eq!(hoi4app::bundle_version("v1.10.1"), Some(String::from("1.10")));
/// assert_eq!(hoi4app::bundle_version("unknown"), None);
/// ```
pub fn bundle_version(version: &str) -> Option<String> {
    // The version number follows a "v" and a digit. A codename can also
    // contain a "v", so the digit is necessary.
    let start = version
        .match_indices('v')
        .find(|(i, _)| version[i + 1..].starts_with(|c: char| c.is_ascii_digit()))
        .map(|(i, _)| i + 1)
        .unwrap_or(0);
    let mut parts = version[start..].split('.');
    let major: u32 = parts.next()?.parse().ok()?;
    let minor: u32 = parts
        .next()?
        .chars()
        .take_while(|x| x.is_ascii_digit())
        .collect::<String>()
        .parse()
        .ok()?;
    Some(format!("{major}.{minor}"))
}
