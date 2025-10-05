use crate::FileProvider;
use crate::asset_compilers::PackageOptions;
use crate::eu4::data::map::{self, GameProvince};
use crate::eu4::data::religion::religion_rebels;
use crate::eu4::data::{
    achievements, area, continents, cultures, localization, personalities, regions, religion,
    sprites, superregion,
};
use crate::http;
use anyhow::Context;
use eu4save::{CountryTag, Eu4File, ProvinceId};
use pdx_zstd::zstd_tee::ZstdTee;
use rawbmp::{Pixels, Rgb};
use regex::Regex;
use serde::{Deserialize, de::IgnoredAny};
use std::collections::{HashMap, HashSet};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

struct GameData<'a> {
    countries: &'a [Country],
    trade_companies: &'a HashMap<String, String>,
    personalities: &'a HashMap<String, String>,
    advisors: &'a HashMap<String, String>,
    total_provinces: usize,
    areas: &'a [(String, Vec<ProvinceId>)],
    regions: &'a [(String, Vec<String>)],
    superregions: &'a [(String, Vec<String>)],
    continents: &'a [(String, Vec<ProvinceId>)],
    culture_groups: &'a [(String, Vec<String>)],
    terrain: &'a [(schemas::eu4::Terrain, f32)],
    provinces: &'a [GameProvince],
    center_locations: &'a HashMap<u16, (u16, u16)>,
    localization: &'a HashMap<String, String>,
    religions: &'a [religion::Religion],
    religious_rebels: &'a HashMap<String, religion::ReligiousRebels>,
    units: &'a [(String, UnitFile)],
}

// New function that uses FileProvider for asset processing
pub fn parse_game_assets<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    game_version: &str,
    options: &PackageOptions,
) -> anyhow::Result<()>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    // This is the FileProvider-based implementation
    let localization = english_localization(fs)?;

    let countries = generate_countries(fs, &localization)?;
    let tc = generate_trade_company_investments(fs, imaging, &localization, out_dir, options)?;
    let persons = generate_ruler_personalities(fs, imaging, &localization, out_dir, options)?;
    let advs = generate_advisors(fs, imaging, &localization, out_dir, options)?;
    let (total_provs, provs) = generate_provinces(fs, game_version)?;
    let terrain = generate_terrain(fs)?;

    // Generate map data
    let areas = generate_areas(fs)?;
    let regions = generate_regions(fs)?;
    let superregions = generate_superregions(fs)?;
    let continents = generate_continents(fs)?;
    let culture_groups = generate_culture_groups(fs)?;
    let (religions_data, religious_rebels) = generate_religions(fs, &localization)?;
    let units = extract_units(fs)?;

    translate_flags(fs, imaging, out_dir, options).context("country flag error")?;
    translate_achievements_images(fs, imaging, out_dir, options)
        .context("achievement images error")?;
    translate_building_images(fs, imaging, out_dir, options).context("building images error")?;

    let center_locations = translate_map(fs, imaging, out_dir, options)?;
    let definitions = fs.read_file("map/definition.csv")?;

    // Skip output generation in trace mode
    if !options.dry_run {
        let mut definitions = map::parse_definition(&definitions);
        definitions.insert(0, Rgb::from((0, 0, 0)));

        generate_province_definition_binaries(definitions.iter(), out_dir)?;

        let game_data = GameData {
            countries: &countries,
            trade_companies: &tc,
            personalities: &persons,
            advisors: &advs,
            total_provinces: total_provs,
            areas: &areas,
            regions: &regions,
            superregions: &superregions,
            continents: &continents,
            culture_groups: &culture_groups,
            terrain: &terrain,
            provinces: &provs,
            center_locations: &center_locations,
            localization: &localization,
            religions: &religions_data,
            religious_rebels: &religious_rebels,
            units: &units,
        };

        generate_output_files(out_dir, &game_data)?;
    }

    Ok(())
}

fn english_localization<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<HashMap<String, String>> {
    use std::collections::HashMap;

    let mut result = HashMap::new();

    // Walk the localisation directory to find all english.yml files
    let localization_files = fs.walk_directory("localisation", &["english.yml"])?;

    for file_path in localization_files {
        let data = fs.read_to_string(&file_path)?;
        let locals = parse_localization(&data);
        result.extend(locals);
    }

    Ok(result)
}

fn parse_localization(data: &str) -> HashMap<String, String> {
    let quote_container = Regex::new("\"(.*)\"").unwrap();
    let mut result = HashMap::new();
    for line in data.lines().skip(1) {
        let mut splits = line.split(':');
        if let Some(field) = splits.next() {
            let key = field.trim();

            // skip comments and blanks
            if key.starts_with('#') || key.is_empty() {
                continue;
            }

            if let Some(field2) = splits.next() {
                let rest = splits.collect::<Vec<_>>().join(":");
                let value = format!("{}:{}", field2, rest);
                if let Some(caps) = quote_container.captures(&value) {
                    result.insert(key.to_string(), caps.get(1).unwrap().as_str().to_string());
                }
            }
        }
    }
    result
}

struct Country {
    tag: CountryTag,
    name: String,
    adjective: String,
    culturegfx: String,
}

fn generate_countries<P: FileProvider + ?Sized>(
    fs: &P,
    localization: &HashMap<String, String>,
) -> anyhow::Result<Vec<Country>> {
    let country_localization = localization::country_localization(localization);

    let tag_data = fs.read_file("common/country_tags/00_countries.txt")?;
    let tags: HashMap<CountryTag, PathBuf> =
        jomini::text::de::from_windows1252_slice(&tag_data[..])?;

    let mut countries = Vec::new();
    for (tag, _path) in tags {
        let localized = country_localization.get(&tag).unwrap();
        countries.push(Country {
            tag,
            name: localized.name.clone(),
            adjective: localized.adjective.clone(),
            culturegfx: String::from("westerngfx"),
        });
    }

    countries.sort_unstable_by(|x, y| x.tag.cmp(&y.tag));
    Ok(countries)
}

fn generate_trade_company_investments<P, I>(
    fs: &P,
    imaging: &I,
    localization: &HashMap<String, String>,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    #[derive(Debug, Deserialize)]
    struct InvestmentData {
        pub sprite: String,
    }

    let file_data = fs.read_file("common/tradecompany_investments/00_Investments.txt")?;
    let data: HashMap<String, InvestmentData> =
        jomini::text::de::from_windows1252_slice(&file_data[..])?;

    let gfx_data = fs.read_file("interface/trade_company_investments_view.gfx")?;
    let gfx = sprites::parse_sprites(&gfx_data[..]);
    let sprites: HashMap<String, PathBuf> =
        gfx.into_iter().map(|x| (x.name, x.texturefile)).collect();
    let sprite_images = data
        .iter()
        .map(|(name, investment)| {
            let sprite_path = sprites.get(&investment.sprite).unwrap();
            let file_handle = fs.fs_file(&sprite_path.display().to_string())?;
            Ok((name.clone(), file_handle.path.clone()))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    if !options.dry_run && !options.minimal {
        let image_out_dir = Path::new(&out_dir).join("common/images/tc-investments");
        std::fs::create_dir_all(&image_out_dir)?;

        let montage_request = crate::images::MontageRequest {
            images: &sprite_images,
            output_path: image_out_dir.join("investments.webp"),
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Quality(90),
            },
            geometry: None,
            background: None,
            additional_args: vec![],
        };

        imaging.montage(montage_request)?;
    }

    let name_ids: HashSet<_> = data.keys().map(|name_id| name_id.as_str()).collect();

    let translate: HashMap<_, _> = localization
        .iter()
        .filter_map(|(k, v)| {
            if name_ids.contains(k.as_str()) {
                Some((k.clone(), v.replace("[Root.GetAdjective] ", "")))
            } else {
                None
            }
        })
        .collect();

    Ok(translate)
}

fn generate_ruler_personalities<P, I>(
    fs: &P,
    imaging: &I,
    localization: &HashMap<String, String>,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    let personality_files = fs.walk_directory("common/ruler_personalities", &[".txt"])?;

    let mut personalities_map: HashMap<String, PathBuf> = HashMap::new();
    for person_file in personality_files {
        let data = fs.read_file(&person_file)?;
        let parsed_persons = personalities::personalities(&data[..]);

        for (personality, possible_traits) in parsed_persons.into_iter() {
            let actual_trait = possible_traits
                .iter()
                .find_map(|possible| {
                    let p = format!("gfx/interface/ideas_EU4/{}.dds", possible);
                    let backup = format!(
                        "gfx/interface/ideas_EU4/{}.dds",
                        possible.replace("_opposite", "")
                    );

                    if fs.file_exists(&p) {
                        Some(p)
                    } else if fs.file_exists(&backup) {
                        Some(backup)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    anyhow::anyhow!("unable to find personality imaging for {}", &personality)
                })?;

            personalities_map.insert(personality, PathBuf::from(actual_trait));
        }
    }

    let mut personalities_order = personalities_map
        .iter()
        .map(|(name, path)| {
            let file_handle = fs.fs_file(&path.display().to_string())?;
            Ok((name.clone(), file_handle.path.clone()))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    personalities_order.sort_unstable();

    if !options.dry_run && !options.minimal {
        let image_out_dir = Path::new(&out_dir).join("common/images/personalities");
        std::fs::create_dir_all(&image_out_dir)?;

        let montage_request = crate::images::MontageRequest {
            images: &personalities_order,
            output_path: image_out_dir.join("personalities.webp"),
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Quality(90),
            },
            geometry: None,
            background: Some(crate::images::Color::Transparent),
            additional_args: vec![],
        };

        imaging.montage(montage_request)?;
    }

    let translate: HashMap<_, _> = localization
        .iter()
        .filter(|(k, _v)| personalities_map.contains_key(*k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    Ok(translate)
}

fn generate_advisors<P, I>(
    fs: &P,
    imaging: &I,
    localization: &HashMap<String, String>,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    let advisor_files = fs.walk_directory("common/advisortypes", &[".txt"])?;

    let mut advisors = Vec::new();
    for advisor_file in advisor_files {
        let data = fs.read_file(&advisor_file)?;
        let advise: HashMap<String, IgnoredAny> = jomini::text::de::from_windows1252_slice(&data)?;

        for advisor in advise.keys() {
            advisors.push((advisor.clone(), localization.get(advisor).unwrap().clone()));
        }
    }

    let advisors_montage = advisors
        .iter()
        .map(|(advisor, _)| {
            let advisor_path = format!("gfx/interface/advisors/{}.dds", advisor);
            let file_handle = fs.fs_file(&advisor_path)?;
            Ok((advisor.clone(), file_handle.path.clone()))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    if !options.dry_run && !options.minimal {
        let image_out_dir = Path::new(&out_dir).join("common/images/advisors");
        std::fs::create_dir_all(&image_out_dir)?;

        // Create multiple montages for different sizes
        for &size in &[48, 64, 77] {
            let geometry = Some(crate::images::Geometry::new(size, size));
            let output_filename = format!("advisors_x{}.webp", size);
            let montage_request = crate::images::MontageRequest {
                images: &advisors_montage,
                output_path: image_out_dir.join(output_filename),
                format: crate::images::OutputFormat::Webp {
                    quality: crate::images::WebpQuality::Quality(90),
                },
                geometry,
                background: Some(crate::images::Color::Transparent),
                additional_args: vec![],
            };

            imaging.montage(montage_request)?;
        }
    }

    let translate = advisors.into_iter().collect::<HashMap<_, _>>();

    Ok(translate)
}

fn generate_provinces<P: FileProvider + ?Sized>(
    fs: &P,
    game_version: &str,
) -> anyhow::Result<(usize, Vec<GameProvince>)> {
    let map_data = fs.read_file("map/default.map")?;
    let default_map = map::parse_default_map(&map_data[..]);
    let ocean_provs: HashSet<_> = default_map
        .lakes
        .iter()
        .chain(default_map.sea_starts.iter())
        .collect();

    let data = http::request(format!("terrain/terrain-{}.eu4", game_version));
    let save_file = Eu4File::from_slice(&data)?;
    let tokens = schemas::resolver::Eu4FlatTokens::new();
    let breakpoint = tokens.breakpoint();
    let values = tokens.into_values();
    let resolver = eu4save::SegmentedResolver::from_parts(values, breakpoint, 10000);
    let save = save_file.parse_save(&resolver)?;
    let mut provs: Vec<_> = save.game.provinces.iter().collect();
    provs.sort_unstable_by_key(|(k, _v)| *k);
    let total_provs = provs.len();

    let mut terrains = Vec::new();
    let man = CountryTag::new(*b"KOI");
    for (id, prov) in provs {
        if let Some(owner) = &prov.owner {
            let terrain = match owner.as_str() {
                "KAL" => schemas::eu4::Terrain::Grasslands,
                "FRA" => schemas::eu4::Terrain::Hills,
                "SWI" => schemas::eu4::Terrain::Mountains,
                "OMA" => schemas::eu4::Terrain::Desert,
                "SWE" => schemas::eu4::Terrain::Marsh,
                "HOL" => schemas::eu4::Terrain::Farmlands,
                "NOV" => schemas::eu4::Terrain::Forest,
                "TUN" => schemas::eu4::Terrain::CoastalDesert,
                "VEN" => schemas::eu4::Terrain::Coastline,
                "CRE" => schemas::eu4::Terrain::Savannah,
                "MAM" => schemas::eu4::Terrain::Drylands,
                "KAR" => schemas::eu4::Terrain::Highlands,
                "MOS" => schemas::eu4::Terrain::Woods,
                "COC" => schemas::eu4::Terrain::Jungle,
                "KAZ" => schemas::eu4::Terrain::Steppe,
                "KMC" => schemas::eu4::Terrain::Glacier,
                _ => panic!("unknown tag"),
            };

            let is_island = prov.cores.contains(&man);

            terrains.push(GameProvince {
                id: *id,
                terrain,
                province_is_on_an_island: is_island,
            })
        } else if !prov.ub {
            if ocean_provs.contains(id) {
                terrains.push(GameProvince {
                    id: *id,
                    terrain: schemas::eu4::Terrain::Ocean,
                    province_is_on_an_island: false,
                });
            } else {
                terrains.push(GameProvince {
                    id: *id,
                    terrain: schemas::eu4::Terrain::Wasteland,
                    province_is_on_an_island: false,
                });
            }
        }
    }

    terrains.sort_by_key(|x| x.id);
    terrains.dedup();
    Ok((total_provs, terrains))
}

fn generate_terrain<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(schemas::eu4::Terrain, f32)>> {
    let terrain_data = fs.read_file("map/terrain.txt")?;
    let terrain = map::parse_terrain_txt(&terrain_data)
        .categories
        .into_iter()
        .filter_map(|(terrain, data)| {
            let terrain = match terrain.as_str() {
                "grasslands" => Some(schemas::eu4::Terrain::Grasslands),
                "hills" => Some(schemas::eu4::Terrain::Hills),
                "mountain" => Some(schemas::eu4::Terrain::Mountains),
                "desert" => Some(schemas::eu4::Terrain::Desert),
                "marsh" => Some(schemas::eu4::Terrain::Marsh),
                "farmlands" => Some(schemas::eu4::Terrain::Farmlands),
                "forest" => Some(schemas::eu4::Terrain::Forest),
                "coastal_desert" => Some(schemas::eu4::Terrain::CoastalDesert),
                "coastline" => Some(schemas::eu4::Terrain::Coastline),
                "savannah" => Some(schemas::eu4::Terrain::Savannah),
                "drylands" => Some(schemas::eu4::Terrain::Drylands),
                "highlands" => Some(schemas::eu4::Terrain::Highlands),
                "woods" => Some(schemas::eu4::Terrain::Woods),
                "jungle" => Some(schemas::eu4::Terrain::Jungle),
                "steppe" => Some(schemas::eu4::Terrain::Steppe),
                "glacier" => Some(schemas::eu4::Terrain::Glacier),
                "pti" | "ocean" | "inland_ocean" | "wasteland" | "impassable_mountains" => None,
                x => panic!("unknown terrain: {}", x),
            }?;
            Some((terrain, data.local_development_cost))
        })
        .collect::<Vec<_>>();
    Ok(terrain)
}

fn generate_areas<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(String, Vec<ProvinceId>)>> {
    let data = fs.read_file("map/area.txt")?;
    let mut data = area::parse_areas(&data).into_iter().collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    Ok(data)
}

fn generate_regions<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(String, Vec<String>)>> {
    let data = fs.read_file("map/region.txt")?;
    let mut data = regions::parse_regions(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    Ok(data)
}

fn generate_superregions<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(String, Vec<String>)>> {
    let data = fs.read_file("map/superregion.txt")?;
    let mut data = superregion::parse_superregions(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    Ok(data)
}

fn generate_continents<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(String, Vec<ProvinceId>)>> {
    let data = fs.read_file("map/continent.txt")?;
    let mut data = continents::parse_continents(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    Ok(data)
}

fn generate_culture_groups<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<Vec<(String, Vec<String>)>> {
    let data = fs.read_file("common/cultures/00_cultures.txt")?;
    let mut data = cultures::parse_cultures(&data)
        .culture_groups
        .into_iter()
        .map(|(key, group)| (key, group.cultures))
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    Ok(data)
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum UnitKind {
    Infantry,
    Cavalry,
    Artillery,
    HeavyShip,
    LightShip,
    Galley,
    Transport,
}

#[derive(Deserialize)]
struct UnitFile {
    #[serde(alias = "type")]
    _type: UnitKind,
    #[serde(default)]
    maneuver: u8,
    #[serde(default)]
    offensive_morale: u8,
    #[serde(default)]
    defensive_morale: u8,
    #[serde(default)]
    offensive_fire: u8,
    #[serde(default)]
    defensive_fire: u8,
    #[serde(default)]
    offensive_shock: u8,
    #[serde(default)]
    defensive_shock: u8,

    #[serde(default)]
    hull_size: u8,
    #[serde(default)]
    base_cannons: u8,
    #[serde(default)]
    blockade: u8,
    #[serde(default)]
    sail_speed: f32,
    #[serde(default)]
    sailors: u16,
}

fn extract_units<P: FileProvider + ?Sized>(fs: &P) -> anyhow::Result<Vec<(String, UnitFile)>> {
    let unit_files = fs.walk_directory("common/units", &[".txt"])?;

    let mut units = Vec::new();
    for unit_file in unit_files {
        let data = fs.read_file(&unit_file)?;
        let unit: UnitFile = jomini::text::de::from_windows1252_slice(&data)?;

        // Extract filename without extension
        let filename = std::path::Path::new(&unit_file)
            .file_stem()
            .context("unable to get file prefix")?
            .to_str()
            .context("unable to convert file name")?;

        units.push((String::from(filename), unit));
    }

    Ok(units)
}

fn generate_religions<P: FileProvider + ?Sized>(
    fs: &P,
    localization: &HashMap<String, String>,
) -> anyhow::Result<(
    Vec<religion::Religion>,
    HashMap<String, religion::ReligiousRebels>,
)> {
    let data = fs.read_file("common/religions/00_religion.txt")?;
    let mut data = religion::parse_enhanced_religions(&data, localization);
    data.sort_unstable_by(|a, b| a.id.cmp(&b.id));

    // Get religious rebels data
    let rebel_files = fs.walk_directory("common/rebel_types", &[".txt"])?;
    let mut religious_rebels: HashMap<String, religion::ReligiousRebels> = HashMap::new();

    for rebel_file in rebel_files {
        let rebel_data = fs.read_file(&rebel_file)?;
        if let Some(rebels) = religion_rebels(&rebel_data) {
            religious_rebels.insert(rebels.religion.clone(), rebels);
        }
    }

    Ok((data, religious_rebels))
}

fn translate_flags<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    // Walk flags directory and get all flag files
    let flag_files = fs.walk_directory("gfx/flags", &[".tga", ".dds"])?;
    let mut flags_with_paths = Vec::new();

    for flag_file in flag_files {
        // Extract flag name from path
        let path = Path::new(&flag_file);
        if let Some(file_stem) = path.file_stem()
            && let Some(tag) = file_stem.to_str()
        {
            let file_handle = fs.fs_file(&flag_file)?;
            flags_with_paths.push((tag.to_string(), file_handle.path.clone()));
        }
    }

    // Sort by tag name for consistent output
    flags_with_paths.sort_by(|a, b| a.0.cmp(&b.0));

    if options.dry_run || options.minimal {
        return Ok(());
    }

    let base_flag_path = Path::new(&out_dir).join("common/images/flags");
    std::fs::create_dir_all(&base_flag_path)
        .with_context(|| format!("unable to create: {}", base_flag_path.display()))?;

    let flag_data_file =
        std::fs::File::create(base_flag_path.join("flags.json")).with_context(|| {
            format!(
                "unable to create: {}",
                base_flag_path.join("flags.json").display()
            )
        })?;
    let mut flag_json = BufWriter::new(flag_data_file);
    flag_json.write_all(&b"{\n"[..])?;

    // Write JSON mapping
    for (i, (tag, _)) in flags_with_paths.iter().enumerate() {
        if i != 0 {
            flag_json.write_all(&b","[..])?;
        }
        write!(flag_json, "\"{}\":{}", tag, i)?;
    }
    flag_json.write_all(&b"\n}"[..])?;
    flag_json.flush()?;

    // Create montage using trait
    for &size in &[8, 48, 64, 128] {
        let geometry = Some(crate::images::Geometry::new(size, size));
        let output_filename = format!("flags_x{}.webp", size);
        let montage_request = crate::images::MontageRequest {
            images: &flags_with_paths,
            output_path: base_flag_path.join(output_filename),
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Quality(90),
            },
            geometry,
            background: Some(crate::images::Color::White),
            additional_args: vec!["-alpha".to_string(), "Off".to_string()],
        };

        imaging
            .montage(montage_request)
            .context("unable to create country flag montage")?;
    }

    Ok(())
}

fn translate_achievements_images<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    let achievements_gfx_data = fs.read_file("interface/achievements.gfx")?;
    let achievement_paths = achievements::achievement_images(&achievements_gfx_data[..]);
    let achievement_data = eu4game_data::achievements();

    let mut achieves = achievement_data
        .iter()
        .filter_map(|x| {
            let path = achievement_paths.get(&x.id)?;
            let achievement_path = path.display().to_string().replace("//", "/");
            let file_handle = fs
                .fs_file(achievement_path.as_str())
                .expect("unable to get file");
            Some((x.id.to_string(), file_handle.path))
        })
        .collect::<Vec<_>>();

    achieves.sort_unstable_by(|a, b| a.0.cmp(&b.0));

    if options.dry_run || options.minimal {
        return Ok(());
    }

    let base_achievements_path = Path::new(&out_dir).join("common/images/achievements");
    std::fs::create_dir_all(&base_achievements_path)
        .with_context(|| format!("unable to create: {}", base_achievements_path.display()))?;

    // Create montage using trait
    let montage_request = crate::images::MontageRequest {
        images: &achieves,
        output_path: base_achievements_path.join("achievements.webp"),
        format: crate::images::OutputFormat::Webp {
            quality: crate::images::WebpQuality::Quality(90),
        },
        geometry: Some(crate::images::Geometry::new(64, 64)),
        background: Some(crate::images::Color::Transparent),
        additional_args: vec![],
    };

    imaging
        .montage(montage_request)
        .context("unable to create achievement images montage")?;

    Ok(())
}

fn translate_building_images<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    let base_path = Path::new(&out_dir).join("common/images/buildings");
    if !options.dry_run && !options.minimal {
        std::fs::create_dir_all(&base_path)
            .with_context(|| format!("unable to create: {}", base_path.display()))?;
    }

    let data = fs.read_file("interface/building_icons.gfx")?;
    let sprites = sprites::parse_sprites(&data[..]);

    let mut western_buildings = Vec::new();
    let mut global_buildings = Vec::new();

    for sprite in sprites {
        let mut new_name = String::from(sprite.name.get(4..).unwrap());
        let image_path = sprite.texturefile.to_string_lossy().replace("//", "/");

        // Find buildings like "latin_temple.tga" which should have their name "GFX_temple",
        // mapped to temple_westerngfx
        if sprite
            .texturefile
            .file_name()
            .is_some_and(|x| x.to_string_lossy().starts_with("latin_"))
        {
            // Map GFX_shipyard texturefile to to
            new_name = format!("{}_westerngfx", new_name);
        }

        if new_name.ends_with("pagan") {
            new_name = new_name.replace("pagan", "africangfx");
        }

        if new_name.ends_with("muslim") {
            new_name = new_name.replace("muslim", "muslimgfx");
        }

        let tga_path = format!("{}.tga", image_path.trim_end_matches(".dds"));
        let dds_path = format!("{}.dds", image_path.trim_end_matches(".tga"));

        let final_image_path = if fs.file_exists(&tga_path) {
            tga_path
        } else if fs.file_exists(&dds_path) {
            dds_path
        } else {
            image_path.to_string()
        };

        let file_handle = fs.fs_file(&final_image_path)?;

        if new_name.ends_with("westerngfx") {
            western_buildings.push((new_name, file_handle.path));
        } else if !new_name.ends_with("gfx") {
            global_buildings.push((new_name, file_handle.path));
        }
    }

    if options.dry_run || options.minimal {
        return Ok(());
    }

    // Turn alpha off as else buildings like latin_admiralty are converted to
    // something that is completely transparent
    let additional_args = vec!["-alpha".to_string(), "Off".to_string()];

    let montage_request = crate::images::MontageRequest {
        images: &western_buildings,
        output_path: base_path.join("westerngfx.webp"),
        format: crate::images::OutputFormat::Webp {
            quality: crate::images::WebpQuality::Quality(90),
        },
        geometry: None,
        background: Some(crate::images::Color::White),
        additional_args: additional_args.clone(),
    };

    imaging.montage(montage_request)?;

    let montage_request = crate::images::MontageRequest {
        images: &global_buildings,
        output_path: base_path.join("global.webp"),
        format: crate::images::OutputFormat::Webp {
            quality: crate::images::WebpQuality::Quality(90),
        },
        geometry: None,
        background: Some(crate::images::Color::White),
        additional_args,
    };

    imaging.montage(montage_request)?;

    Ok(())
}

fn translate_map<P, I>(
    fs: &P,
    imaging: &I,
    out_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<u16, (u16, u16)>>
where
    P: FileProvider + ?Sized,
    I: crate::images::ImageProcessor,
{
    let base_image_dir = out_game_dir.join("map");
    if !options.dry_run {
        std::fs::create_dir_all(&base_image_dir)
            .with_context(|| format!("unable to create: {}", base_image_dir.display()))?;
    }

    // Process province, terrain, and river maps (32-bit images)
    for image in &["provinces.bmp", "terrain.bmp", "rivers.bmp"] {
        let image_path = format!("map/{}", image);
        let file_handle = fs.fs_file(&image_path)?;
        if options.dry_run {
            continue;
        }

        let file_stem = Path::new(image).file_stem().unwrap();

        let mut end_filename = file_stem.to_os_string();
        end_filename.push("-%d.webp");
        let out_path = base_image_dir.join(&end_filename);
        let convert_request = crate::images::ConvertRequest {
            input_path: file_handle.path.clone(),
            output_path: out_path,
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Lossless,
            },
            operation: Some(crate::images::ImageOperation::Tile(
                crate::images::TileGeometry::new(2, 1),
            )),
        };

        imaging.convert(convert_request).context("convert failed")?;
    }

    // Process occupation terrain
    for image in &["terrain/occupation.dds"] {
        let image_path = format!("map/{}", image);
        let file_handle = fs.fs_file(&image_path)?;
        if options.dry_run {
            continue;
        }

        let file_stem = Path::new(image).file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".webp");
        let out_path = base_image_dir.join(&end_filename);

        let convert_request = crate::images::ConvertRequest {
            input_path: file_handle.path,
            output_path: out_path,
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Lossless,
            },
            operation: None,
        };

        imaging.convert(convert_request)?;
    }

    // Process other map textures
    for image in &[
        "world_normal.bmp",
        "terrain/colormap_summer.dds",
        "terrain/colormap_water.dds",
        "terrain/noise-2d.dds",
        "heightmap.bmp",
        "terrain/atlas_normal0.dds",
        "terrain/atlas0.dds",
    ] {
        let image_path = format!("map/{}", image);
        let file_handle = fs.fs_file(&image_path)?;
        if options.dry_run {
            continue;
        }

        let file_stem = Path::new(image).file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".webp");
        let out_path = base_image_dir.join(&end_filename);

        let operation = if *image == "heightmap.bmp" {
            Some(crate::images::ImageOperation::Resize(
                crate::images::Geometry::new(2816, 1024),
            ))
        } else {
            None
        };

        let convert_request = crate::images::ConvertRequest {
            input_path: file_handle.path,
            output_path: out_path,
            format: crate::images::OutputFormat::Webp {
                quality: crate::images::WebpQuality::Lossless,
            },
            operation,
        };

        imaging.convert(convert_request)?;
    }

    // Process atlas textures with cropping
    for image in &["terrain/atlas_normal0.dds", "terrain/atlas0.dds"] {
        let image_path = format!("map/{}", image);
        let file_handle = fs.fs_file(&image_path)?;
        if options.dry_run {
            continue;
        }

        let file_stem = Path::new(image).file_stem().unwrap();

        for i in &["rock", "green"] {
            let mut end_filename = file_stem.to_os_string();
            end_filename.push("_");
            end_filename.push(i);
            end_filename.push(".webp");
            let out_path = base_image_dir.join(&end_filename);

            let crop_geometry = match *i {
                "rock" => crate::images::CropGeometry::new(512, 512, 1024, 512),
                "green" => crate::images::CropGeometry::new(512, 512, 512, 1024),
                _ => unreachable!(),
            };

            let convert_request = crate::images::ConvertRequest {
                input_path: file_handle.path.clone(),
                output_path: out_path,
                format: crate::images::OutputFormat::Webp {
                    quality: crate::images::WebpQuality::Lossless,
                },
                operation: Some(crate::images::ImageOperation::Crop(crop_geometry)),
            };

            imaging.convert(convert_request)?;
        }
    }

    // Always process the province definitions to get center locations
    let center_locations = process_province_definitions(fs)?;

    Ok(center_locations)
}

fn process_province_definitions<P: FileProvider + ?Sized>(
    fs: &P,
) -> anyhow::Result<HashMap<u16, (u16, u16)>> {
    // Read and parse province definitions
    let definitions = fs.read_file("map/definition.csv")?;
    let mut definitions = map::parse_definition(&definitions);
    definitions.insert(0, Rgb::from((0, 0, 0)));

    let mut definitions: Vec<(_, _)> = definitions.iter().map(|(id, rgb)| (rgb, id)).collect();
    definitions.sort_unstable();

    let mut provs: Vec<_> = definitions
        .iter()
        .enumerate()
        .map(|(i, (_rgb, id))| (id, i))
        .collect();
    provs.sort_unstable_by_key(|(id, _index)| **id);

    // Calculate pixel location of center of province
    let provinces_file_data = fs.read_file("map/provinces.bmp")?;
    let definitions: HashMap<_, _> = definitions.into_iter().collect();
    let mut pixel_locations: HashMap<u16, Vec<(u16, u16)>> = HashMap::new();

    let provinces_bmp =
        rawbmp::Bmp::parse(&provinces_file_data[..]).context("unable to parse bmp")?;
    let Pixels::Rgb(pixs) = provinces_bmp.pixels();
    let width = provinces_bmp.dib_header.width.unsigned_abs() as usize;
    let height = provinces_bmp.dib_header.height.unsigned_abs() as u16;

    for (i, pix) in pixs.enumerate() {
        let id = definitions.get(&pix).copied().unwrap();
        let x = (i % width) as u16;
        let y = height - (i / width) as u16;
        let coord = pixel_locations.entry(*id).or_default();
        coord.push((x, y));
    }

    let center_locations: HashMap<u16, (u16, u16)> = pixel_locations
        .iter()
        .map(|(id, coords)| {
            let x = coords.iter().map(|(x, _)| *x as u32).sum::<u32>() / coords.len() as u32;
            let y = coords.iter().map(|(_, y)| *y as u32).sum::<u32>() / coords.len() as u32;
            (*id, (x as u16, y as u16))
        })
        .collect();

    Ok(center_locations)
}

fn generate_province_definition_binaries<'a>(
    definitions: impl Iterator<Item = (&'a u16, &'a Rgb)>,
    out_game_dir: &Path,
) -> anyhow::Result<()> {
    let mut definitions: Vec<(_, _)> = definitions.map(|(id, rgb)| (rgb, id)).collect();
    definitions.sort_unstable();
    let mut provs: Vec<_> = definitions
        .iter()
        .enumerate()
        .map(|(i, (_rgb, id))| (id, i))
        .collect();
    provs.sort_unstable_by_key(|(id, _index)| **id);

    let map_dir = out_game_dir.join("map");
    std::fs::create_dir_all(&map_dir)?;

    // These files don't compress that well (and are small), so we skip compression
    let color_order_file = std::fs::File::create(map_dir.join("color-order.bin"))?;
    let mut color_order_writer = BufWriter::new(color_order_file);
    for (rgb, _prov_id) in &definitions {
        color_order_writer.write_all(&[rgb.r, rgb.g, rgb.b])?;
    }
    color_order_writer.flush()?;

    let color_index_file = std::fs::File::create(map_dir.join("color-index.bin"))?;
    let mut color_index_writer = BufWriter::new(color_index_file);
    for (_prov_id, index) in &provs {
        let val = *index as u16;
        let data = val.to_le_bytes();
        color_index_writer.write_all(&data)?;
    }
    color_index_writer.flush()?;

    Ok(())
}

fn generate_output_files(out_game_dir: &Path, game_data: &GameData) -> anyhow::Result<()> {
    let mut buffer = schemas::flatbuffers::FlatBufferBuilder::new();

    // COUNTRIES
    let mut countries_vec = Vec::new();
    for country in game_data.countries.iter() {
        let tag = buffer.create_string(country.tag.as_str());
        let name = buffer.create_string(country.name.as_str());
        let adjective = buffer.create_string(country.adjective.as_str());
        let culturegfx = buffer.create_string(country.culturegfx.as_str());
        let entry = schemas::eu4::Country::create(
            &mut buffer,
            &schemas::eu4::CountryArgs {
                tag: Some(tag),
                name: Some(name),
                adjective: Some(adjective),
                culturegfx: Some(culturegfx),
            },
        );
        countries_vec.push(entry);
    }
    let countries = buffer.create_vector(&countries_vec);

    // AREAS
    let mut areas_vec = Vec::new();
    for (key, provinces) in game_data.areas.iter() {
        let key = buffer.create_string(key);
        let ids = provinces.iter().map(ProvinceId::as_u16);
        let vec = buffer.create_vector_from_iter(ids);
        let entry = schemas::eu4::EntryUI16List::create(
            &mut buffer,
            &schemas::eu4::EntryUI16ListArgs {
                key: Some(key),
                value: Some(vec),
            },
        );
        areas_vec.push(entry);
    }
    let areas = buffer.create_vector(&areas_vec);

    // REGIONS
    let mut regions_vec = Vec::new();
    for (key, areas) in game_data.regions.iter() {
        let key = buffer.create_string(key);
        let strs = areas
            .iter()
            .map(|x| buffer.create_string(x.as_str()))
            .collect::<Vec<_>>();
        let vec = buffer.create_vector(&strs);
        let entry = schemas::eu4::EntryStringList::create(
            &mut buffer,
            &schemas::eu4::EntryStringListArgs {
                key: Some(key),
                value: Some(vec),
            },
        );
        regions_vec.push(entry);
    }
    let regions = buffer.create_vector(&regions_vec);

    // SUPER-REGIONS
    let mut superregions_vec = Vec::new();
    for (key, areas) in game_data.superregions.iter() {
        let key = buffer.create_string(key);
        let strs = areas
            .iter()
            .map(|x| buffer.create_string(x.as_str()))
            .collect::<Vec<_>>();
        let vec = buffer.create_vector(&strs);
        let entry = schemas::eu4::EntryStringList::create(
            &mut buffer,
            &schemas::eu4::EntryStringListArgs {
                key: Some(key),
                value: Some(vec),
            },
        );
        superregions_vec.push(entry);
    }
    let superregions = buffer.create_vector(&superregions_vec);

    // CONTINENTS
    let mut continents_vec = Vec::new();
    for (key, provinces) in game_data.continents.iter() {
        let key = buffer.create_string(key);
        let ids = provinces.iter().map(ProvinceId::as_u16);
        let vec = buffer.create_vector_from_iter(ids);
        let entry = schemas::eu4::EntryUI16List::create(
            &mut buffer,
            &schemas::eu4::EntryUI16ListArgs {
                key: Some(key),
                value: Some(vec),
            },
        );
        continents_vec.push(entry);
    }
    let continents = buffer.create_vector(&continents_vec);

    // CULTURE-GROUPS
    let mut culture_groups_vec = Vec::new();
    for (key, cultures) in game_data.culture_groups.iter() {
        let key = buffer.create_string(key);
        let strs = cultures
            .iter()
            .map(|x| buffer.create_string(x.as_str()))
            .collect::<Vec<_>>();
        let vec = buffer.create_vector(&strs);
        let entry = schemas::eu4::EntryStringList::create(
            &mut buffer,
            &schemas::eu4::EntryStringListArgs {
                key: Some(key),
                value: Some(vec),
            },
        );
        culture_groups_vec.push(entry);
    }
    let culture_groups = buffer.create_vector(&culture_groups_vec);

    // TRADE COMPANY INVESTMENTS
    let mut data = game_data.trade_companies.iter().collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    let mut trade_companies = Vec::new();
    for (key, name) in data.iter() {
        let key = buffer.create_string(key);
        let name = buffer.create_string(name);
        let entry = schemas::eu4::EntryString::create(
            &mut buffer,
            &schemas::eu4::EntryStringArgs {
                key: Some(key),
                value: Some(name),
            },
        );
        trade_companies.push(entry);
    }
    let trade_companies = buffer.create_vector(&trade_companies);

    // PERSONALITIES
    let mut data = game_data.personalities.iter().collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    let mut personalities = Vec::new();
    for (key, name) in data.iter() {
        let key = buffer.create_string(key);
        let name = buffer.create_string(name);
        let entry = schemas::eu4::EntryString::create(
            &mut buffer,
            &schemas::eu4::EntryStringArgs {
                key: Some(key),
                value: Some(name),
            },
        );
        personalities.push(entry);
    }
    let personalities = buffer.create_vector(&personalities);

    // ADVISORS
    let mut data = game_data.advisors.iter().collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    let mut advisors = Vec::new();
    for (key, name) in data.iter() {
        let key = buffer.create_string(key);
        let name = buffer.create_string(name);
        let entry = schemas::eu4::EntryString::create(
            &mut buffer,
            &schemas::eu4::EntryStringArgs {
                key: Some(key),
                value: Some(name),
            },
        );
        advisors.push(entry);
    }
    let advisors = buffer.create_vector(&advisors);

    // PROVINCES
    let mut provinces = Vec::new();
    for province in game_data.provinces.iter() {
        let (center_x, center_y) = *game_data
            .center_locations
            .get(&province.id.as_u16())
            .ok_or_else(|| anyhow::anyhow!("province not found in map: {}", &province.id))?;

        let entry = schemas::eu4::Province::create(
            &mut buffer,
            &schemas::eu4::ProvinceArgs {
                id: province.id.as_u16(),
                terrain: province.terrain,
                province_is_on_an_island: province.province_is_on_an_island,
                center_x,
                center_y,
            },
        );
        provinces.push(entry);
    }
    let provinces = buffer.create_vector(&provinces);

    // TERRAIN
    let mut terrains = Vec::new();
    for (terrain, local_dev) in game_data.terrain.iter() {
        let entry = schemas::eu4::TerrainInfo::create(
            &mut buffer,
            &schemas::eu4::TerrainInfoArgs {
                id: *terrain,
                local_development_cost: *local_dev,
            },
        );
        terrains.push(entry);
    }
    let terrain = buffer.create_vector(&terrains);

    // LOCALIZATION
    let mut localization_vec: Vec<_> = game_data
        .localization
        .iter()
        .filter(|(k, _v)| {
            k.starts_with("building_")
                || k.ends_with("_area")
                || k.ends_with("_superregion")
                || k.ends_with("_region")
        })
        .collect();
    localization_vec.sort_unstable();
    let mut localization_entries = Vec::new();
    for (key, name) in localization_vec.iter() {
        let key = buffer.create_string(key);
        let name = buffer.create_string(name);
        let entry = schemas::eu4::EntryString::create(
            &mut buffer,
            &schemas::eu4::EntryStringArgs {
                key: Some(key),
                value: Some(name),
            },
        );
        localization_entries.push(entry);
    }
    let localization = buffer.create_vector(&localization_entries);

    // RELIGIONS
    let mut religions = Vec::new();
    for religion in game_data.religions.iter() {
        let key = buffer.create_string(&religion.id);
        let name = buffer.create_string(&religion.name);
        let group = buffer.create_string(&religion.group);
        let color =
            schemas::eu4::Rgb::new(religion.colors[0], religion.colors[1], religion.colors[2]);

        let strs = religion
            .allowed_conversions
            .iter()
            .map(|x| buffer.create_string(x.as_str()))
            .collect::<Vec<_>>();
        let allowed_conversions = buffer.create_vector(&strs);

        let rebels = game_data.religious_rebels.get(&religion.id);
        let entry = schemas::eu4::Religion::create(
            &mut buffer,
            &schemas::eu4::ReligionArgs {
                key: Some(key),
                group: Some(group),
                name: Some(name),
                color: Some(&color),
                allowed_conversion: Some(allowed_conversions),
                negotiate_convert_on_dominant_religion: rebels
                    .is_some_and(|x| x.negotiate_convert_on_dominant_religion),
                force_convert_on_break: rebels.is_some_and(|x| x.force_convert_on_break),
            },
        );
        religions.push(entry);
    }
    let religions = buffer.create_vector(&religions);

    // UNITS
    let mut land_units = Vec::new();
    let mut naval_units = Vec::new();
    for (unit_name, unit) in game_data.units {
        let unit_name = buffer.create_string(unit_name);
        match unit._type {
            UnitKind::Infantry | UnitKind::Cavalry | UnitKind::Artillery => {
                let kind = match unit._type {
                    UnitKind::Infantry => schemas::eu4::LandUnitKind::Infantry,
                    UnitKind::Cavalry => schemas::eu4::LandUnitKind::Cavalry,
                    UnitKind::Artillery => schemas::eu4::LandUnitKind::Artillery,
                    _ => unreachable!(),
                };

                let unit = schemas::eu4::LandUnit::create(
                    &mut buffer,
                    &schemas::eu4::LandUnitArgs {
                        name: Some(unit_name),
                        kind,
                        maneuver: unit.maneuver,
                        offensive_morale: unit.offensive_morale,
                        defensive_morale: unit.defensive_morale,
                        offensive_fire: unit.offensive_fire,
                        defensive_fire: unit.defensive_fire,
                        offensive_shock: unit.offensive_shock,
                        defensive_shock: unit.defensive_shock,
                    },
                );

                land_units.push(unit);
            }
            _ => {
                let kind = match unit._type {
                    UnitKind::HeavyShip => schemas::eu4::NavalUnitKind::HeavyShip,
                    UnitKind::LightShip => schemas::eu4::NavalUnitKind::LightShip,
                    UnitKind::Galley => schemas::eu4::NavalUnitKind::Galley,
                    UnitKind::Transport => schemas::eu4::NavalUnitKind::Transport,
                    _ => unreachable!(),
                };

                let unit = schemas::eu4::NavalUnit::create(
                    &mut buffer,
                    &schemas::eu4::NavalUnitArgs {
                        name: Some(unit_name),
                        kind,
                        hull_size: unit.hull_size,
                        base_cannons: unit.base_cannons,
                        blockade: unit.blockade,
                        sail_speed: unit.sail_speed,
                        sailors: unit.sailors,
                    },
                );

                naval_units.push(unit);
            }
        }
    }

    let land_units = buffer.create_vector(&land_units);
    let naval_units = buffer.create_vector(&naval_units);

    // GAME
    let game = schemas::eu4::Game::create(
        &mut buffer,
        &schemas::eu4::GameArgs {
            countries: Some(countries),
            total_provinces: game_data.total_provinces as u32,
            provinces: Some(provinces),
            localization: Some(localization),
            areas: Some(areas),
            regions: Some(regions),
            superregions: Some(superregions),
            continents: Some(continents),
            culture_groups: Some(culture_groups),
            trade_companies: Some(trade_companies),
            personalities: Some(personalities),
            advisors: Some(advisors),
            religions: Some(religions),
            land_units: Some(land_units),
            naval_units: Some(naval_units),
            terrain: Some(terrain),
        },
    );

    buffer.finish(game, None);
    let raw = buffer.finished_data();

    let mut writer = ZstdTee::create(out_game_dir.join("data"))?;
    writer.write_all(raw)?;
    writer.flush()?;
    writer.finish()?;

    Ok(())
}
