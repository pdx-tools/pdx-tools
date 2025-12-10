use pdx_map::{R16, Rgb};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ColorIdx(R16);

impl ColorIdx {
    pub const fn new(idx: u16) -> Self {
        Self(R16::new(idx))
    }

    pub const fn value(self) -> u16 {
        self.0.value()
    }
}

impl From<R16> for ColorIdx {
    fn from(value: R16) -> Self {
        ColorIdx(value)
    }
}

impl From<ColorIdx> for R16 {
    fn from(value: ColorIdx) -> Self {
        value.0
    }
}

impl<'de> Deserialize<'de> for ColorIdx {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = u16::deserialize(deserializer)?;
        Ok(ColorIdx(R16::new(raw)))
    }
}

impl Serialize for ColorIdx {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u16(self.0.value())
    }
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct GameLocation {
    pub name: String,
    pub terrain: Terrain,
    pub color_id: Option<ColorIdx>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct GameSpatialLocation {
    pub avg_x: u16,
    pub avg_y: u16,
}

#[derive(Debug, Clone)]
pub struct RawGameLocationData {
    pub name: String,
    pub color_id: Rgb,
    pub color_idx: ColorIdx,
    pub terrain: Terrain,
    pub coordinates: (u16, u16),
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Terrain {
    #[default]
    Other,
    Impassable,
    Water,
}

impl Serialize for Terrain {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let s = match self {
            Terrain::Other => 1,
            Terrain::Impassable => 2,
            Terrain::Water => 3,
        };
        serializer.serialize_u8(s)
    }
}

impl<'de> Deserialize<'de> for Terrain {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = u8::deserialize(deserializer)?;
        match s {
            1 => Ok(Terrain::Other),
            2 => Ok(Terrain::Impassable),
            3 => Ok(Terrain::Water),
            _ => Err(serde::de::Error::custom("invalid terrain value")),
        }
    }
}

impl Terrain {
    pub fn is_water(&self) -> bool {
        matches!(self, Terrain::Water)
    }

    pub fn is_passable(&self) -> bool {
        matches!(self, Terrain::Other)
    }
}
