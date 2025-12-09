use jomini::common::{Date, PdsDate};
use serde::Serialize;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Debug, Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(transparent)]
pub struct AchievementList(Vec<eu4game_data::Achievement>);

#[wasm_bindgen]
pub fn achievements() -> AchievementList {
    let mut achieves = eu4game_data::achievements();
    achieves.sort_unstable_by(|a, b| {
        a.difficulty
            .cmp(&b.difficulty)
            .then_with(|| a.name.cmp(&b.name))
    });

    AchievementList(achieves)
}

// equivalent to eu4_days_to_date
#[wasm_bindgen]
pub fn eu4_days_to_date(days: i32) -> String {
    Date::from_ymd(1444, 11, 11)
        .add_days(days)
        .iso_8601()
        .to_string()
}

#[wasm_bindgen]
pub fn latest_eu4_minor_patch() -> u16 {
    eu4game_data::LATEST_MINOR
}
