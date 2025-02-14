use jomini::binary;
use std::{fmt, io};

/// A Vic3 Error
#[derive(thiserror::Error, Debug)]
#[error(transparent)]
pub struct Vic3Error(#[from] Box<Vic3ErrorKind>);

impl Vic3Error {
    pub(crate) fn new(kind: Vic3ErrorKind) -> Vic3Error {
        Vic3Error(Box::new(kind))
    }

    /// Return the specific type of error
    pub fn kind(&self) -> &Vic3ErrorKind {
        &self.0
    }
}

impl From<Vic3ErrorKind> for Vic3Error {
    fn from(err: Vic3ErrorKind) -> Self {
        Vic3Error::new(err)
    }
}

/// Specific type of error
#[derive(thiserror::Error, Debug)]
pub enum Vic3ErrorKind {
    #[error("unable to parse as zip: {0}")]
    Zip(#[from] rawzip::Error),

    #[error("missing zip entry in zip")]
    ZipMissingEntry,

    #[error("unable to parse due to: {0}")]
    Parse(#[source] jomini::Error),

    #[error("unable to deserialize due to: {0}")]
    Deserialize(#[source] jomini::Error),

    #[error("unable to deserialize due to: {0}")]
    DeserializeDebug(String),

    #[error("unable to deserialize due to: {msg}. This shouldn't occur as this is a deserializer wrapper")]
    DeserializeImpl { msg: String },

    #[error("error while writing output: {0}")]
    Writer(#[source] jomini::Error),

    #[error("unknown binary token encountered: {token_id:#x}")]
    UnknownToken { token_id: u16 },

    #[error("binary file encountered but token resolver is empty. This may mean a programmatic error where an application was compiled without ironman tokens")]
    NoTokens,

    #[error("expected the binary integer: {0} to be parsed as a date")]
    InvalidDate(i32),

    #[error("invalid header")]
    InvalidHeader,

    #[error("io error: {0}")]
    Io(#[from] io::Error),
}

impl serde::de::Error for Vic3Error {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        Vic3Error::new(Vic3ErrorKind::DeserializeImpl {
            msg: msg.to_string(),
        })
    }
}

impl From<jomini::Error> for Vic3Error {
    fn from(value: jomini::Error) -> Self {
        let kind = match value.into_kind() {
            jomini::ErrorKind::Deserialize(x) => match x.kind() {
                &jomini::DeserializeErrorKind::UnknownToken { token_id } => {
                    Vic3ErrorKind::UnknownToken { token_id }
                }
                _ => Vic3ErrorKind::Deserialize(x.into()),
            },
            _ => Vic3ErrorKind::DeserializeImpl {
                msg: String::from("unexpected error"),
            },
        };

        Vic3Error::new(kind)
    }
}

impl From<io::Error> for Vic3Error {
    fn from(value: io::Error) -> Self {
        Vic3Error::from(Vic3ErrorKind::from(value))
    }
}

impl From<binary::ReaderError> for Vic3Error {
    fn from(value: binary::ReaderError) -> Self {
        Self::from(jomini::Error::from(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_of_error_test() {
        assert_eq!(std::mem::size_of::<Vic3Error>(), 8);
    }
}
