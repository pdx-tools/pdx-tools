use serde::Deserialize;

#[derive(Debug, Clone, Copy)]
pub struct HexColor(pub [u8; 3]);

struct HexVisitor;

impl serde::de::Visitor<'_> for HexVisitor {
    type Value = HexColor;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a hex color string in the format 'RRGGBB'")
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        // The last two bytes are blue, then green, then red. That
        // means that when encountering a string with 4 characters
        // like "1e05", the red component should be zero. Similar
        // with 5 characters, pad out 0's. For strings longer than
        // 6 characters, take only the first 6.
        let trimmed = &v[..std::cmp::min(v.len(), 6)];
        let mut chunks = trimmed.as_bytes().rchunks(2);
        let b = chunks
            .next()
            .and_then(|s| u8::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok())
            .unwrap_or(0);
        let g = chunks
            .next()
            .and_then(|s| u8::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok())
            .unwrap_or(0);
        let r = chunks
            .next()
            .and_then(|s| u8::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok())
            .unwrap_or(0);
        Ok(HexColor([r, g, b]))
    }
}

// Take a string like "77ac4c" and deserialize it into 3 bytes
impl<'de> Deserialize<'de> for HexColor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_str(HexVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::de::value::StrDeserializer;

    #[test]
    fn test_hexcolor_deserialization() {
        let test_cases = [
            ("a", HexColor([0, 0, 10])),            // 1 char: 0x0a
            ("ff", HexColor([0, 0, 255])),          // 2 chars: 0xff
            ("abc", HexColor([0, 10, 188])),        // 3 chars: 0x0a, 0xbc
            ("1234", HexColor([0, 18, 52])),        // 4 chars: 0x12, 0x34
            ("e4d0f", HexColor([14, 77, 15])),      // 5 chars: 0x0e, 0x4d, 0x0f
            ("77ac4c", HexColor([119, 172, 76])),   // 6 chars: 0x77, 0xac, 0x4c
            ("77ac4cff", HexColor([119, 172, 76])), // 8 chars: truncated to first 6
        ];

        for (input, expected) in test_cases {
            let deserializer = StrDeserializer::<serde::de::value::Error>::new(input);
            let result = HexColor::deserialize(deserializer).unwrap();
            assert_eq!(result.0, expected.0, "Failed for input: {}", input);
        }
    }
}
