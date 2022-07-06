use crate::rawbmp::{Bmp, Pixels, Rgb};
use clap::Args;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::ExitCode,
};

/// Shows which provinces borders which
#[derive(Args)]
pub struct ProvinceBordersArgs {
    #[clap(value_parser)]
    map_dir: PathBuf,
}

impl ProvinceBordersArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let data = std::fs::read("./assets/game/eu4/1.30/data-raw.bin")?;
        let game = schemas::eu4::root_as_game(&data)?;
        let mut province_terrains: HashSet<u16> = HashSet::new();
        let mut ocean_provs: HashSet<u16> = HashSet::new();
        for record in game.provinces().unwrap().iter() {
            province_terrains.insert(record.id());
            let is_ocean = record.terrain() == schemas::eu4::Terrain::Ocean;
            if is_ocean {
                ocean_provs.insert(record.id());
            }
        }

        let definitions = Path::new(&self.map_dir).join("definition.csv");
        let definitions = std::fs::read(&definitions)?;
        let definitions = crate::compile_assets::mapper::parse_definition(&definitions);
        let definitions: HashMap<Rgb, u16> = definitions.into_iter().map(|(k, v)| (v, k)).collect();

        let provinces_bmp = Path::new(&self.map_dir).join("provinces.bmp");
        let provinces_bmp = std::fs::read(&provinces_bmp)?;
        let bmp = Bmp::parse(&provinces_bmp)?;
        let Pixels::Rgb(pixels) = bmp.pixels();
        let provinces: Vec<u16> = pixels
            .into_iter()
            .map(|x| *definitions.get(&x).unwrap())
            .collect();

        let prev_row = provinces.chunks_exact(bmp.dib_header.width as usize);
        let province_rows = provinces
            .chunks_exact(bmp.dib_header.width as usize)
            .skip(1);
        let next_row = provinces
            .chunks_exact(bmp.dib_header.width as usize)
            .skip(2);

        let mut adjacencies: HashMap<u16, HashSet<u16>> = HashMap::new();

        for ((row, prev), next) in province_rows.zip(prev_row).zip(next_row) {
            for (i, window) in row.windows(3).enumerate() {
                let left = window[0];
                let current = window[1];
                let right = window[2];
                let up = prev[i];
                let down = next[i];

                let neighbors = adjacencies.entry(current).or_default();
                neighbors.insert(left);
                neighbors.insert(right);
                neighbors.insert(up);
                neighbors.insert(down);
            }
        }

        let mut out = Vec::new();
        for (prov_id, neighbors) in adjacencies
            .iter_mut()
            .filter(|(prov, _)| !ocean_provs.contains(prov) && province_terrains.contains(prov))
        {
            // remove itself
            neighbors.remove(prov_id);

            // remove ocean tiles
            let neighs = neighbors.difference(&ocean_provs);

            let mut sorted_neighbors = neighs
                .filter(|x| province_terrains.contains(x))
                .collect::<Vec<_>>();
            sorted_neighbors.sort_unstable();
            out.push((*prov_id, sorted_neighbors));
        }

        out.sort_unstable();
        for (prov_id, neighbors) in out.iter_mut() {
            print!("{} ", prov_id);
            if let Some(last) = neighbors.pop() {
                for neighbor in neighbors {
                    print!("{} ", neighbor)
                }
                print!("{}", last);
            }
            println!();
        }

        Ok(ExitCode::SUCCESS)
    }
}
