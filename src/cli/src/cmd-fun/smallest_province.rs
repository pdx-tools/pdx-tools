use crate::rawbmp::{Bmp, Pixels, Rgb};
use clap::Args;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::ExitCode,
};

/// Finds the smallest province on the map
#[derive(Args)]
pub struct SmallestProvinceArgs {
    #[clap(value_parser)]
    map_dir: PathBuf,
}

impl SmallestProvinceArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
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

        let mut prov_count: HashMap<u16, usize> = HashMap::new();
        for prov in provinces {
            let entry = prov_count.entry(prov).or_default();
            *entry += 1;
        }

        let mut counts: Vec<_> = prov_count.into_iter().map(|(k, v)| (v, k)).collect();
        counts.sort_unstable();

        println!("{:?}", &counts[0..2]);

        Ok(ExitCode::SUCCESS)
    }
}
