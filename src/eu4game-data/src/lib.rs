#[allow(
    clippy::match_single_binding,
    reason = "When there is only a single patch of game data, the match statement will be redundant."
)]
mod embedded_game {
    include!(concat!(env!("OUT_DIR"), "/embedded_game.rs"));
}

pub use embedded_game::*;
