//! Compile the map data of a Vic3 installation into the data that the web
//! client uses.

use crate::{
    CountryColor, GameData, GameProvince, GameRegion, ProvinceId, ProvinceKind, WorldMetadata,
    color::hsv_to_rgb,
};
use jomini::{
    TextTape, TextToken, Utf8Encoding,
    text::{ObjectReader, ValueReader},
};
use pdx_map::{Rgb, World, WorldLength};
use std::collections::{HashMap, HashSet};

#[derive(Debug, thiserror::Error)]
pub enum GameInstallError {
    #[error("unable to read {path}: {message}")]
    Io { path: String, message: String },

    #[error("unable to parse {path}: {message}")]
    Parse { path: String, message: String },
}

impl GameInstallError {
    fn parse(path: &str, message: impl std::fmt::Display) -> Self {
        GameInstallError::Parse {
            path: String::from(path),
            message: message.to_string(),
        }
    }
}

/// Read access to the files of a game installation. The paths are relative
/// to the root of the installation (the directory that contains `game`).
pub trait GameFiles {
    fn read_file(&self, path: &str) -> Result<Vec<u8>, GameInstallError>;

    /// Paths of the files in `dir` (and its subdirectories) that end with
    /// `ends_with`
    fn list_files(&self, dir: &str, ends_with: &str) -> Result<Vec<String>, GameInstallError>;
}

/// Game files in a directory on disk
#[derive(Debug, Clone)]
pub struct DirGameFiles(pub std::path::PathBuf);

impl GameFiles for DirGameFiles {
    fn read_file(&self, path: &str) -> Result<Vec<u8>, GameInstallError> {
        std::fs::read(self.0.join(path)).map_err(|e| GameInstallError::Io {
            path: String::from(path),
            message: e.to_string(),
        })
    }

    fn list_files(&self, dir: &str, ends_with: &str) -> Result<Vec<String>, GameInstallError> {
        let mut result = Vec::new();
        let mut pending = vec![self.0.join(dir)];
        while let Some(current) = pending.pop() {
            let entries = std::fs::read_dir(&current).map_err(|e| GameInstallError::Io {
                path: current.display().to_string(),
                message: e.to_string(),
            })?;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    pending.push(path);
                } else if let Ok(relative) = path.strip_prefix(&self.0) {
                    let relative = relative.to_string_lossy().replace('\\', "/");
                    if relative.ends_with(ends_with) {
                        result.push(relative);
                    }
                }
            }
        }
        result.sort();
        Ok(result)
    }
}

/// The compiled map data
#[derive(Debug)]
pub struct CompiledGame {
    pub game_data: GameData,
    pub world_meta: WorldMetadata,
    pub world: World,
}

/// The prefix of the localization keys of dynamic country names
const DYNAMIC_NAME_PREFIX: &str = "dyn_c_";

pub fn compile(files: &impl GameFiles) -> Result<CompiledGame, GameInstallError> {
    let (rgb, width, height) =
        read_province_image(&files.read_file("game/map_data/provinces.png")?)?;
    let scan_ranks = scan_ranks(&rgb, width as usize);
    let (world, palette) = World::from_rgb8(&rgb, WorldLength::new(width));
    drop(rgb);

    let water = parse_water(&files.read_file("game/map_data/default.map")?)?;
    let regions = files
        .list_files("game/map_data/state_regions", ".txt")?
        .into_iter()
        .map(|path| parse_state_regions(&path, &files.read_file(&path)?))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let strategic_regions = files
        .list_files("game/common/strategic_regions", ".txt")?
        .into_iter()
        .map(|path| parse_strategic_regions(&path, &files.read_file(&path)?))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    let province_ids = assign_province_ids(&regions, &strategic_regions, &scan_ranks);

    let mut province_regions = HashMap::new();
    let mut impassable = HashSet::new();
    for region in &regions {
        for province in &region.provinces {
            province_regions.insert(*province, region.id);
        }
        impassable.extend(region.impassable.iter().copied());
    }

    let mut provinces = vec![
        GameProvince {
            id: ProvinceId::new(0),
            kind: ProvinceKind::Land,
            impassable: false,
            region_id: 0,
        };
        palette.len()
    ];
    for (rgb, r16) in palette.iter() {
        let kind = if water.seas.contains(rgb) {
            ProvinceKind::Sea
        } else if water.lakes.contains(rgb) {
            ProvinceKind::Lake
        } else {
            ProvinceKind::Land
        };
        provinces[usize::from(r16.value())] = GameProvince {
            id: ProvinceId::new(province_ids.get(rgb).copied().unwrap_or(0)),
            kind,
            impassable: impassable.contains(rgb),
            region_id: province_regions.get(rgb).copied().unwrap_or(0),
        };
    }

    let colors = parse_country_colors(files)?;
    let country_keys: HashSet<&str> = colors.iter().map(|x| x.key.as_str()).collect();
    let localization = parse_localization(files)?;

    let regions = regions
        .iter()
        .map(|region| GameRegion {
            id: region.id,
            name: localization
                .get(region.key.as_str())
                .cloned()
                .unwrap_or_else(|| region.key.clone()),
        })
        .collect();

    let localization = localization
        .into_iter()
        .filter(|(key, _)| {
            country_keys.contains(key.as_str()) || key.starts_with(DYNAMIC_NAME_PREFIX)
        })
        .collect();

    let mut game_data = GameData {
        provinces,
        regions,
        colors,
        localization,
    };
    game_data.sort();

    let world_meta = WorldMetadata {
        width,
        height,
        max_location_index: world.max_location_index().value(),
    };

    Ok(CompiledGame {
        game_data,
        world_meta,
        world,
    })
}

fn strip_bom(data: &[u8]) -> &[u8] {
    data.strip_prefix(b"\xef\xbb\xbf").unwrap_or(data)
}

/// Parse a province color like `x0974E5`
fn parse_province_color(value: &str) -> Option<Rgb> {
    let hex = value.trim_matches('"').strip_prefix(['x', 'X'])?;
    if hex.len() != 6 {
        return None;
    }
    let value = u32::from_str_radix(hex, 16).ok()?;
    Some(Rgb::new(
        (value >> 16) as u8,
        (value >> 8) as u8,
        value as u8,
    ))
}

fn read_province_colors(value: &ValueReader<'_, '_, Utf8Encoding>) -> Vec<Rgb> {
    value
        .read_array()
        .map(|array| {
            array
                .values()
                .filter_map(|x| x.read_str().ok())
                .filter_map(|x| parse_province_color(&x))
                .collect()
        })
        .unwrap_or_default()
}

/// Decode `provinces.png` into top-down RGB rows
fn read_province_image(data: &[u8]) -> Result<(Vec<u8>, u32, u32), GameInstallError> {
    let path = "game/map_data/provinces.png";
    let image = image::load_from_memory_with_format(data, image::ImageFormat::Png)
        .map_err(|e| GameInstallError::parse(path, e))?
        .into_rgb8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 || width % 2 != 0 {
        return Err(GameInstallError::parse(
            path,
            format!("unsupported dimensions: {width}x{height}"),
        ));
    }
    Ok((image.into_raw(), width, height))
}

/// The order in which each color first appears when the image is scanned
/// row by row from the bottom row to the top row.
fn scan_ranks(rgb: &[u8], width: usize) -> HashMap<Rgb, u32> {
    let mut ranks = HashMap::new();
    let mut previous = None;
    for row in rgb.chunks_exact(width * 3).rev() {
        for pixel in row.as_chunks::<3>().0 {
            let color = Rgb::new(pixel[0], pixel[1], pixel[2]);
            if previous == Some(color) {
                continue;
            }
            previous = Some(color);
            let next = ranks.len() as u32;
            ranks.entry(color).or_insert(next);
        }
    }
    ranks
}

/// Give each province the id that the save uses for it.
///
/// The game numbers the provinces from one, a state region at a time. The
/// state regions are in the order of the strategic regions (files sorted by
/// name, then the order in each file). The states of a strategic region are
/// in the order of the state region files. The provinces of a state region
/// are in the order of their first pixel when `provinces.png` is scanned from
/// the bottom row up. The provinces that are in no state region (lakes) get
/// the last ids, in the same scan order.
fn assign_province_ids(
    regions: &[StateRegionDefinition],
    strategic_regions: &[StrategicRegionDefinition],
    scan_ranks: &HashMap<Rgb, u32>,
) -> HashMap<Rgb, u32> {
    let rank = |color: &Rgb| scan_ranks.get(color).copied().unwrap_or(u32::MAX);
    let region_order: HashMap<&str, usize> = regions
        .iter()
        .enumerate()
        .map(|(idx, x)| (x.key.as_str(), idx))
        .collect();

    let mut ids = HashMap::new();
    let mut next_id = 1u32;
    let mut assign = |colors: Vec<Rgb>| {
        for color in colors {
            ids.entry(color).or_insert_with(|| {
                let id = next_id;
                next_id += 1;
                id
            });
        }
    };

    let mut used_regions = HashSet::new();
    for strategic_region in strategic_regions {
        let mut members: Vec<usize> = strategic_region
            .states
            .iter()
            .filter_map(|x| region_order.get(x.as_str()).copied())
            .filter(|x| used_regions.insert(*x))
            .collect();
        members.sort_unstable();

        for idx in members {
            let mut colors = regions[idx].provinces.clone();
            colors.sort_by_key(rank);
            assign(colors);
        }
    }

    let mut rest: Vec<_> = scan_ranks
        .iter()
        .map(|(color, rank)| (*rank, *color))
        .collect();
    rest.sort_unstable();
    assign(rest.into_iter().map(|(_, color)| color).collect());
    ids
}

#[derive(Debug, Default)]
struct WaterDefinition {
    seas: HashSet<Rgb>,
    lakes: HashSet<Rgb>,
}

/// Parse the sea and lake provinces of `map_data/default.map`
fn parse_water(data: &[u8]) -> Result<WaterDefinition, GameInstallError> {
    let path = "game/map_data/default.map";
    let tape =
        TextTape::from_slice(strip_bom(data)).map_err(|e| GameInstallError::parse(path, e))?;
    let mut result = WaterDefinition::default();
    for (key, _, value) in tape.utf8_reader().fields() {
        match key.read_str().as_ref() {
            "sea_starts" => result.seas.extend(read_province_colors(&value)),
            "lakes" => result.lakes.extend(read_province_colors(&value)),
            _ => {}
        }
    }
    Ok(result)
}

#[derive(Debug)]
struct StateRegionDefinition {
    key: String,
    id: u32,
    provinces: Vec<Rgb>,
    impassable: Vec<Rgb>,
}

/// Parse the state regions of a file in `map_data/state_regions`, in file
/// order
fn parse_state_regions(
    path: &str,
    data: &[u8],
) -> Result<Vec<StateRegionDefinition>, GameInstallError> {
    let tape =
        TextTape::from_slice(strip_bom(data)).map_err(|e| GameInstallError::parse(path, e))?;
    let mut result = Vec::new();
    for (key, _, value) in tape.utf8_reader().fields() {
        let Ok(region) = value.read_object() else {
            continue;
        };

        let mut id = None;
        let mut provinces = Vec::new();
        let mut impassable = Vec::new();
        for (key, _, value) in region.fields() {
            match key.read_str().as_ref() {
                "id" => id = value.read_scalar().ok().and_then(|x| x.to_u64().ok()),
                "provinces" => provinces = read_province_colors(&value),
                "impassable" => impassable = read_province_colors(&value),
                _ => {}
            }
        }

        let key = key.read_string();
        let id = id.ok_or_else(|| GameInstallError::parse(path, format!("{key} has no id")))?;
        result.push(StateRegionDefinition {
            key,
            id: id as u32,
            provinces,
            impassable,
        });
    }
    Ok(result)
}

#[derive(Debug)]
struct StrategicRegionDefinition {
    states: Vec<String>,
}

/// Parse the strategic regions of a file in `common/strategic_regions`, in
/// file order
fn parse_strategic_regions(
    path: &str,
    data: &[u8],
) -> Result<Vec<StrategicRegionDefinition>, GameInstallError> {
    let tape =
        TextTape::from_slice(strip_bom(data)).map_err(|e| GameInstallError::parse(path, e))?;
    let mut result = Vec::new();
    for (_, _, value) in tape.utf8_reader().fields() {
        let Ok(region) = value.read_object() else {
            continue;
        };

        let states = region
            .fields()
            .find(|(key, _, _)| key.read_str() == "states")
            .and_then(|(_, _, value)| value.read_array().ok())
            .map(|array| {
                array
                    .values()
                    .filter_map(|x| x.read_string().ok())
                    .collect()
            })
            .unwrap_or_default();
        result.push(StrategicRegionDefinition { states });
    }
    Ok(result)
}

/// Read a color in one of the forms: `{ 1 2 3 }`, `rgb { 1 2 3 }`, `hsv {
/// 0.1 0.2 0.3 }`, or `hsv360 { 36 20 30 }`.
fn read_color(value: &ValueReader<'_, '_, Utf8Encoding>) -> Option<[u8; 3]> {
    let array = value.read_array().ok()?;
    let values: Vec<_> = array.values().collect();
    let (kind, numbers) = match values.as_slice() {
        [header, body] if matches!(header.token(), TextToken::Header(_)) => {
            let kind = header.read_str().ok()?.to_ascii_lowercase();
            let body = body.read_array().ok()?;
            let numbers = body
                .values()
                .filter_map(|x| x.read_scalar().ok()?.to_f64().ok())
                .collect::<Vec<_>>();
            (kind, numbers)
        }
        _ => {
            let numbers = values
                .iter()
                .filter_map(|x| x.read_scalar().ok()?.to_f64().ok())
                .collect::<Vec<_>>();
            (String::from("rgb"), numbers)
        }
    };

    let [a, b, c, ..] = numbers.as_slice() else {
        return None;
    };

    match kind.as_str() {
        "hsv" => Some(hsv_to_rgb(*a, *b, *c)),
        "hsv360" => Some(hsv_to_rgb(*a / 360.0, *b / 100.0, *c / 100.0)),
        _ => Some([*a, *b, *c].map(|x| x.round().clamp(0.0, 255.0) as u8)),
    }
}

fn find_color(object: &ObjectReader<'_, '_, Utf8Encoding>) -> Option<[u8; 3]> {
    object
        .fields()
        .find(|(key, _, _)| key.read_str() == "color")
        .and_then(|(_, _, value)| read_color(&value))
}

/// Colors of the country tags in `common/country_definitions`
fn parse_country_colors(files: &impl GameFiles) -> Result<Vec<CountryColor>, GameInstallError> {
    let mut colors: HashMap<String, [u8; 3]> = HashMap::new();
    for path in files.list_files("game/common/country_definitions", ".txt")? {
        let data = files.read_file(&path)?;
        let tape = TextTape::from_slice(strip_bom(&data))
            .map_err(|e| GameInstallError::parse(&path, e))?;
        for (key, _, value) in tape.utf8_reader().fields() {
            let Ok(object) = value.read_object() else {
                continue;
            };
            if let Some(color) = find_color(&object) {
                colors.insert(key.read_string(), color);
            }
        }
    }

    Ok(colors
        .into_iter()
        .map(|(key, color)| CountryColor { key, color })
        .collect())
}

/// Parse the English localization files into key value pairs. The files in
/// a `replace` directory take precedence.
fn parse_localization(files: &impl GameFiles) -> Result<HashMap<String, String>, GameInstallError> {
    let mut paths = files.list_files("game/localization/english", "_l_english.yml")?;
    paths.sort_by_key(|x| x.contains("/replace/"));

    let mut result = HashMap::new();
    for path in paths {
        let data = files.read_file(&path)?;
        let text = String::from_utf8_lossy(strip_bom(&data));
        for line in text.lines() {
            if let Some((key, value)) = parse_localization_line(line) {
                result.insert(String::from(key), String::from(value));
            }
        }
    }
    Ok(result)
}

/// Parse a line like ` GBR:0 "Great Britain"`
fn parse_localization_line(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    if line.starts_with('#') {
        return None;
    }

    let (key, rest) = line.split_once(':')?;
    let start = rest.find('"')?;
    let end = rest.rfind('"')?;
    if end <= start || key.contains(char::is_whitespace) {
        return None;
    }
    Some((key, &rest[start + 1..end]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_localization_line() {
        assert_eq!(
            parse_localization_line(r#" GBR:0 "Great Britain""#),
            Some(("GBR", "Great Britain"))
        );
        assert_eq!(
            parse_localization_line(r#" STATE_MINSK: "Minsk" # comment"#),
            Some(("STATE_MINSK", "Minsk"))
        );
        assert_eq!(parse_localization_line("l_english:"), None);
    }

    #[test]
    fn test_parse_province_color() {
        assert_eq!(
            parse_province_color("x0974E5"),
            Some(Rgb::new(0x09, 0x74, 0xe5))
        );
        assert_eq!(
            parse_province_color("\"x3d6a6a\""),
            Some(Rgb::new(0x3d, 0x6a, 0x6a))
        );
        assert_eq!(parse_province_color("0974E5"), None);
    }

    #[test]
    fn test_parse_state_regions() {
        let data = br#"
STATE_SVEALAND = {
    id = 1
    provinces = { "x0974E5" "x216569" }
    impassable = { "x216569" }
    city = "x0974E5"
}
STATE_GOTALAND = {
    id = 2
    provinces = { "x0212F4" }
}"#;
        let regions = parse_state_regions("00_west_europe.txt", data).unwrap();
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].key, "STATE_SVEALAND");
        assert_eq!(regions[0].provinces.len(), 2);
        assert_eq!(regions[0].impassable, vec![Rgb::new(0x21, 0x65, 0x69)]);
        assert_eq!(regions[1].id, 2);
    }

    #[test]
    fn test_assign_province_ids() {
        let color = |x| Rgb::new(x, 0, 0);
        let region = |key: &str, provinces: Vec<Rgb>| StateRegionDefinition {
            key: String::from(key),
            id: 0,
            provinces,
            impassable: Vec::new(),
        };

        // The scan ranks: color(5) is the lake, which no region contains
        let ranks = HashMap::from([
            (color(1), 3),
            (color(2), 1),
            (color(3), 0),
            (color(4), 2),
            (color(5), 4),
        ]);
        let regions = vec![
            region("STATE_A", vec![color(1), color(2)]),
            region("STATE_B", vec![color(3)]),
            region("STATE_C", vec![color(4)]),
        ];

        // The strategic region lists STATE_B before STATE_A, but the file
        // order of the state regions decides.
        let strategic = vec![
            StrategicRegionDefinition {
                states: vec![String::from("STATE_C")],
            },
            StrategicRegionDefinition {
                states: vec![String::from("STATE_B"), String::from("STATE_A")],
            },
        ];

        let ids = assign_province_ids(&regions, &strategic, &ranks);
        assert_eq!(ids[&color(4)], 1);
        assert_eq!(ids[&color(2)], 2);
        assert_eq!(ids[&color(1)], 3);
        assert_eq!(ids[&color(3)], 4);
        assert_eq!(ids[&color(5)], 5);
    }

    #[test]
    fn test_scan_ranks_start_at_bottom_row() {
        // Two rows of two pixels: the bottom row is color 2 then color 3
        let rgb = [1, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0];
        let ranks = scan_ranks(&rgb, 2);
        assert_eq!(ranks[&Rgb::new(2, 0, 0)], 0);
        assert_eq!(ranks[&Rgb::new(3, 0, 0)], 1);
        assert_eq!(ranks[&Rgb::new(1, 0, 0)], 2);
    }

    /// Compile the local installation when the VIC3_DIR environment
    /// variable points to one (the directory that contains `game`).
    #[test]
    fn test_compile_installation() {
        let Some(dir) = std::env::var_os("VIC3_DIR") else {
            return;
        };

        let compiled = compile(&DirGameFiles(dir.into())).unwrap();
        let data = &compiled.game_data;
        assert_eq!(
            data.provinces.len(),
            usize::from(compiled.world_meta.max_location_index) + 1
        );

        let province = |id: u32| {
            data.provinces
                .iter()
                .find(|x| x.id == ProvinceId::new(id))
                .unwrap()
        };

        // The ids of these provinces are the state capitals of a 1.14 save:
        // Lower Egypt, Minsk, and Home Counties.
        assert_eq!(
            data.region(province(3).region_id).unwrap().name,
            "Lower Egypt"
        );
        assert_eq!(
            data.region(province(23570).region_id).unwrap().name,
            "Minsk"
        );
        assert_eq!(
            data.region(province(18791).region_id).unwrap().name,
            "Home Counties"
        );
        assert_eq!(province(36006).kind, ProvinceKind::Sea);

        let mut ids: Vec<_> = data
            .provinces
            .iter()
            .map(|x| x.id.value())
            .filter(|x| *x != 0)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), data.provinces.len());
        assert_eq!(ids.last().copied(), Some(ids.len() as u32));

        assert!(data.color("GBR").is_some());
        assert_eq!(data.localize("GBR"), Some("Great Britain"));
        assert_eq!(
            data.localize("dyn_c_united_states"),
            Some("United States of America")
        );
    }
}
