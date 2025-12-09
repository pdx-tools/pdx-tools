use bumpalo_serde::ArenaDeserialize;
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Clone, Copy, Serialize, Eq, PartialOrd, Ord)]
pub struct GameVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

pub(crate) struct GameVersionVisitor;

impl<'de> serde::de::Visitor<'de> for GameVersionVisitor {
    type Value = GameVersion;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a game version in the format 'major.minor.patch'")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        let mut parts = value.split('.');

        let major = parts.next();
        let minor = parts.next();
        let patch = parts.next();

        let major = major
            .ok_or_else(|| E::custom(format!("Missing major version in: {value}")))?
            .parse()
            .map_err(|_| E::custom(format!("Invalid major version: {value}")))?;

        let minor = minor
            .ok_or_else(|| E::custom(format!("Missing minor version in: {value}")))?
            .parse()
            .map_err(|_| E::custom(format!("Invalid minor version: {value}")))?;

        let patch = patch
            .ok_or_else(|| E::custom(format!("Missing patch version in: {value}")))?
            .parse()
            .map_err(|_| E::custom(format!("Invalid patch version: {value}")))?;

        Ok(GameVersion {
            major,
            minor,
            patch,
        })
    }
}

impl<'de> Deserialize<'de> for GameVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_str(GameVersionVisitor)
    }
}

impl<'bump> ArenaDeserialize<'bump> for GameVersion {
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        _allocator: &'bump bumpalo::Bump,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // GameVersion doesn't need arena allocation, so we can just use the standard deserializer
        Self::deserialize(deserializer)
    }
}
