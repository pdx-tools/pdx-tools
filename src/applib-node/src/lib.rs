use hasher::FileHasher;
use napi::bindgen_prelude::*;
use napi_derive::*;
use parser::FileParser;

mod hasher;
mod parser;

#[napi]
pub fn parse_file(path: String) -> AsyncTask<FileParser> {
    AsyncTask::new(FileParser { path })
}

#[napi]
pub fn file_checksum(path: String) -> AsyncTask<FileHasher> {
    AsyncTask::new(FileHasher { path })
}

#[napi]
pub fn achievements() -> String {
    let mut achieves = eu4game::achievements::achievements();
    achieves.sort_unstable_by(|a, b| {
        a.difficulty
            .cmp(&b.difficulty)
            .then_with(|| a.name.cmp(&b.name))
    });

    // Prefer to serialize to JSON as `to_js_value` is slow. Ref:
    // https://github.com/napi-rs/napi-rs/issues/410
    serde_json::to_string(&achieves).unwrap()
}

#[napi]
pub fn eu4_days_to_date(days: i32) -> String {
    applib::eu4_days_to_date(days)
}

#[napi]
pub fn latest_eu4_minor_patch() -> u16 {
    eu4game::game::LATEST_MINOR
}
