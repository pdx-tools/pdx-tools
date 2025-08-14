use schemas::FlatResolver;
#[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
use std::io::Read;
use wasm_bindgen::prelude::*;

static mut TOKEN_DATA: Vec<u8> = Vec::new();
static mut TOKEN_LOOKUP: FlatResolver<'static> = FlatResolver::empty();

pub(crate) fn get_tokens() -> &'static FlatResolver<'static> {
    unsafe { &*std::ptr::addr_of!(TOKEN_LOOKUP) }
}

#[wasm_bindgen]
pub fn set_tokens(data: Vec<u8>) {
    #[cfg(feature = "zstd_c")]
    let tokens = zstd::bulk::decompress(&data, 1024 * 1024).unwrap_or_default();

    #[cfg(all(feature = "zstd_rust", not(feature = "zstd_c")))]
    let tokens = ruzstd::decoding::StreamingDecoder::new(&data[..])
        .map_err(|_| ())
        .and_then(|mut decoder| {
            let mut output = Vec::new();
            decoder
                .read_to_end(&mut output)
                .map(|_| output)
                .map_err(|_| ())
        })
        .unwrap_or_default();
    let sl: &'static [u8] = unsafe { std::mem::transmute(tokens.as_slice()) };
    let resolver = FlatResolver::from_slice(sl);
    unsafe { TOKEN_DATA = tokens };
    unsafe { TOKEN_LOOKUP = resolver };
}
