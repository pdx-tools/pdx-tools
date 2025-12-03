use std::io;

#[derive(Debug, thiserror::Error)]
pub enum GameDataError {
    #[error("Jomini data failure on: {1} {0}")]
    Jomini(#[source] jomini::Error, &'static str),

    #[error("Unsupported compression method: {0:?}")]
    UnsupportedCompression(rawzip::CompressionMethod),

    #[error("Failed to decompress game data: {0}")]
    Decompression(#[from] pdx_zstd::Error),

    #[error("Failed to access ZIP archive: {0}")]
    ZipAccess(#[source] rawzip::Error),

    #[error("Failed to deserialize data: {0}")]
    Deserialization(#[from] postcard::Error),

    #[error("Missing required data: {0}")]
    MissingData(String),

    #[error("Failed to process location data: {0}")]
    LocationsError(String),

    #[error("IO error: {1}: {0}")]
    Io(#[source] io::Error, String),
}
