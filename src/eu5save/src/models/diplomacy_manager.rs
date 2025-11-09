use crate::Eu5Date;
use crate::models::countries::CountryId;
use serde::Deserialize;
use serde::de;
use std::fmt;

#[derive(Debug, PartialEq)]
pub struct DiplomacyManager<'bump> {
    dependencies: &'bump [DiplomacyDependency],
}

impl<'bump> DiplomacyManager<'bump> {
    pub fn dependencies(&self) -> impl ExactSizeIterator<Item = &DiplomacyDependency> + '_ {
        self.dependencies.iter()
    }
}

fn deserialize_diplomacy_manager<'de, 'bump, D>(
    deserializer: D,
    allocator: &'bump bumpalo::Bump,
) -> Result<DiplomacyManager<'bump>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Debug, PartialEq, Clone, Copy)]
    enum DiplomacyManagerField {
        Int(u32),
        Dependency,
        Other,
    }

    struct DiplomacyManagerFieldVisitor;

    impl<'de> de::Visitor<'de> for DiplomacyManagerFieldVisitor {
        type Value = DiplomacyManagerField;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("an integer or a dependency")
        }

        fn visit_i32<E>(self, v: i32) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(DiplomacyManagerField::Int(v as u32))
        }

        fn visit_u32<E>(self, v: u32) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(DiplomacyManagerField::Int(v))
        }

        fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            if v == "dependency" {
                Ok(DiplomacyManagerField::Dependency)
            } else {
                Ok(DiplomacyManagerField::Other)
            }
        }
    }

    impl<'de> Deserialize<'de> for DiplomacyManagerField {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            deserializer.deserialize_any(DiplomacyManagerFieldVisitor)
        }
    }

    struct DiplomacyManagerVisitor<'a>(&'a bumpalo::Bump);

    impl<'de, 'a> de::Visitor<'de> for DiplomacyManagerVisitor<'a> {
        type Value = DiplomacyManager<'a>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a diplomacy manager with dependencies")
        }

        fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
        where
            A: de::MapAccess<'de>,
        {
            let mut dependencies = bumpalo::collections::Vec::new_in(self.0);

            while let Some(key) = map.next_key()? {
                match key {
                    DiplomacyManagerField::Int(_) => {
                        map.next_value::<de::IgnoredAny>()?;
                    }
                    DiplomacyManagerField::Dependency => {
                        let dependency =
                            map.next_value_seed(
                                bumpalo_serde::ArenaSeed::<DiplomacyDependency>::new(self.0),
                            )?;
                        dependencies.push(dependency);
                    }
                    DiplomacyManagerField::Other => {
                        map.next_value::<de::IgnoredAny>()?;
                    }
                }
            }

            Ok(DiplomacyManager {
                dependencies: dependencies.into_bump_slice(),
            })
        }
    }

    deserializer.deserialize_map(DiplomacyManagerVisitor(allocator))
}

impl<'bump> bumpalo_serde::ArenaDeserialize<'bump> for DiplomacyManager<'bump> {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserialize_diplomacy_manager(deserializer, allocator)
    }
}

#[derive(Debug, Deserialize, PartialEq, bumpalo_serde::ArenaDeserialize)]
pub struct DiplomacyDependency {
    #[arena(default)]
    pub first: CountryId,
    #[arena(default)]
    pub second: CountryId,
    pub start_date: Option<Eu5Date>,
    pub subject_type: DiplomacySubjectType,
}

#[derive(Debug, PartialEq, Clone, Copy, Deserialize, bumpalo_serde::ArenaDeserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiplomacySubjectType {
    Dominion,
    Fiefdom,
    Vassal,
    Tributary,
    HanseaticMember,
    Samanta,
    Appanage,
    Tusi,
    March,
    MahaSamanta,
    #[serde(other)]
    Other,
}
