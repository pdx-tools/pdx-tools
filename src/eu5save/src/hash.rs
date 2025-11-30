use std::hash::{BuildHasherDefault, Hasher};

#[derive(Debug)]
pub struct FnvHasher(u64);

impl Default for FnvHasher {
    #[inline]
    fn default() -> FnvHasher {
        FnvHasher(0xcbf29ce484222325)
    }
}

impl Hasher for FnvHasher {
    #[inline]
    fn finish(&self) -> u64 {
        self.0
    }

    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        let FnvHasher(mut hash) = *self;

        for byte in bytes.iter() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }

        *self = FnvHasher(hash);
    }
}

/// A builder for default FNV hashers.
pub type FnvBuildHasher = BuildHasherDefault<FnvHasher>;

#[derive(Debug)]
pub struct FxHasher {
    hash: u64,
}

impl Default for FxHasher {
    #[inline]
    fn default() -> FxHasher {
        FxHasher { hash: 0 }
    }
}

impl Hasher for FxHasher {
    #[inline]
    fn finish(&self) -> u64 {
        self.hash
    }

    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        let mut remaining = bytes;

        // Process 8 bytes at once
        while remaining.len() >= 8 {
            let chunk = u64::from_ne_bytes([
                remaining[0],
                remaining[1],
                remaining[2],
                remaining[3],
                remaining[4],
                remaining[5],
                remaining[6],
                remaining[7],
            ]);
            self.hash = self.hash.rotate_left(5) ^ chunk;
            remaining = &remaining[8..];
        }

        // Process remaining bytes one by one
        for byte in remaining {
            self.hash = self.hash.rotate_left(5) ^ (*byte as u64);
        }
    }
}

/// A builder for default FxHash hashers.
pub type FxBuildHasher = BuildHasherDefault<FxHasher>;
pub type FxHashMap<K, V> = std::collections::HashMap<K, V, FxBuildHasher>;
pub type FxHashSet<K> = std::collections::HashSet<K, FxBuildHasher>;

pub type FnvHashMap<K, V> = std::collections::HashMap<K, V, FnvBuildHasher>;
