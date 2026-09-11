//! Writes the twitter corpus in the Paradox binary format.
//!
//! The corpus is JSON, but the shape of the document — nested objects, arrays,
//! strings, integers and booleans — is also what a Paradox save holds. The
//! benchmark writes the same document as jomini binary, so that one model is
//! read from a text format and from a binary format, and only the format
//! changes between the measurements. JSON gives the text side, and therefore
//! the module does not write jomini text.
//!
//! A key is a 16 bit token, as a save of a game writes. The translation gives
//! each distinct key a token and hands back the table, which the deserializer
//! then reads as its token resolver. A string value stays a length prefixed
//! string, so the flavor still decodes 4754 of them.
//!
//! The binary format has no null. A field with a null value is not written,
//! which the models read as `None`, the same as a JSON null.

use jomini::binary::{BinaryFlavor, Token, TokenResolver};
use jomini::{Encoding, Scalar};
use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashMap;

/// The first token that this module gives to a key.
///
/// jomini keeps the ids below `0x0d5d` for the lexemes of the format, so the
/// keys start well above them.
const TOKEN_BASE: u16 = 0x2000;

/// The tokens that the translation gave to the keys of the document.
///
/// A game ships this table, and the deserializer needs it to name a field
/// again. Here the translation builds it.
#[derive(Debug, Default)]
pub struct TokenTable {
    names: Vec<String>,
    tokens: HashMap<String, u16>,
}

impl TokenTable {
    fn token_of(&mut self, name: &str) -> u16 {
        if let Some(token) = self.tokens.get(name) {
            return *token;
        }

        let token = TOKEN_BASE + self.names.len() as u16;
        self.names.push(String::from(name));
        self.tokens.insert(String::from(name), token);
        token
    }

    /// The number of distinct keys in the document.
    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn is_empty(&self) -> bool {
        self.names.is_empty()
    }
}

impl TokenResolver for TokenTable {
    fn resolve(&self, token: u16) -> Option<&str> {
        let index = token.checked_sub(TOKEN_BASE)?;
        self.names.get(usize::from(index)).map(String::as_str)
    }
}

/// The flavor of the corpus: UTF-8 text and IEEE floats.
///
/// A game gives its own flavor, because the games do not agree on how to write
/// a float. The corpus has no game behind it, so it writes the plain bytes.
#[derive(Debug, Clone, Copy)]
pub struct TwitterFlavor;

impl Encoding for TwitterFlavor {
    fn decode<'a>(&self, data: &'a [u8]) -> Cow<'a, str> {
        String::from_utf8_lossy(data)
    }
}

impl BinaryFlavor for TwitterFlavor {
    fn visit_f32(&self, data: [u8; 4]) -> f32 {
        f32::from_le_bytes(data)
    }

    fn visit_f64(&self, data: [u8; 8]) -> f64 {
        f64::from_le_bytes(data)
    }
}

/// Writes the document in the binary format, and the table of the tokens that
/// the deserializer needs to read it back.
pub fn to_binary(document: &Value) -> (Vec<u8>, TokenTable) {
    let mut out = Vec::new();
    let mut tokens = TokenTable::default();

    let root = document.as_object().expect("the document to be an object");
    for (key, value) in root {
        if value.is_null() {
            continue;
        }
        write_key(&mut out, &mut tokens, key);
        write_value(&mut out, &mut tokens, value);
    }

    (out, tokens)
}

fn write_key(out: &mut Vec<u8>, tokens: &mut TokenTable, key: &str) {
    Token::Id(tokens.token_of(key)).write(&mut *out).unwrap();
    Token::Equal.write(out).unwrap();
}

fn write_value(out: &mut Vec<u8>, tokens: &mut TokenTable, value: &Value) {
    match value {
        Value::Null => unreachable!("a null is not written"),
        Value::Bool(x) => Token::Bool(*x).write(out).unwrap(),
        Value::Number(x) => {
            let token = if let Some(x) = x.as_u64() {
                match u32::try_from(x) {
                    Ok(x) => Token::U32(x),
                    Err(_) => Token::U64(x),
                }
            } else if let Some(x) = x.as_i64() {
                match i32::try_from(x) {
                    Ok(x) => Token::I32(x),
                    Err(_) => Token::I64(x),
                }
            } else {
                Token::F64(x.as_f64().expect("a finite number").to_le_bytes())
            };
            token.write(out).unwrap();
        }
        Value::String(x) => Token::Quoted(Scalar::new(x.as_bytes())).write(out).unwrap(),
        Value::Array(elements) => {
            Token::Open.write(&mut *out).unwrap();
            for element in elements {
                write_value(out, tokens, element);
            }
            Token::Close.write(out).unwrap();
        }
        Value::Object(fields) => {
            Token::Open.write(&mut *out).unwrap();
            for (key, field) in fields {
                if field.is_null() {
                    continue;
                }
                write_key(out, tokens, key);
                write_value(out, tokens, field);
            }
            Token::Close.write(out).unwrap();
        }
    }
}
