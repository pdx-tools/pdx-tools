use clap::Args;
use eu4game::{game::Game, shared::Eu4Parser};
use eu4save::ProvinceId;
use pdx_map::{GpuColor, LocationFlags};
use std::{io::Write, path::PathBuf, process::ExitCode};

/// Re-encode from eu4 color format to the pdx-map format
#[derive(Args)]
pub struct ColorMapperArgs {
    /// Files to parse
    file: PathBuf,
}

impl ColorMapperArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let color_index = std::fs::read("assets/game/eu4/1.37/map/color-index.bin")?;
        let color_order: Vec<u8> = std::fs::read("assets/game/eu4/1.37/map/color-order.bin")?;

        // first we need to match up the province id to the color code location
        let colors = color_index
            .chunks_exact(2)
            .enumerate()
            .map(|(id, chunk)| (id as u16, u16::from_le_bytes([chunk[0], chunk[1]]) as usize))
            .map(|(id, color_idx)| {
                let color = &color_order[color_idx * 3..color_idx * 3 + 3];
                (
                    pdx_map::LocationId::new(u32::from(id)),
                    pdx_map::GpuColor::from_rgb(color[0], color[1], color[2]),
                )
            })
            .collect::<Vec<_>>();
        let mut colors = pdx_map::LocationArrays::from_iter(colors.into_iter());

        // Now we need to assign primary and secondary colors according to the save data
        let save_data = std::fs::read(&self.file)?;

        let save = Eu4Parser::new().parse(&save_data)?;
        let game = Game::new(&save.save.meta.savegame_version);

        let mut color_iter = colors.iter_mut();
        while let Some(mut gpu_location) = color_iter.next_location() {
            let prov_id = ProvinceId::new(gpu_location.location_id().value() as i32);
            let terrain = game.get_province(&prov_id).map(|p| p.terrain);

            match terrain {
                Some(schemas::eu4::Terrain::InlandOcean | schemas::eu4::Terrain::Ocean) => {
                    gpu_location.set_primary_color(GpuColor::WATER);
                    gpu_location.set_owner_color(GpuColor::WATER);
                    gpu_location.set_secondary_color(GpuColor::WATER);
                    gpu_location
                        .flags_mut()
                        .set(LocationFlags::NO_LOCATION_BORDERS);
                    continue;
                }
                Some(schemas::eu4::Terrain::Wasteland) => {
                    gpu_location.set_primary_color(GpuColor::IMPASSABLE);
                    gpu_location.set_owner_color(GpuColor::IMPASSABLE);
                    gpu_location.set_secondary_color(GpuColor::IMPASSABLE);
                    continue;
                }
                _ => {}
            }

            let prov = save.save.game.provinces.get(&prov_id).unwrap();
            let Some(owner) = prov.owner.as_ref() else {
                gpu_location.set_primary_color(GpuColor::UNOWNED);
                gpu_location.set_owner_color(GpuColor::UNOWNED);
                gpu_location.set_secondary_color(GpuColor::UNOWNED);
                continue;
            };

            let Some(controller) = prov.controller.as_ref() else {
                gpu_location.set_primary_color(GpuColor::UNOWNED);
                gpu_location.set_owner_color(GpuColor::UNOWNED);
                gpu_location.set_secondary_color(GpuColor::UNOWNED);
                continue;
            };

            let owner_color = save
                .save
                .game
                .countries
                .iter()
                .find_map(|(id, c)| if id == owner { Some(c) } else { None })
                .map(|c| {
                    GpuColor::from_rgb(
                        c.colors.map_color[0],
                        c.colors.map_color[1],
                        c.colors.map_color[2],
                    )
                })
                .unwrap_or(GpuColor::UNOWNED);

            let controller_color = save
                .save
                .game
                .countries
                .iter()
                .find_map(|(id, c)| if id == controller { Some(c) } else { None })
                .map(|c| {
                    GpuColor::from_rgb(
                        c.colors.map_color[0],
                        c.colors.map_color[1],
                        c.colors.map_color[2],
                    )
                })
                .unwrap_or(GpuColor::UNOWNED);

            gpu_location.set_primary_color(owner_color);
            gpu_location.set_secondary_color(controller_color);
            gpu_location.set_owner_color(owner_color);
        }

        std::io::stdout().write_all(bytemuck::cast_slice(colors.as_data()))?;

        Ok(ExitCode::SUCCESS)
    }
}
