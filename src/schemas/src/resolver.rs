// There is a large gap in token values where values jump from 2000 to 10000
// (it's always 10000 for some reason). Instead of storing thousands of empty strings
// to index into, they are instead spliced out
pub const BREAKPOINT: u16 = 10000;

pub struct FlatResolver<'a> {
    values: Vec<&'a str>,

    // The index where the data after the gap starts
    breakpoint: u16,
}

impl<'a> FlatResolver<'a> {
    pub fn from_slice(data: &'a [u8]) -> Self {
        if data.len() < 4 {
            return FlatResolver {
                values: Vec::new(),
                breakpoint: 0,
            };
        }

        let total_tokens = usize::from(u16::from_le_bytes([data[0], data[1]]));
        let breakpoint = u16::from_le_bytes([data[2], data[3]]);
        let mut values = vec![""; total_tokens];
        let mut data = &data[4..];
        for value in values.iter_mut() {
            if let Some((&len, rest)) = data.split_first() {
                let len = usize::from(len);
                if len != 0 && rest.len() >= len {
                    let (s, rest) = rest.split_at(len);
                    *value = unsafe { std::str::from_utf8_unchecked(s) };
                    data = rest;
                } else {
                    data = rest;
                }
            }
        }

        Self { values, breakpoint }
    }
}

impl<'a> jomini::binary::TokenResolver for FlatResolver<'a> {
    fn resolve(&self, token: u16) -> Option<&str> {
        if token < self.breakpoint {
            self.values
                .get(usize::from(token))
                .and_then(|x| (!x.is_empty()).then_some(*x))
        } else if token >= BREAKPOINT {
            self.values
                .get(usize::from(token - BREAKPOINT + self.breakpoint))
                .and_then(|x| (!x.is_empty()).then_some(*x))
        } else {
            None
        }
    }
}

include!(concat!(env!("OUT_DIR"), "/gen_tokens.rs"));

#[cfg(all(test, feature = "inline", eu4_tokens))]
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
