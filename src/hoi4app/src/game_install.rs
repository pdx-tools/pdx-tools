//! Compile the map data of an HOI4 installation into the data that the web
//! client uses.

use crate::{
    CountryColor, GameData, GameProvince, GameState, ProvinceId, ProvinceKind, StateId,
    WorldMetadata, color::hsv_to_rgb,
};
use jomini::{
    TextTape, TextToken, Utf8Encoding,
    text::{ObjectReader, ValueReader},
};
use pdx_map::{Rgb, World, WorldLength};
use std::collections::{HashMap, HashSet};

#[derive(Debug, thiserror::Error)]
pub enum GameInstallError {
    #[error("unable to read {path}")]
    Io {
        path: String,
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },

    #[error("unable to parse {path}: {message}")]
    Parse { path: String, message: String },
}

impl GameInstallError {
    pub fn io(path: &str, source: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        GameInstallError::Io {
            path: String::from(path),
            source: source.into(),
        }
    }

    fn parse(path: &str, message: impl std::fmt::Display) -> Self {
        GameInstallError::Parse {
            path: String::from(path),
            message: message.to_string(),
        }
    }
}

/// Read access to the files of a game installation
pub trait GameFiles {
    fn file_exists(&self, path: &str) -> bool;

    fn read_file(&self, path: &str) -> Result<Vec<u8>, GameInstallError>;

    /// Paths of the files in `dir` (and its subdirectories) that end with
    /// `ends_with`
    fn list_files(&self, dir: &str, ends_with: &str) -> Result<Vec<String>, GameInstallError>;
}

/// Game files in a directory on disk
#[derive(Debug, Clone)]
pub struct DirGameFiles(pub std::path::PathBuf);

impl GameFiles for DirGameFiles {
    fn file_exists(&self, path: &str) -> bool {
        self.0.join(path).is_file()
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, GameInstallError> {
        std::fs::read(self.0.join(path)).map_err(|e| GameInstallError::io(path, e))
    }

    fn list_files(&self, dir: &str, ends_with: &str) -> Result<Vec<String>, GameInstallError> {
        let mut result = Vec::new();
        let mut pending = vec![self.0.join(dir)];
        while let Some(current) = pending.pop() {
            let entries = std::fs::read_dir(&current)
                .map_err(|e| GameInstallError::io(&current.display().to_string(), e))?;
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

/// The ideologies that change the name of a country
const IDEOLOGIES: [&str; 4] = ["communism", "democratic", "fascism", "neutrality"];

pub fn compile(files: &impl GameFiles) -> Result<CompiledGame, GameInstallError> {
    let definitions = parse_definitions(&files.read_file("map/definition.csv")?)?;
    let (world, width, height) = read_province_bitmap(&files.read_file("map/provinces.bmp")?)?;
    let (world, palette) = World::from_rgb8(&world, WorldLength::new(width));

    let state_defs = files
        .list_files("history/states", ".txt")?
        .into_iter()
        .map(|path| parse_state(&path, &files.read_file(&path)?))
        .collect::<Result<Vec<_>, _>>()?;

    let mut province_states = HashMap::new();
    for state in &state_defs {
        for province in &state.provinces {
            province_states.insert(*province, state.id);
        }
    }

    let mut provinces = vec![
        GameProvince {
            id: None,
            kind: ProvinceKind::Land,
            state_id: None,
        };
        palette.len()
    ];
    for (rgb, r16) in palette.iter() {
        if let Some((id, kind)) = definitions.get(rgb) {
            provinces[usize::from(r16.value())] = GameProvince {
                id: Some(*id),
                kind: *kind,
                state_id: province_states.get(id).copied(),
            };
        }
    }

    let colors = parse_country_colors(files)?;
    let country_keys: HashSet<&str> = colors.iter().map(|x| x.key.as_str()).collect();
    let localization = parse_localization(files)?;

    let states = state_defs
        .iter()
        .map(|state| GameState {
            id: state.id,
            name: localization
                .get(state.name.as_str())
                .cloned()
                .unwrap_or_else(|| state.name.clone()),
            impassable: state.impassable,
        })
        .collect();

    let is_country_key = |key: &str| {
        country_keys.contains(key)
            || key.rsplit_once('_').is_some_and(|(base, ideology)| {
                country_keys.contains(base) && IDEOLOGIES.contains(&ideology)
            })
    };

    let localization = localization
        .into_iter()
        .filter(|(key, _)| is_country_key(key))
        .collect();

    let game_data = GameData::new(provinces, states, colors, localization);

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

/// Parse `map/definition.csv` into province ids and kinds by color
fn parse_definitions(
    data: &[u8],
) -> Result<HashMap<Rgb, (ProvinceId, ProvinceKind)>, GameInstallError> {
    let path = "map/definition.csv";
    let text = String::from_utf8_lossy(strip_bom(data));
    let mut result = HashMap::new();
    for line in text.lines() {
        let fields: Vec<_> = line.split(';').collect();
        let [id, r, g, b, kind, ..] = fields.as_slice() else {
            continue;
        };

        let Ok(id) = id.trim().parse::<u32>() else {
            continue;
        };

        if id == 0 {
            continue;
        }

        let channel = |x: &str| {
            x.trim()
                .parse::<u8>()
                .map_err(|e| GameInstallError::parse(path, format!("province {id}: {e}")))
        };
        let rgb = Rgb::new(channel(r)?, channel(g)?, channel(b)?);
        let kind = match kind.trim() {
            "sea" => ProvinceKind::Sea,
            "lake" => ProvinceKind::Lake,
            _ => ProvinceKind::Land,
        };
        result.insert(rgb, (ProvinceId::new(id), kind));
    }
    Ok(result)
}

/// Decode a 24-bit `provinces.bmp` into top-down RGB rows
fn read_province_bitmap(data: &[u8]) -> Result<(Vec<u8>, u32, u32), GameInstallError> {
    let path = "map/provinces.bmp";
    let bmp = rawbmp::Bmp::parse(data).map_err(|e| GameInstallError::parse(path, e))?;
    if bmp.dib_header.bpp != 24 {
        return Err(GameInstallError::parse(
            path,
            format!("expected 24 bits per pixel, found {}", bmp.dib_header.bpp),
        ));
    }

    let width = bmp.dib_header.width.unsigned_abs();
    let height = bmp.dib_header.height.unsigned_abs();
    if width == 0 || height == 0 || width % 2 != 0 {
        return Err(GameInstallError::parse(
            path,
            format!("unsupported dimensions: {width}x{height}"),
        ));
    }

    let mut rows: Vec<&[u8]> = bmp.data().collect();
    if rows.len() != height as usize {
        return Err(GameInstallError::parse(path, "truncated pixel data"));
    }

    // A positive height means the rows are stored from the bottom up.
    if bmp.dib_header.height > 0 {
        rows.reverse();
    }

    let mut out = Vec::with_capacity(width as usize * height as usize * 3);
    for row in rows {
        for bgr in row.as_chunks::<3>().0 {
            out.extend_from_slice(&[bgr[2], bgr[1], bgr[0]]);
        }
    }

    Ok((out, width, height))
}

#[derive(Debug)]
struct StateDefinition {
    id: StateId,
    name: String,
    provinces: Vec<ProvinceId>,
    impassable: bool,
}

fn parse_state(path: &str, data: &[u8]) -> Result<StateDefinition, GameInstallError> {
    let tape =
        TextTape::from_slice(strip_bom(data)).map_err(|e| GameInstallError::parse(path, e))?;
    let reader = tape.utf8_reader();
    let read_id = |value: ValueReader<'_, '_, Utf8Encoding>| {
        let id = value
            .read_scalar()
            .map_err(|e| GameInstallError::parse(path, e))?
            .to_u64()
            .map_err(|e| GameInstallError::parse(path, e))?;
        u32::try_from(id)
            .map_err(|_| GameInstallError::parse(path, format!("id {id} is too large")))
    };

    let state = reader
        .fields()
        .find(|(key, _, _)| key.read_str() == "state")
        .ok_or_else(|| GameInstallError::parse(path, "missing state"))?
        .2
        .read_object()
        .map_err(|e| GameInstallError::parse(path, e))?;

    let mut id = None;
    let mut name = None;
    let mut provinces = Vec::new();
    let mut impassable = false;
    for (key, _, value) in state.fields() {
        match key.read_str().as_ref() {
            "id" => id = Some(StateId::new(read_id(value)?)),
            "name" => name = value.read_string().ok(),
            "impassable" => {
                impassable = value.read_scalar().ok().and_then(|x| x.to_bool().ok()) == Some(true)
            }
            "provinces" => {
                let array = value
                    .read_array()
                    .map_err(|e| GameInstallError::parse(path, e))?;
                for value in array.values() {
                    provinces.push(ProvinceId::new(read_id(value)?));
                }
            }
            _ => {}
        }
    }

    let id = id.ok_or_else(|| GameInstallError::parse(path, "missing state id"))?;
    Ok(StateDefinition {
        id,
        name: name.unwrap_or_else(|| format!("STATE_{}", id.value())),
        provinces,
        impassable,
    })
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
        "rgb" => Some([*a, *b, *c].map(|x| x.round().clamp(0.0, 255.0) as u8)),
        "hsv" => Some(hsv_to_rgb(*a, *b, *c)),
        "hsv360" => Some(hsv_to_rgb(*a / 360.0, *b / 100.0, *c / 100.0)),
        _ => None,
    }
}

fn find_color(object: &ObjectReader<'_, '_, Utf8Encoding>) -> Option<[u8; 3]> {
    object
        .fields()
        .find(|(key, _, _)| key.read_str() == "color")
        .and_then(|(_, _, value)| read_color(&value))
}

/// Colors of the country tags, with the overrides of `colors.txt`, and the
/// colors of the cosmetic tags.
fn parse_country_colors(files: &impl GameFiles) -> Result<Vec<CountryColor>, GameInstallError> {
    let mut colors: HashMap<String, [u8; 3]> = HashMap::new();

    for path in files.list_files("common/country_tags", ".txt")? {
        let data = files.read_file(&path)?;
        let tape = TextTape::from_slice(strip_bom(&data))
            .map_err(|e| GameInstallError::parse(&path, e))?;
        let reader = tape.utf8_reader();
        for (key, _, value) in reader.fields() {
            let tag = key.read_string();
            let Ok(country_path) = value.read_string() else {
                continue;
            };

            if tag.len() != 3 {
                continue;
            }

            // Some tags refer to a file that does not exist
            let country_path = format!("common/{country_path}");
            if !files.file_exists(&country_path) {
                continue;
            }

            let country_data = files.read_file(&country_path)?;
            let tape = TextTape::from_slice(strip_bom(&country_data))
                .map_err(|e| GameInstallError::parse(&country_path, e))?;
            if let Some(color) = find_color(&tape.utf8_reader()) {
                colors.insert(tag, color);
            }
        }
    }

    // colors.txt overrides the country colors and cosmetic.txt adds the
    // colors of the cosmetic tags. Both have the same format.
    for path in [
        "common/countries/colors.txt",
        "common/countries/cosmetic.txt",
    ] {
        if !files.file_exists(path) {
            continue;
        }

        let data = files.read_file(path)?;
        let tape =
            TextTape::from_slice(strip_bom(&data)).map_err(|e| GameInstallError::parse(path, e))?;
        let reader = tape.utf8_reader();
        for (key, _, value) in reader.fields() {
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

/// Parse the English localization files into key value pairs
fn parse_localization(files: &impl GameFiles) -> Result<HashMap<String, String>, GameInstallError> {
    let mut result = HashMap::new();
    for path in files.list_files("localisation/english", "_l_english.yml")? {
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

/// Parse a line like ` GER_fascism:0 "German Reich"`
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
            parse_localization_line(r#" GER_fascism:0 "German Reich""#),
            Some(("GER_fascism", "German Reich"))
        );
        assert_eq!(
            parse_localization_line(r#" STATE_1: "Corsica" # comment"#),
            Some(("STATE_1", "Corsica"))
        );
        assert_eq!(parse_localization_line("l_english:"), None);
        assert_eq!(parse_localization_line(r#" # GER:0 "x""#), None);
    }

    #[test]
    fn test_read_colors() {
        let data = b"a = { color = rgb { 201 56 93 } } b = { color = HSV { 0.1 0.15 0.4 } } c = { color = { 1 2 3 } }";
        let tape = TextTape::from_slice(data).unwrap();
        let colors: Vec<_> = tape
            .utf8_reader()
            .fields()
            .map(|(_, _, value)| find_color(&value.read_object().unwrap()))
            .collect();
        assert_eq!(
            colors,
            vec![Some([201, 56, 93]), Some([102, 96, 87]), Some([1, 2, 3])]
        );
    }

    #[test]
    fn test_parse_state() {
        let data = br#"
state={
	id=1
	name="STATE_1" # Corsica
	impassable = yes
	history={ owner = FRA }
	provinces={
		3838 9851 11804
	}
}"#;
        let state = parse_state("1-France.txt", data).unwrap();
        assert_eq!(state.id, StateId::new(1));
        assert_eq!(state.name, "STATE_1");
        assert!(state.impassable);
        assert_eq!(
            state.provinces,
            [3838, 9851, 11804].map(ProvinceId::new).to_vec()
        );
    }

    #[test]
    fn test_parse_state_rejects_overflowing_ids() {
        let data = b"state={ id=4294967297 provinces={ 1 } }";
        parse_state("1-France.txt", data).unwrap_err();
        let data = b"state={ id=1 provinces={ 1 x } }";
        parse_state("1-France.txt", data).unwrap_err();
    }

    #[test]
    fn test_read_color_rejects_unknown_headers() {
        let data = b"a = { color = hex { 0xff0000 } }";
        let tape = TextTape::from_slice(data).unwrap();
        let reader = tape.utf8_reader();
        let (_, _, value) = reader.fields().next().unwrap();
        assert_eq!(find_color(&value.read_object().unwrap()), None);
    }

    #[test]
    fn test_parse_definitions() {
        let data = b"0;0;0;0;land;false;unknown;0\n1;230;81;119;lake;false;lakes;7\n4;0;0;232;sea;true;ocean;0\n";
        let defs = parse_definitions(data).unwrap();
        assert_eq!(defs.len(), 2);
        assert_eq!(
            defs.get(&Rgb::new(230, 81, 119)),
            Some(&(ProvinceId::new(1), ProvinceKind::Lake))
        );
    }

    /// Compile the local installation when the HOI4_DIR environment
    /// variable points to one.
    #[test]
    fn test_compile_installation() {
        let Some(dir) = std::env::var_os("HOI4_DIR") else {
            return;
        };

        let compiled = compile(&DirGameFiles(dir.into())).unwrap();
        let data = &compiled.game_data;
        assert_eq!(
            data.provinces().len(),
            usize::from(compiled.world_meta.max_location_index) + 1
        );
        assert!(
            data.provinces()
                .iter()
                .filter(|x| x.kind == ProvinceKind::Sea)
                .count()
                > 1000
        );
        assert_eq!(
            data.state(StateId::new(1)).map(|x| x.name.as_str()),
            Some("Corsica")
        );
        assert!(data.color("GER").is_some());
        assert!(data.color("SPR_civil_war").is_some());
        assert_eq!(data.localize("GER_fascism"), Some("German Reich"));
    }
}
