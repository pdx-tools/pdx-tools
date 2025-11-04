use bumpalo_serde::ArenaDeserialize;
use serde::de::{self, Deserialize, value::SeqAccessDeserializer};
use std::fmt;

#[derive(Debug, PartialEq, Clone, Copy, ArenaDeserialize)]
pub struct Color(pub [u8; 3]);

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
        // Use size hint to detect binary color
        if seq.size_hint() == Some(3) {
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
