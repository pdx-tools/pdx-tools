pub use bumpalo_serde_derive::ArenaDeserialize;

use bumpalo::collections::{String as BumpString, Vec as BumpVec};
use serde::de::{DeserializeSeed, Deserializer, SeqAccess, Visitor};
use serde::{Deserialize, de};
use std::marker::PhantomData;

/// A trait for types that can be deserialized using a bump allocator.
pub trait ArenaDeserialize<'bump>: Sized {
    /// Deserialize this value from the given deserializer using the provided bump allocator.
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>;
}

/// A seed for deserializing values using a bump allocator.
#[derive(Clone, Copy)]
pub struct ArenaSeed<'bump, T> {
    pub allocator: &'bump bumpalo::Bump,
    pub marker: PhantomData<fn() -> T>,
}

impl<'bump, T> ArenaSeed<'bump, T> {
    /// Create a new ArenaSeed with the given allocator.
    pub fn new(allocator: &'bump bumpalo::Bump) -> Self {
        Self {
            allocator,
            marker: PhantomData,
        }
    }
}

impl<'de, 'bump, T> DeserializeSeed<'de> for ArenaSeed<'bump, T>
where
    T: ArenaDeserialize<'bump>,
{
    type Value = T;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        T::deserialize_in_arena(deserializer, self.allocator)
    }
}

// Macro to generate ArenaDeserialize implementations for types that just use regular Deserialize
macro_rules! impl_arena_deserialize_passthrough {
    ($($t:ty),* $(,)?) => {
        $(
            impl<'bump> ArenaDeserialize<'bump> for $t {
                fn deserialize_in_arena<'de, D>(deserializer: D, _allocator: &'bump bumpalo::Bump) -> Result<Self, D::Error>
                where
                    D: Deserializer<'de>,
                {
                    Self::deserialize(deserializer)
                }
            }
        )*
    };
}

// Implement ArenaDeserialize for common types that don't need arena allocation
impl_arena_deserialize_passthrough! {
    String,
    i8, i16, i32, i64, i128, isize,
    u8, u16, u32, u64, u128, usize,
    f32, f64,
    bool,
    char,
}

// Generic implementations for collections where the element types implement Deserialize
impl<'bump, T> ArenaDeserialize<'bump> for Vec<T>
where
    T: for<'de> Deserialize<'de>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Vec::<T>::deserialize(deserializer)
    }
}

impl<'bump, K, V> ArenaDeserialize<'bump> for std::collections::HashMap<K, V>
where
    K: for<'de> Deserialize<'de> + Eq + std::hash::Hash,
    V: for<'de> Deserialize<'de>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        std::collections::HashMap::<K, V>::deserialize(deserializer)
    }
}

impl<'bump, K, V> ArenaDeserialize<'bump> for std::collections::BTreeMap<K, V>
where
    K: for<'de> Deserialize<'de> + Ord,
    V: for<'de> Deserialize<'de>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        std::collections::BTreeMap::<K, V>::deserialize(deserializer)
    }
}

impl<'bump, T> ArenaDeserialize<'bump> for std::collections::HashSet<T>
where
    T: for<'de> Deserialize<'de> + Eq + std::hash::Hash,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        std::collections::HashSet::<T>::deserialize(deserializer)
    }
}

impl<'bump, T> ArenaDeserialize<'bump> for std::collections::BTreeSet<T>
where
    T: for<'de> Deserialize<'de> + Ord,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        std::collections::BTreeSet::<T>::deserialize(deserializer)
    }
}

impl<'bump, T> ArenaDeserialize<'bump> for Option<T>
where
    T: ArenaDeserialize<'bump>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct OptionVisitor<'a, T> {
            allocator: &'a bumpalo::Bump,
            marker: PhantomData<T>,
        }

        impl<'de, 'a, T> Visitor<'de> for OptionVisitor<'a, T>
        where
            T: ArenaDeserialize<'a>,
        {
            type Value = Option<T>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("option")
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(None)
            }

            fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
            where
                D: Deserializer<'de>,
            {
                T::deserialize_in_arena(deserializer, self.allocator).map(Some)
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(None)
            }
        }

        deserializer.deserialize_option(OptionVisitor {
            allocator,
            marker: PhantomData,
        })
    }
}

// Implementation for bumpalo::collections::String
impl<'bump> ArenaDeserialize<'bump> for BumpString<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct StringVisitor<'a>(&'a bumpalo::Bump);

        impl<'de, 'a> Visitor<'de> for StringVisitor<'a> {
            type Value = BumpString<'a>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string for BumpString")
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BumpString::from_str_in(v, self.0))
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(BumpString::from_str_in(&v, self.0))
            }
        }

        deserializer.deserialize_string(StringVisitor(allocator))
    }
}

// Implementation for &'bump str
impl<'bump> ArenaDeserialize<'bump> for &'bump str {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct StrVisitor<'a>(&'a bumpalo::Bump);

        impl<'de, 'a> Visitor<'de> for StrVisitor<'a> {
            type Value = &'a str;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string slice string")
            }

            fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(self.0.alloc_str(v))
            }

            fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(self.0.alloc_str(&v))
            }
        }

        deserializer.deserialize_str(StrVisitor(allocator))
    }
}

// Implementation for &'bump [u8]
impl<'bump> ArenaDeserialize<'bump> for &'bump [u8] {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct BytesVisitor<'a>(&'a bumpalo::Bump);

        impl<'de, 'a> Visitor<'de> for BytesVisitor<'a> {
            type Value = &'a [u8];

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("bytes")
            }

            fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(self.0.alloc_slice_copy(v))
            }

            fn visit_byte_buf<E>(self, v: Vec<u8>) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(self.0.alloc_slice_copy(&v))
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut bytes = Vec::new();
                while let Some(byte) = seq.next_element::<u8>()? {
                    bytes.push(byte);
                }
                Ok(self.0.alloc_slice_copy(&bytes))
            }
        }

        deserializer.deserialize_any(BytesVisitor(allocator))
    }
}

// Implementation for bumpalo::collections::Vec
impl<'bump, T> ArenaDeserialize<'bump> for BumpVec<'bump, T>
where
    T: ArenaDeserialize<'bump>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct VecVisitor<'a, T>(&'a bumpalo::Bump, PhantomData<T>);

        impl<'de, 'a, T> Visitor<'de> for VecVisitor<'a, T>
        where
            T: ArenaDeserialize<'a> + 'a,
        {
            type Value = BumpVec<'a, T>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut vec = BumpVec::new_in(self.0);

                while let Some(element) = seq.next_element_seed(ArenaSeed::new(self.0))? {
                    vec.push(element);
                }

                Ok(vec)
            }
        }

        deserializer.deserialize_seq(VecVisitor(allocator, PhantomData))
    }
}

/// A generic deserializer seed for deserializing slices into bump-allocated memory.
/// This is used by the derive macro to avoid generating duplicate code for each slice field.
pub struct SliceDeserializer<'bump, T> {
    allocator: &'bump bumpalo::Bump,
    _phantom: PhantomData<T>,
}

impl<'bump, T> SliceDeserializer<'bump, T> {
    /// Create a new SliceDeserializer with the given allocator.
    pub fn new(allocator: &'bump bumpalo::Bump) -> Self {
        Self {
            allocator,
            _phantom: PhantomData,
        }
    }
}

impl<'de, 'bump, T> DeserializeSeed<'de> for SliceDeserializer<'bump, T>
where
    T: ArenaDeserialize<'bump> + 'bump,
{
    type Value = &'bump [T];

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct SliceVisitor<'b, T> {
            allocator: &'b bumpalo::Bump,
            _phantom: PhantomData<T>,
        }

        impl<'de, 'b, T> Visitor<'de> for SliceVisitor<'b, T>
        where
            T: ArenaDeserialize<'b> + 'b,
        {
            type Value = &'b [T];

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut vec = BumpVec::new_in(self.allocator);

                while let Some(element) =
                    seq.next_element_seed(ArenaSeed::<T>::new(self.allocator))?
                {
                    vec.push(element);
                }

                Ok(vec.into_bump_slice())
            }
        }

        deserializer.deserialize_seq(SliceVisitor {
            allocator: self.allocator,
            _phantom: PhantomData,
        })
    }
}

// Implementation for tuples
impl<'bump, A, B> ArenaDeserialize<'bump> for (A, B)
where
    A: ArenaDeserialize<'bump>,
    B: ArenaDeserialize<'bump>,
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct TupleVisitor<'a, A, B>(&'a bumpalo::Bump, PhantomData<(A, B)>);

        impl<'de, 'a, A, B> Visitor<'de> for TupleVisitor<'a, A, B>
        where
            A: ArenaDeserialize<'a>,
            B: ArenaDeserialize<'a>,
        {
            type Value = (A, B);

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a tuple")
            }

            fn visit_seq<S>(self, mut seq: S) -> Result<Self::Value, S::Error>
            where
                S: SeqAccess<'de>,
            {
                let first = seq
                    .next_element_seed(ArenaSeed::new(self.0))?
                    .ok_or_else(|| de::Error::invalid_length(0, &self))?;
                let second = seq
                    .next_element_seed(ArenaSeed::new(self.0))?
                    .ok_or_else(|| de::Error::invalid_length(1, &self))?;

                Ok((first, second))
            }
        }

        deserializer.deserialize_tuple(2, TupleVisitor(allocator, PhantomData))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Provide bumpalo_serde as an alias to crate for the derive macro in tests
    use crate as bumpalo_serde;

    // Example custom deserializer function
    fn deserialize_map_as_pair_seq<'de, 'bump, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<BumpVec<'bump, (u16, &'bump str)>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // This is a simplified version - in real implementation would parse map differently
        // For demonstration, just return an empty vector
        let _: serde::de::IgnoredAny = serde::Deserialize::deserialize(deserializer)?;
        Ok(BumpVec::new_in(allocator))
    }

    #[derive(ArenaDeserialize)]
    struct City<'bump> {
        #[arena(alias = "n")]
        name: bumpalo::collections::String<'bump>,
        citizens: bumpalo::collections::Vec<'bump, Citizen<'bump>>,
    }

    #[derive(ArenaDeserialize)]
    struct Citizen<'bump> {
        first_name: &'bump str,
        last_name: String, // Deserializing with global allocator
        #[arena(default)] // Support for "default" field attribute
        age: i16,
        data: CitizenData<'bump>,
        #[arena(deserialize_with = "deserialize_map_as_pair_seq")]
        tags: bumpalo::collections::Vec<'bump, (u16, &'bump str)>,
    }

    #[derive(ArenaDeserialize)]
    struct CitizenData<'bump>(&'bump [u8]);

    #[test]
    fn test_basic_struct_deserialization() {
        let allocator = bumpalo::Bump::new();

        let json = r#"{"first_name": "John", "last_name": "Doe", "age": 25, "data": [1, 2, 3], "tags": [[1, "tag1"], [2, "tag2"]]}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let citizen: Citizen =
            Citizen::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(citizen.first_name, "John");
        assert_eq!(citizen.last_name, "Doe");
        assert_eq!(citizen.age, 25);
        assert_eq!(citizen.data.0, &[1, 2, 3]);
        assert_eq!(citizen.tags.len(), 0); // Empty tags array
    }

    #[test]
    fn test_alias_support() {
        let allocator = bumpalo::Bump::new();

        let json = r#"{"n": "New York", "citizens": []}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let city: City = City::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(city.name.as_str(), "New York");
    }

    #[test]
    fn test_default_field() {
        let allocator = bumpalo::Bump::new();

        let json = r#"{"first_name": "Jane", "last_name": "Smith", "data": [4, 5, 6], "tags": []}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let citizen: Citizen =
            Citizen::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(citizen.first_name, "Jane");
        assert_eq!(citizen.last_name, "Smith");
        assert_eq!(citizen.age, 0); // Default value for i16
        assert_eq!(citizen.data.0, &[4, 5, 6]);
        assert_eq!(citizen.tags.len(), 0); // Empty tags array
    }

    #[test]
    fn test_nested_structs() {
        let allocator = bumpalo::Bump::new();

        let json = r#"{
            "name": "Boston",
            "citizens": [
                {"first_name": "Alice", "last_name": "Wonder", "age": 30, "data": [7, 8, 9], "tags": []},
                {"first_name": "Bob", "last_name": "Builder", "data": [10, 11, 12], "tags": []}
            ]
        }"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let city: City = City::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(city.name.as_str(), "Boston");
        assert_eq!(city.citizens.len(), 2);
        assert_eq!(city.citizens[0].first_name, "Alice");
        assert_eq!(city.citizens[0].age, 30);
        assert_eq!(city.citizens[0].data.0, &[7, 8, 9]);
        assert_eq!(city.citizens[0].tags.len(), 0);
        assert_eq!(city.citizens[1].first_name, "Bob");
        assert_eq!(city.citizens[1].age, 0); // Default value
        assert_eq!(city.citizens[1].data.0, &[10, 11, 12]);
        assert_eq!(city.citizens[1].tags.len(), 0);
    }

    #[test]
    fn test_transparent_newtype() {
        let allocator = bumpalo::Bump::new();

        let json = r#"[1, 2, 3, 4, 5]"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let data: CitizenData =
            CitizenData::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(data.0, &[1, 2, 3, 4, 5]);
    }

    #[test]
    fn test_bumpalo_string() {
        let allocator = bumpalo::Bump::new();

        let json = r#""Hello, World!""#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let s: BumpString =
            BumpString::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(s.as_str(), "Hello, World!");
    }

    #[test]
    fn test_borrowed_str() {
        let allocator = bumpalo::Bump::new();

        let json = r#""Borrowed string""#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let s: &str = <&str>::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(s, "Borrowed string");
    }

    #[test]
    fn test_bumpalo_vec() {
        let allocator = bumpalo::Bump::new();

        let json = r#"["one", "two", "three"]"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let v: BumpVec<&str> =
            BumpVec::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(v.len(), 3);
        assert_eq!(v[0], "one");
        assert_eq!(v[1], "two");
        assert_eq!(v[2], "three");
    }

    #[test]
    fn test_generic_collections() {
        let allocator = bumpalo::Bump::new();

        // Test Vec<i32>
        let json = r#"[1, 2, 3, 4, 5]"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);
        let v: Vec<i32> = Vec::deserialize_in_arena(&mut deserializer, &allocator).unwrap();
        assert_eq!(v, vec![1, 2, 3, 4, 5]);

        // Test HashMap<String, i32>
        let json = r#"{"a": 1, "b": 2, "c": 3}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);
        let map: std::collections::HashMap<String, i32> =
            std::collections::HashMap::deserialize_in_arena(&mut deserializer, &allocator).unwrap();
        assert_eq!(map.len(), 3);
        assert_eq!(map.get("a"), Some(&1));
        assert_eq!(map.get("b"), Some(&2));
        assert_eq!(map.get("c"), Some(&3));

        // Test Option<String>
        let json = r#""hello""#;
        let mut deserializer = serde_json::Deserializer::from_str(json);
        let opt: Option<String> =
            Option::deserialize_in_arena(&mut deserializer, &allocator).unwrap();
        assert_eq!(opt, Some("hello".to_string()));

        // Test None case
        let json = r#"null"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);
        let opt: Option<String> =
            Option::deserialize_in_arena(&mut deserializer, &allocator).unwrap();
        assert_eq!(opt, None);
    }

    #[test]
    fn test_struct_with_generic_collections() {
        let allocator = bumpalo::Bump::new();

        #[derive(ArenaDeserialize)]
        struct ComplexStruct<'bump> {
            name: String,
            scores: Vec<i32>,
            metadata: std::collections::HashMap<String, String>,
            arena_string: bumpalo::collections::String<'bump>,
            optional_value: Option<i32>,
        }

        let json = r#"{
            "name": "test",
            "scores": [10, 20, 30],
            "metadata": {"key1": "value1", "key2": "value2"},
            "arena_string": "arena allocated",
            "optional_value": 42
        }"#;

        let mut deserializer = serde_json::Deserializer::from_str(json);
        let complex: ComplexStruct =
            ComplexStruct::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(complex.name, "test");
        assert_eq!(complex.scores, vec![10, 20, 30]);
        assert_eq!(complex.metadata.len(), 2);
        assert_eq!(complex.metadata.get("key1"), Some(&"value1".to_string()));
        assert_eq!(complex.metadata.get("key2"), Some(&"value2".to_string()));
        assert_eq!(complex.arena_string.as_str(), "arena allocated");
        assert_eq!(complex.optional_value, Some(42));
    }

    #[test]
    fn test_owned_type_auto_forward() {
        let allocator = bumpalo::Bump::new();

        #[derive(ArenaDeserialize, serde::Deserialize, Debug, PartialEq)]
        struct OwnedStruct {
            id: u32,
            name: String,
            values: Vec<i32>,
        }

        let json = r#"{"id": 42, "name": "test", "values": [1, 2, 3]}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let result: OwnedStruct =
            OwnedStruct::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.id, 42);
        assert_eq!(result.name, "test");
        assert_eq!(result.values, vec![1, 2, 3]);
    }

    #[test]
    fn test_optional_fields_without_default() {
        let allocator = bumpalo::Bump::new();

        #[derive(ArenaDeserialize)]
        struct StructWithOptionalFields<'bump> {
            required_field: String,
            optional_field1: Option<i32>,
            optional_field2: Option<bumpalo::collections::String<'bump>>,
            optional_field3: Option<Vec<String>>,
        }

        // Test with all optional fields present
        let json_with_options = r#"{
            "required_field": "required",
            "optional_field1": 42,
            "optional_field2": "arena string",
            "optional_field3": ["item1", "item2"]
        }"#;

        let mut deserializer = serde_json::Deserializer::from_str(json_with_options);
        let result: StructWithOptionalFields =
            StructWithOptionalFields::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.required_field, "required");
        assert_eq!(result.optional_field1, Some(42));
        assert_eq!(
            result.optional_field2.as_ref().map(|s| s.as_str()),
            Some("arena string")
        );
        assert_eq!(
            result.optional_field3,
            Some(vec!["item1".to_string(), "item2".to_string()])
        );

        // Test with optional fields missing (should be None)
        let json_without_options = r#"{
            "required_field": "required"
        }"#;

        let mut deserializer = serde_json::Deserializer::from_str(json_without_options);
        let result: StructWithOptionalFields =
            StructWithOptionalFields::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.required_field, "required");
        assert_eq!(result.optional_field1, None);
        assert_eq!(result.optional_field2, None);
        assert_eq!(result.optional_field3, None);

        // Test with explicit null values
        let json_with_nulls = r#"{
            "required_field": "required",
            "optional_field1": null,
            "optional_field2": null,
            "optional_field3": null
        }"#;

        let mut deserializer = serde_json::Deserializer::from_str(json_with_nulls);
        let result: StructWithOptionalFields =
            StructWithOptionalFields::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.required_field, "required");
        assert_eq!(result.optional_field1, None);
        assert_eq!(result.optional_field2, None);
        assert_eq!(result.optional_field3, None);
    }

    #[test]
    fn test_struct_with_custom_lifetime_a() {
        let allocator = bumpalo::Bump::new();

        #[derive(ArenaDeserialize)]
        struct CustomLifetimeStruct<'a> {
            data: &'a str,
            items: bumpalo::collections::Vec<'a, i32>,
        }

        let json = r#"{"data": "hello", "items": [1, 2, 3]}"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let result: CustomLifetimeStruct =
            CustomLifetimeStruct::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.data, "hello");
        assert_eq!(result.items.len(), 3);
        assert_eq!(result.items[0], 1);
        assert_eq!(result.items[1], 2);
        assert_eq!(result.items[2], 3);
    }

    /// Test nested structs with custom lifetime parameters
    #[test]
    fn test_nested_structs_with_custom_lifetimes() {
        let allocator = bumpalo::Bump::new();

        #[derive(ArenaDeserialize)]
        struct Inner<'a> {
            value: &'a str,
            number: i32,
        }

        #[derive(ArenaDeserialize)]
        struct Outer<'a> {
            inner: Inner<'a>,
            outer_data: &'a str,
        }

        let json = r#"{
            "inner": {"value": "inner", "number": 42},
            "outer_data": "outer"
        }"#;
        let mut deserializer = serde_json::Deserializer::from_str(json);

        let result: Outer = Outer::deserialize_in_arena(&mut deserializer, &allocator).unwrap();

        assert_eq!(result.inner.value, "inner");
        assert_eq!(result.inner.number, 42);
        assert_eq!(result.outer_data, "outer");
    }
}
