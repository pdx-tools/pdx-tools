//! Typed keys and immutable, aligned table columns.
use crate::{
    ColumnError, Columns, DecodeError, Decoder, Encoder, InlineKeys, KeyMemory, KeyStorage,
    RowColumns,
};
use std::cell::{Cell, OnceCell};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::ops::{Bound, RangeBounds};
use std::rc::Rc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeyError {
    TooManyRows,
    Duplicate,
    Unsorted,
    UnsortedPrefix,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TableError {
    Key(KeyError),
    Column(ColumnError),
    InTable {
        table: &'static str,
        source: Box<Self>,
    },
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RowError {
    ForeignIndex,
    OutOfBounds,
    Unordered,
    ReversedRange,
}

/// An opaque identity. A clear does not permit identity reuse.
/// Identities and row handles stay in the thread that owns their indexes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct IndexId(u64, std::marker::PhantomData<Rc<()>>);
thread_local! { static NEXT_INDEX: Cell<u64> = const { Cell::new(0) }; }
fn next_index() -> IndexId {
    NEXT_INDEX.with(|next| {
        let value = next
            .get()
            .checked_add(1)
            .expect("index identity must not wrap");
        next.set(value);
        IndexId(value, std::marker::PhantomData)
    })
}
#[derive(Debug)]
struct KeyIndex<K> {
    id: IndexId,
    keys: Vec<K>,
    sorted: bool,
    rows: OnceCell<HashMap<K, u32>>,
    prefix_sorted: bool,
}
/// A row can be used only with its original shared index.
#[derive(Debug, Clone, Copy)]
pub struct Row {
    index: IndexId,
    offset: u32,
}

/// A column with checked access. Nullable columns return `Some(None)` for
/// an absent measurement and `None` for an offset outside the column.
pub trait Column {
    type Value<'a>
    where
        Self: 'a;
    fn get_value(&self, offset: usize) -> Option<Self::Value<'_>>;
}
impl<T> Column for Vec<T> {
    type Value<'a>
        = &'a T
    where
        T: 'a;
    fn get_value(&self, offset: usize) -> Option<&T> {
        self.get(offset)
    }
}

/// A prefix is part of the key schema. Its order must agree with key order.
pub trait PrefixKey: Ord {
    type Prefix: Ord + ?Sized;
    fn prefix(&self) -> &Self::Prefix;
}

#[derive(Debug, Clone)]
pub struct Table<K, C> {
    index: Rc<KeyIndex<K>>,
    columns: C,
}
impl<K: PartialEq, C: PartialEq> PartialEq for Table<K, C> {
    fn eq(&self, other: &Self) -> bool {
        self.index.keys == other.index.keys && self.columns == other.columns
    }
}
impl<K: Ord, C: RowColumns> Table<K, C> {
    /// Construct an analytical table. Keys must be strictly increasing.
    pub fn sorted(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        Self::new(keys, columns, true)
    }
    /// Preserve map order. Only this policy permits a lazy hash lookup.
    pub fn map_order(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        Self::new(keys, columns, false)
    }
    fn new(keys: Vec<K>, columns: C, require_sorted: bool) -> Result<Self, TableError> {
        Self::new_inner(keys, columns, require_sorted)
            .map_err(|error| error.in_table(C::table_name()))
    }
    fn new_inner(keys: Vec<K>, columns: C, require_sorted: bool) -> Result<Self, TableError> {
        u32::try_from(keys.len()).map_err(|_| TableError::Key(KeyError::TooManyRows))?;
        let sorted = keys.is_sorted();
        if require_sorted && !sorted {
            return Err(TableError::Key(KeyError::Unsorted));
        }
        let duplicate = if sorted {
            keys.windows(2).any(|x| x[0] == x[1])
        } else {
            let mut refs: Vec<_> = keys.iter().collect();
            refs.sort_unstable();
            refs.windows(2).any(|x| x[0] == x[1])
        };
        if duplicate {
            return Err(TableError::Key(KeyError::Duplicate));
        }
        columns.check_rows(keys.len()).map_err(TableError::Column)?;
        Ok(Self {
            index: Rc::new(KeyIndex {
                id: next_index(),
                keys,
                sorted,
                rows: OnceCell::new(),
                prefix_sorted: false,
            }),
            columns,
        })
    }
    /// Construct a sorted composite table and check the declared prefix order.
    /// Use this constructor with `prefix_range`. See `examples/market_goods.rs`.
    pub fn sorted_prefix(keys: Vec<K>, columns: C) -> Result<Self, TableError>
    where
        K: PrefixKey,
    {
        if keys.windows(2).any(|x| x[0].prefix() > x[1].prefix()) {
            return Err(TableError::Key(KeyError::UnsortedPrefix).in_table(C::table_name()));
        }
        let mut table = Self::sorted(keys, columns)?;
        Rc::get_mut(&mut table.index)
            .expect("new index")
            .prefix_sorted = true;
        Ok(table)
    }
    /// The schema supplies the ordering policy; bytes cannot select it.
    pub fn decode_sorted_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError> {
        let keys = keys(input).map_err(|error| error.in_table(C::table_name()))?;
        Self::sorted(
            keys,
            C::decode(input).map_err(|error| error.in_table(C::table_name()))?,
        )
        .map_err(DecodeError::Table)
    }
    pub fn decode_sorted_prefix_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError>
    where
        K: PrefixKey,
    {
        let keys = keys(input).map_err(|error| error.in_table(C::table_name()))?;
        Self::sorted_prefix(
            keys,
            C::decode(input).map_err(|error| error.in_table(C::table_name()))?,
        )
        .map_err(DecodeError::Table)
    }
    pub fn decode_map_order_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError> {
        let keys = keys(input).map_err(|error| error.in_table(C::table_name()))?;
        Self::map_order(
            keys,
            C::decode(input).map_err(|error| error.in_table(C::table_name()))?,
        )
        .map_err(DecodeError::Table)
    }
}
impl<K: Ord + Clone + Hash, C> Table<K, C> {
    pub fn row(&self, key: &K) -> Option<Row> {
        let offset = if self.index.sorted {
            self.index.keys.binary_search(key).ok().map(|x| x as u32)
        } else {
            self.index
                .rows
                .get_or_init(|| {
                    self.keys()
                        .iter()
                        .cloned()
                        .enumerate()
                        .map(|(i, k)| (k, i as u32))
                        .collect()
                })
                .get(key)
                .copied()
        }?;
        Some(Row {
            index: self.index.id,
            offset,
        })
    }
}
impl<K: PartialEq, C> Table<K, C> {
    /// Replace allocations while preserving key content and order. Use this
    /// operation to resolve text through a prepared text registry.
    pub fn canonicalize_keys(&mut self, mut resolve: impl FnMut(&K) -> K) {
        let keys: Vec<_> = self
            .keys()
            .iter()
            .map(|key| {
                let canonical = resolve(key);
                assert!(canonical == *key, "canonical keys must preserve identity");
                canonical
            })
            .collect();
        self.index = Rc::new(KeyIndex {
            id: next_index(),
            keys,
            sorted: self.index.sorted,
            prefix_sorted: self.index.prefix_sorted,
            rows: OnceCell::new(),
        });
    }
}
impl<K, C: Columns> Table<K, C> {
    /// Encode keys through a domain codec, then encode the aligned columns.
    pub fn encode_with(&self, out: &mut Encoder, keys: impl FnOnce(&[K], &mut Encoder)) {
        keys(self.keys(), out);
        self.columns.encode(out);
    }
}
impl<K, C> Table<K, C> {
    pub fn keys(&self) -> &[K] {
        &self.index.keys
    }
    pub fn columns(&self) -> &C {
        &self.columns
    }
    pub fn len(&self) -> usize {
        self.keys().len()
    }
    pub fn is_empty(&self) -> bool {
        self.keys().is_empty()
    }
    pub fn index_id(&self) -> IndexId {
        self.index.id
    }
    pub fn rows(&self) -> impl ExactSizeIterator<Item = Row> + '_ {
        (0..self.len() as u32).map(|offset| Row {
            index: self.index.id,
            offset,
        })
    }
    fn offset(&self, row: Row) -> Result<usize, RowError> {
        if row.index != self.index.id {
            return Err(RowError::ForeignIndex);
        }
        let offset = row.offset as usize;
        if offset >= self.len() {
            return Err(RowError::OutOfBounds);
        }
        Ok(offset)
    }
    pub fn key(&self, row: Row) -> Result<&K, RowError> {
        self.keys()
            .get(self.offset(row)?)
            .ok_or(RowError::OutOfBounds)
    }
    pub fn value<A: Column>(
        &self,
        row: Row,
        column: impl FnOnce(&C) -> &A,
    ) -> Result<A::Value<'_>, RowError> {
        let offset = self.offset(row)?;
        column(&self.columns)
            .get_value(offset)
            .ok_or(RowError::OutOfBounds)
    }
}
impl<K: Ord, C> Table<K, C> {
    /// Borrow a key interval without allocating offsets.
    pub fn range(&self, bounds: impl RangeBounds<K>) -> Result<RowRange<'_, K, C>, RowError> {
        if !self.index.sorted {
            return Err(RowError::Unordered);
        }
        match (bounds.start_bound(), bounds.end_bound()) {
            (
                Bound::Included(start) | Bound::Excluded(start),
                Bound::Included(end) | Bound::Excluded(end),
            ) if start > end
                || (start == end
                    && matches!(
                        (bounds.start_bound(), bounds.end_bound()),
                        (Bound::Excluded(_), Bound::Excluded(_))
                    )) =>
            {
                return Err(RowError::ReversedRange);
            }
            _ => (),
        }
        let start = match bounds.start_bound() {
            Bound::Unbounded => 0,
            Bound::Included(k) => self.keys().partition_point(|v| v < k),
            Bound::Excluded(k) => self.keys().partition_point(|v| v <= k),
        };
        let end = match bounds.end_bound() {
            Bound::Unbounded => self.len(),
            Bound::Included(k) => self.keys().partition_point(|v| v <= k),
            Bound::Excluded(k) => self.keys().partition_point(|v| v < k),
        };
        if start > end {
            return Err(RowError::ReversedRange);
        }
        Ok(RowRange {
            table: self,
            start,
            end,
        })
    }
    /// Read one checked schema prefix. Empty and absent prefixes borrow an
    /// empty interval. Construct this table with `sorted_prefix`.
    pub fn prefix_range(&self, prefix: &K::Prefix) -> Result<RowRange<'_, K, C>, RowError>
    where
        K: PrefixKey,
    {
        if !self.index.sorted {
            return Err(RowError::Unordered);
        }
        if !self.index.prefix_sorted {
            return Err(RowError::Unordered);
        }
        let start = self.keys().partition_point(|k| k.prefix() < prefix);
        let end = self.keys().partition_point(|k| k.prefix() <= prefix);
        Ok(RowRange {
            table: self,
            start,
            end,
        })
    }
}
/// A borrowed interval bound to a shared key index.
#[derive(Debug)]
pub struct RowRange<'a, K, C> {
    table: &'a Table<K, C>,
    start: usize,
    end: usize,
}
impl<'a, K, C> RowRange<'a, K, C> {
    pub fn len(&self) -> usize {
        self.end - self.start
    }
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
    pub fn keys(&self) -> &[K] {
        &self.table.keys()[self.start..self.end]
    }
    pub fn bind<D>(&self, table: &'a Table<K, D>) -> Result<RowRange<'a, K, D>, RowError> {
        if self.table.index.id != table.index.id {
            return Err(RowError::ForeignIndex);
        }
        Ok(RowRange {
            table,
            start: self.start,
            end: self.end,
        })
    }
    pub fn values<'b, A: Column + 'b>(
        &'b self,
        column: impl FnOnce(&C) -> &A,
    ) -> impl ExactSizeIterator<Item = A::Value<'b>>
    where
        'a: 'b,
    {
        let column = column(self.table.columns());
        (self.start..self.end).map(move |i| column.get_value(i).expect("validated aligned column"))
    }
}
#[derive(Debug)]
enum ResolvedRows {
    MissingKey,
    Rows(Box<[u32]>),
}
/// A borrowed selection with one cached resolution for each encountered index.
/// Use `resolve_bound` to read each table. Use `resolve` and `bind` to read
/// another snapshot with the same index. See the EU4 province query.
#[derive(Debug)]
pub struct RowSelect<'q, K> {
    keys: &'q [K],
    cache: Vec<(IndexId, ResolvedRows)>,
}
#[derive(Debug)]
pub enum SelectionRows<'a> {
    EmptySelection,
    MissingKey,
    Rows(ResolvedBatch<'a>),
}
/// A selection resolved and bound to the table supplied to `resolve_bound`.
#[derive(Debug)]
pub enum BoundSelectionRows<'t, 'r, K, C> {
    EmptySelection,
    MissingKey,
    Rows(BoundRows<'t, 'r, K, C>),
}
#[derive(Debug)]
pub struct ResolvedBatch<'a> {
    index: IndexId,
    offsets: &'a [u32],
}
#[derive(Debug)]
pub struct BoundRows<'a, 'b, K, C> {
    table: &'a Table<K, C>,
    offsets: &'b [u32],
}
impl<'q, K> RowSelect<'q, K> {
    pub fn new(keys: &'q [K]) -> Self {
        Self {
            keys,
            cache: Vec::new(),
        }
    }
}
impl<K: Ord + Clone + Hash> RowSelect<'_, K> {
    /// Resolve and bind in one operation. The resolved offsets come from this
    /// table, so no rebinding identity check is required.
    pub fn resolve_bound<'r, 't, C>(
        &'r mut self,
        table: &'t Table<K, C>,
    ) -> BoundSelectionRows<'t, 'r, K, C> {
        match self.resolve(table) {
            SelectionRows::EmptySelection => BoundSelectionRows::EmptySelection,
            SelectionRows::MissingKey => BoundSelectionRows::MissingKey,
            SelectionRows::Rows(rows) => BoundSelectionRows::Rows(BoundRows {
                table,
                offsets: rows.offsets,
            }),
        }
    }
    pub fn resolve<C>(&mut self, table: &Table<K, C>) -> SelectionRows<'_> {
        if self.keys.is_empty() {
            return SelectionRows::EmptySelection;
        }
        let at = match self.cache.iter().position(|(id, _)| *id == table.index.id) {
            Some(at) => at,
            None => {
                let rows: Option<Box<[u32]>> = self
                    .keys
                    .iter()
                    .map(|key| table.row(key).map(|row| row.offset))
                    .collect();
                self.cache.push((
                    table.index.id,
                    rows.map_or(ResolvedRows::MissingKey, ResolvedRows::Rows),
                ));
                self.cache.len() - 1
            }
        };
        match &self.cache[at].1 {
            ResolvedRows::MissingKey => SelectionRows::MissingKey,
            ResolvedRows::Rows(offsets) => SelectionRows::Rows(ResolvedBatch {
                index: table.index.id,
                offsets,
            }),
        }
    }
}
impl<'b> ResolvedBatch<'b> {
    pub fn bind<'a, K, C>(
        &self,
        table: &'a Table<K, C>,
    ) -> Result<BoundRows<'a, 'b, K, C>, RowError> {
        if self.index != table.index.id {
            return Err(RowError::ForeignIndex);
        }
        Ok(BoundRows {
            table,
            offsets: self.offsets,
        })
    }
}
impl<K, C> BoundRows<'_, '_, K, C> {
    pub fn values<'a, A: Column + 'a>(
        &'a self,
        column: impl FnOnce(&C) -> &A,
    ) -> impl ExactSizeIterator<Item = A::Value<'a>> {
        let column = column(self.table.columns());
        self.offsets.iter().map(move |i| {
            column
                .get_value(*i as usize)
                .expect("validated aligned column")
        })
    }
}

/// A typed registry. Fingerprint collisions use exact ordered-key comparison.
/// Declare one registry for each table schema. See `examples/market_goods.rs`
/// for a prepared append with both index and text registry plans.
#[derive(Debug)]
pub struct IndexRegistry<K, M = InlineKeys> {
    buckets: HashMap<u64, Vec<RegisteredIndex<K>>>,
    layouts: HashMap<String, Rc<KeyIndex<K>>>,
    memory: std::marker::PhantomData<M>,
}
#[derive(Debug)]
struct RegisteredIndex<K> {
    index: Rc<KeyIndex<K>>,
    memory: KeyMemory,
}
impl<K, M> Default for IndexRegistry<K, M> {
    fn default() -> Self {
        Self {
            buckets: HashMap::new(),
            layouts: HashMap::new(),
            memory: std::marker::PhantomData,
        }
    }
}
#[derive(Debug)]
pub struct PreparedIndex<K> {
    hash: u64,
    index: Rc<KeyIndex<K>>,
    new: bool,
    layout: Option<String>,
    memory: KeyMemory,
}
impl<K> PreparedIndex<K> {
    pub fn added_bytes(&self) -> usize {
        if self.new { self.memory.data_bytes } else { 0 }
    }
}
#[derive(Debug, Default, Clone, Copy)]
pub struct RegistryMemory {
    pub data_bytes: usize,
    pub allocated_bytes: usize,
    pub lookup_bytes: usize,
    pub indexes: usize,
}
impl std::ops::Add for RegistryMemory {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Self {
            data_bytes: self.data_bytes + rhs.data_bytes,
            allocated_bytes: self.allocated_bytes + rhs.allocated_bytes,
            lookup_bytes: self.lookup_bytes + rhs.lookup_bytes,
            indexes: self.indexes + rhs.indexes,
        }
    }
}
impl<K: Eq + Hash, M: KeyStorage<K>> IndexRegistry<K, M> {
    /// Prepare sharing without changing the registry or an existing lookup.
    pub fn prepare<C>(
        &self,
        table: &mut Table<K, C>,
        layout: Option<&str>,
    ) -> Result<PreparedIndex<K>, crate::AnalysisError> {
        if let Some(index) = layout.and_then(|name| self.layouts.get(name)) {
            if index.keys != table.index.keys || index.prefix_sorted != table.index.prefix_sorted {
                return Err(crate::AnalysisError::IncompatibleLayout);
            }
            table.index = Rc::clone(index);
            return Ok(PreparedIndex {
                hash: 0,
                index: Rc::clone(&table.index),
                new: false,
                layout: None,
                memory: KeyMemory::default(),
            });
        }
        let mut hash = std::hash::DefaultHasher::new();
        table.keys().hash(&mut hash);
        self.prepare_hash(table, layout, hash.finish())
    }
    fn prepare_hash<C>(
        &self,
        table: &mut Table<K, C>,
        layout: Option<&str>,
        hash: u64,
    ) -> Result<PreparedIndex<K>, crate::AnalysisError> {
        if layout
            .and_then(|key| self.layouts.get(key))
            .is_some_and(|index| index.keys != table.index.keys)
        {
            return Err(crate::AnalysisError::IncompatibleLayout);
        }
        let existing = self.buckets.get(&hash).and_then(|bucket| {
            bucket.iter().map(|entry| &entry.index).find(|index| {
                index.keys == table.index.keys && index.prefix_sorted == table.index.prefix_sorted
            })
        });
        if let Some(index) = existing {
            table.index = Rc::clone(index);
        }
        let memory = if existing.is_none() {
            let extra = M::extra_memory(table.keys());
            KeyMemory {
                data_bytes: table
                    .len()
                    .checked_mul(size_of::<K>())
                    .and_then(|bytes| bytes.checked_add(extra.data_bytes))
                    .ok_or(crate::AnalysisError::MemoryFull)?,
                allocated_bytes: table
                    .index
                    .keys
                    .capacity()
                    .checked_mul(size_of::<K>())
                    .and_then(|bytes| bytes.checked_add(extra.allocated_bytes))
                    .ok_or(crate::AnalysisError::MemoryFull)?,
            }
        } else {
            KeyMemory::default()
        };
        Ok(PreparedIndex {
            hash,
            index: Rc::clone(&table.index),
            new: existing.is_none(),
            layout: layout.map(str::to_owned),
            memory,
        })
    }
}
impl<K, M> IndexRegistry<K, M> {
    /// Commit a plan from the same exclusive append operation.
    pub fn commit(&mut self, plan: PreparedIndex<K>) {
        if plan.new {
            self.buckets
                .entry(plan.hash)
                .or_default()
                .push(RegisteredIndex {
                    index: Rc::clone(&plan.index),
                    memory: plan.memory,
                });
        }
        if let Some(layout) = plan.layout {
            self.layouts.insert(layout, plan.index);
        }
    }
    pub fn memory(&self) -> RegistryMemory {
        let mut result = RegistryMemory::default();
        for entry in self.buckets.values().flatten() {
            let index = &entry.index;
            result.indexes += 1;
            result.data_bytes += entry.memory.data_bytes;
            result.allocated_bytes += entry.memory.allocated_bytes;
            result.lookup_bytes += index.rows.get().map_or(0, |rows| {
                rows.capacity() * (size_of::<(K, u32)>() + 1) + entry.memory.allocated_bytes
                    - index.keys.capacity() * size_of::<K>()
            });
        }
        result
    }
}

impl std::fmt::Display for KeyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::TooManyRows => "Table row count exceeds u32",
            Self::Duplicate => "Table has duplicate keys",
            Self::Unsorted => "Analytical table keys are not sorted",
            Self::UnsortedPrefix => "Table prefixes are not sorted",
        })
    }
}
impl std::error::Error for KeyError {}
impl std::fmt::Display for TableError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Key(error) => error.fmt(f),
            Self::Column(error) => error.fmt(f),
            Self::InTable { table, source } => write!(f, "Table {table}: {source}"),
        }
    }
}
impl TableError {
    pub fn in_table(self, table: &'static str) -> Self {
        Self::InTable {
            table,
            source: Box::new(self),
        }
    }
}
impl std::error::Error for TableError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Key(error) => Some(error),
            Self::Column(error) => Some(error),
            Self::InTable { source, .. } => Some(source.as_ref()),
        }
    }
}
impl std::fmt::Display for RowError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::ForeignIndex => "Row or range belongs to another key index",
            Self::OutOfBounds => "Row is outside the column",
            Self::Unordered => "Table ordering does not support this range",
            Self::ReversedRange => "Range bounds are reversed",
        })
    }
}
impl std::error::Error for RowError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bound_resolution_reads_each_snapshots_columns() {
        let mut registry = IndexRegistry::<u32>::default();
        let mut first = Table::map_order(vec![2u32, 1], vec![20u8, 10]).unwrap();
        let plan = registry.prepare(&mut first, None).unwrap();
        registry.commit(plan);
        let mut equal = Table::map_order(vec![2u32, 1], vec![200u8, 100]).unwrap();
        let plan = registry.prepare(&mut equal, None).unwrap();
        registry.commit(plan);
        let changed = Table::map_order(vec![1u32, 2], vec![11u8, 21]).unwrap();
        let mut select = RowSelect::new(&[1, 2]);
        for (table, expected) in [
            (&first, [10, 20]),
            (&equal, [100, 200]),
            (&changed, [11, 21]),
            (&first, [10, 20]),
        ] {
            let BoundSelectionRows::Rows(rows) = select.resolve_bound(table) else {
                panic!("resolved rows");
            };
            assert_eq!(rows.values(|v| v).copied().collect::<Vec<_>>(), expected);
        }
        assert_eq!(select.cache.len(), 2);
        assert!(matches!(
            RowSelect::new(&[]).resolve_bound(&first),
            BoundSelectionRows::EmptySelection
        ));
        assert!(matches!(
            RowSelect::new(&[3]).resolve_bound(&first),
            BoundSelectionRows::MissingKey
        ));
    }

    #[test]
    fn construction_and_encoding_do_not_require_clone_or_hash() {
        #[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
        struct Ordered(u32);
        let mut table = Table::sorted(vec![Ordered(1)], vec![7u8]).unwrap();
        table.canonicalize_keys(|key| Ordered(key.0));
        let mut out = Encoder::new();
        table.encode_with(&mut out, |keys, out| out.column(&[keys[0].0]));
        let bytes = out.finish();
        let decoded =
            Table::<Ordered, Vec<u8>>::decode_sorted_with(&mut Decoder::new(&bytes), |input| {
                Ok(input.column::<u32>()?.into_iter().map(Ordered).collect())
            })
            .unwrap();
        assert_eq!(table, decoded);

        #[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct Key(u32);
        struct Storage;
        impl KeyStorage<Key> for Storage {
            fn extra_memory(_: &[Key]) -> KeyMemory {
                KeyMemory::default()
            }
        }
        let mut registry = IndexRegistry::<Key, Storage>::default();
        let mut table = Table::sorted(vec![Key(1)], vec![7u8]).unwrap();
        let plan = registry.prepare(&mut table, None).unwrap();
        registry.commit(plan);
        assert_eq!(registry.memory().data_bytes, size_of::<Key>());
        struct Unconstrained;
        assert_eq!(
            IndexRegistry::<Unconstrained>::default().memory().indexes,
            0
        );
    }

    #[test]
    fn owned_key_memory_is_counted_once_and_capacity_is_separate() {
        let mut text = String::with_capacity(128);
        text.push_str("iron");
        let capacity = text.capacity();
        let mut keys = Vec::with_capacity(4);
        keys.push(text);
        let key_capacity = keys.capacity();
        let mut first = Table::sorted(keys, vec![1u8]).unwrap();
        let mut registry = IndexRegistry::<String, crate::StringKeys>::default();
        let plan = registry.prepare(&mut first, None).unwrap();
        assert_eq!(plan.added_bytes(), size_of::<String>() + 4);
        assert_eq!(registry.memory().data_bytes, 0);
        drop(plan);
        assert_eq!(registry.memory().indexes, 0);
        let plan = registry.prepare(&mut first, None).unwrap();
        registry.commit(plan);
        assert_eq!(registry.memory().data_bytes, size_of::<String>() + 4);
        assert_eq!(
            registry.memory().allocated_bytes,
            key_capacity * size_of::<String>() + capacity
        );
        let mut equal = Table::sorted(vec![String::from("iron")], vec![2u8]).unwrap();
        let plan = registry.prepare(&mut equal, None).unwrap();
        assert_eq!(plan.added_bytes(), 0);
        registry.commit(plan);
        assert_eq!(first.index_id(), equal.index_id());
        assert_eq!(
            registry.memory().allocated_bytes,
            key_capacity * size_of::<String>() + capacity
        );
    }

    #[test]
    fn key_memory_overflow_does_not_change_the_registry() {
        struct Overflow;
        impl KeyStorage<u32> for Overflow {
            fn extra_memory(_: &[u32]) -> KeyMemory {
                KeyMemory {
                    data_bytes: usize::MAX,
                    allocated_bytes: 0,
                }
            }
        }
        let registry = IndexRegistry::<u32, Overflow>::default();
        let mut table = Table::sorted(vec![1u32], vec![1u8]).unwrap();
        assert_eq!(
            registry.prepare(&mut table, None).unwrap_err(),
            crate::AnalysisError::MemoryFull
        );
        assert_eq!(registry.memory().indexes, 0);
    }

    #[test]
    fn analytical_keys_are_strict_and_map_lookup_is_lazy() {
        for keys in [vec![2u32, 1], vec![1, 1]] {
            Table::sorted(keys, vec![1u8, 2]).unwrap_err();
        }
        Table::map_order(vec![1u32, 1], vec![1u8, 2]).unwrap_err();
        Table::sorted(vec![1u32], vec![1u8, 2]).unwrap_err();
        let sorted = Table::sorted(vec![1u32, 2], vec![10u8, 20]).unwrap();
        assert!(sorted.row(&2).is_some());
        assert!(sorted.index.rows.get().is_none());
        let mut table = Table::map_order(vec![2u32, 1], vec![20u8, 10]).unwrap();
        assert!(table.index.rows.get().is_none());
        let mut registry = IndexRegistry::<u32>::default();
        let prepared = registry.prepare(&mut table, Some("map")).unwrap();
        assert_eq!(registry.memory().indexes, 0);
        registry.commit(prepared);
        assert_eq!(registry.memory().lookup_bytes, 0);
        assert_eq!(*table.value(table.row(&1).unwrap(), |v| v).unwrap(), 10);
        assert!(registry.memory().lookup_bytes > 0);
        assert_eq!(table.range(1..=2).unwrap_err(), RowError::Unordered);
    }

    #[test]
    fn prefix_order_is_checked_separately_from_key_order() {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct Key {
            order: u8,
            prefix: u8,
        }
        impl PrefixKey for Key {
            type Prefix = u8;
            fn prefix(&self) -> &u8 {
                &self.prefix
            }
        }
        assert_eq!(
            Table::sorted_prefix(
                vec![
                    Key {
                        order: 0,
                        prefix: 2
                    },
                    Key {
                        order: 1,
                        prefix: 1
                    }
                ],
                vec![1u8, 2]
            )
            .unwrap_err(),
            TableError::Key(KeyError::UnsortedPrefix).in_table(std::any::type_name::<Vec<u8>>())
        );
    }

    #[test]
    fn foreign_rows_and_resolved_batches_fail_in_every_build() {
        let a = Table::sorted(vec![1u32, 2], vec![10u32, 20]).unwrap();
        let b = Table::sorted(vec![1u32, 2], vec![30u32, 40]).unwrap();
        let row = a.row(&1).unwrap();
        assert_eq!(b.value(row, |v| v).unwrap_err(), RowError::ForeignIndex);
        assert_eq!(b.key(row).unwrap_err(), RowError::ForeignIndex);
        let keys = [1];
        let mut select = RowSelect::new(&keys);
        let SelectionRows::Rows(batch) = select.resolve(&a) else {
            panic!("resolved")
        };
        assert_eq!(batch.bind(&b).unwrap_err(), RowError::ForeignIndex);
        assert_eq!(
            batch
                .bind(&a)
                .unwrap()
                .values(|v| v)
                .copied()
                .collect::<Vec<_>>(),
            [10]
        );
        let touched = Cell::new(false);
        assert_eq!(
            b.value(row, |v| {
                touched.set(true);
                v
            })
            .unwrap_err(),
            RowError::ForeignIndex
        );
        assert!(!touched.get());
        assert_eq!(
            a.range((Bound::Included(9), Bound::Excluded(8)))
                .unwrap_err(),
            RowError::ReversedRange
        );
        let out = Row {
            index: a.index_id(),
            offset: u32::MAX,
        };
        assert_eq!(a.value(out, |v| v).unwrap_err(), RowError::OutOfBounds);
    }

    #[test]
    fn selection_cache_checks_changed_order_and_missing_and_empty_keys() {
        let a = Table::map_order(vec![2u32, 1], vec![20u32, 10]).unwrap();
        let b = Table::map_order(vec![1u32, 2], vec![100u32, 200]).unwrap();
        let keys = [1, 2];
        let mut select = RowSelect::new(&keys);
        for (table, expected) in [(&a, vec![10, 20]), (&b, vec![100, 200]), (&a, vec![10, 20])] {
            let SelectionRows::Rows(batch) = select.resolve(table) else {
                panic!("resolved")
            };
            assert_eq!(
                batch
                    .bind(table)
                    .unwrap()
                    .values(|v| v)
                    .copied()
                    .collect::<Vec<_>>(),
                expected
            );
        }
        assert_eq!(select.cache.len(), 2);
        assert!(matches!(
            RowSelect::new(&[]).resolve(&a),
            SelectionRows::EmptySelection
        ));
        assert!(matches!(
            RowSelect::new(&[3]).resolve(&a),
            SelectionRows::MissingKey
        ));
    }

    #[test]
    fn equal_keys_share_across_geographic_layout_names() {
        let mut registry = IndexRegistry::<u32>::default();
        let mut a = Table::map_order(vec![2u32, 1], vec![20u8, 10]).unwrap();
        let plan = registry.prepare(&mut a, Some("first-map")).unwrap();
        registry.commit(plan);
        let mut b = Table::map_order(vec![2u32, 1], vec![30u8, 40]).unwrap();
        let plan = registry.prepare(&mut b, Some("second-map")).unwrap();
        assert_eq!(plan.added_bytes(), 0);
        registry.commit(plan);
        assert_eq!(a.index_id(), b.index_id());
        assert_eq!(registry.memory().indexes, 1);
        let mut changed = Table::map_order(vec![1u32, 2], vec![40u8, 30]).unwrap();
        assert_eq!(
            registry
                .prepare(&mut changed, Some("first-map"))
                .unwrap_err(),
            crate::AnalysisError::IncompatibleLayout
        );
    }

    #[test]
    fn collisions_require_equal_ordered_keys_and_clear_never_reuses_identity() {
        let mut registry = IndexRegistry::<u32>::default();
        let mut a = Table::sorted(vec![1u32, 2], vec![10u8, 20]).unwrap();
        let mut b = Table::sorted(vec![1u32, 3], vec![10u8, 30]).unwrap();
        let mut equal = Table::sorted(vec![1u32, 2], vec![11u8, 21]).unwrap();
        let plan = registry.prepare_hash(&mut a, None, 7).unwrap();
        registry.commit(plan);
        let plan = registry.prepare_hash(&mut b, None, 7).unwrap();
        registry.commit(plan);
        let plan = registry.prepare_hash(&mut equal, None, 7).unwrap();
        registry.commit(plan);
        assert_ne!(a.index_id(), b.index_id());
        assert_eq!(a.index_id(), equal.index_id());
        assert_eq!(registry.memory().indexes, 2);
        let id = a.index_id();
        drop(registry);
        drop(a);
        drop(equal);
        let next = Table::sorted(vec![1u32, 2], vec![10u8, 20]).unwrap();
        assert_ne!(id, next.index_id());
    }
}
