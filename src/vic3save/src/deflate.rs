#[derive(thiserror::Error, Debug)]
pub(crate) enum ZipInflationError {
    #[error("unable to inflate: {msg}")]
    BadData { msg: String },

    #[error("early eof, only able to write {written} bytes")]
    EarlyEof { written: usize },
}

#[cfg(all(feature = "miniz", not(feature = "libdeflate")))]
pub(crate) fn inflate_exact(raw: &[u8], out: &mut [u8]) -> Result<(), ZipInflationError> {
    let inflation = miniz_oxide::inflate::decompress_slice_iter_to_slice(
        out,
        std::iter::once(raw),
        false,
        false,
    );

    match inflation {
        Ok(written) if written == out.len() => Ok(()),
        Ok(written) => Err(ZipInflationError::EarlyEof { written }),
        Err(miniz_oxide::inflate::TINFLStatus::HasMoreOutput) => Ok(()),
        Err(e) => Err(ZipInflationError::BadData {
            msg: format!("{:?}", e),
        }),
    }
}

#[cfg(feature = "libdeflate")]
pub(crate) fn inflate_exact(raw: &[u8], out: &mut [u8]) -> Result<(), ZipInflationError> {
    let inflation = libdeflater::Decompressor::new().deflate_decompress(raw, out);

    match inflation {
        Ok(written) if written == out.len() => Ok(()),
        Ok(written) => Err(ZipInflationError::EarlyEof { written }),
        Err(libdeflater::DecompressionError::InsufficientSpace) => Ok(()),
        Err(e) => Err(ZipInflationError::BadData { msg: e.to_string() }),
    }
}
