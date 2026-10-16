use super::*;
use crate::gradient::{self, GradientScale};
use crate::map_projection::{FRACTION_SCALE, MapProjectionData, MapProjectionError};
use crate::map_render_source::{self, MapRenderSource};
use std::collections::BTreeMap;
struct ProjectedMapSource<'a, 'bump> {
    workspace: &'a Eu5Workspace<'bump>,
    frame: &'a MapProjectionData<'a>,
}
impl MapRenderSource for ProjectedMapSource<'_, '_> {
    fn location_count(&self) -> usize {
        self.frame.location_ids.len()
    }
    fn terrain(&self, index: LocationIdx) -> Terrain {
        self.workspace.location_terrain(index)
    }
    fn owned(&self, index: LocationIdx) -> bool {
        self.frame.owners[index.value() as usize] != u32::MAX
    }
}

impl Eu5Workspace<'_> {
    pub fn map_projection_layout_key(&self) -> &str {
        &self.map_layout_key
    }

    /// Repaint observations against shared terrain, without rebuilding a save model.
    /// All compatibility checks precede buffer changes.
    pub fn apply_map_projection(
        &mut self,
        frame: MapProjectionData<'_>,
        mode: MapMode,
    ) -> Result<Vec<u32>, MapProjectionError> {
        let n = frame.location_ids.len();
        frame.validate(&self.map_layout_key, &self.gamestate.locations)?;
        let countries: BTreeMap<_, _> = frame
            .countries
            .as_chunks::<4>()
            .0
            .iter()
            .map(|p| (p[0], [p[1], p[2], p[3]]))
            .collect();
        let religions: BTreeMap<_, _> = frame
            .religion_colors
            .as_chunks::<2>()
            .0
            .iter()
            .map(|p| (p[0], GpuColor::from_packed(p[1])))
            .collect();
        let markets: BTreeMap<_, _> = frame
            .market_colors
            .as_chunks::<3>()
            .0
            .iter()
            .map(|p| (p[0], (p[1], GpuColor::from_packed(p[2]))))
            .collect();
        let fraction = |index: usize, column: usize| {
            f64::from(frame.fractions[index * 2 + column]) / FRACTION_SCALE
        };
        let metric = |index: usize, column: usize| f64::from(frame.metrics[index * 7 + column]);
        let value = |index| match mode {
            MapMode::Control => fraction(index, 0),
            MapMode::Development => metric(index, 0),
            MapMode::Population => metric(index, 1),
            MapMode::BuildingLevels => metric(index, 2),
            MapMode::RgoLevel => metric(index, 3),
            MapMode::Wealth => metric(index, 4),
            MapMode::UnrealizedTaxBase => metric(index, 5),
            MapMode::PopulationGrowth => metric(index, 6),
            MapMode::StateEfficacy => metric(index, 0) * fraction(index, 0),
            _ => 0.0,
        };
        let render_source = ProjectedMapSource {
            workspace: self,
            frame: &frame,
        };
        let mut domain = map_render_source::gradient_domains(
            &render_source,
            &|idx| value(idx.value() as usize),
            &|_| true,
            (mode == MapMode::PopulationGrowth).then_some(0.95),
        )
        .0;
        if mode == MapMode::Control {
            domain = 1.0;
        }
        let scale = if mode == MapMode::Population {
            GradientScale::Log
        } else {
            GradientScale::Linear
        };
        let owner_donors = self.fill_components.resolve_all(|idx| {
            let owner = frame.owners[idx.value() as usize];
            (owner != u32::MAX).then_some(owner)
        });
        let control_donors = (mode == MapMode::Political).then(|| {
            self.fill_components.resolve_all(|idx| {
                let index = idx.value() as usize;
                let owner = frame.owners[index];
                (owner != u32::MAX).then_some((owner, frame.controllers[index]))
            })
        });
        let religion_donors = (mode == MapMode::Religion).then(|| {
            self.fill_components.resolve_all(|idx| {
                let index = idx.value() as usize;
                let owner = frame.owners[index];
                (owner != u32::MAX).then_some((owner, frame.religions[index]))
            })
        });
        let terrain_color = |index: usize| {
            map_render_source::terrain_color(&render_source, LocationIdx::new(index as u32))
        };
        let political = |index: usize, controller: bool| {
            terrain_color(index).unwrap_or_else(|| {
                let id = if controller {
                    frame.controllers[index]
                } else {
                    frame.owners[index]
                };
                countries
                    .get(&id)
                    .map(|p| GpuColor::from_packed(p[usize::from(controller)]))
                    .unwrap_or(GpuColor::UNOWNED)
            })
        };
        let religion = |index: usize| {
            terrain_color(index).unwrap_or_else(|| {
                if frame.religions[index] == u32::MAX {
                    GpuColor::UNOWNED
                } else {
                    religions
                        .get(&frame.religions[index])
                        .copied()
                        .unwrap_or(GpuColor::DEBUG)
                }
            })
        };
        // Center colors are shared across all locations in a market.
        let market_colors: BTreeMap<_, _> = markets
            .iter()
            .map(|(&id, &(center, color))| {
                let owner = self
                    .gamestate
                    .locations
                    .get(eu5save::models::LocationId::new(center))
                    .map(|idx| political(idx.value() as usize, false))
                    .unwrap_or(GpuColor::UNOWNED);
                (id, map_render_source::market_center_color(color, owner))
            })
            .collect();
        let mut painted = Vec::with_capacity(n);
        for (index, entry) in self.gamestate.locations.iter().enumerate() {
            let source = owner_donors[entry.idx()].unwrap_or(entry.idx()).value() as usize;
            let border = terrain_color(index).unwrap_or_else(|| political(source, false));
            let (primary, secondary) = match mode {
                MapMode::Political => {
                    let primary = political(source, false);
                    let source = if owner_donors[entry.idx()].is_none() {
                        Some(entry.idx())
                    } else {
                        control_donors.as_ref().unwrap()[entry.idx()]
                    };
                    (
                        primary,
                        source
                            .map(|idx| political(idx.value() as usize, true))
                            .unwrap_or(primary),
                    )
                }
                MapMode::Religion => {
                    let source = religion_donors.as_ref().unwrap()[entry.idx()]
                        .unwrap_or(entry.idx())
                        .value() as usize;
                    let primary = religion(source);
                    let secondary = countries
                        .get(&frame.owners[source])
                        .and_then(|p| religions.get(&p[2]))
                        .copied()
                        .unwrap_or(primary);
                    (primary, secondary)
                }
                MapMode::Markets => {
                    let id = frame.markets[index];
                    let color = if id == u32::MAX {
                        terrain_color(index).unwrap_or(GpuColor::UNOWNED)
                    } else {
                        market_colors
                            .get(&id)
                            .map(|color| {
                                map_render_source::market_access_color(*color, fraction(index, 1))
                            })
                            .unwrap_or(GpuColor::DEBUG)
                    };
                    (color, color)
                }
                _ => {
                    let divisor = if mode == MapMode::Population {
                        1000.0
                    } else {
                        1.0
                    };
                    let color = map_render_source::quantitative_color(
                        &render_source,
                        entry.idx(),
                        value(index) / divisor,
                        domain / divisor,
                        scale,
                    );
                    (color, color)
                }
            };
            painted.push((primary, secondary, border));
        }
        let mut groups = vec![u32::MAX; self.location_arrays.len()];
        for (index, entry) in self.gamestate.locations.iter().enumerate() {
            let Some(gpu) = self.gpu_indices[entry.idx()] else {
                continue;
            };
            let (primary, secondary, border) = painted[index];
            let terrain = self.location_terrain(entry.idx());
            let mut location = self.location_arrays.get_mut(gpu);
            location.set_primary_color(primary);
            location.set_secondary_color(secondary);
            location.set_border_color(border);
            location.flags_mut().clear(LocationFlags::INTERACTION);
            if terrain.is_passable() {
                super::map_render::set_unowned_flag(
                    location.flags_mut(),
                    frame.owners[index] == u32::MAX,
                );
            }
            groups[gpu.value() as usize] =
                map_render_source::group_id(mode, frame.owners[index], frame.markets[index]);
        }
        self.current_map_mode = mode;
        self.current_map_legend = match mode {
            MapMode::Political | MapMode::Religion | MapMode::Markets => {
                gradient::MapLegend::Qualitative
            }
            _ => gradient::MapLegend::Quantitative(gradient::sequential(scale, 0.0, domain)),
        };
        Ok(groups)
    }
    pub fn restore_map_projection(&mut self) {
        self.build_location_arrays();
        self.apply_map_mode(self.current_map_mode);
    }
}
