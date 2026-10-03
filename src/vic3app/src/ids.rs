use serde::{Deserialize, Deserializer, Serialize};
use std::fmt;

macro_rules! save_id {
    ($name:ident, $description:literal) => {
        #[doc = $description]
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
        )]
        #[serde(transparent)]
        pub struct $name(u32);

        impl $name {
            pub const fn new(value: u32) -> Self {
                Self(value)
            }

            pub const fn value(self) -> u32 {
                self.0
            }
        }

        impl From<u32> for $name {
            fn from(value: u32) -> Self {
                Self::new(value)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

save_id!(CountryId, "The ID of a country in the save.");
save_id!(StateId, "The ID of a state in the save.");
save_id!(
    ProvinceId,
    "The ID of a province in the save and game data."
);

/// Read an optional ID. Convert the unset reference value to `None`.
pub fn deserialize_reference<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: From<u32>,
{
    Ok(Option::<u32>::deserialize(deserializer)?
        .filter(|value| *value != u32::MAX)
        .map(T::from))
}
