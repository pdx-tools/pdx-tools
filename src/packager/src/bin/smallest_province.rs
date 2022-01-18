use packager::rawbmp::{Bmp, Pixels, Rgb};
use std::{collections::HashMap, path::Path};

fn main() {
    let args: Vec<_> = std::env::args().collect();
    let map_dir = &args[1];

    let definitions = Path::new(map_dir).join("definition.csv");
    let definitions = std::fs::read(&definitions).unwrap();
    let definitions = packager::mapper::parse_definition(&definitions);
    let definitions: HashMap<Rgb, u16> = definitions.into_iter().map(|(k, v)| (v, k)).collect();

    let provinces_bmp = Path::new(map_dir).join("provinces.bmp");
    let provinces_bmp = std::fs::read(&provinces_bmp).unwrap();
    let bmp = Bmp::parse(&provinces_bmp).unwrap();
    let Pixels::Rgb(pixels) = bmp.pixels();
    let provinces: Vec<u16> = pixels
        .into_iter()
        .map(|x| *definitions.get(&x).unwrap())
        .collect();

    let mut prov_count: HashMap<u16, usize> = HashMap::new();
    for prov in provinces {
        let entry = prov_count.entry(prov).or_default();
        *entry += 1;
    }

    let mut counts: Vec<_> = prov_count.into_iter().map(|(k, v)| (v, k)).collect();
    counts.sort_unstable();

    println!("{:?}", &counts[0..2]);
}
