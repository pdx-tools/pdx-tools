//! The snapshot of one save, and its binary form. The binary form is the
//! only snapshot data that leaves Rust: JavaScript moves it between workers
//! and does not read it.

use crate::columns::{Columns, DecodeError, Decoder, Encoder};
use crate::{AnalysisError, Game, SnapshotDescriptor};

const MAGIC: [u8; 4] = *b"PDXA";
/// Changes when the binary form changes.
const FORMAT: u32 = 1;

/// The parser output for one save.
#[derive(Debug, Clone)]
pub struct Observation<G: Game> {
    pub descriptor: SnapshotDescriptor,
    pub detail: G::Detail,
    /// The geographic IDs in row order.
    pub ids: Vec<u32>,
    pub payload: G::Payload,
}

impl<G: Game> Observation<G> {
    pub fn encode(&self) -> Vec<u8> {
        encode::<G>(&self.descriptor, &self.detail, &self.ids, &self.payload)
    }

    /// Read a snapshot of game `G`. A snapshot of another game or another
    /// extractor version gives an error before its payload is read.
    pub fn decode(bytes: &[u8]) -> Result<Self, AnalysisError> {
        let mut input = Decoder::new(bytes);
        if input.raw(MAGIC.len())? != MAGIC {
            return Err(DecodeError::NotASnapshot.into());
        }
        let format = u32::from_le_bytes(input.raw(4)?.try_into().unwrap_or_default());
        if format != FORMAT {
            return Err(DecodeError::UnknownFormat(format).into());
        }
        let descriptor: SnapshotDescriptor = header(&input.column::<u8>()?)?;
        if descriptor.game != G::GAME || descriptor.extractor_version != G::EXTRACTOR_VERSION {
            return Err(AnalysisError::WrongGame {
                game: G::GAME,
                version: G::EXTRACTOR_VERSION,
            });
        }
        let detail = header(&input.column::<u8>()?)?;
        let ids = input.column()?;
        let payload = G::Payload::decode(&mut input)?;
        input.finish()?;
        Ok(Self {
            descriptor,
            detail,
            ids,
            payload,
        })
    }
}

pub(crate) fn encode<G: Game>(
    descriptor: &SnapshotDescriptor,
    detail: &G::Detail,
    ids: &[u32],
    payload: &G::Payload,
) -> Vec<u8> {
    let mut out = Encoder::new();
    out.raw(&MAGIC);
    out.raw(&FORMAT.to_le_bytes());
    out.column(&header_bytes(descriptor));
    out.column(&header_bytes(detail));
    out.column(ids);
    payload.encode(&mut out);
    out.finish()
}

fn header<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T, DecodeError> {
    postcard::from_bytes(bytes).map_err(|error| DecodeError::Header(error.to_string()))
}

/// Postcard cannot fail on the headers: they have no maps of unknown length.
fn header_bytes<T: serde::Serialize>(value: &T) -> Vec<u8> {
    postcard::to_allocvec(value).expect("a snapshot header can be encoded")
}
