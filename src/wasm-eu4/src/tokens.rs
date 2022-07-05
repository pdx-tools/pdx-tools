use wasm_bindgen::prelude::*;

static mut TOKEN_DATA: Option<Vec<u8>> = None;
static mut TOKEN_LOOKUP: Option<TokenIndex<'static>> = None;

pub(crate) struct TokenIndex<'a> {
    data: Vec<&'a str>,
}

impl<'a> jomini::binary::TokenResolver for TokenIndex<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.data
            .get(usize::from(token))
            .and_then(|x| (!x.is_empty()).then(|| *x))
    }
}

pub(crate) fn get_tokens() -> &'static TokenIndex<'static> {
    let raw = unsafe { &TOKEN_LOOKUP };
    raw.as_ref().unwrap()
}

#[wasm_bindgen]
pub fn set_tokens(data: Vec<u8>) {
    let sl: &'static [u8] = unsafe { std::mem::transmute(data.as_slice()) };
    let xb: schemas::tokens::Tokens = schemas::tokens::root_as_tokens(sl).unwrap();
    let values = xb.values().unwrap();
    let tokens = values.iter().collect::<Vec<_>>();
    unsafe {
        TOKEN_DATA = Some(data);
        TOKEN_LOOKUP = Some(TokenIndex { data: tokens })
    }
}
