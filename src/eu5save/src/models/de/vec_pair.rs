use crate::models::de::Maybe;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserializer, de};
use std::{fmt, marker::PhantomData};

pub fn deserialize_vec_pair_arena<'bump, 'de, D, K, V>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<bumpalo::collections::Vec<'bump, (K, Option<V>)>, D::Error>
where
    D: Deserializer<'de>,
    K: ArenaDeserialize<'bump> + std::fmt::Debug + 'bump,
    V: ArenaDeserialize<'bump> + 'bump,
{
    struct VecPairArenaVisitor<'bump, K1, V1> {
        allocator: &'bump bumpalo::Bump,
        marker: PhantomData<(K1, V1)>,
    }

    impl<'bump, 'de, K1, V1> de::Visitor<'de> for VecPairArenaVisitor<'bump, K1, V1>
    where
        K1: ArenaDeserialize<'bump> + std::fmt::Debug + 'bump,
        V1: ArenaDeserialize<'bump> + 'bump,
    {
        type Value = bumpalo::collections::Vec<'bump, (K1, Option<V1>)>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing key value tuples")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut values = bumpalo::collections::Vec::new_in(self.allocator);

            while let Some(key) = map.next_key_seed(ArenaSeed::<K1>::new(self.allocator))? {
                let maybe_value =
                    map.next_value_seed(ArenaSeed::<Maybe<V1>>::new(self.allocator))?;
                let value = maybe_value.into_value();
                values.push((key, value));
            }

            Ok(values)
        }
    }

    deserializer.deserialize_map(VecPairArenaVisitor {
        allocator,
        marker: PhantomData,
    })
}
