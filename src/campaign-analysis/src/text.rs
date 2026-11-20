//! Text dictionaries. The binary form of a snapshot carries its own sorted
//! dictionary, and tables refer to its rows. A store keeps each text once
//! and gives it a [`TextId`] that is the same in every snapshot.
use crate::{
    AnalysisError, Columns, DecodeError, Decoder, Encoder, KeyError, ReferenceError, Registry,
    RegistryMemory, TableError,
};
use std::collections::HashMap;
use std::rc::Rc;

/// The ID of a text in a store dictionary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TextId(u32);

/// A row of the dictionary of one snapshot. Use it in table keys and
/// columns. Validation checks the row against the dictionary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TextRow(u32);
impl TextRow {
    pub fn new(row: u32) -> Self {
        Self(row)
    }
    pub fn get(self) -> u32 {
        self.0
    }
}

/// The texts of one snapshot, sorted and distinct, so row order is text
/// order. A store append shares each text with the store dictionary and
/// records its [`TextId`].
#[derive(Debug, Clone)]
pub struct Texts {
    texts: Vec<Rc<str>>,
    /// Empty until a store prepares the snapshot.
    ids: Vec<TextId>,
}
impl PartialEq for Texts {
    fn eq(&self, other: &Self) -> bool {
        self.texts == other.texts
    }
}
impl Texts {
    /// Texts must be strictly increasing.
    pub fn new<T: Into<Rc<str>>>(texts: impl IntoIterator<Item = T>) -> Result<Self, KeyError> {
        let texts: Vec<Rc<str>> = texts.into_iter().map(Into::into).collect();
        u32::try_from(texts.len()).map_err(|_| KeyError::TooManyRows)?;
        if let Some(pair) = texts.windows(2).find(|pair| pair[0] >= pair[1]) {
            return Err(if pair[0] == pair[1] {
                KeyError::Duplicate
            } else {
                KeyError::Unsorted
            });
        }
        Ok(Self {
            texts,
            ids: Vec::new(),
        })
    }
    pub fn len(&self) -> usize {
        self.texts.len()
    }
    pub fn is_empty(&self) -> bool {
        self.texts.is_empty()
    }
    pub fn find(&self, text: &str) -> Option<TextRow> {
        let row = self.texts.binary_search_by(|x| (**x).cmp(text)).ok()?;
        Some(TextRow(row as u32))
    }
    pub fn text(&self, row: TextRow) -> Option<&str> {
        self.texts.get(row.0 as usize).map(|text| &**text)
    }
    /// The store ID of a row. Only a stored snapshot has IDs.
    pub fn id(&self, row: TextRow) -> Option<TextId> {
        self.ids.get(row.0 as usize).copied()
    }
    pub fn check(&self, row: TextRow) -> Result<(), ReferenceError> {
        if (row.0 as usize) < self.len() {
            Ok(())
        } else {
            Err(ReferenceError::Dictionary {
                row: row.0,
                rows: self.len(),
            })
        }
    }
}
impl Columns for Texts {
    fn encode(&self, out: &mut Encoder) {
        out.serde(&self.texts.iter().map(|text| &**text).collect::<Vec<_>>());
    }
    fn decode(input: &mut Decoder<'_>) -> Result<Self, DecodeError> {
        let texts: Vec<String> = input.serde()?;
        Self::new(texts).map_err(|error| DecodeError::Table(TableError::Key(error)))
    }
    /// The text bytes belong to the store dictionary.
    fn heap_bytes(&self) -> usize {
        size_of_val(self.texts.as_slice()) + size_of_val(self.ids.as_slice())
    }
    fn allocated_bytes(&self) -> usize {
        self.texts.capacity() * size_of::<Rc<str>>() + self.ids.capacity() * size_of::<TextId>()
    }
}

/// A store dictionary. Declare one for each kind of text.
#[derive(Debug, Default)]
pub struct TextRegistry {
    texts: Vec<Rc<str>>,
    ids: HashMap<Rc<str>, TextId>,
}
#[derive(Debug)]
pub struct PreparedTexts {
    first: usize,
    new: Vec<Rc<str>>,
    bytes: usize,
}
impl PreparedTexts {
    pub fn added_bytes(&self) -> usize {
        self.bytes
    }
}
impl TextRegistry {
    /// Give each text of a snapshot its store ID without changing the
    /// registry. A new text gets the next free ID when the plan commits.
    pub fn prepare(&self, texts: &mut Texts) -> Result<PreparedTexts, AnalysisError> {
        let mut new = Vec::new();
        let ids = texts
            .texts
            .iter_mut()
            .map(|text| match self.ids.get(text) {
                Some(id) => {
                    *text = Rc::clone(&self.texts[id.0 as usize]);
                    Ok(*id)
                }
                None => {
                    let id = u32::try_from(self.texts.len() + new.len())
                        .map_err(|_| AnalysisError::MemoryFull)?;
                    new.push(Rc::clone(text));
                    Ok(TextId(id))
                }
            })
            .collect::<Result<_, AnalysisError>>()?;
        texts.ids = ids;
        Ok(PreparedTexts {
            first: self.texts.len(),
            bytes: new.iter().map(|text| text.len()).sum(),
            new,
        })
    }
    /// Commit a plan from the same exclusive append operation. Another
    /// commit in between would give its IDs away, so that is a bug.
    pub fn commit(&mut self, plan: PreparedTexts) {
        assert_eq!(plan.first, self.texts.len(), "a stale text plan");
        for text in plan.new {
            self.ids
                .insert(Rc::clone(&text), TextId(self.texts.len() as u32));
            self.texts.push(text);
        }
    }
    pub fn text(&self, id: TextId) -> Option<&str> {
        self.texts.get(id.0 as usize).map(|text| &**text)
    }
    pub fn memory(&self) -> RegistryMemory {
        let bytes = self.texts.iter().map(|text| text.len()).sum();
        RegistryMemory {
            data_bytes: bytes,
            allocated_bytes: bytes,
            lookup_bytes: self.texts.capacity() * size_of::<Rc<str>>()
                + self.ids.capacity() * (size_of::<(Rc<str>, TextId)>() + 1),
            indexes: 0,
        }
    }
}
impl Registry for TextRegistry {
    type Prepared = PreparedTexts;
    fn added_bytes(prepared: &PreparedTexts) -> usize {
        prepared.added_bytes()
    }
    fn commit(&mut self, prepared: PreparedTexts) {
        TextRegistry::commit(self, prepared);
    }
    fn memory(&self) -> RegistryMemory {
        TextRegistry::memory(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(values: &[&str]) -> Texts {
        Texts::new(values.iter().copied()).unwrap()
    }

    #[test]
    fn a_dictionary_is_sorted_and_distinct_and_survives_encoding() {
        assert_eq!(Texts::new(["b", "a"]).unwrap_err(), KeyError::Unsorted);
        assert_eq!(Texts::new(["a", "a"]).unwrap_err(), KeyError::Duplicate);
        let dictionary = texts(&["catholic", "orthodox"]);
        let row = dictionary.find("orthodox").unwrap();
        assert_eq!(dictionary.text(row), Some("orthodox"));
        assert_eq!(dictionary.find("sunni"), None);
        assert_eq!(dictionary.id(row), None);
        dictionary.check(row).unwrap();
        dictionary.check(TextRow::new(2)).unwrap_err();

        let mut out = Encoder::new();
        dictionary.encode(&mut out);
        let bytes = out.finish();
        assert_eq!(
            Texts::decode(&mut Decoder::new(&bytes)).unwrap(),
            dictionary
        );
        let mut out = Encoder::new();
        out.serde(&["b", "a"]);
        Texts::decode(&mut Decoder::new(&out.finish())).unwrap_err();
    }

    #[test]
    fn the_store_keeps_each_text_once_and_ids_are_stable() {
        let mut registry = TextRegistry::default();
        let mut first = texts(&["catholic", "orthodox"]);
        let plan = registry.prepare(&mut first).unwrap();
        assert_eq!(plan.added_bytes(), "catholicorthodox".len());
        assert_eq!(registry.memory().data_bytes, 0);
        registry.commit(plan);

        let mut second = texts(&["coptic", "orthodox"]);
        let plan = registry.prepare(&mut second).unwrap();
        assert_eq!(plan.added_bytes(), "coptic".len());
        registry.commit(plan);
        assert_eq!(registry.memory().data_bytes, "catholicorthodoxcoptic".len());

        let orthodox = |texts: &Texts| texts.id(texts.find("orthodox").unwrap()).unwrap();
        assert_eq!(orthodox(&first), orthodox(&second));
        assert_eq!(registry.text(orthodox(&second)), Some("orthodox"));
        let coptic = second.id(second.find("coptic").unwrap()).unwrap();
        assert_eq!(registry.text(coptic), Some("coptic"));
        // The snapshot shares the text of the store.
        assert!(Rc::ptr_eq(&second.texts[1], &registry.texts[1]));

        // A plan that does not commit changes nothing.
        let mut third = texts(&["sunni"]);
        let plan = registry.prepare(&mut third).unwrap();
        drop(plan);
        assert_eq!(registry.memory().data_bytes, "catholicorthodoxcoptic".len());
        assert_eq!(registry.texts.len(), 3);
    }

    #[test]
    #[should_panic(expected = "a stale text plan")]
    fn a_plan_from_before_another_commit_is_refused() {
        let mut registry = TextRegistry::default();
        let first = registry.prepare(&mut texts(&["catholic"])).unwrap();
        let second = registry.prepare(&mut texts(&["sunni"])).unwrap();
        registry.commit(first);
        registry.commit(second);
    }
}
