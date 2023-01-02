use eu4save::Eu4Error;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Eu4GameError {
    #[error("eu4 file parsing error: {0}")]
    Parse(#[from] Eu4Error),

    #[error("eu4 deserialization error: {0}")]
    DeserializeDebug(String),

    #[error("save file is too large at: {0} bytes")]
    TooLarge(usize),
}
