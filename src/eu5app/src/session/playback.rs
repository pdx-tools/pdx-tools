//! A versioned recording of values consumed by the save model. Ignored fields
//! are omitted; numeric values are stored directly, without text tokenization.
//! The recording is an implementation cache, never a replacement save format.
use serde::de::{self, DeserializeSeed, IntoDeserializer, MapAccess, SeqAccess, Visitor};
use std::fmt;

#[derive(Default)]
pub(super) struct Recording {
    pub bytes: Vec<u8>,
    pub valid: bool,
}
impl Recording {
    pub fn new() -> Self {
        Self {
            bytes: Vec::new(),
            valid: true,
        }
    }
    fn string(&mut self, text: &str) {
        self.bytes.push(4);
        self.bytes
            .extend_from_slice(&(text.len() as u32).to_le_bytes());
        self.bytes.extend_from_slice(text.as_bytes());
    }
}
pub(super) struct Record<'a, D> {
    pub inner: D,
    pub output: &'a mut Recording,
    pub key_start: Option<usize>,
}
struct Visit<'a, V> {
    inner: V,
    output: &'a mut Recording,
}
macro_rules! record_methods {
    ($($method:ident $(($($arg:ident : $ty:ty),*))?;)*) => {$ (
        fn $method<V: Visitor<'de>>(self, $($($arg:$ty,)*)? visitor:V)->Result<V::Value,Self::Error> {
            self.inner.$method($($($arg,)*)? Visit { inner:visitor,output:self.output })
        }
    )*};
}

impl<'de, D: de::Deserializer<'de>> de::Deserializer<'de> for Record<'_, D> {
    type Error = D::Error;
    record_methods! {
        deserialize_any;
        deserialize_bool;
        deserialize_i8;
        deserialize_i16;
        deserialize_i32;
        deserialize_i64;
        deserialize_i128;
        deserialize_u8;
        deserialize_u16;
        deserialize_u32;
        deserialize_u64;
        deserialize_u128;
        deserialize_f32;
        deserialize_f64;
        deserialize_char;
        deserialize_str;
        deserialize_string;
        deserialize_bytes;
        deserialize_byte_buf;
        deserialize_option;
        deserialize_unit;
        deserialize_seq;
        deserialize_map;
        deserialize_identifier;
        deserialize_unit_struct(name: &'static str);
        deserialize_newtype_struct(name: &'static str);
        deserialize_tuple(len:usize);
        deserialize_tuple_struct(name: &'static str,len:usize);
        deserialize_struct(name: &'static str,fields:&'static [&'static str]);
        deserialize_enum(name: &'static str,variants:&'static [&'static str]);
    }
    fn deserialize_ignored_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Self::Error> {
        if let Some(start) = self.key_start {
            self.output.bytes.truncate(start);
        } else {
            self.output.bytes.push(0);
        }
        self.inner.deserialize_ignored_any(visitor)
    }
    fn is_human_readable(&self) -> bool {
        self.inner.is_human_readable()
    }
}
impl<'de, V: Visitor<'de>> Visitor<'de> for Visit<'_, V> {
    type Value = V::Value;
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        self.inner.expecting(f)
    }
    fn visit_i8<E: de::Error>(self, value: i8) -> Result<Self::Value, E> {
        self.output.bytes.push(11);
        self.output
            .bytes
            .extend_from_slice(&(value as i64).to_le_bytes());
        self.inner.visit_i8(value)
    }
    fn visit_i16<E: de::Error>(self, value: i16) -> Result<Self::Value, E> {
        self.output.bytes.push(12);
        self.output
            .bytes
            .extend_from_slice(&(value as i64).to_le_bytes());
        self.inner.visit_i16(value)
    }
    fn visit_i32<E: de::Error>(self, value: i32) -> Result<Self::Value, E> {
        self.output.bytes.push(13);
        self.output
            .bytes
            .extend_from_slice(&(value as i64).to_le_bytes());
        self.inner.visit_i32(value)
    }
    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
        self.output.bytes.push(1);
        self.output.bytes.extend_from_slice(&value.to_le_bytes());
        self.inner.visit_i64(value)
    }
    fn visit_u8<E: de::Error>(self, value: u8) -> Result<Self::Value, E> {
        self.output.bytes.push(14);
        self.output
            .bytes
            .extend_from_slice(&(value as u64).to_le_bytes());
        self.inner.visit_u8(value)
    }
    fn visit_u16<E: de::Error>(self, value: u16) -> Result<Self::Value, E> {
        self.output.bytes.push(15);
        self.output
            .bytes
            .extend_from_slice(&(value as u64).to_le_bytes());
        self.inner.visit_u16(value)
    }
    fn visit_u32<E: de::Error>(self, value: u32) -> Result<Self::Value, E> {
        self.output.bytes.push(16);
        self.output
            .bytes
            .extend_from_slice(&(value as u64).to_le_bytes());
        self.inner.visit_u32(value)
    }
    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
        self.output.bytes.push(2);
        self.output.bytes.extend_from_slice(&value.to_le_bytes());
        self.inner.visit_u64(value)
    }
    fn visit_f32<E: de::Error>(self, value: f32) -> Result<Self::Value, E> {
        self.output.bytes.push(17);
        self.output
            .bytes
            .extend_from_slice(&(value as f64).to_le_bytes());
        self.inner.visit_f32(value)
    }
    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
        self.output.bytes.push(3);
        self.output.bytes.extend_from_slice(&value.to_le_bytes());
        self.inner.visit_f64(value)
    }
    fn visit_i128<E: de::Error>(self, value: i128) -> Result<Self::Value, E> {
        self.output.valid = false;
        self.inner.visit_i128(value)
    }
    fn visit_u128<E: de::Error>(self, value: u128) -> Result<Self::Value, E> {
        self.output.valid = false;
        self.inner.visit_u128(value)
    }
    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Self::Value, E> {
        self.output.bytes.push(if value { 6 } else { 5 });
        self.inner.visit_bool(value)
    }
    fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
        self.output.string(value);
        self.inner.visit_str(value)
    }
    fn visit_borrowed_str<E: de::Error>(self, value: &'de str) -> Result<Self::Value, E> {
        self.output.string(value);
        self.inner.visit_borrowed_str(value)
    }
    fn visit_string<E: de::Error>(self, value: String) -> Result<Self::Value, E> {
        self.output.string(&value);
        self.inner.visit_string(value)
    }
    fn visit_char<E: de::Error>(self, value: char) -> Result<Self::Value, E> {
        self.output.string(value.encode_utf8(&mut [0; 4]));
        self.inner.visit_char(value)
    }
    fn visit_bytes<E: de::Error>(self, value: &[u8]) -> Result<Self::Value, E> {
        self.output.bytes.push(7);
        self.output
            .bytes
            .extend_from_slice(&(value.len() as u32).to_le_bytes());
        self.output.bytes.extend_from_slice(value);
        self.inner.visit_bytes(value)
    }
    fn visit_borrowed_bytes<E: de::Error>(self, value: &'de [u8]) -> Result<Self::Value, E> {
        self.visit_bytes(value)
    }
    fn visit_byte_buf<E: de::Error>(self, value: Vec<u8>) -> Result<Self::Value, E> {
        self.visit_bytes(&value)
    }
    fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
        self.output.bytes.push(0);
        self.inner.visit_none()
    }
    fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
        self.output.bytes.push(0);
        self.inner.visit_unit()
    }
    fn visit_some<D: de::Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
        self.inner.visit_some(Record {
            inner: d,
            output: self.output,
            key_start: None,
        })
    }
    fn visit_newtype_struct<D: de::Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
        self.inner.visit_newtype_struct(Record {
            inner: d,
            output: self.output,
            key_start: None,
        })
    }
    fn visit_seq<A: SeqAccess<'de>>(self, access: A) -> Result<Self::Value, A::Error> {
        self.output.bytes.push(8);
        let result = self.inner.visit_seq(Sequence {
            inner: access,
            output: self.output,
        });
        self.output.bytes.push(10);
        result
    }
    fn visit_map<A: MapAccess<'de>>(self, access: A) -> Result<Self::Value, A::Error> {
        self.output.bytes.push(9);
        let result = self.inner.visit_map(Mapping {
            inner: access,
            output: self.output,
            key_start: 0,
        });
        self.output.bytes.push(10);
        result
    }
    fn visit_enum<A: de::EnumAccess<'de>>(self, access: A) -> Result<Self::Value, A::Error> {
        self.output.bytes.push(20);
        self.inner.visit_enum(Enumeration {
            inner: access,
            output: self.output,
        })
    }
}
struct Seed<'a, S> {
    inner: S,
    output: &'a mut Recording,
    key_start: Option<usize>,
}
impl<'de, S: DeserializeSeed<'de>> DeserializeSeed<'de> for Seed<'_, S> {
    type Value = S::Value;
    fn deserialize<D: de::Deserializer<'de>>(self, d: D) -> Result<Self::Value, D::Error> {
        self.inner.deserialize(Record {
            inner: d,
            output: self.output,
            key_start: self.key_start,
        })
    }
}
struct Sequence<'a, A> {
    inner: A,
    output: &'a mut Recording,
}
impl<'de, A: SeqAccess<'de>> SeqAccess<'de> for Sequence<'_, A> {
    type Error = A::Error;
    fn next_element_seed<S: DeserializeSeed<'de>>(
        &mut self,
        seed: S,
    ) -> Result<Option<S::Value>, Self::Error> {
        self.inner.next_element_seed(Seed {
            inner: seed,
            output: self.output,
            key_start: None,
        })
    }
    fn size_hint(&self) -> Option<usize> {
        self.inner.size_hint()
    }
}
struct Mapping<'a, A> {
    inner: A,
    output: &'a mut Recording,
    key_start: usize,
}
impl<'de, A: MapAccess<'de>> MapAccess<'de> for Mapping<'_, A> {
    type Error = A::Error;
    fn next_key_seed<S: DeserializeSeed<'de>>(
        &mut self,
        seed: S,
    ) -> Result<Option<S::Value>, Self::Error> {
        self.key_start = self.output.bytes.len();
        self.inner.next_key_seed(Seed {
            inner: seed,
            output: self.output,
            key_start: None,
        })
    }
    fn next_value_seed<S: DeserializeSeed<'de>>(
        &mut self,
        seed: S,
    ) -> Result<S::Value, Self::Error> {
        self.inner.next_value_seed(Seed {
            inner: seed,
            output: self.output,
            key_start: Some(self.key_start),
        })
    }
    fn size_hint(&self) -> Option<usize> {
        self.inner.size_hint()
    }
}

struct Enumeration<'a, A> {
    inner: A,
    output: &'a mut Recording,
}
impl<'a, 'de, A: de::EnumAccess<'de>> de::EnumAccess<'de> for Enumeration<'a, A> {
    type Error = A::Error;
    type Variant = Variant<'a, A::Variant>;
    fn variant_seed<S: DeserializeSeed<'de>>(
        self,
        seed: S,
    ) -> Result<(S::Value, Self::Variant), Self::Error> {
        let (value, variant) = self.inner.variant_seed(Seed {
            inner: seed,
            output: self.output,
            key_start: None,
        })?;
        Ok((
            value,
            Variant {
                inner: variant,
                output: self.output,
            },
        ))
    }
}
struct Variant<'a, A> {
    inner: A,
    output: &'a mut Recording,
}
impl<'de, A: de::VariantAccess<'de>> de::VariantAccess<'de> for Variant<'_, A> {
    type Error = A::Error;
    fn unit_variant(self) -> Result<(), Self::Error> {
        self.output.bytes.push(0);
        self.inner.unit_variant()
    }
    fn newtype_variant_seed<S: DeserializeSeed<'de>>(
        self,
        seed: S,
    ) -> Result<S::Value, Self::Error> {
        self.inner.newtype_variant_seed(Seed {
            inner: seed,
            output: self.output,
            key_start: None,
        })
    }
    fn tuple_variant<V: Visitor<'de>>(
        self,
        len: usize,
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        self.inner.tuple_variant(
            len,
            Visit {
                inner: visitor,
                output: self.output,
            },
        )
    }
    fn struct_variant<V: Visitor<'de>>(
        self,
        fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        self.inner.struct_variant(
            fields,
            Visit {
                inner: visitor,
                output: self.output,
            },
        )
    }
}

pub(super) struct Replay<'a> {
    pub remaining: &'a [u8],
    depth: usize,
}
type Error = de::value::Error;
impl<'a> Replay<'a> {
    pub fn new(bytes: &'a [u8]) -> Self {
        Self {
            remaining: bytes,
            depth: 0,
        }
    }
    fn take(&mut self, len: usize) -> Result<&'a [u8], Error> {
        if len > self.remaining.len() {
            return Err(de::Error::custom("Truncated playback cache"));
        }
        let (head, tail) = self.remaining.split_at(len);
        self.remaining = tail;
        Ok(head)
    }
    fn byte(&mut self) -> Result<u8, Error> {
        Ok(self.take(1)?[0])
    }
    fn bytes(&mut self) -> Result<&'a [u8], Error> {
        let len = u32::from_le_bytes(self.take(4)?.try_into().unwrap()) as usize;
        self.take(len)
    }
    fn end(&mut self) -> Result<bool, Error> {
        if self.remaining.first() == Some(&10) {
            self.byte()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
impl<'de> de::Deserializer<'de> for &mut Replay<'de> {
    type Error = Error;
    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        match self.byte()? {
            0 => visitor.visit_unit(),
            1 => visitor.visit_i64(i64::from_le_bytes(self.take(8)?.try_into().unwrap())),
            2 => visitor.visit_u64(u64::from_le_bytes(self.take(8)?.try_into().unwrap())),
            3 => visitor.visit_f64(f64::from_le_bytes(self.take(8)?.try_into().unwrap())),
            4 => visitor
                .visit_borrowed_str(std::str::from_utf8(self.bytes()?).map_err(de::Error::custom)?),
            5 => visitor.visit_bool(false),
            6 => visitor.visit_bool(true),
            7 => visitor.visit_borrowed_bytes(self.bytes()?),
            11 => visitor.visit_i8((i64::from_le_bytes(self.take(8)?.try_into().unwrap())) as i8),
            12 => visitor.visit_i16((i64::from_le_bytes(self.take(8)?.try_into().unwrap())) as i16),
            13 => visitor.visit_i32((i64::from_le_bytes(self.take(8)?.try_into().unwrap())) as i32),
            14 => visitor.visit_u8((u64::from_le_bytes(self.take(8)?.try_into().unwrap())) as u8),
            15 => visitor.visit_u16((u64::from_le_bytes(self.take(8)?.try_into().unwrap())) as u16),
            16 => visitor.visit_u32((u64::from_le_bytes(self.take(8)?.try_into().unwrap())) as u32),
            17 => visitor.visit_f32((f64::from_le_bytes(self.take(8)?.try_into().unwrap())) as f32),
            tag @ (8 | 9) => {
                if self.depth >= 128 {
                    return Err(de::Error::custom("Playback cache nesting limit"));
                }
                self.depth += 1;
                let mut access = Access {
                    replay: &mut *self,
                    finished: false,
                };
                let result = if tag == 8 {
                    visitor.visit_seq(&mut access)
                } else {
                    visitor.visit_map(&mut access)
                };
                if result.is_ok() && !access.finished {
                    while !access.replay.end()? {
                        <de::IgnoredAny as serde::Deserialize>::deserialize(&mut *access.replay)?;
                    }
                }
                self.depth -= 1;
                result
            }
            _ => Err(de::Error::custom("Invalid playback cache token")),
        }
    }
    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        if self.remaining.first() == Some(&0) {
            self.byte()?;
            visitor.visit_none()
        } else {
            visitor.visit_some(self)
        }
    }
    fn deserialize_newtype_struct<V: Visitor<'de>>(
        self,
        _name: &'static str,
        visitor: V,
    ) -> Result<V::Value, Error> {
        visitor.visit_newtype_struct(self)
    }
    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Error> {
        let tag = self.byte()?;
        if tag == 20 {
            return visitor.visit_enum(self);
        }
        if tag != 4 {
            return Err(de::Error::custom("Invalid playback enum"));
        }
        let text = std::str::from_utf8(self.bytes()?).map_err(de::Error::custom)?;
        visitor.visit_enum(text.into_deserializer())
    }
    fn deserialize_identifier<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Error> {
        match self.remaining.first().copied() {
            Some(1 | 2 | 11 | 12 | 13 | 14 | 15 | 16) => {
                self.byte()?;
                visitor.visit_u64(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
            }
            _ => self.deserialize_any(visitor),
        }
    }
    serde::forward_to_deserialize_any! { bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string bytes byte_buf unit unit_struct seq tuple tuple_struct map struct ignored_any }
}
struct Access<'a, 'de> {
    replay: &'a mut Replay<'de>,
    finished: bool,
}
impl<'de> SeqAccess<'de> for &mut Access<'_, 'de> {
    type Error = Error;
    fn next_element_seed<S: DeserializeSeed<'de>>(
        &mut self,
        seed: S,
    ) -> Result<Option<S::Value>, Error> {
        if self.finished || self.replay.end()? {
            self.finished = true;
            Ok(None)
        } else {
            seed.deserialize(&mut *self.replay).map(Some)
        }
    }
}
impl<'de> MapAccess<'de> for &mut Access<'_, 'de> {
    type Error = Error;
    fn next_key_seed<S: DeserializeSeed<'de>>(
        &mut self,
        seed: S,
    ) -> Result<Option<S::Value>, Error> {
        if self.finished || self.replay.end()? {
            self.finished = true;
            Ok(None)
        } else {
            seed.deserialize(&mut *self.replay).map(Some)
        }
    }
    fn next_value_seed<S: DeserializeSeed<'de>>(&mut self, seed: S) -> Result<S::Value, Error> {
        seed.deserialize(&mut *self.replay)
    }
}

impl<'de> de::EnumAccess<'de> for &mut Replay<'de> {
    type Error = Error;
    type Variant = Self;
    fn variant_seed<S: DeserializeSeed<'de>>(
        self,
        seed: S,
    ) -> Result<(S::Value, Self::Variant), Error> {
        let value = seed.deserialize(&mut *self)?;
        Ok((value, self))
    }
}
impl<'de> de::VariantAccess<'de> for &mut Replay<'de> {
    type Error = Error;
    fn unit_variant(self) -> Result<(), Error> {
        if self.byte()? == 0 {
            Ok(())
        } else {
            Err(de::Error::custom("Invalid playback unit variant"))
        }
    }
    fn newtype_variant_seed<S: DeserializeSeed<'de>>(self, seed: S) -> Result<S::Value, Error> {
        seed.deserialize(self)
    }
    fn tuple_variant<V: Visitor<'de>>(self, _len: usize, visitor: V) -> Result<V::Value, Error> {
        de::Deserializer::deserialize_seq(self, visitor)
    }
    fn struct_variant<V: Visitor<'de>>(
        self,
        _fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Error> {
        de::Deserializer::deserialize_map(self, visitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Deserialize, Serialize)]
    struct Sample {
        name: String,
        count: i32,
        values: Vec<Option<f64>>,
        enabled: bool,
    }

    #[test]
    fn records_consumed_fields_and_replays_without_unknown_data() {
        let input = r#"{"name":"France","ignored":{"large":[1,2,3]},"count":-42,"values":[1.25,null,0.0],"enabled":true}"#;
        let mut recording = Recording::new();
        let original = Sample::deserialize(Record {
            inner: &mut serde_json::Deserializer::from_str(input),
            output: &mut recording,
            key_start: None,
        })
        .unwrap();
        assert!(recording.valid);
        assert!(!recording.bytes.windows(7).any(|s| s == b"ignored"));
        let mut replay = Replay::new(&recording.bytes);
        assert_eq!(original, Sample::deserialize(&mut replay).unwrap());
        assert!(replay.remaining.is_empty());
    }

    #[test]
    fn preserves_fixed_tuples_and_enum_payloads() {
        #[derive(Debug, PartialEq, Deserialize)]
        enum Choice {
            Point((i32, i32)),
            Empty,
        }
        #[derive(Debug, PartialEq, Deserialize)]
        struct Container {
            point: (i32, i32),
            following: i32,
            choice: Choice,
        }
        let input = r#"{"point":[1,2],"following":3,"choice":{"Point":[4,5]}}"#;
        let mut recording = Recording::new();
        let original = Container::deserialize(Record {
            inner: &mut serde_json::Deserializer::from_str(input),
            output: &mut recording,
            key_start: None,
        })
        .unwrap();
        let mut replay = Replay::new(&recording.bytes);
        assert_eq!(original, Container::deserialize(&mut replay).unwrap());
        assert!(replay.remaining.is_empty());
    }

    #[test]
    fn rejects_truncation_and_invalid_tokens() {
        for bytes in [&[4, 99, 0, 0, 0][..], &[255], &[8, 1]] {
            assert!(Vec::<String>::deserialize(&mut Replay::new(bytes)).is_err());
        }
    }
}
