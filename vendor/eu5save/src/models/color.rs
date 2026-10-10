use arena_serde::ArenaDeserialize;
use serde::de::{self, Deserialize, value::SeqAccessDeserializer};
use std::fmt;

#[derive(Debug, PartialEq, Clone, Copy)]
pub struct Color(pub [u8; 3]);

impl Default for Color {
    fn default() -> Self {
        // Default to the "unowned" color so that an unowned location will use
        // country id 0's color (gray)
        Color([128, 128, 128])
    }
}

struct ColorVisitor;

impl<'de> de::Visitor<'de> for ColorVisitor {
    type Value = Color;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("a color array of 3 integers")
    }

    fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
    where
        A: de::SeqAccess<'de>,
    {
        // A binary color arrives with its channel count known. Some fields,
        // such as `color3`, hold a fourth alpha channel that the map ignores.
        if matches!(seq.size_hint(), Some(3) | Some(4)) {
            let arr = <[u8; 3]>::deserialize(SeqAccessDeserializer::new(seq))?;
            Ok(Color(arr))
        } else {
            // Otherwise it will be a two element tuple of color=rgb { 100 200, 50 }
            let (_ignored, arr) =
                <(de::IgnoredAny, [u8; 3])>::deserialize(SeqAccessDeserializer::new(seq))?;
            Ok(Color(arr))
        }
    }
}

impl<'de> Deserialize<'de> for Color {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_seq(ColorVisitor)
    }
}

impl<'bump> ArenaDeserialize<'bump> for Color {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump arena_serde::Arena,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Color has no arena data. Forward to the custom visitor above.
        Self::deserialize(deserializer)
    }
}
