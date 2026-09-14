use anyhow::{Context, ensure};
use eu4save::ProvinceId;
use jomini::Scalar;
use rawbmp::{Bmp, Pixels, Rgb};
use serde::Deserialize;
use std::{collections::HashMap, io::Cursor};

#[derive(Deserialize, Debug, Clone)]
pub struct Terrain {
    #[serde(default, deserialize_with = "crate::de::deserialize_vec_pair")]
    pub categories: Vec<(String, TerrainCategory)>,
    pub terrain: HashMap<String, GraphicalTerrain>,
    pub tree: HashMap<String, TreeTerrain>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TerrainOverridePrecedence {
    /// Keep the first category for a province.
    First,
    /// Keep the last category for a province.
    Last,
}

impl TerrainOverridePrecedence {
    /// Return the duplicate override rule used by an EU4 release.
    ///
    /// EU4 releases before 1.30 keep the last duplicate entry. EU4 1.30 and
    /// later keep the first duplicate entry.
    pub fn for_game_version(game_version: &str) -> Self {
        let mut components = game_version
            .trim_start_matches('v')
            .split('.')
            .map(|component| component.parse::<u32>().ok());
        let major = components.next().flatten();
        let minor = components.next().flatten();
        match (major, minor) {
            (Some(major), Some(minor)) if (major, minor) < (1, 30) => Self::Last,
            _ => Self::First,
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct TerrainCategory {
    #[serde(default)]
    pub terrain_override: Vec<u16>,
    #[serde(default)]
    pub local_development_cost: f32,
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

#[derive(Deserialize)]
struct ContinentData {
    #[serde(default)]
    island_check_provinces: Vec<ProvinceId>,
}

#[derive(Deserialize)]
struct ClimateData {
    #[serde(default)]
    impassable: Vec<ProvinceId>,
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

    pub fn province_terrain_overrides(&self) -> HashMap<u16, schemas::eu4::Terrain> {
        self.province_terrain_overrides_with_precedence(TerrainOverridePrecedence::First)
    }

    pub fn province_terrain_overrides_with_precedence(
        &self,
        precedence: TerrainOverridePrecedence,
    ) -> HashMap<u16, schemas::eu4::Terrain> {
        let mut result = HashMap::new();
        for (terrain_name, category) in &self.categories {
            let Some(terrain) = terrain_from_name(terrain_name) else {
                continue;
            };

            for &province_id in &category.terrain_override {
                match precedence {
                    TerrainOverridePrecedence::First => {
                        result.entry(province_id).or_insert(terrain);
                    }
                    TerrainOverridePrecedence::Last => {
                        result.insert(province_id, terrain);
                    }
                }
            }
        }

        result
    }

    fn terrain_indices(&self) -> HashMap<u8, schemas::eu4::Terrain> {
        let mut result = HashMap::new();
        for graphical in self.terrain.values() {
            let Some(terrain) = terrain_from_name(&graphical.ty) else {
                continue;
            };

            for &index in &graphical.color {
                result.insert(index, terrain);
            }
        }

        result
    }

    fn terrain_representatives(&self) -> HashMap<schemas::eu4::Terrain, u8> {
        let mut result: HashMap<schemas::eu4::Terrain, u8> = HashMap::new();
        for graphical in self.terrain.values() {
            let Some(terrain) = terrain_from_name(&graphical.ty) else {
                continue;
            };

            for &index in &graphical.color {
                result
                    .entry(terrain)
                    .and_modify(|current| *current = (*current).min(index))
                    .or_insert(index);
            }
        }

        result
    }

    fn tree_indices(&self) -> HashMap<u8, u8> {
        let mut result = HashMap::new();
        let representatives = self.terrain_representatives();
        for tree in self.tree.values() {
            let Some(terrain) = terrain_from_name(&tree.terrain) else {
                continue;
            };
            let Some(&representative) = representatives.get(&terrain) else {
                continue;
            };

            for &index in &tree.color {
                result.insert(index, representative);
            }
        }

        result
    }
}

fn terrain_from_name(name: &str) -> Option<schemas::eu4::Terrain> {
    Some(match name {
        "grasslands" | "plains" => schemas::eu4::Terrain::Grasslands,
        "hills" => schemas::eu4::Terrain::Hills,
        "mountain" | "mountains" => schemas::eu4::Terrain::Mountains,
        "desert" => schemas::eu4::Terrain::Desert,
        "farmlands" => schemas::eu4::Terrain::Farmlands,
        "forest" => schemas::eu4::Terrain::Forest,
        "ocean" => schemas::eu4::Terrain::Ocean,
        "inland_ocean" => schemas::eu4::Terrain::InlandOcean,
        "coastal_desert" => schemas::eu4::Terrain::CoastalDesert,
        "savannah" => schemas::eu4::Terrain::Savannah,
        "drylands" => schemas::eu4::Terrain::Drylands,
        "highlands" => schemas::eu4::Terrain::Highlands,
        "coastline" => schemas::eu4::Terrain::Coastline,
        "glacier" => schemas::eu4::Terrain::Glacier,
        "impassable_mountains" => schemas::eu4::Terrain::ImpassableMountain,
        "marsh" => schemas::eu4::Terrain::Marsh,
        "steppe" => schemas::eu4::Terrain::Steppe,
        "wasteland" => schemas::eu4::Terrain::Wasteland,
        "jungle" => schemas::eu4::Terrain::Jungle,
        "woods" => schemas::eu4::Terrain::Woods,
        _ => return None,
    })
}

pub fn parse_terrain_txt(data: &[u8]) -> Terrain {
    jomini::text::de::from_windows1252_slice(data).unwrap()
}

pub fn parse_default_map(data: &[u8]) -> DefaultMap {
    jomini::text::de::from_windows1252_slice(data).unwrap()
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

pub fn parse_island_check_provinces(data: &[u8]) -> anyhow::Result<Vec<ProvinceId>> {
    let continents: ContinentData =
        jomini::text::de::from_windows1252_slice(data).context("unable to parse continents")?;
    Ok(continents.island_check_provinces)
}

pub fn parse_impassable_provinces(data: &[u8]) -> anyhow::Result<Vec<ProvinceId>> {
    let climate: ClimateData =
        jomini::text::de::from_windows1252_slice(data).context("unable to parse climate")?;
    Ok(climate.impassable)
}

pub fn calculate_province_terrains(
    terrain_txt: &[u8],
    definition_csv: &[u8],
    provinces_bmp: &[u8],
    terrain_bmp: &[u8],
    trees_bmp: &[u8],
) -> anyhow::Result<HashMap<u16, schemas::eu4::Terrain>> {
    calculate_province_terrains_with_precedence(
        terrain_txt,
        definition_csv,
        provinces_bmp,
        terrain_bmp,
        trees_bmp,
        TerrainOverridePrecedence::First,
    )
}

pub fn calculate_province_terrains_with_precedence(
    terrain_txt: &[u8],
    definition_csv: &[u8],
    provinces_bmp: &[u8],
    terrain_bmp: &[u8],
    trees_bmp: &[u8],
    override_precedence: TerrainOverridePrecedence,
) -> anyhow::Result<HashMap<u16, schemas::eu4::Terrain>> {
    let terrain = parse_terrain_txt(terrain_txt);
    let counts = calculate_province_terrain_counts_with_terrain(
        &terrain,
        definition_csv,
        provinces_bmp,
        terrain_bmp,
        trees_bmp,
    )?;

    let mut result = terrain.province_terrain_overrides_with_precedence(override_precedence);
    for (province_id, province_counts) in counts {
        let Some((terrain, _)) =
            province_counts
                .into_iter()
                .max_by(|(terrain_a, count_a), (terrain_b, count_b)| {
                    count_a.cmp(count_b).then_with(|| terrain_b.cmp(terrain_a))
                })
        else {
            continue;
        };
        result.entry(province_id).or_insert(terrain);
    }

    Ok(result)
}

pub fn calculate_province_terrain_counts(
    terrain_txt: &[u8],
    definition_csv: &[u8],
    provinces_bmp: &[u8],
    terrain_bmp: &[u8],
    trees_bmp: &[u8],
) -> anyhow::Result<HashMap<u16, HashMap<schemas::eu4::Terrain, usize>>> {
    let terrain = parse_terrain_txt(terrain_txt);
    calculate_province_terrain_counts_with_terrain(
        &terrain,
        definition_csv,
        provinces_bmp,
        terrain_bmp,
        trees_bmp,
    )
}

fn calculate_province_terrain_counts_with_terrain(
    terrain: &Terrain,
    definition_csv: &[u8],
    provinces_bmp: &[u8],
    terrain_bmp: &[u8],
    trees_bmp: &[u8],
) -> anyhow::Result<HashMap<u16, HashMap<schemas::eu4::Terrain, usize>>> {
    let definitions = parse_definition(definition_csv);
    let definitions: HashMap<Rgb, u16> = definitions
        .into_iter()
        .map(|(province_id, color)| (color, province_id))
        .collect();

    let province_bmp = Bmp::parse(provinces_bmp).context("unable to parse provinces.bmp")?;
    let terrain_bmp = Bmp::parse(terrain_bmp).context("unable to parse terrain.bmp")?;
    let trees_bmp = Bmp::parse(trees_bmp).context("unable to parse trees.bmp")?;

    let width = terrain_bmp.dib_header.width.unsigned_abs() as usize;
    let height = terrain_bmp.dib_header.height.unsigned_abs() as usize;
    ensure!(width > 0 && height > 0, "terrain.bmp has no pixels");
    validate_bitmap("provinces.bmp", &province_bmp, width, height, 24)?;
    validate_bitmap("terrain.bmp", &terrain_bmp, width, height, 8)?;
    ensure!(
        trees_bmp.dib_header.bpp == 8,
        "trees.bmp must be an 8-bit indexed bitmap"
    );

    let Pixels::Rgb(province_pixels) = province_bmp.pixels();
    let province_ids = province_pixels
        .map(|color| {
            definitions.get(&color).copied().with_context(|| {
                format!("province color is missing from definition.csv: {color:?}")
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let terrain_indices = terrain_bmp.data().flatten().copied().collect::<Vec<_>>();
    ensure!(
        terrain_indices.len() == width * height,
        "terrain.bmp has an invalid pixel count"
    );

    let terrain_indices_by_type = terrain.terrain_indices();
    let tree_indices = terrain.tree_indices();
    let mut canonical_terrain = terrain_indices.clone();
    apply_tree_overrides(
        &mut canonical_terrain,
        &trees_bmp,
        &tree_indices,
        width,
        height,
    )?;

    let mut counts: HashMap<u16, HashMap<schemas::eu4::Terrain, usize>> = HashMap::new();
    for (&province_id, &terrain_index) in province_ids.iter().zip(canonical_terrain.iter()) {
        let Some(terrain) = terrain_indices_by_type.get(&terrain_index).copied() else {
            continue;
        };
        if matches!(
            terrain,
            schemas::eu4::Terrain::Ocean | schemas::eu4::Terrain::InlandOcean
        ) {
            continue;
        }

        let count = counts
            .entry(province_id)
            .or_default()
            .entry(terrain)
            .or_insert(0);
        *count += 1;
        if matches!(
            terrain,
            schemas::eu4::Terrain::Forest
                | schemas::eu4::Terrain::Jungle
                | schemas::eu4::Terrain::Woods
        ) {
            *count += 1;
        }
    }

    Ok(counts)
}

fn validate_bitmap(
    name: &str,
    bmp: &Bmp<'_>,
    width: usize,
    height: usize,
    bpp: u16,
) -> anyhow::Result<()> {
    ensure!(
        bmp.dib_header.width.unsigned_abs() as usize == width
            && bmp.dib_header.height.unsigned_abs() as usize == height,
        "{name} dimensions do not match the other map bitmaps"
    );
    ensure!(
        bmp.dib_header.bpp == bpp,
        "{name} must be a {bpp}-bit bitmap"
    );
    ensure!(
        bmp.pixels_len() == width * height,
        "{name} has an invalid pixel count"
    );
    Ok(())
}

fn apply_tree_overrides(
    canonical_terrain: &mut [u8],
    trees_bmp: &Bmp<'_>,
    tree_indices: &HashMap<u8, u8>,
    map_width: usize,
    map_height: usize,
) -> anyhow::Result<()> {
    let tree_width = trees_bmp.dib_header.width.unsigned_abs() as usize;
    let tree_height = trees_bmp.dib_header.height.unsigned_abs() as usize;
    ensure!(tree_width > 0 && tree_height > 0, "trees.bmp has no pixels");

    let tree_pixels = trees_bmp.data().flatten().copied().collect::<Vec<_>>();
    ensure!(
        tree_pixels.len() == tree_width * tree_height,
        "trees.bmp has an invalid pixel count"
    );

    apply_tree_overrides_to_pixels(
        canonical_terrain,
        &tree_pixels,
        tree_width,
        tree_height,
        tree_indices,
        map_width,
        map_height,
    )
}

fn apply_tree_overrides_to_pixels(
    canonical_terrain: &mut [u8],
    tree_pixels: &[u8],
    tree_width: usize,
    tree_height: usize,
    tree_indices: &HashMap<u8, u8>,
    map_width: usize,
    map_height: usize,
) -> anyhow::Result<()> {
    ensure!(map_width > 0 && map_height > 0, "map has no pixels");
    ensure!(
        canonical_terrain.len() == map_width * map_height,
        "map has an invalid pixel count"
    );
    ensure!(tree_width > 0 && tree_height > 0, "trees.bmp has no pixels");
    ensure!(
        tree_pixels.len() == tree_width * tree_height,
        "trees.bmp has an invalid pixel count"
    );

    let x_scale = map_width as f32 / tree_width as f32;
    let y_scale = map_height as f32 / tree_height as f32;
    let half_x_scale = x_scale * 0.5;
    let half_y_scale = y_scale * 0.5;
    for logical_row in 0..tree_height {
        let row = tree_height - logical_row - 1;
        for col in 0..tree_width {
            let tree_pixel = tree_pixels[row * tree_width + col];
            let Some(&terrain_index) = tree_indices.get(&tree_pixel) else {
                continue;
            };
            let mut center_x = col as f32 * x_scale;
            if logical_row % 2 == 1 {
                center_x += half_x_scale;
            }
            let center_y = row as f32 * y_scale;
            let lower_x = (center_x - half_x_scale).max(0.0);
            let upper_x = (center_x + half_x_scale).min(map_width as f32 - 1.0);
            let lower_y = (center_y - half_y_scale).max(0.0);
            let upper_y = (center_y + half_y_scale).min(map_height as f32 - 1.0);

            let start_x = lower_x as usize;
            let start_y = lower_y as usize;
            let mut x = start_x;
            while (x as f32) < upper_x {
                let mut y = start_y;
                while (y as f32) < upper_y {
                    canonical_terrain[y * map_width + x] = terrain_index;
                    y += 2;
                }
                x += 1;
            }
        }
    }

    Ok(())
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

        let first = terrain.province_terrain_overrides();
        assert_eq!(first.get(&104), Some(&schemas::eu4::Terrain::Grasslands));

        let last =
            terrain.province_terrain_overrides_with_precedence(TerrainOverridePrecedence::Last);
        assert_eq!(last.get(&104), Some(&schemas::eu4::Terrain::Hills));
    }

    #[test]
    fn test_terrain_override_precedence_by_version() {
        assert_eq!(
            TerrainOverridePrecedence::for_game_version("1.28.3"),
            TerrainOverridePrecedence::Last
        );
        assert_eq!(
            TerrainOverridePrecedence::for_game_version("v1.29"),
            TerrainOverridePrecedence::Last
        );
        assert_eq!(
            TerrainOverridePrecedence::for_game_version("1.30"),
            TerrainOverridePrecedence::First
        );
        assert_eq!(
            TerrainOverridePrecedence::for_game_version("1.37"),
            TerrainOverridePrecedence::First
        );
    }

    #[test]
    fn test_tree_overlay_uses_native_raster_geometry() {
        let map_width = 8;
        let map_height = 16;
        let tree_width = 2;
        let tree_height = 4;
        let mut canonical_terrain = vec![0; map_width * map_height];
        let tree_pixels = vec![0, 0, 0, 0, 1, 0, 0, 2];
        let tree_indices = HashMap::from([(1, 7), (2, 9)]);

        apply_tree_overrides_to_pixels(
            &mut canonical_terrain,
            &tree_pixels,
            tree_width,
            tree_height,
            &tree_indices,
            map_width,
            map_height,
        )
        .unwrap();

        for y in [6, 8] {
            for x in 0..4 {
                assert_eq!(canonical_terrain[y * map_width + x], 7);
            }
            for x in 4..8 {
                assert_eq!(canonical_terrain[y * map_width + x], 0);
            }
        }
        for y in [10, 12] {
            for x in 0..2 {
                assert_eq!(canonical_terrain[y * map_width + x], 0);
            }
            for x in 2..6 {
                assert_eq!(canonical_terrain[y * map_width + x], 9);
            }
            for x in 6..8 {
                assert_eq!(canonical_terrain[y * map_width + x], 0);
            }
        }
        for y in [0, 1, 2, 3, 4, 5, 7, 9, 11, 13, 14, 15] {
            assert!(
                canonical_terrain[y * map_width..(y + 1) * map_width]
                    .iter()
                    .all(|&terrain| terrain == 0)
            );
        }
    }

    #[test]
    fn test_tree_overlay_clips_cell_boundaries() {
        let map_width = 8;
        let map_height = 8;
        let mut canonical_terrain = vec![0; map_width * map_height];
        let tree_indices = HashMap::from([(1, 7)]);

        apply_tree_overrides_to_pixels(
            &mut canonical_terrain,
            &[0, 1, 0, 0],
            2,
            2,
            &tree_indices,
            map_width,
            map_height,
        )
        .unwrap();

        for &terrain in &canonical_terrain[4..7] {
            assert_eq!(terrain, 7);
        }
        assert_eq!(canonical_terrain[7], 0);
        assert_eq!(canonical_terrain[map_width], 0);
        assert_eq!(
            canonical_terrain
                .iter()
                .filter(|&&terrain| terrain == 7)
                .count(),
            3
        );
    }

    #[test]
    fn test_parse_map_province_lists() {
        let climate = b"tropical = { 1 2 } impassable = { 3 4 } equator_y_on_province_image = 656";
        assert_eq!(
            parse_impassable_provinces(climate).unwrap(),
            vec![ProvinceId::from(3), ProvinceId::from(4)]
        );

        let continents = b"europe = { 1 } island_check_provinces = { 5 6 } new_world = { }";
        assert_eq!(
            parse_island_check_provinces(continents).unwrap(),
            vec![ProvinceId::from(5), ProvinceId::from(6)]
        );
    }
}
