use crate::rawbmp::{Bmp, Pixels, Rgb};
use eu4save::ProvinceId;
use jomini::Scalar;
use serde::Deserialize;
use std::{collections::HashMap, io::Cursor};

#[derive(Deserialize, Debug, Clone)]
pub struct Terrain {
    #[serde(default, deserialize_with = "super::vec_pair::deserialize_vec_pair")]
    pub categories: Vec<(String, TerrainCategory)>,
    pub terrain: HashMap<String, GraphicalTerrain>,
    pub tree: HashMap<String, TreeTerrain>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct TerrainCategory {
    #[serde(default)]
    pub terrain_override: Vec<u16>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct GraphicalTerrain {
    #[serde(alias = "type")]
    pub ty: String,
    pub color: Vec<u8>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct TreeTerrain {
    pub terrain: String,
    pub color: Vec<u8>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct DefaultMap {
    pub sea_starts: Vec<ProvinceId>,
    pub lakes: Vec<ProvinceId>,
}

impl Terrain {
    pub fn overrides(&self) -> HashMap<u16, String> {
        let mut result = HashMap::new();
        for (terrain_key, cat) in &self.categories {
            for &t_override in &cat.terrain_override {
                result
                    .entry(t_override)
                    .or_insert_with(|| terrain_key.clone());
            }
        }

        result
    }
}

pub fn parse_terrain_txt(data: &[u8]) -> Terrain {
    jomini::TextDeserializer::from_windows1252_slice(data).unwrap()
}

pub fn parse_default_map(data: &[u8]) -> DefaultMap {
    jomini::TextDeserializer::from_windows1252_slice(data).unwrap()
}

pub fn parse_definition(data: &[u8]) -> HashMap<u16, Rgb> {
    let mut result = HashMap::new();
    let mut record = csv::ByteRecord::new();
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(b';')
        .has_headers(true)
        .flexible(true)
        .from_reader(Cursor::new(data));

    while rdr.read_byte_record(&mut record).unwrap() {
        let province_id = Scalar::new(&record[0]).to_u64().unwrap() as u16;
        let r = Scalar::new(&record[1]).to_u64().unwrap() as u8;
        let g = Scalar::new(&record[2]).to_u64().unwrap() as u8;
        let b = Scalar::new(&record[3]).to_u64().unwrap() as u8;
        let val = Rgb { r, g, b };
        result.insert(province_id, val);
    }

    result
}

pub fn parse_terrain_bmp(
    terrainbmp: &[u8],
    province_area: &[u16],
    is_river: &[bool],
    tree_override: &[u8],
) -> HashMap<u16, Vec<u8>> {
    let bmp = Bmp::parse(terrainbmp).unwrap();
    let mut prov_id_terrain_ind: HashMap<u16, Vec<u8>> = HashMap::new();

    for (i, &index) in bmp.data().flatten().enumerate() {
        if is_river[i] {
            continue;
        }

        let prov_id = province_area[i];
        let indices = prov_id_terrain_ind.entry(prov_id).or_default();
        if tree_override[i] != 0 {
            indices.push(tree_override[i]);
        } else {
            // ocean and inland ocean
            indices.push(index);
        }
    }

    prov_id_terrain_ind
}

pub fn province_areas(provincebmp: &[u8]) -> Vec<Rgb> {
    let bmp = Bmp::parse(provincebmp).unwrap();
    let Pixels::Rgb(pixels) = bmp.pixels();
    pixels.collect()
}

#[derive(Debug, Clone, PartialEq)]
pub struct GameProvince {
    pub id: ProvinceId,
    pub terrain: schemas::eu4::Terrain,
    pub province_is_on_an_island: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_definition() {
        let data = "province;red;green;blue;x;x
1;128;34;64;Stockholm;x
2;0;36;128;Östergötland;x
3;128;38;192;Småland;x
3004;189;110;220;Unused1
";

        let actual = parse_definition(data.as_bytes());
        let mut expected = HashMap::new();
        expected.insert(1, Rgb::from((128, 34, 64)));
        expected.insert(2, Rgb::from((0, 36, 128)));
        expected.insert(3, Rgb::from((128, 38, 192)));
        expected.insert(3004, Rgb::from((189, 110, 220)));
        assert_eq!(actual, expected);
    }

    #[test]
    fn test_parse_terrain() {
        let data = "categories = {
            grasslands = {
                terrain_override = { 104 109  }
            }
            hills = {
                terrain_override = { 70 104 }
            }        
        }
        terrain = {
            grasslands = { type = grasslands color = {   0    } }
            hills  = { type = hills color = {   1    } }
        }
        tree = {
            forest = { terrain = forest color = { 3 4 6 7 19 20 } }
            jungle  = { terrain = jungle color = { 13 14 15 } }
        }     
        ";

        let terrain = parse_terrain_txt(data.as_bytes());
        assert_eq!(terrain.terrain.get("grasslands").unwrap().color[0], 0);
        assert_eq!(terrain.terrain.get("hills").unwrap().color[0], 1);

        let terrain_overrides = terrain.overrides();
        assert_eq!(terrain_overrides.get(&1), None);
        assert_eq!(
            terrain_overrides.get(&104).unwrap(),
            &String::from("grasslands")
        );
        assert_eq!(
            terrain_overrides.get(&109).unwrap(),
            &String::from("grasslands")
        );
        assert_eq!(terrain_overrides.get(&70).unwrap(), &String::from("hills"));
    }
}
