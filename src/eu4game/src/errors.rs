use eu4save::Eu4Error;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Eu4GameError {
    #[error("eu4 file parsing error")]
    Disconnect(#[from] Eu4Error),

    #[error("save file is too large at: {0} bytes")]
    TooLarge(usize),
}
