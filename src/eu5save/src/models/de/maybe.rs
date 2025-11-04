use serde::{
    Deserialize, Deserializer, Serialize,
    de::{
        self,
        value::{BorrowedStrDeserializer, StrDeserializer, StringDeserializer},
    },
};
use std::marker::PhantomData;

/// Helper trait for implementing special value deserializers
pub(crate) trait SpecialValueDeserializer<T> {
    /// Check if a string represents the special value
    fn is_special(value: &str) -> bool;

    /// Create the special variant
    fn create_special() -> Self;

    /// Create the visible variant
    fn create_visible(value: T) -> Self;
}

/// Value that could be "none"
#[derive(Debug, Default, PartialEq, Eq, Clone)]
pub struct Maybe<T>(Option<T>);

impl<T> Maybe<T> {
    pub fn into_value(self) -> Option<T> {
        self.0
    }
}

impl<T> SpecialValueDeserializer<T> for Maybe<T> {
    fn is_special(value: &str) -> bool {
        value == "none"
    }

    fn create_special() -> Self {
        Maybe(None)
    }

    fn create_visible(value: T) -> Self {
        Maybe(Some(value))
    }
}

impl<T> Serialize for Maybe<T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self.0 {
            None => serializer.serialize_str("none"),
            Some(ref value) => value.serialize(serializer),
        }
    }
}

pub(crate) fn deserialize_special_value<'de, D, T, S>(deserializer: D) -> Result<S, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
    S: SpecialValueDeserializer<T>,
{
    struct SpecialVisitor<T, S> {
        marker: PhantomData<(T, S)>,
    }

    impl<'de, T, S> de::Visitor<'de> for SpecialVisitor<T, S>
    where
        T: Deserialize<'de>,
        S: SpecialValueDeserializer<T>,
    {
        type Value = S;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or a value")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if S::is_special(value) {
                Ok(S::create_special())
            } else {
                T::deserialize(StrDeserializer::new(value)).map(S::create_visible)
            }
        }

        fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if S::is_special(&value) {
                Ok(S::create_special())
            } else {
                T::deserialize(StringDeserializer::new(value)).map(S::create_visible)
            }
        }

        fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if S::is_special(value) {
                Ok(S::create_special())
            } else {
                T::deserialize(BorrowedStrDeserializer::new(value)).map(S::create_visible)
            }
        }

        // For all non-string types, just deserialize directly to visible variant
        fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::BoolDeserializer::new(v),
            )?))
        }

        fn visit_i8<E>(self, v: i8) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::I8Deserializer::new(v),
            )?))
        }

        fn visit_i16<E>(self, v: i16) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::I16Deserializer::new(v),
            )?))
        }

        fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::I32Deserializer::new(v),
            )?))
        }

        fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::I64Deserializer::new(v),
            )?))
        }

        fn visit_u8<E>(self, v: u8) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::U8Deserializer::new(v),
            )?))
        }

        fn visit_u16<E>(self, v: u16) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::U16Deserializer::new(v),
            )?))
        }

        fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::U32Deserializer::new(v),
            )?))
        }

        fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::U64Deserializer::new(v),
            )?))
        }

        fn visit_f32<E>(self, v: f32) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::F32Deserializer::new(v),
            )?))
        }

        fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::F64Deserializer::new(v),
            )?))
        }

        fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
        where
            A: de::SeqAccess<'de>,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::SeqAccessDeserializer::new(seq),
            )?))
        }

        fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            Ok(S::create_visible(T::deserialize(
                serde::de::value::MapAccessDeserializer::new(map),
            )?))
        }
    }

    deserializer.deserialize_map(SpecialVisitor {
        marker: PhantomData,
    })
}

impl<'de, T> Deserialize<'de> for Maybe<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserialize_special_value(deserializer)
    }
}

// ArenaDeserialize implementation for Maybe
impl<'bump, T> bumpalo_serde::ArenaDeserialize<'bump> for Maybe<T>
where
    T: bumpalo_serde::ArenaDeserialize<'bump>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        fn deserialize_special_value_arena<'de, 'bump, D, T, S>(
            deserializer: D,
            allocator: &'bump bumpalo::Bump,
        ) -> Result<S, D::Error>
        where
            D: Deserializer<'de>,
            T: bumpalo_serde::ArenaDeserialize<'bump>,
            S: SpecialValueDeserializer<T>,
        {
            struct SpecialArenaVisitor<'bump, T, S> {
                allocator: &'bump bumpalo::Bump,
                marker: PhantomData<(T, S)>,
            }

            impl<'de, 'bump, T, S> de::Visitor<'de> for SpecialArenaVisitor<'bump, T, S>
            where
                T: bumpalo_serde::ArenaDeserialize<'bump>,
                S: SpecialValueDeserializer<T>,
            {
                type Value = S;

                fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                    formatter.write_str("a string or a value")
                }

                fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    if S::is_special(value) {
                        Ok(S::create_special())
                    } else {
                        T::deserialize_in_arena(StrDeserializer::new(value), self.allocator)
                            .map(S::create_visible)
                    }
                }

                fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    if S::is_special(&value) {
                        Ok(S::create_special())
                    } else {
                        T::deserialize_in_arena(StringDeserializer::new(value), self.allocator)
                            .map(S::create_visible)
                    }
                }

                fn visit_borrowed_str<E>(self, value: &'de str) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    if S::is_special(value) {
                        Ok(S::create_special())
                    } else {
                        T::deserialize_in_arena(BorrowedStrDeserializer::new(value), self.allocator)
                            .map(S::create_visible)
                    }
                }

                fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
                where
                    A: de::MapAccess<'de>,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::MapAccessDeserializer::new(map),
                        self.allocator,
                    )?))
                }

                // For all other types, delegate to the ArenaDeserialize implementation
                fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::BoolDeserializer::new(v),
                        self.allocator,
                    )?))
                }

                fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::I32Deserializer::new(v),
                        self.allocator,
                    )?))
                }

                fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::U32Deserializer::new(v),
                        self.allocator,
                    )?))
                }

                fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
                where
                    E: de::Error,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::F64Deserializer::new(v),
                        self.allocator,
                    )?))
                }

                fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
                where
                    A: de::SeqAccess<'de>,
                {
                    Ok(S::create_visible(T::deserialize_in_arena(
                        serde::de::value::SeqAccessDeserializer::new(seq),
                        self.allocator,
                    )?))
                }
            }

            deserializer.deserialize_map(SpecialArenaVisitor {
                allocator,
                marker: PhantomData,
            })
        }

        deserialize_special_value_arena(deserializer, allocator)
    }
}
