//! Text dictionary codecs for the snapshot format.
use crate::{DecodeError, Decoder, Encoder, ReferenceError};
use std::collections::HashMap;
use std::rc::Rc;

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
