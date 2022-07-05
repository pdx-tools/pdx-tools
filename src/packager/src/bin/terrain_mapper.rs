use eu4save::{EnvTokens, Eu4File, ProvinceId};
use packager::rawbmp::{Bmp, Pixels, Rgb};
use std::{collections::HashMap, collections::HashSet, path::Path};

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let interested: HashSet<u16> = args[3..]
        .iter()
        .map(|x| x.parse::<u16>().unwrap())
        .collect();
    let map_dir = &args[1];
    let definitions = Path::new(map_dir).join("definition.csv");
    let definitions = std::fs::read(&definitions).unwrap();
    let definitions = packager::mapper::parse_definition(&definitions);
    let definitions: HashMap<Rgb, u16> = definitions.into_iter().map(|(k, v)| (v, k)).collect();

    let rivers_bmp = Path::new(map_dir).join("rivers.bmp");
    let rivers_bmp = std::fs::read(&rivers_bmp).unwrap();
    let rivers_bmp = Bmp::parse(&rivers_bmp).unwrap();
    let Pixels::Rgb(pixs) = rivers_bmp.pixels();
    let is_river: Vec<_> = pixs
        .map(|x| match (x.r, x.g, x.b) {
            (0, 200, 255) => true, // Bahawalpur (4508)
            (0, 100, 255) => true,
            (0, 0, 200) => true, // Qos (360)
            (0, 150, 255) => true,
            (0, 225, 255) => false, // Bregenz (4710)
            _ => false,
        })
        .collect();

    let terrain_txt = Path::new(map_dir).join("terrain.txt");
    let terrain_txt = std::fs::read(&terrain_txt).unwrap();
    let terrain = packager::mapper::parse_terrain_txt(&terrain_txt);

    let provinces_bmp = Path::new(map_dir).join("provinces.bmp");
    let provinces_bmp = std::fs::read(&provinces_bmp).unwrap();
    let provinces = packager::mapper::province_areas(&provinces_bmp);
    let provinces: Vec<u16> = provinces
        .into_iter()
        .map(|x| *definitions.get(&x).unwrap())
        .collect();

    let trees_bmp = Path::new(map_dir).join("trees.bmp");
    let trees_bmp = std::fs::read(&trees_bmp).unwrap();
    let trees_bmp = Bmp::parse(&trees_bmp).unwrap();

    let mut forest_colors = terrain.tree.get("forest").cloned().unwrap().color;
    forest_colors = forest_colors.to_vec();

    let jungle_colors = terrain.tree.get("jungle").cloned().unwrap().color;
    let mut tree_override: Vec<u8> = vec![0; provinces.len()];

    let province_width = rivers_bmp.dib_header.width as usize;
    for (row, data) in trees_bmp.data().enumerate() {
        for (col, pix) in data.iter().enumerate() {
            // If we see a pixel in trees.bmp at (25, 15) the corresponding start
            // would be: (199, 102) as we upscale it to the same resolution as
            // terrain, provinces, and rivers.bmp. The width is upscaled by 8 and
            // the height is upscaled by 6.989761092150171 with a minor adjustment
            // to the starting location so that all province tests pass.
            let start_x = col * 8 - 2;
            let start_y = ((row as f64) * 6.989761092150171) as usize - 2;

            if forest_colors.contains(pix) {
                for x in start_x..start_x + 8 {
                    for y in start_y..start_y + 6 {
                        tree_override[x + (y * province_width)] = Terrain::Forest as u8;
                    }
                }
            } else if jungle_colors.contains(pix) {
                for x in start_x..start_x + 8 {
                    for y in start_y..start_y + 6 {
                        tree_override[x + (y * province_width)] = Terrain::Jungle as u8;
                    }
                }
            } else if *pix == 5 {
                for x in start_x..start_x + 8 {
                    for y in start_y..start_y + 6 {
                        tree_override[x + (y * province_width)] = Terrain::Woods as u8;
                    }
                }
            }
        }
    }

    let terrain_bmp = Path::new(map_dir).join("terrain.bmp");
    let terrain_bmp = std::fs::read(&terrain_bmp).unwrap();
    let terrain_ind =
        packager::mapper::parse_terrain_bmp(&terrain_bmp, &provinces, &is_river, &tree_override);

    // let overrides: HashMap<u16, Terrain> = HashMap::new();

    // let overrides: HashSet<u16> = terrain.categories.iter().flat_map(|(_, cat)| cat.terrain_override.iter().copied()).collect();

    // for prov_id in overrides {
    //     terrain_ind.remove(&prov_id).unwrap();
    // }

    let mapped_terrain: HashMap<u16, Vec<Terrain>> = terrain_ind
        .iter()
        .map(|(&key, values)| {
            (
                key,
                values
                    .iter()
                    .copied()
                    .map(Terrain::from_terrain_bmp)
                    .collect(),
            )
        })
        .collect();
    let mut province_terrain = HashMap::with_capacity(mapped_terrain.len());

    for (ts, cat) in &terrain.categories {
        if let Some(terrain) = Terrain::from_terrain_name(ts.as_str()) {
            for &prov in &cat.terrain_override {
                province_terrain
                    .entry(ProvinceId::from(i32::from(prov)))
                    .or_insert(terrain);
            }
        }
    }

    for (prov_id, terrains) in mapped_terrain {
        let mut count: HashMap<Terrain, usize> = HashMap::new();
        for t in terrains {
            if !matches!(t, Terrain::Ocean | Terrain::InlandOcean) {
                *count.entry(t).or_default() += 1;
            }
        }

        let mut freq: Vec<_> = count.iter().collect();
        if !freq.is_empty() {
            freq.sort_unstable_by(|(at, &acount), (bt, &bcount)| {
                bcount.cmp(&acount).then_with(|| at.cmp(bt))
            });

            if interested.contains(&prov_id) {
                panic!("{:?}", &freq);
            }

            province_terrain
                .entry(ProvinceId::from(i32::from(prov_id)))
                .or_insert(*freq[0].0);
        }
    }

    // let expected = vec![
    //     (16, Terrain::Hills),
    //     (28, Terrain::Grasslands),
    //     (73, Terrain::Mountains),
    //     (103, Terrain::Mountains),
    //     (142, Terrain::Coastline),
    //     (157, Terrain::Grasslands),
    //     (165, Terrain::Hills),
    //     (171, Terrain::Grasslands),
    //     (179, Terrain::Grasslands),
    //     (207, Terrain::Grasslands),
    //     (212, Terrain::Hills),
    //     (241, Terrain::Grasslands),
    //     (249, Terrain::Grasslands),
    //     (278, Terrain::Marsh),
    //     (314, Terrain::Forest),
    //     (320, Terrain::Coastline),
    //     (357, Terrain::CoastalDesert),
    //     (360, Terrain::Desert),
    //     (416, Terrain::Mountains),
    //     (426, Terrain::Mountains),
    //     (427, Terrain::Desert),
    //     (437, Terrain::Desert),
    //     (440, Terrain::Desert),
    //     (443, Terrain::Desert),
    //     (597, Terrain::Grasslands),
    //     (598, Terrain::Jungle),
    //     (626, Terrain::Grasslands),
    //     (629, Terrain::Grasslands),
    //     (630, Terrain::Grasslands),
    //     (632, Terrain::Grasslands),
    //     (640, Terrain::Jungle),
    //     (641, Terrain::Grasslands),
    //     (659, Terrain::Coastline),
    //     (668, Terrain::Grasslands),
    //     (809, Terrain::Mountains),
    //     (810, Terrain::Mountains),
    //     (813, Terrain::Mountains),
    //     (818, Terrain::Jungle),
    //     (821, Terrain::Jungle),
    //     (828, Terrain::Jungle),
    //     (1007, Terrain::Forest),
    //     (1009, Terrain::Forest),
    //     (1061, Terrain::Forest),
    //     (1072, Terrain::Forest),
    //     (1073, Terrain::Forest),
    //     (1080, Terrain::Forest),
    //     (1092, Terrain::Grasslands),
    //     (1127, Terrain::Desert),
    //     (1213, Terrain::Mountains),
    //     (1214, Terrain::Mountains),
    //     (1997, Terrain::Coastline),
    //     (2196, Terrain::Mountains),
    //     (2231, Terrain::Desert),
    //     (2257, Terrain::Jungle),
    //     (2275, Terrain::Desert),
    //     (2294, Terrain::Jungle),
    //     (2318, Terrain::Desert),
    //     (2322, Terrain::Desert),
    //     (2323, Terrain::Desert),
    //     (2326, Terrain::CoastalDesert),
    //     (2375, Terrain::Jungle),
    //     (2393, Terrain::Grasslands),
    //     (2470, Terrain::Mountains),
    //     (2410, Terrain::Grasslands),
    //     (2474, Terrain::Desert),
    //     (2506, Terrain::Mountains),
    //     (2615, Terrain::Mountains),
    //     (2616, Terrain::Desert),
    //     (2661, Terrain::Jungle),
    //     (2676, Terrain::Grasslands),
    //     (2685, Terrain::Jungle),
    //     (2686, Terrain::Coastline),
    //     (2687, Terrain::Grasslands),
    //     (2705, Terrain::Jungle),
    //     (2707, Terrain::Jungle),
    //     (2712, Terrain::Jungle),
    //     (2719, Terrain::Jungle),
    //     (2803, Terrain::Marsh),
    //     (2807, Terrain::Grasslands),
    //     (2829, Terrain::Mountains),
    //     (2836, Terrain::Mountains),
    //     (2849, Terrain::Grasslands),
    //     (2856, Terrain::Desert),
    //     (2881, Terrain::Marsh),
    //     (2945, Terrain::Jungle),
    //     (2954, Terrain::CoastalDesert),
    //     (2967, Terrain::Hills),
    //     (2985, Terrain::Grasslands),
    //     (4060, Terrain::Mountains),
    //     (4113, Terrain::Forest),
    //     (4149, Terrain::Grasslands),
    //     (4163, Terrain::Grasslands),
    //     (4158, Terrain::Mountains),
    //     (4245, Terrain::Grasslands),
    //     (4247, Terrain::Grasslands),
    //     (4268, Terrain::Mountains),
    //     (4273, Terrain::Desert),
    //     (4274, Terrain::Desert),
    //     (4287, Terrain::Desert),
    //     (4326, Terrain::Mountains),
    //     (4329, Terrain::Mountains),
    //     (4330, Terrain::Mountains),
    //     (4397, Terrain::Grasslands),
    //     (4440, Terrain::Jungle),
    //     (4452, Terrain::Grasslands),
    //     (4512, Terrain::Grasslands),
    //     (4567, Terrain::Desert),
    //     (4576, Terrain::Jungle),
    //     (4583, Terrain::Jungle),
    //     (4585, Terrain::Jungle),
    //     (4587, Terrain::Jungle),
    //     (4591, Terrain::Jungle),
    //     (4595, Terrain::Jungle),
    //     (4598, Terrain::Jungle),
    //     (4599, Terrain::Jungle),
    //     (4617, Terrain::Jungle),
    //     (4621, Terrain::Grasslands),
    //     (4634, Terrain::Mountains),
    //     (4642, Terrain::Grasslands),
    //     (4645, Terrain::Mountains),
    //     (4648, Terrain::Mountains),
    //     (4685, Terrain::Grasslands),
    //     (4686, Terrain::Grasslands),
    //     (4687, Terrain::Grasslands),
    //     (4691, Terrain::Forest),
    //     (4704, Terrain::Grasslands),
    //     (4723, Terrain::Grasslands),
    //     (4756, Terrain::Grasslands),
    //     (4758, Terrain::Mountains),
    // ];

    // let mut mismatched: Vec<(u16, Terrain, Option<Terrain>)> = Vec::with_capacity(expected.len());
    // for (id, ter) in expected {
    //     if let Some(actual) = province_terrain.get(&ProvinceId::from(i32::from(id))).copied() {
    //         if ter != actual {
    //             mismatched.push((id, ter, Some(actual)));
    //         }
    //     } else {
    //         mismatched.push((id, ter, None));
    //     }
    // }

    // if !mismatched.is_empty() {
    //     panic!("{:?} failures: {:#?}", mismatched.len(), &mismatched);
    // }

    let data = std::fs::read(&args[2]).unwrap();
    let file = Eu4File::from_slice(&data).unwrap();
    let save = file.deserializer().build_save(&EnvTokens).unwrap();
    let mut mismatched2: Vec<(ProvinceId, Terrain, Terrain)> = Vec::new();
    for (id, prov) in save.game.provinces {
        if let Some(owner) = prov.owner {
            let predicted = province_terrain.get(&id).copied().unwrap();
            let terrain = match owner.as_str() {
                "KAL" => Terrain::Grasslands,
                "FRA" => Terrain::Hills,
                "SWI" => Terrain::Mountains,
                "OMA" => Terrain::Desert,
                "SWE" => Terrain::Marsh,
                "HOL" => Terrain::Farmlands,
                "NOV" => Terrain::Forest,
                "TUN" => Terrain::CoastalDesert,
                "VEN" => Terrain::Coastline,
                "CRE" => Terrain::Savannah,
                "MAM" => Terrain::Drylands,
                "KAR" => Terrain::Highlands,
                "MOS" => Terrain::Woods,
                "COC" => Terrain::Jungle,
                "KAZ" => Terrain::Steppe,
                "KMC" => Terrain::Glacier,
                _ => panic!("unknown tag"),
            };

            if predicted != terrain {
                mismatched2.push((id, terrain, predicted));
            }
        }
    }

    if !mismatched2.is_empty() {
        panic!("{:?} failures: {:#?}", mismatched2.len(), &mismatched2);
    }

    // let mut terrain_name: HashMap<u8, String> = HashMap::new();
    // for terr in terrain.terrain.values() {
    //     for &color in &terr.color {
    //         terrain_name.insert(color, terr.ty.clone());
    //     }
    // }

    // for (prov_id, indices) in &terrain_ind {
    //     let mut count: HashMap<u8, usize> = HashMap::new();
    //     let mut count2: HashMap<u8, usize> = HashMap::new();

    //     for &ind in indices {
    //         *count.entry(ind).or_default() += 1;
    //         *count2.entry(map_ind(ind)).or_default() += 1;

    //     }

    //     let mut freq: Vec<_> = count.iter().collect();
    //     freq.sort_unstable_by(|(_, &acount), (_, &bcount)| bcount.cmp(&acount));
    //     if freq.len() > 1 && freq[1].1 == freq[0].1 {
    //         println!("{:?} {:?}", prov_id, freq);
    //     }

    //     let mut freq2: Vec<_> = count2.iter().collect();
    //     freq2.sort_unstable_by(|(aind, &acount), (bind, &bcount)| bcount.cmp(&acount).then_with(|| aind.cmp(bind)));

    //     if terrain_name.get(freq2[0].0) != terrain_name.get(freq[0].0) {
    //         println!("SPLIT: {:?} {:?}", prov_id, freq);
    //     }
    // }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Ord, PartialOrd, Hash)]
#[repr(u8)]
pub enum Terrain {
    Grasslands = 0,
    Hills = 1,
    Mountains = 2,
    Desert = 3,
    Farmlands = 10,
    Forest = 12,
    Ocean = 15,
    InlandOcean = 17,
    CoastalDesert = 19,
    Savannah = 20,
    Drylands = 22,
    Highlands = 23,
    Coastline = 35,

    Glacier,
    ImpassableMountain,
    Marsh,
    Steppe,

    Jungle = 254,
    Woods = 255,
}

impl Terrain {
    pub fn from_terrain_bmp(ind: u8) -> Self {
        match ind {
            0 | 4 | 5 => Terrain::Grasslands,
            1 => Terrain::Hills,
            2 | 6 | 16 => Terrain::Mountains,
            3 | 7 => Terrain::Desert,
            8 => Terrain::Hills,
            9 => Terrain::Marsh,
            10 | 11 | 21 => Terrain::Farmlands,
            12 | 13 | 14 => Terrain::Forest,
            15 => Terrain::Ocean,
            17 => Terrain::InlandOcean,
            19 => Terrain::CoastalDesert,
            35 => Terrain::Coastline,
            20 => Terrain::Savannah,
            22 => Terrain::Drylands,
            23 => Terrain::Highlands,
            24 => Terrain::Highlands,
            255 => Terrain::Woods,
            254 => Terrain::Jungle,
            _ => panic!("unrecognized index: {:?}", ind),
        }
    }

    pub fn from_terrain_name(name: &str) -> Option<Self> {
        match name {
            "glacier" => Some(Terrain::Glacier),
            "farmlands" => Some(Terrain::Farmlands),
            "forest" => Some(Terrain::Forest),
            "hills" => Some(Terrain::Hills),
            "woods" => Some(Terrain::Woods),
            "mountain" => Some(Terrain::Mountains),
            "grasslands" => Some(Terrain::Grasslands),
            "jungle" => Some(Terrain::Jungle),
            "marsh" => Some(Terrain::Marsh),
            "desert" => Some(Terrain::Desert),
            "coastal_desert" => Some(Terrain::CoastalDesert),
            "coastline" => Some(Terrain::Coastline),
            "drylands" => Some(Terrain::Drylands),
            "highlands" => Some(Terrain::Highlands),
            "savannah" => Some(Terrain::Savannah),
            "steppe" => Some(Terrain::Steppe),
            _ => None,
        }
    }
}
