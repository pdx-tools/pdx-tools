use crate::Eu5Date;
use crate::models::countries::CountryId;
use serde::de;
use serde::{Deserialize, Deserializer};
use std::fmt;

#[derive(Debug, PartialEq)]
pub struct DiplomacyManager<'bump> {
    dependencies: &'bump [DiplomacyDependency],
    entries: &'bump [CountryDiplomacy],
}

impl<'bump> DiplomacyManager<'bump> {
    pub fn dependencies(&self) -> impl ExactSizeIterator<Item = &DiplomacyDependency> + '_ {
        self.dependencies.iter()
    }

    pub fn entries(&self) -> impl ExactSizeIterator<Item = &CountryDiplomacy> + '_ {
        self.entries.iter()
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
            } else if let Ok(v) = v.parse() {
                Ok(DiplomacyManagerField::Int(v))
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
            let mut country_diplomacy = bumpalo::collections::Vec::new_in(self.0);

            while let Some(key) = map.next_key()? {
                match key {
                    DiplomacyManagerField::Int(country) => {
                        let raw = map.next_value::<CountryDiplomacyRaw>()?;
                        country_diplomacy.push(CountryDiplomacy {
                            country: CountryId::new(country),
                            liberty_desire: raw.liberty_desire,
                        });
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
                entries: country_diplomacy.into_bump_slice(),
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

#[derive(Debug, PartialEq)]
pub struct CountryDiplomacy {
    pub country: CountryId,
    pub liberty_desire: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct CountryDiplomacyRaw {
    liberty_desire: Option<f64>,
}

#[derive(Debug, PartialEq)]
pub struct DiplomacyDependency {
    pub first: CountryId,
    pub second: CountryId,
    pub start_date: Option<Eu5Date>,
    pub subject_type: DiplomacySubjectType,
}

impl<'bump> bumpalo_serde::ArenaDeserialize<'bump> for DiplomacyDependency {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = DiplomacyDependencyRaw::deserialize(deserializer)?;
        Ok(Self::from_raw(raw))
    }
}

impl<'de> Deserialize<'de> for DiplomacyDependency {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = DiplomacyDependencyRaw::deserialize(deserializer)?;
        Ok(Self::from_raw(raw))
    }
}

impl DiplomacyDependency {
    fn from_raw(raw: DiplomacyDependencyRaw) -> Self {
        DiplomacyDependency {
            first: raw.first,
            second: raw.second,
            start_date: raw.start_date,
            subject_type: raw
                .subject_type
                .or(raw.named_targets)
                .unwrap_or(DiplomacySubjectType::Other),
        }
    }
}

#[derive(Debug, Deserialize)]
struct DiplomacyDependencyRaw {
    #[serde(default)]
    first: CountryId,
    #[serde(default)]
    second: CountryId,
    start_date: Option<Eu5Date>,
    subject_type: Option<DiplomacySubjectType>,
    #[serde(default, deserialize_with = "deserialize_dependency_named_targets")]
    named_targets: Option<DiplomacySubjectType>,
}

fn deserialize_dependency_named_targets<'de, D>(
    deserializer: D,
) -> Result<Option<DiplomacySubjectType>, D::Error>
where
    D: Deserializer<'de>,
{
    struct NamedTargetsVisitor;

    impl<'de> de::Visitor<'de> for NamedTargetsVisitor {
        type Value = Option<DiplomacySubjectType>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("dependency named targets")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: de::SeqAccess<'de>,
        {
            let mut subject_type = None;

            while let Some(target) = seq.next_element::<DependencyNamedTarget>()? {
                if subject_type.is_none()
                    && target.flag == Some(DependencyNamedTargetFlag::SubjectType)
                {
                    subject_type = target.target.and_then(|target| target.object);
                }
            }

            Ok(subject_type)
        }
    }

    deserializer.deserialize_seq(NamedTargetsVisitor)
}

#[derive(Debug, Deserialize)]
struct DependencyNamedTarget {
    flag: Option<DependencyNamedTargetFlag>,
    target: Option<DependencyNamedTargetValue>,
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum DependencyNamedTargetFlag {
    SubjectType,
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct DependencyNamedTargetValue {
    object: Option<DiplomacySubjectType>,
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
    ColonialNation,
    Conquistador,
    TradeCompany,
    #[serde(other)]
    Other,
}

#[cfg(test)]
mod tests {
    use super::*;
    use bumpalo_serde::ArenaDeserialize;
    use jomini::TextDeserializer;

    fn deserialize_manager<'bump>(
        data: &str,
        allocator: &'bump bumpalo::Bump,
    ) -> DiplomacyManager<'bump> {
        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");

        DiplomacyManager::deserialize_in_arena(&deserializer, allocator)
            .expect("diplomacy manager deserializes")
    }

    fn assert_vassal_dependency(data: &str) {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(data, &allocator);
        let dependencies: Vec<_> = manager.dependencies().collect();

        assert_eq!(dependencies.len(), 1);
        assert_eq!(dependencies[0].first, CountryId::new(314));
        assert_eq!(dependencies[0].second, CountryId::new(339));
        assert_eq!(dependencies[0].subject_type, DiplomacySubjectType::Vassal);
    }

    #[test]
    fn diplomacy_dependency_deserializes_direct_subject_type() {
        assert_vassal_dependency(
            r#"
dependency={
    first=314
    second=339
    subject_type=vassal
}
"#,
        );
    }

    #[test]
    fn diplomacy_dependency_deserializes_named_target_subject_type() {
        assert_vassal_dependency(
            r#"
dependency={
    first=314
    second=339
    named_targets={ {
            flag="subject_type"
            target={
                type=subject_type
                object=vassal
            }
        } }
}
"#,
        );
    }

    #[test]
    fn diplomacy_dependency_unknown_subject_type_deserializes_to_other() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
dependency={
    first=314
    second=339
    named_targets={ {
            flag="subject_type"
            target={
                type=subject_type
                object=unknown_future_type
            }
        } }
}
"#,
            &allocator,
        );
        let dependencies: Vec<_> = manager.dependencies().collect();
        assert_eq!(dependencies.len(), 1);
        assert_eq!(dependencies[0].subject_type, DiplomacySubjectType::Other);
    }

    #[test]
    fn diplomacy_dependency_deserializes_colonial_nation_subject_type() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
dependency={
    first=283
    second=83888446
    named_targets={ {
            flag="subject_type"
            target={
                type=subject_type
                object=colonial_nation
            }
        } }
    start_date=1445.1.1
}
"#,
            &allocator,
        );
        let dependencies: Vec<_> = manager.dependencies().collect();
        assert_eq!(dependencies.len(), 1);
        assert_eq!(
            dependencies[0].subject_type,
            DiplomacySubjectType::ColonialNation
        );
    }

    #[test]
    fn diplomacy_dependency_with_null_identity_falls_back_to_other() {
        // Some dependencies have identity=18446744073709551615 (null sentinel) instead of
        // object=<type>, leaving subject_type unresolvable — should fall back to Other.
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
dependency={
    first=283
    second=1898
    named_targets={ {
            flag="subject_type"
            target={
                type=subject_type
                identity=18446744073709551615
            }
        } }
    start_date=1572.2.2
}
"#,
            &allocator,
        );
        let dependencies: Vec<_> = manager.dependencies().collect();
        assert_eq!(dependencies.len(), 1);
        assert_eq!(dependencies[0].subject_type, DiplomacySubjectType::Other);
    }

    #[test]
    fn diplomacy_manager_deserializes_country_liberty_desire() {
        let allocator = bumpalo::Bump::new();
        let manager = deserialize_manager(
            r#"
0={
    diplomats=2.5
}
3={
    diplomats=1.1
    liberty_desire=17
    rivals_2={
        list={
            {
                country=1773
                date=1337.4.2
            }
        }
    }
}
4={
    diplomats=0.7
    liberty_desire=70.5
}
dependency={
    first=314
    second=339
    subject_type=vassal
}
"#,
            &allocator,
        );

        let country_diplomacy: Vec<_> = manager.entries().collect();
        let dependencies: Vec<_> = manager.dependencies().collect();

        assert_eq!(country_diplomacy.len(), 3);
        assert_eq!(country_diplomacy[0].country, CountryId::new(0));
        assert_eq!(country_diplomacy[0].liberty_desire, None);
        assert_eq!(country_diplomacy[1].country, CountryId::new(3));
        assert_eq!(country_diplomacy[1].liberty_desire, Some(17.0));
        assert_eq!(country_diplomacy[2].country, CountryId::new(4));
        assert_eq!(country_diplomacy[2].liberty_desire, Some(70.5));
        assert_eq!(dependencies.len(), 1);
        assert_eq!(dependencies[0].first, CountryId::new(314));
        assert_eq!(dependencies[0].second, CountryId::new(339));
        assert_eq!(dependencies[0].subject_type, DiplomacySubjectType::Vassal);
    }
}
