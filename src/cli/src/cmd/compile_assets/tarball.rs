use super::{
    achievements, area, assets, continents, cultures, localization, mapper, personalities, regions,
    religion, sprites, superregion,
};
use crate::brotli_tee::BrotliTee;
use crate::rawbmp::{self, Pixels, Rgb};
use anyhow::{bail, Context};
use eu4save::{CountryTag, Eu4File, ProvinceId};
use jomini::TextDeserializer;
use mapper::GameProvince;
use schemas::resolver::Eu4FlatBufferTokens;
use serde::{de::IgnoredAny, Deserialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::{collections::HashMap, time::Instant};
use std::{collections::HashSet, process::Command};
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
    let (total_provs, provs) = write_provinces_csv(tmp_game_dir, game_version)?;
    write_map_indices(tmp_game_dir, out_game_dir)?;
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
        let strs = areas.iter().map(|x| x.as_str()).collect::<Vec<_>>();
        let vec = buffer.create_vector_of_strings(&strs);
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
        let strs = areas.iter().map(|x| x.as_str()).collect::<Vec<_>>();
        let vec = buffer.create_vector_of_strings(&strs);
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
            .map(|x| x.as_str())
            .collect::<Vec<_>>();
        let vec = buffer.create_vector_of_strings(&strs);
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

    let mut religions = Vec::new();
    for religion in data.iter() {
        let key = buffer.create_string(&religion.id);
        let name = buffer.create_string(&religion.name);
        let color =
            schemas::eu4::Rgb::new(religion.colors[0], religion.colors[1], religion.colors[2]);
        let entry = schemas::eu4::Religion::create(
            &mut buffer,
            &schemas::eu4::ReligionArgs {
                key: Some(key),
                name: Some(name),
                color: Some(&color),
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

    // LOCALIZATION
    let mut localization: Vec<_> = localization
        .iter()
        .filter(|(k, _v)| k.starts_with("building_") || k.ends_with("_area"))
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
        },
    );

    buffer.finish(game, None);
    let raw = buffer.finished_data();

    let mut writer = BrotliTee::create(out_game_dir.join("data"))?;
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
        TextDeserializer::from_windows1252_slice(&tag_data[..])?;
    let mut countries = Vec::new();
    for (tag, path) in tags {
        let country_path = tmp_game_dir.join("common").join(&path);
        let country_data = fs::read(country_path)?;
        let country: CountryData = TextDeserializer::from_windows1252_slice(&country_data[..])
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

fn optimize_png<P: AsRef<Path>>(input: P) -> anyhow::Result<()> {
    let fp = input.as_ref();
    let mut opts = oxipng::Options::from_preset(2);
    opts.strip = oxipng::Headers::Safe;
    let out = oxipng::OutFile::Path(None);
    oxipng::optimize(&fp.into(), &out, &opts)
        .with_context(|| format!("unable to optimize png: {}", fp.display()))
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
        TextDeserializer::from_windows1252_slice(&file_data[..])?;

    let gfx_path = tmp_game_dir
        .join("interface")
        .join("trade_company_investments_view.gfx");
    let gfx_data = fs::read(gfx_path)?;
    let gfx = sprites::parse_sprites(&gfx_data[..]);
    let sprites: HashMap<String, PathBuf> =
        gfx.into_iter().map(|x| (x.name, x.texturefile)).collect();

    let out_dir = Path::new("assets/game/eu4/common/images/tc-investments");
    fs::create_dir_all(&out_dir)?;

    for (name, investment) in &data {
        let sprite_path = tmp_game_dir.join(sprites.get(&investment.sprite).unwrap());
        let out_path = out_dir.join(name).with_extension("png");

        if (out_path.exists() && !options.regen) || !options.common {
            continue;
        }

        let child = Command::new("convert")
            .arg(sprite_path)
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "image convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        optimize_png(&out_path)?;
    }

    let name_ids: HashSet<_> = data.iter().map(|(name_id, _)| name_id.as_str()).collect();

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
    fs::create_dir_all(&out_dir)?;

    let mut personalities: HashSet<String> = HashSet::new();
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

            let out_path = out_dir.join(&personality).with_extension("png");
            personalities.insert(personality);

            if (out_path.exists() && !options.regen) || !options.common {
                continue;
            }

            let child = Command::new("convert")
                .arg(actual_trait)
                .arg(&out_path)
                .output()?;

            if !child.status.success() {
                bail!(
                    "image convert failed with: {}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }

            optimize_png(&out_path)?;
        }
    }

    let translate: HashMap<_, _> = localization
        .iter()
        .filter(|(k, _v)| personalities.contains(*k))
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
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir());

    let out_dir = Path::new("assets/game/eu4/common/images/advisors");
    fs::create_dir_all(&out_dir)?;

    let mut advisors = Vec::new();
    for person_file in persons {
        let data = fs::read(person_file.path())?;
        let advise: HashMap<String, IgnoredAny> = TextDeserializer::from_windows1252_slice(&data)?;

        for advisor in advise.keys() {
            advisors.push((advisor.clone(), localization.get(advisor).unwrap().clone()));

            let out_path = out_dir.join(&advisor).with_extension("png");
            let actual_path = tmp_game_dir
                .join("gfx")
                .join("interface")
                .join("advisors")
                .join(&advisor)
                .with_extension("dds");

            if (out_path.exists() && !options.regen) || !options.common {
                continue;
            }

            let child = Command::new("convert")
                .arg(actual_path)
                .arg(&out_path)
                .output()?;

            if !child.status.success() {
                bail!(
                    "image convert failed with: {}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }

            optimize_png(&out_path)?;
        }
    }

    let translate = advisors.into_iter().collect::<HashMap<_, _>>();

    Ok(translate)
}

fn write_provinces_csv(
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
    let tokens = Eu4FlatBufferTokens::new();
    let save = save_file.deserializer().build_save(&tokens)?;
    let mut provs: Vec<_> = save.game.provinces.iter().collect();
    provs.sort_unstable_by_key(|(k, _v)| *k);
    let total_provs = provs.len();

    let mut terrains = Vec::new();
    let man: CountryTag = "KOI".parse().unwrap();
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

pub fn write_map_indices(tmp_game_dir: &Path, out_game_dir: &Path) -> anyhow::Result<()> {
    // Write out province id for each pixel. No need to get fancy here with run length encoding
    // as gzip compression gets it within 50-100 kb. We also need to translate from pixels
    // starting from the bottom left to the top left.
    let now = Instant::now();
    let mut writer = BrotliTee::create(out_game_dir.join("provinces-indices"))?;

    let provinces_file_data = fs::read(tmp_game_dir.join("map").join("provinces.bmp"))?;

    let definition_data = fs::read(tmp_game_dir.join("map").join("definition.csv"))?;
    let defs = mapper::parse_definition(&definition_data[..]);
    let definitions: HashMap<_, _> = defs.into_iter().map(|(id, color)| (color, id)).collect();

    let provinces_bmp = rawbmp::Bmp::parse(&provinces_file_data[..]).unwrap();
    let mut translated = vec![0u16; provinces_bmp.pixels_len()];
    let Pixels::Rgb(pixs) = provinces_bmp.pixels();
    for (i, pix) in pixs.enumerate() {
        let (width, height) = (
            provinces_bmp.dib_header.width.abs() as usize,
            provinces_bmp.dib_header.height.abs() as usize,
        );
        let id = definitions.get(&pix).copied().unwrap();
        let row = i / width as usize;
        let col = i % width as usize;
        translated[(height - row - 1) * width + col] = id;
    }

    for x in translated {
        writer.write_all(&x.to_le_bytes()[..]).unwrap();
    }

    writer.flush().unwrap();
    println!("province indices {}ms", now.elapsed().as_millis());

    Ok(())
}

pub fn translate_achievements_images(
    tmp_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()> {
    let base_achievement_path = Path::new("assets/game/eu4/common/images/achievements");
    std::fs::create_dir_all(&base_achievement_path)?;

    let achievements_gfx_data = fs::read(tmp_game_dir.join("interface").join("achievements.gfx"))?;
    let achieves = achievements::achievement_images(&achievements_gfx_data[..]);

    for (id, path) in achieves {
        let achieve_path = tmp_game_dir.join(&path);
        let out_filename = format!("{}.png", id);
        let out_path = base_achievement_path.join(out_filename);

        if (out_path.exists() && !options.regen) || !options.common {
            continue;
        }

        let child = Command::new("convert")
            .arg(achieve_path)
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "Achievement convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        optimize_png(&out_path)?;
    }

    Ok(())
}

pub fn translate_building_images(
    tmp_game_dir: &Path,
    options: &PackageOptions,
) -> anyhow::Result<()> {
    let base_path = Path::new("assets/game/eu4/common/images/buildings");
    std::fs::create_dir_all(&base_path)?;

    let data = fs::read(tmp_game_dir.join("interface").join("building_icons.gfx"))?;
    let sprites = sprites::parse_sprites(&data[..]);

    for sprite in sprites {
        let mut new_name = String::from(sprite.name.get(4..).unwrap());
        let mut image_path =
            tmp_game_dir.join(&sprite.texturefile.to_string_lossy().replace("//", "/"));

        // Find buildings like "latin_temple.tga" which should have their name "GFX_temple",
        // mapped to temple_westerngfx
        if sprite
            .texturefile
            .file_name()
            .map_or(false, |x| x.to_string_lossy().starts_with("latin_"))
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

        let out_filename = format!("{}.png", new_name);
        let out_path = base_path.join(out_filename);

        let tga_path = image_path.with_extension("tga");
        let dds_path = image_path.with_extension("dds");
        if tga_path.exists() {
            image_path = tga_path
        } else if dds_path.exists() {
            image_path = dds_path;
        }

        if (out_path.exists() && !options.regen) || !options.common {
            continue;
        }

        // Turn alpha off as else buildings like latin_admiralty are converted to
        // something that is completely transparent
        let child = Command::new("convert")
            .arg("-alpha")
            .arg("Off")
            .arg(image_path)
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "image convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        optimize_png(out_path)?;
    }

    Ok(())
}

pub fn translate_flags(tmp_game_dir: &Path, options: &PackageOptions) -> anyhow::Result<()> {
    let base_flag_path = Path::new("assets/game/eu4/common/images/flags");
    std::fs::create_dir_all(&base_flag_path)?;

    let tmp_flags = WalkDir::new(tmp_game_dir.join("gfx").join("flags"))
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|x| !x.path().is_dir());

    for flag in tmp_flags {
        let file_path = flag.path();
        let file_stem = file_path.file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".png");
        let out_path = base_flag_path.join(&end_filename);

        if (out_path.exists() && !options.regen) || !options.common {
            continue;
        }

        let child = Command::new("convert")
            .arg(file_path)
            .arg("-flip")
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "Flag convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        optimize_png(&out_path)?;
    }
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
            end_filename.push(format!("-{}.png", i));
            let out_path = base_image_dir.join(&end_filename);

            if out_path.exists() && !options.regen {
                continue;
            }

            let child = Command::new("convert")
                .arg(&image_path)
                .arg("-strip")
                .arg("-crop")
                .arg(format!("2816x2048+{}+0", (i - 1) * 2816))
                .arg(format!("PNG32:{}", out_path.display()))
                .output()
                .context("imagemagick convert failed")?;

            if !child.status.success() {
                bail!(
                    "convert failed with: {}",
                    String::from_utf8_lossy(&child.stderr)
                );
            }

            let mut opts = oxipng::Options::from_preset(2);
            opts.strip = oxipng::Headers::Safe;
            if *image == "provinces.bmp" {
                opts.bit_depth_reduction = false;
                opts.palette_reduction = false;
                opts.color_type_reduction = false;
            }

            let out = oxipng::OutFile::Path(None);
            oxipng::optimize(&out_path.clone().into(), &out, &opts)
                .with_context(|| format!("unable to optimize png: {}", out_path.display()))?
        }
    }

    for image in &["terrain/occupation.dds"] {
        let image_path = tmp_game_dir.join("map").join(image);
        let file_stem = image_path.file_stem().unwrap();
        let mut end_filename = file_stem.to_os_string();
        end_filename.push(".png");
        let out_path = base_image_dir.join(&end_filename);

        if out_path.exists() && !options.regen {
            continue;
        }

        let child = Command::new("convert")
            .arg(image_path)
            .arg("-strip")
            .arg(&out_path)
            .output()?;

        if !child.status.success() {
            bail!(
                "convert failed with: {}",
                String::from_utf8_lossy(&child.stderr)
            );
        }

        optimize_png(&out_path)?;
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

        let mut child = Command::new("convert");
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

            let child = Command::new("convert")
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

    let mut color_order_writer = BrotliTee::create(out_game_dir.join("map").join("color-order"))?;

    for (rgb, _prov_id) in &definitions {
        color_order_writer.write_all(&[rgb.r, rgb.g, rgb.b])?;
    }
    color_order_writer.flush()?;

    let mut color_index_writer = BrotliTee::create(out_game_dir.join("map").join("color-index"))?;
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
    let width = provinces_bmp.dib_header.width.abs() as usize;
    let height = provinces_bmp.dib_header.height.abs() as u16;

    for (i, pix) in pixs.enumerate() {
        let id = definitions.get(&pix).copied().unwrap();
        let x = (i % width) as u16;
        let y = height - (i / width) as u16;
        let coord = pixel_locations.entry(*id).or_insert_with(Vec::new);
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
