mod error;
#[cfg(not(target_arch = "wasm32"))]
pub mod zstd_tee;

pub use backend::{Decoder, Encoder};
pub use error::Error;
pub type Result<T> = std::result::Result<T, Error>;

#[cfg(feature = "zstd_c")]
#[path = "backend/zstd_c.rs"]
mod backend;

#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
#[path = "backend/zstd_rust.rs"]
mod backend;

const MAGIC_NUMBER: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];

pub fn is_zstd_compressed(data: &[u8]) -> bool {
    data.get(..4) == Some(&MAGIC_NUMBER)
}

pub fn decode_all(data: &[u8]) -> Result<Vec<u8>> {
    backend::decode_all(data)
}

pub fn copy_decode(data: &[u8], writer: &mut impl std::io::Write) -> Result<()> {
    backend::copy_decode(data, writer)
}

pub fn encode_all(data: &[u8], level: i32) -> Result<Vec<u8>> {
    backend::encode_all(data, level)
}
