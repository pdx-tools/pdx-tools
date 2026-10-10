use std::io;

#[derive(thiserror::Error, Debug)]
#[error(transparent)]
pub struct Eu5Error(#[from] Box<Eu5ErrorKind>);

impl Eu5Error {
    pub(crate) fn new(kind: Eu5ErrorKind) -> Eu5Error {
        Eu5Error(Box::new(kind))
    }

    /// Return the specific type of error
    pub fn kind(&self) -> &Eu5ErrorKind {
        &self.0
    }
}

impl From<io::Error> for Eu5Error {
    fn from(value: io::Error) -> Self {
        Eu5Error::from(Eu5ErrorKind::from(value))
    }
}

impl From<jomini::Error> for Eu5Error {
    fn from(value: jomini::Error) -> Self {
        Eu5Error::from(Eu5ErrorKind::from(value))
    }
}

impl From<jomini::binary::ReaderError> for Eu5Error {
    fn from(value: jomini::binary::ReaderError) -> Self {
        Eu5Error::from(Eu5ErrorKind::from(value))
    }
}

/// Specific type of error
#[derive(thiserror::Error, Debug)]
pub enum Eu5ErrorKind {
    #[error("invalid header")]
    InvalidHeader,

    #[error("parser error: {0}")]
    Jomini(#[from] jomini::Error),

    #[error("file envelope error: {0}")]
    Envelope(#[from] jomini::envelope::EnvelopeError),

    #[error("binary reader error: {0}")]
    BinaryReader(#[from] jomini::binary::ReaderError),

    #[error("io error: {0}")]
    Io(#[from] io::Error),

    #[error("unknown token: 0x{token_id:x}")]
    UnknownToken { token_id: u16 },

    #[error("unknown lookup: 0x{lookup_id:x}")]
    UnknownLookup { lookup_id: u32 },
}

impl From<Eu5ErrorKind> for Eu5Error {
    fn from(err: Eu5ErrorKind) -> Self {
        Eu5Error::new(err)
    }
}
