use schemas::FlatBufferResolver;
use wasm_bindgen::prelude::*;

static mut TOKEN_DATA: Option<Vec<u8>> = None;
static mut TOKEN_LOOKUP: Option<FlatBufferResolver<'static>> = None;

pub(crate) fn get_tokens() -> &'static FlatBufferResolver<'static> {
    let raw = unsafe { &TOKEN_LOOKUP };
    raw.as_ref().unwrap()
}

#[wasm_bindgen]
pub fn set_tokens(data: Vec<u8>) {
    let sl: &'static [u8] = unsafe { std::mem::transmute(data.as_slice()) };
    let resolver = FlatBufferResolver::from_slice(sl);
    unsafe {
        TOKEN_DATA = Some(data);
        TOKEN_LOOKUP = Some(resolver)
    }
}
