use bumpalo_serde::ArenaDeserialize;
use serde::de;

/// A conventionally UTF-8 string that is not required to be UTF-8.
///
/// A `BStr` allows us to quickly deserialize more data than what we need
/// without paying the cost of UTF-8 parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct BStr<'bump>(&'bump [u8]);

impl<'bump> BStr<'bump> {
    pub fn new(bytes: &'bump [u8]) -> Self {
        Self(bytes)
    }

    /// Return a string slice that encompasses the valid UTF-8 subset of the
    /// `BStr`
    #[expect(clippy::wrong_self_convention)]
    pub fn to_str(&self) -> &'bump str {
        match std::str::from_utf8(self.0) {
            Ok(s) => s,
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                unsafe { std::str::from_utf8_unchecked(&self.0[..valid_up_to]) }
            }
        }
    }

    pub fn as_bytes(&self) -> &[u8] {
        self.0
    }
}

impl std::fmt::Display for BStr<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_str())
    }
}

impl<'bump> ArenaDeserialize<'bump> for BStr<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct BStrVisitor<'bump>(&'bump bumpalo::Bump);

        impl<'de, 'bump> de::Visitor<'de> for BStrVisitor<'bump> {
            type Value = BStr<'bump>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a byte string")
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                let bytes = self.0.alloc_slice_copy(v);
                Ok(BStr::new(bytes))
            }

            fn visit_borrowed_bytes<E>(self, v: &'de [u8]) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                let bytes = self.0.alloc_slice_copy(v);
                Ok(BStr::new(bytes))
            }
        }

        deserializer.deserialize_bytes(BStrVisitor(allocator))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::rstest;

    #[rstest]
    #[case(b"Hello, World!", "Hello, World!")]
    #[case(b"", "")]
    #[case("Möng Köng".as_bytes(), "Möng Köng")]
    #[case(b"up to\xD6 not-this", "up to")]
    fn test_bstr_to_str(#[case] input: &[u8], #[case] expected: &str) {
        let bstr = BStr::new(input);
        let result = bstr.to_str();
        assert_eq!(result, expected);
    }

    #[test]
    fn test_bstr_to_str_preserves_lifetime() {
        let bytes = b"test";
        let actual = {
            let bstr = BStr::new(bytes);
            bstr.to_str()
        };
        assert_eq!(actual, "test");
    }
}
