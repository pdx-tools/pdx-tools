use eu4save::SegmentedResolver;
use schemas::FlatResolver;
use wasm_bindgen::prelude::*;

static mut TOKEN_DATA: Vec<u8> = Vec::new();
static mut TOKEN_LOOKUP: SegmentedResolver<'static> = SegmentedResolver::empty();

pub(crate) fn get_tokens() -> &'static SegmentedResolver<'static> {
    unsafe { &*std::ptr::addr_of!(TOKEN_LOOKUP) }
}

#[wasm_bindgen]
pub fn set_tokens(data: Vec<u8>) {
    let tokens = pdx_zstd::decode_all(&data).unwrap_or_default();

    let sl: &'static [u8] = unsafe { std::mem::transmute(tokens.as_slice()) };
    let resolver = FlatResolver::from_slice(sl);
    let resolver = SegmentedResolver::from_parts(resolver.values, resolver.breakpoint, 10000);
    unsafe { TOKEN_DATA = tokens };
    unsafe { TOKEN_LOOKUP = resolver };
}
