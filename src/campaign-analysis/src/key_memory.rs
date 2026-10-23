//! Explicit accounting for storage owned by table keys.

/// Key storage outside the elements of the key vector. Interned text that a
/// separate registry owns must be counted by that registry, once per text.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct KeyMemory {
    pub data_bytes: usize,
    pub allocated_bytes: usize,
}

/// Declare how a key schema retains storage. Count owned heap data and its
/// capacity here. Count key elements in the index registry, not in this hook.
/// Implementations must return stable counts for immutable keys. Shared text
/// must have a separate registry that counts its canonical allocation.
pub trait KeyStorage<K> {
    fn extra_memory(keys: &[K]) -> KeyMemory;
}

/// The default policy permits Copy keys, which cannot own heap allocations.
#[derive(Debug)]
pub struct InlineKeys;
impl<K: Copy> KeyStorage<K> for InlineKeys {
    fn extra_memory(_: &[K]) -> KeyMemory {
        KeyMemory::default()
    }
}

/// Count text owned by each String key. Use this policy explicitly with
/// `IndexRegistry<String, StringKeys>`; the default policy rejects String.
#[derive(Debug)]
pub struct StringKeys;
impl KeyStorage<String> for StringKeys {
    fn extra_memory(keys: &[String]) -> KeyMemory {
        KeyMemory {
            data_bytes: keys.iter().map(String::len).sum(),
            allocated_bytes: keys.iter().map(String::capacity).sum(),
        }
    }
}
