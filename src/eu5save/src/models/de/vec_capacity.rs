use std::marker::PhantomData;

use bumpalo_serde::{ArenaDeserialize, ArenaSeed};

pub fn deserialize_vec_capacity<'bump, 'de, D, T, const CAPACITY: usize>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<&'bump [T], D::Error>
where
    D: serde::Deserializer<'de>,
    T: ArenaDeserialize<'bump> + 'bump,
{
    struct VecVisitor<'bump, T> {
        allocator: &'bump bumpalo::Bump,
        capacity: usize,
        marker: PhantomData<T>,
    }

    impl<'bump, 'de, T1> serde::de::Visitor<'de> for VecVisitor<'bump, T1>
    where
        T1: ArenaDeserialize<'bump> + 'bump,
    {
        type Value = &'bump [T1];

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a capacity initial vec")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: serde::de::SeqAccess<'de>,
        {
            let mut vec =
                bumpalo::collections::Vec::with_capacity_in(self.capacity, self.allocator);
            while let Some(element) = seq.next_element_seed(ArenaSeed::new(self.allocator))? {
                vec.push(element);
            }
            Ok(vec.into_bump_slice())
        }
    }

    deserializer.deserialize_seq(VecVisitor {
        allocator,
        marker: PhantomData,
        capacity: CAPACITY,
    })
}
