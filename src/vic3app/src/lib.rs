//! Vic3 map data that is shared between the asset compiler and the web
//! client.

mod bundle;
mod color;
mod game_data;
#[cfg(feature = "game-install")]
pub mod game_install;
mod ids;
mod save;
mod world;

pub use bundle::*;
pub use color::{fallback_color, hsv_to_rgb};
pub use game_data::*;
pub use ids::*;
pub use save::*;
pub use world::*;

/// The asset bundle version (major.minor) of a save's game version.
///
/// ```
/// assert_eq!(vic3app::bundle_version("1.14.5"), Some(String::from("1.14")));
/// assert_eq!(vic3app::bundle_version("v1.9.8"), Some(String::from("1.9")));
/// assert_eq!(vic3app::bundle_version("1.14.0 (Ice Tea)"), Some(String::from("1.14")));
/// assert_eq!(vic3app::bundle_version("unknown"), None);
/// ```
pub fn bundle_version(version: &str) -> Option<String> {
    let version = version.trim().trim_start_matches('v');
    let mut parts = version.split('.');
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
