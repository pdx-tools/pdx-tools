#![allow(dead_code)]
use serde::Deserialize;

/// Helper to run tracked deserialization with serde_json
fn deserialize_tracked<T: for<'de> Deserialize<'de>>(json: &str) -> Result<T, String> {
    let mut path_buf = Vec::new();
    let mut deserializer = serde_json::Deserializer::from_str(json);
    bumpalo_serde::tracked::deserialize(&mut deserializer, &mut path_buf)
        .map_err(|err| err.path().to_string())
}

#[test]
fn test_simple_field_error() {
    #[derive(Deserialize, Debug)]
    struct TestStruct {
        name: String,
    }

    let json = r#"{"name": 123}"#; // Type error: expected string
    let err = deserialize_tracked::<TestStruct>(json).unwrap_err();
    assert_eq!(err, "name");
}

#[test]
fn test_missing_required_field() {
    #[derive(Deserialize, Debug)]
    struct TestStruct {
        name: String,
    }

    let json = r#"{}"#;
    let err = deserialize_tracked::<TestStruct>(json).unwrap_err();
    // Missing field error occurs at root level
    assert_eq!(err, ".");
}

#[test]
fn test_nested_struct_error() {
    #[derive(Deserialize, Debug)]
    struct Inner {
        value: i32,
    }

    #[derive(Deserialize, Debug)]
    struct Outer {
        inner: Inner,
    }

    let json = r#"{"inner": {"value": "not an int"}}"#;
    let err = deserialize_tracked::<Outer>(json).unwrap_err();
    assert_eq!(err, "inner.value");
}

#[test]
fn test_deeply_nested_path() {
    #[derive(Deserialize, Debug)]
    struct L5 {
        val: i32,
    }

    #[derive(Deserialize, Debug)]
    struct L4 {
        l5: L5,
    }

    #[derive(Deserialize, Debug)]
    struct L3 {
        l4: L4,
    }

    #[derive(Deserialize, Debug)]
    struct L2 {
        l3: L3,
    }

    #[derive(Deserialize, Debug)]
    struct L1 {
        l2: L2,
    }

    let json = r#"{"l2": {"l3": {"l4": {"l5": {"val": "wrong"}}}}}"#;
    let err = deserialize_tracked::<L1>(json).unwrap_err();
    assert_eq!(err, "l2.l3.l4.l5.val");
}

#[test]
fn test_root_level_error() {
    let json = r#""not a number""#;
    let err = deserialize_tracked::<i32>(json).unwrap_err();
    // Root level errors show as "."
    assert_eq!(err, ".");
}

#[test]
fn test_sequence_error() {
    let json = r#"[1, 2, "three", 4]"#;
    let err = deserialize_tracked::<Vec<i32>>(json).unwrap_err();
    assert_eq!(err, "[2]");
}

#[test]
fn test_sequence_nested_error() {
    #[derive(Deserialize, Debug)]
    struct Item {
        id: i32,
    }

    let json = r#"[{"id": 1}, {"id": "wrong"}]"#;
    let err = deserialize_tracked::<Vec<Item>>(json).unwrap_err();
    assert_eq!(err, "[1].id");
}

#[test]
fn test_empty_sequence() {
    let vec: Vec<i32> = deserialize_tracked::<Vec<i32>>(r#"[]"#).unwrap();
    assert!(vec.is_empty());
}

#[test]
fn test_tuple_error() {
    let json = r#"["string", 123, "not an int"]"#;
    let err = deserialize_tracked::<(String, i32, i32)>(json).unwrap_err();
    assert_eq!(err, "[2]");
}

#[test]
fn test_map_error() {
    let json = r#"{"key1": 10, "key2": "not an int"}"#;
    let err = deserialize_tracked::<std::collections::HashMap<String, i32>>(json).unwrap_err();
    assert_eq!(err, "key2");
}

#[test]
fn test_struct_map_error() {
    #[derive(Deserialize, Debug)]
    struct Config {
        timeout: u32,
        debug: bool,
    }

    let json = r#"{"timeout": 30, "debug": "not a bool"}"#;
    let err = deserialize_tracked::<Config>(json).unwrap_err();
    assert_eq!(err, "debug");
}

#[test]
fn test_multiple_map_keys() {
    #[derive(Deserialize, Debug)]
    struct Config {
        host: String,
        port: u16,
        timeout: u32,
    }

    let json = r#"{"host": "localhost", "port": 8080, "timeout": "not an int"}"#;
    let err = deserialize_tracked::<Config>(json).unwrap_err();
    assert_eq!(err, "timeout");
}

#[test]
fn test_enum_variant_error() {
    #[derive(Deserialize, Debug)]
    #[serde(tag = "type")]
    enum Status {
        Active { timestamp: i64 },
        Inactive,
    }

    let json = r#"{"type": "Active", "timestamp": "not a number"}"#;
    let err = deserialize_tracked::<Status>(json).unwrap_err();
    assert_eq!(err, ".");
}

#[test]
fn test_enum_newtype_variant() {
    #[derive(Deserialize, Debug)]
    enum Message {
        #[serde(rename = "text")]
        Text(String),
        #[serde(rename = "number")]
        Number(i32),
    }

    let json = r#"{"number": "not a number"}"#;
    let err = deserialize_tracked::<Message>(json).unwrap_err();
    assert_eq!(err, "number");
}

#[test]
fn test_option_some_with_error() {
    #[derive(Deserialize, Debug)]
    struct Config {
        timeout: Option<i32>,
    }

    let json = r#"{"timeout": "not an int"}"#;
    let err = deserialize_tracked::<Config>(json).unwrap_err();
    assert_eq!(err, "timeout");
}

#[test]
fn test_option_none() {
    #[derive(Deserialize, Debug)]
    struct Config {
        timeout: Option<i32>,
    }

    let config: Config = deserialize_tracked(r#"{"timeout": null}"#).unwrap();
    assert_eq!(config.timeout, None);
}

#[test]
fn test_option_missing() {
    #[derive(Deserialize, Debug)]
    struct Config {
        #[serde(default)]
        timeout: Option<i32>,
    }

    let config: Config = deserialize_tracked(r#"{}"#).unwrap();
    assert_eq!(config.timeout, None);
}

#[test]
fn test_mixed_nesting_map_and_array() {
    #[derive(Deserialize, Debug)]
    struct Item {
        id: i32,
    }

    let json = r#"{"items": [{"id": 1}, {"id": "wrong"}]}"#;
    let err =
        deserialize_tracked::<std::collections::HashMap<String, Vec<Item>>>(json).unwrap_err();
    assert_eq!(err, "items[1].id");
}

#[test]
fn test_mixed_nesting_array_and_map() {
    let json = r#"[{"a": 1}, {"a": "wrong"}]"#;
    let err = deserialize_tracked::<Vec<std::collections::HashMap<String, i32>>>(json).unwrap_err();
    assert_eq!(err, "[1].a");
}

#[test]
fn test_struct_with_vec_with_struct() {
    #[derive(Deserialize, Debug)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[derive(Deserialize, Debug)]
    struct Shape {
        points: Vec<Point>,
    }

    let json = r#"{"points": [{"x": 1, "y": 2}, {"x": "wrong", "y": 3}]}"#;
    let err = deserialize_tracked::<Shape>(json).unwrap_err();
    assert_eq!(err, "points[1].x");
}

#[test]
fn test_long_key_name() {
    // Test with a key longer than 255 bytes
    // Keys are capped at u8::MAX (255 bytes) due to the length field being a u8
    let long_key = "a".repeat(300);
    let expected_key = "a".repeat(255); // Capped at u8::MAX
    let json = format!(r#"{{"{}": "not an int"}}"#, long_key);
    let err = deserialize_tracked::<std::collections::HashMap<String, i32>>(&json).unwrap_err();
    // The error path contains the key, truncated to 255 bytes
    assert_eq!(
        err, expected_key,
        "Keys longer than 255 bytes are truncated"
    );
}

#[test]
fn test_deeply_nested_arrays() {
    let json = r#"[[[[[1, 2, "wrong"]]]]]]"#;
    let err = deserialize_tracked::<Vec<Vec<Vec<Vec<Vec<i32>>>>>>(json).unwrap_err();
    assert_eq!(err, "[0][0][0][0][2]");
}

#[test]
fn test_newtype_struct() {
    #[derive(Deserialize, Debug)]
    struct UserId(i32);

    #[derive(Deserialize, Debug)]
    struct User {
        id: UserId,
    }

    let json = r#"{"id": "not an int"}"#;
    let err = deserialize_tracked::<User>(json).unwrap_err();
    assert_eq!(err, "id");
}

#[test]
fn test_tuple_struct() {
    #[derive(Deserialize, Debug)]
    struct Point(i32, i32, i32);

    let json = r#"[1, 2, "wrong"]"#;
    let err = deserialize_tracked::<Point>(json).unwrap_err();
    assert_eq!(err, "[2]");
}

#[test]
fn test_buffer_push_pop_symmetry() {
    // This test exercises the stack discipline of push_bytes and pop_bytes
    // by deserializing multiple sequential map entries
    let json = r#"{
        "first": 1,
        "second": 2,
        "third": "wrong"
    }"#;

    let err = deserialize_tracked::<std::collections::HashMap<String, i32>>(json).unwrap_err();
    assert_eq!(err, "third");
}

#[test]
fn test_sequential_arrays() {
    // Tests buffer cleanup between array elements
    let json = r#"[[1, 2], [3, 4], [5, "wrong"]]"#;
    let err = deserialize_tracked::<Vec<Vec<i32>>>(json).unwrap_err();
    assert_eq!(err, "[2][1]");
}

#[test]
fn test_interleaved_maps_and_arrays() {
    // Complex scenario testing buffer management
    #[derive(Deserialize, Debug)]
    struct Item {
        id: i32,
        tags: Vec<String>,
    }

    let json = r#"{
        "items": [
            {"id": 1, "tags": ["a", "b"]},
            {"id": 2, "tags": ["c", "d"]},
            {"id": "wrong", "tags": []}
        ]
    }"#;

    let err =
        deserialize_tracked::<std::collections::HashMap<String, Vec<Item>>>(json).unwrap_err();
    assert_eq!(err, "items[2].id");
}

#[test]
fn test_valid_simple_struct() {
    #[derive(Deserialize, Debug)]
    struct Config {
        name: String,
        count: i32,
    }

    let json = r#"{"name": "test", "count": 42}"#;
    let config: Config = deserialize_tracked(json).unwrap();
    assert_eq!(config.name, "test");
    assert_eq!(config.count, 42);
}

#[test]
fn test_valid_nested_structure() {
    #[derive(Deserialize, Debug)]
    struct Inner {
        value: String,
    }

    #[derive(Deserialize, Debug)]
    struct Outer {
        inner: Inner,
        count: i32,
    }

    let json = r#"{"inner": {"value": "hello"}, "count": 10}"#;
    let outer: Outer = deserialize_tracked(json).unwrap();
    assert_eq!(outer.inner.value, "hello");
    assert_eq!(outer.count, 10);
}

#[test]
fn test_valid_array() {
    let json = r#"[1, 2, 3, 4, 5]"#;
    let vec: Vec<i32> = deserialize_tracked(json).unwrap();
    assert_eq!(vec, vec![1, 2, 3, 4, 5]);
}

#[test]
fn test_valid_map() {
    let json = r#"{"a": 1, "b": 2, "c": 3}"#;
    let map: std::collections::HashMap<String, i32> = deserialize_tracked(json).unwrap();
    assert_eq!(map.get("a"), Some(&1));
    assert_eq!(map.get("b"), Some(&2));
    assert_eq!(map.get("c"), Some(&3));
}
