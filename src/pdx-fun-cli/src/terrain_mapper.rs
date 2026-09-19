use anyhow::Context;
use clap::Args;
use pdx_assets::{
    FileProvider, create_provider,
    eu4::data::{game_version, map},
};
use std::{fs, path::PathBuf, process::ExitCode};

#[derive(Args)]
pub struct TerrainMapperArgs {
    /// EU4 map directory.
    #[clap(value_parser)]
    map_dir: PathBuf,

    /// Optional tree map when the source does not contain trees.bmp.
    #[clap(long, value_parser)]
    trees: Option<PathBuf>,

    /// EU4 game version when launcher-settings.json is not available.
    #[clap(long, value_parser)]
    game_version: Option<String>,
}

impl TerrainMapperArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let provider = create_provider(&self.map_dir)?;
        let prefix = if self.map_dir.join("terrain.txt").exists() {
            ""
        } else {
            "map/"
        };
        let game_version = match &self.game_version {
            Some(version) => Some(version.clone()),
            None if provider.file_exists("launcher-settings.json") => {
                Some(game_version::extract_game_version(&*provider)?)
            }
            None => None,
        };
        let override_precedence = game_version
            .as_deref()
            .map(map::TerrainOverridePrecedence::for_game_version)
            .unwrap_or(map::TerrainOverridePrecedence::First);
        let trees = match &self.trees {
            Some(path) => fs::read(path).context("unable to read tree map")?,
            None => read_map_file(&*provider, prefix, "trees.bmp")?,
        };
        let provinces = map::ProvinceRaster::decode(
            &read_map_file(&*provider, prefix, "definition.csv")?,
            &read_map_file(&*provider, prefix, "provinces.bmp")?,
        )?;
        let calculated = map::calculate_province_terrains(
            &provinces,
            &read_map_file(&*provider, prefix, "terrain.txt")?,
            &read_map_file(&*provider, prefix, "terrain.bmp")?,
            Some(&trees),
            override_precedence,
        )?;

        let mut calculated: Vec<_> = calculated.into_iter().collect();
        calculated.sort_unstable_by_key(|(id, _)| *id);
        for (id, terrain) in calculated {
            println!("{id}\t{}", terrain.variant_name().unwrap_or("unknown"));
        }

        Ok(ExitCode::SUCCESS)
    }
}

fn read_map_file(provider: &dyn FileProvider, prefix: &str, name: &str) -> anyhow::Result<Vec<u8>> {
    provider
        .read_file(&format!("{prefix}{name}"))
        .with_context(|| format!("unable to read map file {name}"))
}
