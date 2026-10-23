//! Shared text and dictionary codecs. Equality uses text content.
use crate::{DecodeError, Decoder, Encoder, ReferenceError, RegistryMemory};
use std::collections::HashMap;
use std::rc::Rc;

/// Canonical text shared across snapshots. See `examples/market_goods.rs`
/// for dictionary decode, prepared resolution, commit, and byte counts.
#[derive(Debug, Default)]
pub struct TextRegistry {
    values: HashMap<Rc<str>, Rc<str>>,
}
#[derive(Debug, Default)]
pub struct PreparedText {
    additions: HashMap<Rc<str>, Rc<str>>,
}
impl TextRegistry {
    pub fn prepare(&self) -> PreparedText {
        PreparedText::default()
    }
    /// Resolve text without changing the registry. Retain the returned reference
    /// in each key. Commit this plan only after memory admission succeeds.
    pub fn resolve(&self, plan: &mut PreparedText, text: &str) -> Rc<str> {
        if let Some(value) = self.values.get(text).or_else(|| plan.additions.get(text)) {
            return Rc::clone(value);
        }
        let value: Rc<str> = Rc::from(text);
        plan.additions.insert(Rc::clone(&value), Rc::clone(&value));
        value
    }
    pub fn commit(&mut self, plan: PreparedText) {
        self.values.extend(plan.additions);
    }
    pub fn memory(&self) -> RegistryMemory {
        let bytes = self.values.keys().map(|x| x.len()).sum();
        RegistryMemory {
            data_bytes: bytes,
            allocated_bytes: bytes,
            ..RegistryMemory::default()
        }
    }
}
impl PreparedText {
    pub fn added_bytes(&self) -> usize {
        self.additions.keys().map(|x| x.len()).sum()
    }
}

/// Encode each distinct text once. Row references follow the dictionary.
pub fn encode_text_dictionary<'a>(values: impl IntoIterator<Item = &'a str>, out: &mut Encoder) {
    let mut dictionary = Vec::new();
    let mut found = HashMap::new();
    let mut rows = Vec::new();
    for text in values {
        let next = found.len() as u32;
        let row = *found.entry(text).or_insert_with(|| {
            dictionary.push(text);
            next
        });
        rows.push(row);
    }
    out.serde(&dictionary);
    out.column(&rows);
}
/// Decode through a temporary dictionary and validate every row reference.
pub fn decode_text_dictionary(input: &mut Decoder<'_>) -> Result<Vec<Rc<str>>, DecodeError> {
    let dictionary: Vec<String> = input.serde()?;
    let dictionary: Vec<Rc<str>> = dictionary.into_iter().map(Rc::from).collect();
    input
        .column::<u32>()?
        .into_iter()
        .map(|row| {
            dictionary
                .get(row as usize)
                .map(Rc::clone)
                .ok_or(DecodeError::Reference(ReferenceError::Dictionary {
                    row,
                    rows: dictionary.len(),
                }))
        })
        .collect()
}
