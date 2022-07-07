pub struct FlatBufferResolver<'a> {
    data: Vec<&'a str>,
}

impl<'a> FlatBufferResolver<'a> {
    pub fn from_slice(data: &'a [u8]) -> Self {
        let xb = crate::tokens::root_as_tokens(data).unwrap();
        let values = xb.values().unwrap();
        let tokens = values.iter().collect::<Vec<_>>();
        Self { data: tokens }
    }
}

impl<'a> jomini::binary::TokenResolver for FlatBufferResolver<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.data
            .get(usize::from(token))
            .and_then(|x| (!x.is_empty()).then(|| *x))
    }
}
