//! Typed keys and immutable, aligned table columns.
use crate::{ColumnError, Columns, DecodeError, Decoder, Encoder, RowColumns};
use std::borrow::Cow;
use std::cell::{Cell, OnceCell};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;
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

/// A prefix is part of the key schema. Its order must agree with key order,
/// and equal keys must have equal prefixes.
pub trait PrefixKey: Ord {
    type Prefix: Ord + ?Sized;
    fn prefix(&self) -> &Self::Prefix;
}

mod sealed {
    pub trait Sealed {
        /// The constructor rejects keys that do not strictly increase.
        const SORTED: bool;
    }
}
/// How a table orders its keys. The order is part of the table type, so a
/// table reaches a range query only if its constructor checked the order.
pub trait KeyOrder: sealed::Sealed {}
/// An order that supports key ranges.
pub trait RangeOrder: KeyOrder {}
/// Keys strictly increase.
#[derive(Debug, Clone, Copy)]
pub struct Sorted;
/// Keys strictly increase, and their [`PrefixKey`] prefixes never decrease.
#[derive(Debug, Clone, Copy)]
pub struct Prefixed;
/// Keys keep the order of the map they came from.
#[derive(Debug, Clone, Copy)]
pub struct MapOrder;
impl sealed::Sealed for Sorted {
    const SORTED: bool = true;
}
impl sealed::Sealed for Prefixed {
    const SORTED: bool = true;
}
impl sealed::Sealed for MapOrder {
    const SORTED: bool = false;
}
impl KeyOrder for Sorted {}
impl KeyOrder for Prefixed {}
impl KeyOrder for MapOrder {}
impl RangeOrder for Sorted {}
impl RangeOrder for Prefixed {}

/// A table with fixed-size keys. Use domain IDs or composite IDs for keys.
#[derive(Debug, Clone)]
pub struct Table<K, C, O = Sorted> {
    index: Rc<KeyIndex<K>>,
    columns: C,
    order: PhantomData<O>,
}
impl<K: PartialEq, C: PartialEq, O> PartialEq for Table<K, C, O> {
    fn eq(&self, other: &Self) -> bool {
        self.index.keys == other.index.keys && self.columns == other.columns
    }
}
impl<K: Copy + Ord, C: RowColumns> Table<K, C, Sorted> {
    /// Construct an analytical table. Keys must be strictly increasing.
    pub fn sorted(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        Self::new(keys, columns)
    }
    /// The schema supplies the ordering policy; bytes cannot select it.
    pub fn decode_sorted_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError> {
        Self::decode_with(input, keys, Self::sorted)
    }
}
impl<K: Copy + Ord, C: RowColumns> Table<K, C, MapOrder> {
    /// Preserve map order. Only this policy permits a lazy hash lookup.
    pub fn map_order(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        Self::new(keys, columns)
    }
    pub fn decode_map_order_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError> {
        Self::decode_with(input, keys, Self::map_order)
    }
}
impl<K: Copy + Ord + PrefixKey, C: RowColumns> Table<K, C, Prefixed> {
    /// Construct a sorted composite table and check the declared prefix order,
    /// which `prefix_range` needs.
    pub fn sorted_prefix(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        if keys.windows(2).any(|x| x[0].prefix() > x[1].prefix()) {
            return Err(TableError::Key(KeyError::UnsortedPrefix).in_table(C::table_name()));
        }
        Self::new(keys, columns)
    }
    pub fn decode_sorted_prefix_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
    ) -> Result<Self, DecodeError> {
        Self::decode_with(input, keys, Self::sorted_prefix)
    }
}
impl<K: Copy + Ord, C: RowColumns, O: KeyOrder> Table<K, C, O> {
    fn new(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        Self::new_inner(keys, columns).map_err(|error| error.in_table(C::table_name()))
    }
    fn decode_with(
        input: &mut Decoder<'_>,
        keys: impl FnOnce(&mut Decoder<'_>) -> Result<Vec<K>, DecodeError>,
        build: impl FnOnce(Vec<K>, C) -> Result<Self, TableError>,
    ) -> Result<Self, DecodeError> {
        let keys = keys(input).map_err(|error| error.in_table(C::table_name()))?;
        let columns = C::decode(input).map_err(|error| error.in_table(C::table_name()))?;
        build(keys, columns).map_err(DecodeError::Table)
    }
    fn new_inner(keys: Vec<K>, columns: C) -> Result<Self, TableError> {
        u32::try_from(keys.len()).map_err(|_| TableError::Key(KeyError::TooManyRows))?;
        let sorted = keys.is_sorted();
        if O::SORTED && !sorted {
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
            }),
            columns,
            order: PhantomData,
        })
    }
}
impl<K: Copy + Ord + Hash, C, O> Table<K, C, O> {
    pub fn row(&self, key: &K) -> Option<Row> {
        let offset = if self.index.sorted {
            self.index.keys.binary_search(key).ok().map(|x| x as u32)
        } else {
            self.index
                .rows
                .get_or_init(|| {
                    self.keys()
                        .iter()
                        .copied()
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
impl<K, C: Columns, O> Table<K, C, O> {
    /// Encode keys through a domain codec, then encode the aligned columns.
    pub fn encode_with(&self, out: &mut Encoder, keys: impl FnOnce(&[K], &mut Encoder)) {
        keys(self.keys(), out);
        self.columns.encode(out);
    }
}
impl<K, C, O> Table<K, C, O> {
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
impl<K: Ord, C, O: RangeOrder> Table<K, C, O> {
    /// Borrow a key interval without allocating offsets.
    pub fn range(&self, bounds: impl RangeBounds<K>) -> Result<RowRange<'_, K, C>, RowError> {
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
        Ok(self.row_range(start, end))
    }
}
impl<K: PrefixKey, C> Table<K, C, Prefixed> {
    /// The rows of one prefix. An absent prefix gives an empty interval.
    pub fn prefix_range(&self, prefix: &K::Prefix) -> RowRange<'_, K, C> {
        let start = self.keys().partition_point(|k| k.prefix() < prefix);
        let end = self.keys().partition_point(|k| k.prefix() <= prefix);
        self.row_range(start, end)
    }
}
impl<K, C, O> Table<K, C, O> {
    fn row_range(&self, start: usize, end: usize) -> RowRange<'_, K, C> {
        RowRange {
            index: self.index.id,
            keys: &self.keys()[start..end],
            columns: &self.columns,
            start,
        }
    }
}
/// A borrowed interval bound to a shared key index.
#[derive(Debug)]
pub struct RowRange<'a, K, C> {
    index: IndexId,
    keys: &'a [K],
    columns: &'a C,
    start: usize,
}
impl<'a, K, C> RowRange<'a, K, C> {
    pub fn len(&self) -> usize {
        self.keys.len()
    }
    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }
    pub fn keys(&self) -> &'a [K] {
        self.keys
    }
    /// The same rows of another table with the same shared index.
    pub fn bind<'t, D, O>(
        &self,
        table: &'t Table<K, D, O>,
    ) -> Result<RowRange<'t, K, D>, RowError> {
        if self.index != table.index.id {
            return Err(RowError::ForeignIndex);
        }
        Ok(table.row_range(self.start, self.start + self.len()))
    }
    pub fn values<'b, A: Column + 'b>(
        &'b self,
        column: impl FnOnce(&C) -> &A,
    ) -> impl ExactSizeIterator<Item = A::Value<'b>>
    where
        'a: 'b,
    {
        let column = column(self.columns);
        (self.start..self.start + self.len())
            .map(move |i| column.get_value(i).expect("validated aligned column"))
    }
}
#[derive(Debug)]
enum ResolvedRows {
    MissingKey,
    Rows(Box<[u32]>),
}
/// A borrowed set of keys with one cached resolution for each encountered
/// index. Rows follow the order of the given keys, and a repeated key counts
/// once, at its first place.
/// Use `resolve_bound` to read each table. Use `resolve` and `bind` to read
/// another snapshot with the same index. See the EU4 province query.
#[derive(Debug)]
pub struct RowSelect<'q, K: Clone> {
    keys: Cow<'q, [K]>,
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
pub enum BoundSelectionRows<'t, 'r, C> {
    EmptySelection,
    MissingKey,
    Rows(BoundRows<'t, 'r, C>),
}
#[derive(Debug)]
pub struct ResolvedBatch<'a> {
    index: IndexId,
    offsets: &'a [u32],
}
#[derive(Debug)]
pub struct BoundRows<'a, 'b, C> {
    columns: &'a C,
    offsets: &'b [u32],
}
impl<'q, K: Copy + Ord + Hash> RowSelect<'q, K> {
    pub fn new(keys: &'q [K]) -> Self {
        let mut seen = HashSet::new();
        let keys = if keys.len() < 2 || keys.iter().all(|key| seen.insert(*key)) {
            Cow::Borrowed(keys)
        } else {
            seen.clear();
            Cow::Owned(
                keys.iter()
                    .copied()
                    .filter(|key| seen.insert(*key))
                    .collect(),
            )
        };
        Self {
            keys,
            cache: Vec::new(),
        }
    }
    /// Resolve and bind in one operation. The resolved offsets come from this
    /// table, so no rebinding identity check is required.
    pub fn resolve_bound<'r, 't, C, O>(
        &'r mut self,
        table: &'t Table<K, C, O>,
    ) -> BoundSelectionRows<'t, 'r, C> {
        match self.resolve(table) {
            SelectionRows::EmptySelection => BoundSelectionRows::EmptySelection,
            SelectionRows::MissingKey => BoundSelectionRows::MissingKey,
            SelectionRows::Rows(rows) => BoundSelectionRows::Rows(BoundRows {
                columns: &table.columns,
                offsets: rows.offsets,
            }),
        }
    }
    pub fn resolve<C, O>(&mut self, table: &Table<K, C, O>) -> SelectionRows<'_> {
        if self.keys.is_empty() {
            return SelectionRows::EmptySelection;
        }
        let at = match self.cache.iter().position(|(id, _)| *id == table.index.id) {
            Some(at) => at,
            None => {
                let rows: Option<Vec<u32>> = self
                    .keys
                    .iter()
                    .map(|key| table.row(key).map(|row| row.offset))
                    .collect();
                let rows = rows.map_or(ResolvedRows::MissingKey, |rows| {
                    ResolvedRows::Rows(rows.into_boxed_slice())
                });
                self.cache.push((table.index.id, rows));
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
    pub fn bind<'a, K, C, O>(
        &self,
        table: &'a Table<K, C, O>,
    ) -> Result<BoundRows<'a, 'b, C>, RowError> {
        if self.index != table.index.id {
            return Err(RowError::ForeignIndex);
        }
        Ok(BoundRows {
            columns: &table.columns,
            offsets: self.offsets,
        })
    }
}
impl<C> BoundRows<'_, '_, C> {
    pub fn values<'a, A: Column + 'a>(
        &'a self,
        column: impl FnOnce(&C) -> &A,
    ) -> impl ExactSizeIterator<Item = A::Value<'a>> {
        let column = column(self.columns);
        self.offsets.iter().map(move |i| {
            column
                .get_value(*i as usize)
                .expect("validated aligned column")
        })
    }
}

/// A typed registry. Fingerprint collisions use exact ordered-key comparison.
/// Declare one registry for each table schema. Keys must implement `Copy`.
#[derive(Debug)]
pub struct IndexRegistry<K> {
    buckets: HashMap<u64, Vec<Rc<KeyIndex<K>>>>,
    layouts: HashMap<String, Rc<KeyIndex<K>>>,
}
impl<K> Default for IndexRegistry<K> {
    fn default() -> Self {
        Self {
            buckets: HashMap::new(),
            layouts: HashMap::new(),
        }
    }
}
#[derive(Debug)]
pub struct PreparedIndex<K> {
    hash: u64,
    index: Rc<KeyIndex<K>>,
    new: bool,
    layout: Option<String>,
    bytes: usize,
}
impl<K> PreparedIndex<K> {
    pub fn added_bytes(&self) -> usize {
        self.bytes
    }
}
#[derive(Debug, Default, Clone, Copy)]
pub struct RegistryMemory {
    pub data_bytes: usize,
    /// Diagnostic key capacity. The admission limit excludes this count.
    pub allocated_bytes: usize,
    /// An estimate of lookup storage. The admission limit excludes this count.
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
impl<K: Copy + Eq + Hash> IndexRegistry<K> {
    /// Prepare sharing without changing the registry or an existing lookup.
    pub fn prepare<C, O>(
        &self,
        table: &mut Table<K, C, O>,
        layout: Option<&str>,
    ) -> Result<PreparedIndex<K>, crate::AnalysisError> {
        if let Some(index) = layout.and_then(|name| self.layouts.get(name)) {
            if index.keys != table.index.keys {
                return Err(crate::AnalysisError::IncompatibleLayout);
            }
            table.index = Rc::clone(index);
            return Ok(PreparedIndex {
                hash: 0,
                index: Rc::clone(&table.index),
                new: false,
                layout: None,
                bytes: 0,
            });
        }
        let mut hash = std::hash::DefaultHasher::new();
        table.keys().hash(&mut hash);
        self.prepare_hash(table, layout, hash.finish())
    }
    fn prepare_hash<C, O>(
        &self,
        table: &mut Table<K, C, O>,
        layout: Option<&str>,
        hash: u64,
    ) -> Result<PreparedIndex<K>, crate::AnalysisError> {
        if layout
            .and_then(|key| self.layouts.get(key))
            .is_some_and(|index| index.keys != table.index.keys)
        {
            return Err(crate::AnalysisError::IncompatibleLayout);
        }
        let existing = self
            .buckets
            .get(&hash)
            .and_then(|bucket| bucket.iter().find(|index| index.keys == table.index.keys));
        if let Some(index) = existing {
            table.index = Rc::clone(index);
        }
        let bytes = if existing.is_none() {
            std::mem::size_of_val(table.keys())
        } else {
            0
        };
        Ok(PreparedIndex {
            hash,
            index: Rc::clone(&table.index),
            new: existing.is_none(),
            layout: layout.map(str::to_owned),
            bytes,
        })
    }
}
impl<K> IndexRegistry<K> {
    /// Commit a plan from the same exclusive append operation.
    pub fn commit(&mut self, plan: PreparedIndex<K>) {
        if plan.new {
            self.buckets
                .entry(plan.hash)
                .or_default()
                .push(Rc::clone(&plan.index));
        }
        if let Some(layout) = plan.layout {
            self.layouts.insert(layout, plan.index);
        }
    }
    pub fn memory(&self) -> RegistryMemory {
        let mut result = RegistryMemory::default();
        for index in self.buckets.values().flatten() {
            result.indexes += 1;
            result.data_bytes += std::mem::size_of_val(index.keys.as_slice());
            result.allocated_bytes += index.keys.capacity() * size_of::<K>();
            result.lookup_bytes += index
                .rows
                .get()
                .map_or(0, |rows| rows.capacity() * (size_of::<(K, u32)>() + 1));
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
    fn construction_and_encoding_do_not_require_hash() {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
        struct Ordered(u32);
        let table = Table::sorted(vec![Ordered(1)], vec![7u8]).unwrap();
        let mut out = Encoder::new();
        table.encode_with(&mut out, |keys, out| out.column(&[keys[0].0]));
        let bytes = out.finish();
        let decoded =
            Table::<Ordered, Vec<u8>>::decode_sorted_with(&mut Decoder::new(&bytes), |input| {
                Ok(input.column::<u32>()?.into_iter().map(Ordered).collect())
            })
            .unwrap();
        assert_eq!(table, decoded);

        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct Key(u32);
        let mut registry = IndexRegistry::<Key>::default();
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
    fn composite_key_data_is_counted_once_and_capacity_is_separate() {
        type Key = (u32, u32);
        let mut keys = Vec::with_capacity(4);
        keys.push((1u32, 2u32));
        let key_capacity = keys.capacity();
        let mut first = Table::sorted(keys, vec![1u8]).unwrap();
        let mut registry = IndexRegistry::<Key>::default();
        let plan = registry.prepare(&mut first, None).unwrap();
        assert_eq!(plan.added_bytes(), size_of::<Key>());
        assert_eq!(registry.memory().data_bytes, 0);
        drop(plan);
        assert_eq!(registry.memory().indexes, 0);
        let plan = registry.prepare(&mut first, None).unwrap();
        registry.commit(plan);
        assert_eq!(registry.memory().data_bytes, size_of::<Key>());
        assert_eq!(
            registry.memory().allocated_bytes,
            key_capacity * size_of::<Key>()
        );
        let mut equal = Table::sorted(vec![(1u32, 2u32)], vec![2u8]).unwrap();
        let plan = registry.prepare(&mut equal, None).unwrap();
        assert_eq!(plan.added_bytes(), 0);
        registry.commit(plan);
        assert_eq!(first.index_id(), equal.index_id());
        assert_eq!(
            registry.memory().allocated_bytes,
            key_capacity * size_of::<Key>()
        );
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
    }

    #[test]
    fn prefix_order_is_checked_separately_from_key_order() {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
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
        let mut repeated = RowSelect::new(&[1, 2, 1]);
        let BoundSelectionRows::Rows(rows) = repeated.resolve_bound(&a) else {
            panic!("resolved")
        };
        assert_eq!(rows.values(|v| v).copied().collect::<Vec<_>>(), [10, 20]);
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
    fn tables_of_different_orders_share_equal_keys() {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        struct Key(u8, u8);
        impl PrefixKey for Key {
            type Prefix = u8;
            fn prefix(&self) -> &u8 {
                &self.0
            }
        }
        let keys = vec![Key(1, 1), Key(1, 2), Key(2, 1)];
        let mut registry = IndexRegistry::<Key>::default();
        let mut sorted = Table::sorted(keys.clone(), vec![10u8, 20, 30]).unwrap();
        let plan = registry.prepare(&mut sorted, Some("layout")).unwrap();
        registry.commit(plan);
        // A known layout name, then a fresh one that finds the keys by hash.
        for layout in ["layout", "other"] {
            let mut prefixed = Table::sorted_prefix(keys.clone(), vec![11u8, 21, 31]).unwrap();
            let plan = registry.prepare(&mut prefixed, Some(layout)).unwrap();
            registry.commit(plan);
            assert_eq!(sorted.index_id(), prefixed.index_id());
            let rows = prefixed.prefix_range(&2);
            assert_eq!(rows.values(|v| v).copied().collect::<Vec<_>>(), [31]);
            let rows = rows.bind(&sorted).unwrap();
            assert_eq!(rows.values(|v| v).copied().collect::<Vec<_>>(), [30]);
        }
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
