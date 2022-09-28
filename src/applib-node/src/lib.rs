use hasher::FileHasher;
use napi::bindgen_prelude::*;
use napi_derive::*;
use parser::FileParser;
use std::convert::TryInto;

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

#[napi]
pub fn valid_patch(first: i32, second: i32) -> Result<bool> {
    let first = to_u16(first)?;
    let second = to_u16(second)?;
    Ok(eu4game::achievements::valid_patch(first, second))
}

fn to_u16(input: i32) -> Result<u16> {
    input.try_into().map_err(|_| {
        Error::new(
            Status::InvalidArg,
            String::from("Unable to convert into short"),
        )
    })
}
