// There is a large gap in token values where values jump from 2000 to 10000
// (it's always 10000 for some reason). Instead of storing thousands of empty strings
// to index into, they are instead spliced out
const BREAKPOINT: u16 = 10000;

pub struct FlatBufferResolver<'a> {
    values: Vec<&'a str>,

    // The index where the data after the gap starts
    breakpoint: u16,
}

impl<'a> FlatBufferResolver<'a> {
    pub fn from_slice(data: &'a [u8]) -> Self {
        let xb = crate::tokens::root_as_tokens(data).unwrap();
        let values = xb.values().unwrap();
        let values = values.iter().collect::<Vec<_>>();
        let breakpoint = xb.breakpoint();
        Self { values, breakpoint }
    }

    pub fn create_data(tokens: Vec<&str>) -> Vec<u8> {
        let mut buffer = crate::flatbuffers::FlatBufferBuilder::new();

        let lower_max = &tokens[..usize::from(BREAKPOINT)]
            .iter()
            .enumerate()
            .fold(0, |acc, (i, x)| if x.is_empty() { acc } else { i });

        let mut values = Vec::new();
        values.extend_from_slice(&tokens[..lower_max + 1]);
        values.extend_from_slice(&tokens[usize::from(BREAKPOINT)..]);

        let softs: Vec<_> = values.iter().map(|x| buffer.create_string(x)).collect();
        let offset = buffer.create_vector(&softs);

        let root = crate::tokens::Tokens::create(
            &mut buffer,
            &crate::tokens::TokensArgs {
                values: Some(offset),
                breakpoint: (lower_max + 1) as u16,
            },
        );

        buffer.finish(root, None);
        buffer.finished_data().to_vec()
    }
}

impl<'a> jomini::binary::TokenResolver for FlatBufferResolver<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        if token < self.breakpoint {
            self.values
                .get(usize::from(token))
                .and_then(|x| (!x.is_empty()).then(|| *x))
        } else if token >= BREAKPOINT {
            self.values
                .get(usize::from(token - BREAKPOINT + self.breakpoint))
                .and_then(|x| (!x.is_empty()).then(|| *x))
        } else {
            None
        }
    }
}

#[cfg(feature = "inline")]
pub struct Eu4FlatBufferTokens {
    resolver: FlatBufferResolver<'static>,
}

#[cfg(feature = "inline")]
impl Eu4FlatBufferTokens {
    pub fn new() -> Self {
        let data = include_bytes!("../../../assets/tokens/eu4-raw.bin");
        Self {
            resolver: FlatBufferResolver::from_slice(data),
        }
    }
}

#[cfg(feature = "inline")]
impl jomini::binary::TokenResolver for Eu4FlatBufferTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.resolver.resolve(token)
    }
}

#[cfg(feature = "inline")]
pub struct Ck3FlatBufferTokens {
    resolver: FlatBufferResolver<'static>,
}

#[cfg(feature = "inline")]
impl Ck3FlatBufferTokens {
    pub fn new() -> Self {
        let data = include_bytes!("../../../assets/tokens/ck3-raw.bin");
        Self {
            resolver: FlatBufferResolver::from_slice(data),
        }
    }
}

#[cfg(feature = "inline")]
impl jomini::binary::TokenResolver for Ck3FlatBufferTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.resolver.resolve(token)
    }
}

#[cfg(feature = "inline")]
pub struct Hoi4FlatBufferTokens {
    resolver: FlatBufferResolver<'static>,
}

#[cfg(feature = "inline")]
impl Hoi4FlatBufferTokens {
    pub fn new() -> Self {
        let data = include_bytes!("../../../assets/tokens/hoi4-raw.bin");
        Self {
            resolver: FlatBufferResolver::from_slice(data),
        }
    }
}

#[cfg(feature = "inline")]
impl jomini::binary::TokenResolver for Hoi4FlatBufferTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.resolver.resolve(token)
    }
}

#[cfg(feature = "inline")]
pub struct ImperatorFlatBufferTokens {
    resolver: FlatBufferResolver<'static>,
}

#[cfg(feature = "inline")]
impl ImperatorFlatBufferTokens {
    pub fn new() -> Self {
        let data = include_bytes!("../../../assets/tokens/imperator-raw.bin");
        Self {
            resolver: FlatBufferResolver::from_slice(data),
        }
    }
}

#[cfg(feature = "inline")]
impl jomini::binary::TokenResolver for ImperatorFlatBufferTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        self.resolver.resolve(token)
    }
}

#[cfg(all(test, feature = "inline"))]
mod tests {
    use super::*;
    use jomini::binary::TokenResolver;

    #[test]
    pub fn test_eu4_resolver() {
        let resolver = Eu4FlatBufferTokens::new();
        assert_eq!(resolver.resolve(0x1b), Some("name"));
        assert_eq!(resolver.resolve(0x337f), Some("campaign_id"));
        assert_eq!(resolver.resolve(0x1000), None);
    }
}
