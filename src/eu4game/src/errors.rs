use eu4save::Eu4Error;
use std::io;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Eu4GameError {
    #[error("eu4 file parsing error: {0}")]
    Parse(#[from] Eu4Error),

    #[error("eu4 deserialization error: {0}")]
    DeserializeDebug(String),

    #[error("eu4 deserialization error: {0}")]
    Deserialize(#[from] jomini::Error),

    #[error("No meta file detected")]
    NoMeta,

    #[error("save file is too large at: {0} bytes")]
    TooLarge(usize),

    #[error("unable to inflate detected zstd data: {0}")]
    ZstdInflate(#[from] pdx_zstd::Error),

    #[error("io error")]
    Io(#[from] io::Error),
}
