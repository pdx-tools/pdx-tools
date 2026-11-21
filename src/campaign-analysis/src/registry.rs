//! Data that a store shares across its snapshots.
use crate::{IndexRegistry, PreparedIndex, RegistryMemory};

/// Shared store data. An append prepares a plan without changing the
/// registry, counts the added bytes of the plan against the limit, and then
/// commits it. Commit cannot fail.
pub trait Registry {
    type Prepared;
    fn added_bytes(prepared: &Self::Prepared) -> usize;
    fn commit(&mut self, prepared: Self::Prepared);
    fn memory(&self) -> RegistryMemory;
}

impl<K> Registry for IndexRegistry<K> {
    type Prepared = PreparedIndex<K>;
    fn added_bytes(prepared: &PreparedIndex<K>) -> usize {
        prepared.added_bytes()
    }
    fn commit(&mut self, prepared: PreparedIndex<K>) {
        IndexRegistry::commit(self, prepared);
    }
    fn memory(&self) -> RegistryMemory {
        IndexRegistry::memory(self)
    }
}

/// Declare the shared data of a game as named registries, and the struct of
/// their prepared plans. The declared struct is a [`Registry`] too, so a
/// game uses it as [`Game::Shared`](crate::Game::Shared). Only doc comments
/// are accepted, so every generated item has the same fields.
///
/// ```ignore
/// campaign_analysis::registries! {
///     pub struct Eu4Shared => Eu4Prepared {
///         provinces: IndexRegistry<ProvinceId>,
///         religions: TextRegistry,
///     }
/// }
/// ```
#[macro_export]
macro_rules! registries {
    (
        $(#[doc = $doc:literal])*
        $vis:vis struct $name:ident => $prepared:ident {
            $($(#[doc = $field_doc:literal])* $field:ident : $ty:ty),+ $(,)?
        }
    ) => {
        $(#[doc = $doc])*
        #[derive(Debug, Default)]
        $vis struct $name {
            $($(#[doc = $field_doc])* pub $field: $ty),+
        }

        /// One prepared plan for each registry.
        #[derive(Debug)]
        $vis struct $prepared {
            $(pub $field: <$ty as $crate::Registry>::Prepared),+
        }

        impl $crate::Registry for $name {
            type Prepared = $prepared;
            fn added_bytes(prepared: &$prepared) -> usize {
                0 $(+ <$ty as $crate::Registry>::added_bytes(&prepared.$field))+
            }
            fn commit(&mut self, prepared: $prepared) {
                $(<$ty as $crate::Registry>::commit(&mut self.$field, prepared.$field);)+
            }
            fn memory(&self) -> $crate::RegistryMemory {
                $crate::RegistryMemory::default()
                    $(+ <$ty as $crate::Registry>::memory(&self.$field))+
            }
        }
    };
}
