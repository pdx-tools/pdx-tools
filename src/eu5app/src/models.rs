use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub struct GameLocationData {
    pub color_id: [u8; 3],
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
