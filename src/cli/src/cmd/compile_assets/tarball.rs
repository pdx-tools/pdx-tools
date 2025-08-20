use super::imagemagick;
use super::mapper::parse_terrain_txt;
use super::montager::{self, Montager};
use super::religion::religion_rebels;
use super::{
    achievements, area, assets, continents, cultures, localization, mapper, personalities, regions,
    religion, sprites, superregion,
};
use crate::rawbmp::{self, Pixels, Rgb};
use crate::zstd_tee::ZstdTee;
use anyhow::{bail, Context};
use eu4save::{CountryTag, Eu4File, ProvinceId};
use mapper::GameProvince;
use serde::{de::IgnoredAny, Deserialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct PackageOptions {
    pub common: bool,
    pub regen: bool,
    pub path: PathBuf,
}

pub fn parse_game_bundle(options: &PackageOptions) -> anyhow::Result<()> {
    let tar_name = options.path.file_name().unwrap().to_string_lossy();
    let game_file_stem = tar_name.trim_end_matches(".tar.zst");
    let game_parts: Vec<_> = game_file_stem.split('-').collect();
    let game_name = game_parts[0].to_string();
    let game_version = game_parts[1].to_string();
    let game_dir = Path::new(".")
        .join("assets")
        .join("game")
        .join(game_name)
        .join(&game_version);
    std::fs::create_dir_all(&game_dir).with_context(|| format!("{}", game_dir.display()))?;

    let tar_zst =
        fs::File::open(&options.path).with_context(|| format!("{}", options.path.display()))?;
    let tar = zstd::Decoder::new(tar_zst).with_context(|| format!("{}", options.path.display()))?;
    let mut archive = tar::Archive::new(tar);

    let dir = tempfile::tempdir()?;
    archive.unpack(dir.path())?;
    parse_game_dir(dir.path(), &game_dir, &game_version, options)
}

pub fn parse_game_dir(
    tmp_game_dir: &Path,
    out_game_dir: &Path,
    game_version: &str,
    options: &PackageOptions,
) -> anyhow::Result<()> {
    let localization = localization::english_localization(tmp_game_dir.join("localisation"))?;

    let countries = generate_countries(tmp_game_dir, &localization)?;
    let tc = generate_trade_company_investments(tmp_game_dir, &localization, options)?;
    let persons = generate_ruler_personalities(tmp_game_dir, &localization, options)?;
    let advs = generate_advisors(tmp_game_dir, &localization, options)?;
    let (total_provs, provs) = generate_provinces(tmp_game_dir, game_version)?;
    let terrain = generate_terrain(tmp_game_dir)?;
    translate_flags(tmp_game_dir, options).context("country flag error")?;
    translate_achievements_images(tmp_game_dir, options).context("achievement images error")?;
    translate_building_images(tmp_game_dir, options).context("building images error")?;
    let center_locations =
        translate_map(tmp_game_dir, out_game_dir, options).context("map error")?;

    let mut buffer = schemas::flatbuffers::FlatBufferBuilder::new();

    // COUNTRIES
    let data = countries;
    let mut countries = Vec::new();
    for country in data.iter() {
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
        countries.push(entry);
    }

    let countries = buffer.create_vector(&countries);

    // AREA
    let data_path = tmp_game_dir.join("map").join("area.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;
    let mut data = area::parse_areas(&data).into_iter().collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));

    let mut areas = Vec::new();
    for (key, provinces) in data.iter() {
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
        areas.push(entry);
    }

    let areas = buffer.create_vector(&areas);

    // REGION
    let data_path = tmp_game_dir.join("map").join("region.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;

    let mut data = regions::parse_regions(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));

    let mut regions = Vec::new();
    for (key, areas) in data.iter() {
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
        regions.push(entry);
    }

    let regions = buffer.create_vector(&regions);

    // SUPER-REGION
    let data_path = tmp_game_dir.join("map").join("superregion.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;

    let mut data = superregion::parse_superregions(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));

    let mut superregions = Vec::new();
    for (key, areas) in data.iter() {
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
        superregions.push(entry);
    }

    let superregions = buffer.create_vector(&superregions);

    // CONTINENTS
    let data_path = tmp_game_dir.join("map").join("continent.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;

    let mut data = continents::parse_continents(&data)
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));

    let mut continents = Vec::new();
    for (key, provinces) in data.iter() {
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
        continents.push(entry);
    }

    let continents = buffer.create_vector(&continents);

    // CULTURE-GROUPS
    let data_path = tmp_game_dir
        .join("common")
        .join("cultures")
        .join("00_cultures.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;

    let mut data = cultures::parse_cultures(&data)
        .culture_groups
        .into_iter()
        .collect::<Vec<_>>();
    data.sort_unstable_by(|(key1, _), (key2, _)| key1.cmp(key2));
    let mut culture_groups = Vec::new();

    for (key, group) in data.iter() {
        let key = buffer.create_string(key);
        let strs = group
            .cultures
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
        culture_groups.push(entry);
    }

    let culture_groups = buffer.create_vector(&culture_groups);

    // TRADE COMPANY INVESTMENTS
    let mut data = tc.into_iter().collect::<Vec<_>>();
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
    let mut data = persons.into_iter().collect::<Vec<_>>();
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
    let mut data = advs.into_iter().collect::<Vec<_>>();
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

    // RELIGIONS
    let data_path = Path::new(tmp_game_dir)
        .join("common")
        .join("religions")
        .join("00_religion.txt");
    let data = std::fs::read(&data_path)
        .with_context(|| format!("unable to read {}", data_path.display()))?;

    let mut data = religion::parse_enhanced_religions(&data, &localization);
    data.sort_unstable_by(|a, b| a.id.cmp(&b.id));

    let religious_rebels: HashMap<_, _> =
        WalkDir::new(Path::new(tmp_game_dir).join("common").join("rebel_types"))
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|x| !x.file_type().is_dir())
            .filter_map(|e| religion_rebels(&std::fs::read(e.path()).unwrap()))
            .map(|x| (x.religion.clone(), x))
            .collect();

    let mut religions = Vec::new();
    for religion in data.iter() {
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

        let rebels = religious_rebels.get(&religion.id);
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

    // PROVINCES
    let mut provinces = Vec::new();
    for province in provs.iter() {
        let (center_x, center_y) = *center_locations
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
    for (terrain, local_dev) in terrain.iter() {
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
    let mut localization: Vec<_> = localization
        .iter()
        .filter(|(k, _v)| {
            k.starts_with("building_")
                || k.ends_with("_area")
                || k.ends_with("_superregion")
                || k.ends_with("_region")
        })
        .collect();
    localization.sort_unstable();
    let data = localization;
    let mut localization = Vec::new();
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
        localization.push(entry);
    }

    // UNITS
    let units = extract_units(tmp_game_dir)?;
    let mut land_units = Vec::new();
    let mut naval_units = Vec::new();
    for (unit_name, unit) in units {
        let unit_name = buffer.create_string(&unit_name);
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

    let localization = buffer.create_vector(&localization);

    // GAME
    let game = schemas::eu4::Game::create(
        &mut buffer,
        &schemas::eu4::GameArgs {
            countries: Some(countries),
            total_provinces: total_provs as u32,
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

    Ok(())
}

struct Country {
    tag: CountryTag,
    name: String,
    adjective: String,
    culturegfx: String,
}

fn generate_countries(
    tmp_game_dir: &Path,
    localization: &HashMap<String, String>,
) -> anyhow::Result<Vec<Country>> {
    let country_localization = localization::country_localization(localization);

    #[derive(Debug, Deserialize)]
    struct CountryData {
        pub graphical_culture: String,
    }

    let tag_path = tmp_game_dir
        .join("common")
        .join("country_tags")
        .join("00_countries.txt");

    let tag_data = fs::read(tag_path)?;
    let tags: HashMap<CountryTag, PathBuf> =
        jomini::text::de::from_windows1252_slice(&tag_data[..])?;
    let mut countries = Vec::new();
    for (tag, path) in tags {
        let country_path = tmp_game_dir.join("common").join(&path);
        let country_data = fs::read(country_path)?;
        let country: CountryData = jomini::text::de::from_windows1252_slice(&country_data[..])
            .with_context(|| format!("parsing {} at: {}", tag, path.display()))?;

        let localized = country_localization.get(&tag).unwrap();
        countries.push(Country {
            tag,
            name: localized.name.clone(),
            adjective: localized.adjective.clone(),
            culturegfx: country.graphical_culture,
        });
    }

    countries.sort_unstable_by(|x, y| x.tag.cmp(&y.tag));
    Ok(countries)
}

fn generate_trade_company_investments(
    tmp_game_dir: &Path,
    localization: &HashMap<String, String>,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>> {
    #[derive(Debug, Deserialize)]
    struct InvestmentData {
        pub sprite: String,
    }

    let file_path = tmp_game_dir
        .join("common")
        .join("tradecompany_investments")
        .join("00_Investments.txt");

    let file_data = fs::read(file_path)?;
    let data: HashMap<String, InvestmentData> =
        jomini::text::de::from_windows1252_slice(&file_data[..])?;

    if options.common {
        let gfx_path = tmp_game_dir
            .join("interface")
            .join("trade_company_investments_view.gfx");
        let gfx_data = fs::read(gfx_path)?;
        let gfx = sprites::parse_sprites(&gfx_data[..]);
        let sprites: HashMap<String, PathBuf> =
            gfx.into_iter().map(|x| (x.name, x.texturefile)).collect();

        let out_dir = Path::new("assets/game/eu4/common/images/tc-investments");
        fs::create_dir_all(out_dir)?;

        let sprite_images = data
            .iter()
            .map(|(name, investment)| {
                let sprite_path = tmp_game_dir.join(sprites.get(&investment.sprite).unwrap());
                (name, sprite_path)
            })
            .collect::<Vec<_>>();

        let montage = Montager {
            name: "investments",
            base_path: out_dir.to_path_buf(),
            encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
            args: &[],
            sizes: &[],
        };

        montage.montage(&sprite_images)?;
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

fn generate_ruler_personalities(
    tmp_game_dir: &Path,
    localization: &HashMap<String, String>,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>> {
    let persons = WalkDir::new(tmp_game_dir.join("common").join("ruler_personalities"))
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir());

    let out_dir = Path::new("assets/game/eu4/common/images/personalities");
    fs::create_dir_all(out_dir)?;

    let mut personalities: HashMap<String, PathBuf> = HashMap::new();
    for person_file in persons {
        let data = fs::read(person_file.path())?;
        let parsed_persons = personalities::personalities(&data[..]);

        for (personality, possible_traits) in parsed_persons.into_iter() {
            let actual_trait = possible_traits
                .iter()
                .find_map(|possible| {
                    let p = tmp_game_dir
                        .join("gfx")
                        .join("interface")
                        .join("ideas_EU4")
                        .join(format!("{}.dds", possible));

                    // petty and humane look to use the same icon even though you'd think one should be labelled as opposite
                    let backup = tmp_game_dir
                        .join("gfx")
                        .join("interface")
                        .join("ideas_EU4")
                        .join(format!("{}.dds", possible.replace("_opposite", "")));

                    if p.exists() {
                        Some(p)
                    } else if backup.exists() {
                        Some(backup)
                    } else {
                        None
                    }
                })
                .ok_or_else(|| {
                    anyhow::anyhow!("unable to find personality image for {}", &personality)
                })?;

            personalities.insert(personality, actual_trait);
        }
    }

    if options.common {
        let mut personalities_order = personalities.iter().collect::<Vec<_>>();
        personalities_order.sort_unstable();

        let montage = Montager {
            name: "personalities",
            base_path: out_dir.to_path_buf(),
            encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
            args: &["-background", "transparent"],
            sizes: &[],
        };

        montage.montage(&personalities_order)?;
    }

    let translate: HashMap<_, _> = localization
        .iter()
        .filter(|(k, _v)| personalities.contains_key(*k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    Ok(translate)
}

fn generate_advisors(
    tmp_game_dir: &Path,
    localization: &HashMap<String, String>,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<String, String>> {
    let persons = WalkDir::new(tmp_game_dir.join("common").join("advisortypes"))
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir());

    let out_dir = Path::new("assets/game/eu4/common/images/advisors");
    fs::create_dir_all(out_dir)?;

    let mut advisors = Vec::new();
    for person_file in persons {
        let data = fs::read(person_file.path())?;
        let advise: HashMap<String, IgnoredAny> = jomini::text::de::from_windows1252_slice(&data)?;

        for advisor in advise.keys() {
            advisors.push((advisor.clone(), localization.get(advisor).unwrap().clone()));
        }
    }

    if options.common {
        let advisors_montage = advisors
            .iter()
            .map(|(advisor, _)| {
                let advisor_path = tmp_game_dir
                    .join("gfx")
                    .join("interface")
                    .join("advisors")
                    .join(advisor)
                    .with_extension("dds");
                (advisor, advisor_path)
            })
            .collect::<Vec<_>>();

        let montage = Montager {
            name: "advisors",
            base_path: out_dir.to_path_buf(),
            encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
            args: &["-background", "transparent"],
            sizes: &["48x48", "64x64", "77x77"],
        };

        montage.montage(&advisors_montage)?;
    }

    let translate = advisors.into_iter().collect::<HashMap<_, _>>();

    Ok(translate)
}

fn generate_terrain(tmp_game_dir: &Path) -> anyhow::Result<Vec<(schemas::eu4::Terrain, f32)>> {
    let terrain_data = fs::read(tmp_game_dir.join("map").join("terrain.txt"))?;
    let terrain = parse_terrain_txt(&terrain_data)
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

fn generate_provinces(
    tmp_game_dir: &Path,
    game_version: &str,
) -> anyhow::Result<(usize, Vec<GameProvince>)> {
    let map_data = fs::read(tmp_game_dir.join("map").join("default.map"))?;
    let default_map = mapper::parse_default_map(&map_data[..]);
    let ocean_provs: HashSet<_> = default_map
        .lakes
        .iter()
        .chain(default_map.sea_starts.iter())
        .collect();

    let data = assets::request(format!("terrain/terrain-{}.eu4", game_version));
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
            // We check that the ub is false as there are many placeholder provinces
            // like prov id: 3489 and there is no need to bloat the payload with placeholder
            // provinces. Then there are provinces like prov 3004 which doesn't exist in game
            // but is listed as an ocean in default.map and we would like to exclude it as well
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

pub fn translate_achievements_images(
    tmp_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()> {
    if !options.common {
        return Ok(());
    }

    let base_achievement_path = Path::new("assets/game/eu4/common/images/achievements");
    std::fs::create_dir_all(base_achievement_path)?;

    let additional_achievement_entries = WalkDir::new(base_achievement_path)
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir())
        .filter(|x| {
            x.path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
        })
        .filter_map(|x| {
            let name = x.path().file_stem()?.to_str()?;
            Some((String::from(name), x.into_path()))
        });

    let achievements_gfx_data = fs::read(tmp_game_dir.join("interface").join("achievements.gfx"))?;
    let achievement_paths = achievements::achievement_images(&achievements_gfx_data[..]);
    let achievement_data = eu4game_data::achievements();
    let achieves = achievement_data
        .iter()
        .filter_map(|x| {
            achievement_paths
                .get(&x.id)
                .map(|path| (x.id.to_string(), tmp_game_dir.join(path)))
        })
        .chain(additional_achievement_entries)
        .collect::<Vec<_>>();

    let montage = Montager {
        name: "achievements",
        base_path: base_achievement_path.to_path_buf(),
        encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
        args: &["-background", "transparent"],
        sizes: &[],
    };

    montage.montage(&achieves)?;

    Ok(())
}

pub fn translate_building_images(
    tmp_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()> {
    if !options.common {
        return Ok(());
    }

    let base_path = Path::new("assets/game/eu4/common/images/buildings");
    std::fs::create_dir_all(base_path)?;

    let data = fs::read(tmp_game_dir.join("interface").join("building_icons.gfx"))?;
    let sprites = sprites::parse_sprites(&data[..]);

    let mut western_buildings = Vec::new();
    let mut global_buildings = Vec::new();

    for sprite in sprites {
        let mut new_name = String::from(sprite.name.get(4..).unwrap());
        let mut image_path =
            tmp_game_dir.join(sprite.texturefile.to_string_lossy().replace("//", "/"));

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

        let tga_path = image_path.with_extension("tga");
        let dds_path = image_path.with_extension("dds");
        if tga_path.exists() {
            image_path = tga_path
        } else if dds_path.exists() {
            image_path = dds_path;
        }

        if new_name.ends_with("westerngfx") {
            western_buildings.push((new_name, image_path))
        } else if !new_name.ends_with("gfx") {
            global_buildings.push((new_name, image_path));
        }
    }

    // Turn alpha off as else buildings like latin_admiralty are converted to
    // something that is completely transparent
    let args = &["-background", "white", "-alpha", "Off", "-auto-orient"];
    let montage = Montager {
        name: "westerngfx",
        base_path: base_path.to_path_buf(),
        encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
        args,
        sizes: &[],
    };

    montage.montage(&western_buildings)?;

    let montage = Montager {
        name: "global",
        base_path: base_path.to_path_buf(),
        encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),
        args,
        sizes: &[],
    };

    montage.montage(&global_buildings)?;

    Ok(())
}

pub fn translate_flags(tmp_game_dir: &Path, options: &PackageOptions) -> anyhow::Result<()> {
    if !options.common {
        return Ok(());
    }

    let base_flag_path = Path::new("assets/game/eu4/common/images/flags");
    std::fs::create_dir_all(base_flag_path)
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

    let tmp_flags = WalkDir::new(tmp_game_dir.join("gfx").join("flags"))
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir())
        .map(|flag| {
            let file_stem = flag.path().file_stem().unwrap();
            let tag = file_stem.to_str().unwrap();
            (String::from(tag), flag.path().to_path_buf())
        })
        .collect::<Vec<_>>();

    let montage = Montager {
        name: "flags",
        base_path: base_flag_path.to_path_buf(),
        encoding: montager::Encoding::Webp(montager::WebpQuality::Quality(90)),

        // flag images are mostly 128x128 but there are a
        // few 256x256, and 48x48 is max flag avatar size
        args: &["-background", "white", "-alpha", "Off", "-auto-orient"],
        sizes: &["8x8", "48x48", "64x64", "128x128"],
    };

    montage
        .montage(&tmp_flags)
        .context("unable to create country flag montage")?;
    Ok(())
}

pub fn translate_map(
    tmp_game_dir: &Path,
    out_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<HashMap<u16, (u16, u16)>> {
    let base_image_dir = out_game_dir.join("map");
    std::fs::create_dir_all(&base_image_dir)
        .with_context(|| format!("unable to create: {}", base_image_dir.display()))?;

    // strip any profiles that the browser may misinterpret

    // these images need to remain 32bit
    for image in &["provinces.bmp", "terrain.bmp", "rivers.bmp"] {
        let image_path = tmp_game_dir.join("map").join(image);
        let file_stem = image_path.file_stem().unwrap();

        for i in 1..=2 {
            let mut end_filename = file_stem.to_os_string();
            end_filename.push(format!("-{}.webp", i));
            let out_path = base_image_dir.join(&end_filename);

            if out_path.exists() && !options.regen {
                continue;
            }

            let child = imagemagick::imagemagick_command("convert")?
                .arg(&image_path)
                .arg("-strip")
                .arg("-crop")
                .arg(format!("2816x2048+{}+0", (i - 1) * 2816))
                .arg("-define")
                .arg("webp:lossless=true")
                .arg(out_path)
                .output()
                .context("imagemagick convert failed")?;

            if !child.status.success() {
                bail!(
                    "convert failed with: {}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }
        }
    }

    for image in &["terrain/occupation.dds"] {
        let image_path = tmp_game_dir.join("map").join(image);
        let file_stem = image_path.file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".webp");
        let out_path = base_image_dir.join(&end_filename);

        if out_path.exists() && !options.regen {
            continue;
        }

        let child = imagemagick::imagemagick_command("convert")?
            .arg(image_path)
            .arg("-strip")
            .arg("-define")
            .arg("webp:lossless=true")
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }
    }

    for image in &[
        "world_normal.bmp",
        "terrain/colormap_summer.dds",
        "terrain/colormap_water.dds",
        "terrain/noise-2d.dds",
        "heightmap.bmp",
        "terrain/atlas_normal0.dds",
        "terrain/atlas0.dds",
    ] {
        let image_path = tmp_game_dir.join("map").join(image);
        let file_stem = image_path.file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".webp");
        let out_path = base_image_dir.join(&end_filename);

        if out_path.exists() && !options.regen {
            continue;
        }

        let mut child = imagemagick::imagemagick_command("convert")?;
        child.arg(image_path);

        if *image == "heightmap.bmp" {
            child.arg("-resize");
            child.arg("2816x1024");
        }

        let out = child.arg(&out_path).output()?;
        if !out.status.success() {
            bail!(
                "convert failed with: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
    }

    for image in &["terrain/atlas_normal0.dds", "terrain/atlas0.dds"] {
        let image_path = tmp_game_dir.join("map").join(image);
        let file_stem = image_path.file_stem().unwrap();

        for i in &["rock", "green"] {
            let mut end_filename = file_stem.to_os_string();
            end_filename.push("_");
            end_filename.push(i);
            end_filename.push(".webp");
            let out_path = base_image_dir.join(&end_filename);

            if out_path.exists() && !options.regen {
                continue;
            }

            let crop = match *i {
                "rock" => "512x512+1024+512",
                "green" => "512x512+512+1024",
                _ => unreachable!(),
            };

            let child = imagemagick::imagemagick_command("convert")?
                .arg(&image_path)
                .arg("-crop")
                .arg(crop)
                .arg(&out_path)
                .output()?;

            if !child.status.success() {
                bail!(
                    "convert failed with: {}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }
        }
    }

    let definitions = tmp_game_dir.join("map").join("definition.csv");
    let definitions = std::fs::read(&definitions)
        .with_context(|| format!("unable to read: {}", definitions.display()))?;
    let mut definitions = mapper::parse_definition(&definitions);
    definitions.insert(0, Rgb::from((0, 0, 0)));

    let mut definitions: Vec<(_, _)> = definitions.iter().map(|(id, rgb)| (rgb, id)).collect();

    definitions.sort_unstable();
    let mut provs: Vec<_> = definitions
        .iter()
        .enumerate()
        .map(|(i, (_rgb, id))| (id, i))
        .collect();
    provs.sort_unstable_by_key(|(&&id, _index)| id);

    // These files don't compress that well (and are small), so we skip compression
    let color_order_file = fs::File::create(out_game_dir.join("map").join("color-order.bin"))?;
    let mut color_order_writer = BufWriter::new(color_order_file);
    for (rgb, _prov_id) in &definitions {
        color_order_writer.write_all(&[rgb.r, rgb.g, rgb.b])?;
    }
    color_order_writer.flush()?;

    let color_index_file = fs::File::create(out_game_dir.join("map").join("color-index.bin"))?;
    let mut color_index_writer = BufWriter::new(color_index_file);
    for (_prov_id, index) in &provs {
        let val = *index as u16;
        let data = val.to_le_bytes();
        color_index_writer.write_all(&data)?;
    }
    color_index_writer.flush()?;

    // calculate pixel location of center of province
    let provinces_path = tmp_game_dir.join("map").join("provinces.bmp");
    let provinces_file_data = fs::read(&provinces_path)
        .with_context(|| format!("unable to read: {}", provinces_path.display()))?;
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
        .into_iter()
        .map(|(id, coords)| {
            let sum_x: u64 = coords.iter().map(|(x, _)| *x).map(u64::from).sum();
            let avg_x = (sum_x / coords.len() as u64) as u16;
            let sum_y: u64 = coords.iter().map(|(_, y)| *y).map(u64::from).sum();
            let avg_y = (sum_y / coords.len() as u64) as u16;
            (id, (avg_x, avg_y))
        })
        .collect();

    Ok(center_locations)
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

fn extract_units(tmp_game_dir: &Path) -> anyhow::Result<Vec<(String, UnitFile)>> {
    let units_dir = tmp_game_dir.join("common").join("units");
    let unit_files = WalkDir::new(&units_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir());

    let mut units = Vec::new();
    for unit_file in unit_files {
        let data = fs::read(unit_file.path())?;
        let unit: UnitFile = jomini::text::de::from_windows1252_slice(&data)?;
        let filename = unit_file
            .path()
            .file_stem()
            .context("unable to get file prefix")?
            .to_str()
            .context("unable to convert file name")?;
        units.push((String::from(filename), unit));
    }
    Ok(units)
}
