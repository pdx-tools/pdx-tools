use crate::models::CountryId;
use crate::models::de::Maybe;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::{Deserialize, de};
use std::fmt;

#[derive(Debug, PartialEq, ArenaDeserialize)]
pub struct LoanManager<'bump> {
    #[arena(deserialize_with = "deserialize_units")]
    pub database: LoanDatabase<'bump>,
}

impl<'bump> LoanManager<'bump> {}

#[derive(Debug, PartialEq)]
pub struct LoanDatabase<'bump> {
    ids: &'bump [LoanId],
    values: &'bump [Option<Loan>],
}

impl<'bump> LoanDatabase<'bump> {
    /// Returns an iterator over all loans in the database
    pub fn iter(&self) -> impl Iterator<Item = &Loan> {
        self.values.iter().filter_map(|x| x.as_ref())
    }
}

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Deserialize, Default, ArenaDeserialize,
)]
#[serde(transparent)]
pub struct LoanId(u32);

impl LoanId {
    #[inline]
    pub fn new(id: u32) -> Self {
        LoanId(id)
    }

    #[inline]
    pub fn value(self) -> u32 {
        self.0
    }
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct Loan {
    pub amount: f64,
    pub interest: f64,
    #[arena(default)]
    pub month: u32,
    pub borrower: CountryId,
    pub lender: Option<CountryId>,
}

#[inline]
fn deserialize_units<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<LoanDatabase<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct LoanVisitor<'bump>(&'bump bumpalo::Bump);

    impl<'de, 'bump> de::Visitor<'de> for LoanVisitor<'bump> {
        type Value = LoanDatabase<'bump>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a map containing sub-unit entries")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut loan_ids = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            let mut loan_values = bumpalo::collections::Vec::with_capacity_in(4096, self.0);
            while let Some((key, value)) = map.next_entry_seed(
                ArenaSeed::new(self.0),
                ArenaSeed::<Maybe<Loan>>::new(self.0),
            )? {
                loan_ids.push(key);
                loan_values.push(value.into_value());
            }

            let ids = loan_ids.into_bump_slice();
            let values = loan_values.into_bump_slice();
            Ok(LoanDatabase { ids, values })
        }
    }

    deserializer.deserialize_map(LoanVisitor(allocator))
}
