use jomini::binary;
use std::io;

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
    #[error("unable to deserialize due to: {0}")]
    Deserialize(#[source] jomini::Error),

    #[error("unable to deserialize due to: {0}")]
    DeserializeDebug(String),

    #[error("error while writing output: {0}")]
    Writer(#[source] jomini::Error),

    #[error("unknown binary token encountered: {token_id:#x}")]
    UnknownToken { token_id: u16 },

    #[error("parsing error: {0}")]
    Jomini(#[from] jomini::Error),

    #[error("file envelope error: {0}")]
    Envelope(#[from] jomini::envelope::EnvelopeError),

    #[error("binary file encountered but token resolver is empty. This may mean a programmatic error where an application was compiled without ironman tokens")]
    NoTokens,

    #[error("expected the binary integer: {0} to be parsed as a date")]
    InvalidDate(i32),

    #[error("invalid header")]
    InvalidHeader,

    #[error("io error: {0}")]
    Io(#[from] io::Error),
}

impl From<jomini::Error> for Vic3Error {
    fn from(value: jomini::Error) -> Self {
        if let jomini::ErrorKind::Deserialize(_) = value.kind() {
            let jomini::ErrorKind::Deserialize(x) = value.into_kind() else {
                unreachable!()
            };

            let kind = match x.kind() {
                &jomini::DeserializeErrorKind::UnknownToken { token_id } => {
                    Vic3ErrorKind::UnknownToken { token_id }
                }
                _ => Vic3ErrorKind::Deserialize(x.into()),
            };
            Vic3Error::new(kind)
        } else {
            Vic3Error::new(Vic3ErrorKind::Jomini(value))
        }
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

impl From<jomini::envelope::EnvelopeError> for Vic3Error {
    fn from(value: jomini::envelope::EnvelopeError) -> Self {
        Vic3Error::from(Vic3ErrorKind::from(value))
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
