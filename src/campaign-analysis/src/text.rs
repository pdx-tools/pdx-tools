//! Shared text and dictionary codecs. Equality uses text content.
use crate::{DecodeError, Decoder, Encoder, ReferenceError, RegistryMemory};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

/// Canonical text shared across snapshots. See `examples/market_goods.rs`
/// for dictionary decode, prepared resolution, commit, and byte counts.
#[derive(Debug, Default)]
pub struct TextRegistry {
    values: HashSet<Rc<str>>,
}
#[derive(Debug, Default)]
pub struct PreparedText {
    additions: HashSet<Rc<str>>,
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
        plan.additions.insert(Rc::clone(&value));
        value
    }
    pub fn commit(&mut self, plan: PreparedText) {
        self.values.extend(plan.additions);
    }
    pub fn memory(&self) -> RegistryMemory {
        let bytes = self.values.iter().map(|x| x.len()).sum();
        RegistryMemory {
            data_bytes: bytes,
            allocated_bytes: bytes,
            ..RegistryMemory::default()
        }
    }
}
impl PreparedText {
    pub fn added_bytes(&self) -> usize {
        self.additions.iter().map(|x| x.len()).sum()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_has_one_canonical_reference_in_each_registry() {
        let mut registry = TextRegistry::default();
        let mut plan = registry.prepare();
        let iron = registry.resolve(&mut plan, "iron");
        let again = registry.resolve(&mut plan, "iron");
        assert!(Rc::ptr_eq(&iron, &again));
        assert_eq!(plan.added_bytes(), 4);
        assert_eq!(registry.memory().data_bytes, 0);
        drop(again);
        assert_eq!(Rc::strong_count(&iron), 2);
        registry.commit(plan);
        assert_eq!(Rc::strong_count(&iron), 2);
        let mut plan = registry.prepare();
        let again = registry.resolve(&mut plan, "iron");
        assert!(Rc::ptr_eq(&iron, &again));
        assert_eq!(plan.added_bytes(), 0);
        registry.resolve(&mut plan, "wool");
        drop(plan);
        assert_eq!(registry.memory().data_bytes, 4);
    }
}
