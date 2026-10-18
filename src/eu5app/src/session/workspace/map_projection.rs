use super::map_painter::{self, LocationMarket, LocationValues, MapLayout, PaintRequest};
use super::terrain_fill::FillComponents;
use super::*;
use crate::map_projection::{Fraction, MapProjectionData, MapProjectionError, Metric};
use std::cell::OnceCell;
use std::sync::OnceLock;

/// The values of a snapshot frame. They do not depend on the loaded save.
struct FrameValues<'a> {
    frame: &'a MapProjectionData<'a>,
    fill: &'a FillComponents,
    /// The index of each location ID. It is the same for every frame of the
    /// layout, so the workspace keeps it.
    location_index: &'a OnceLock<FxHashMap<LocationId, LocationIdx>>,
    /// [historical owner color, current controller color, primary religion]
    countries: FxHashMap<u32, [u32; 3]>,
    religions: OnceCell<FxHashMap<u32, GpuColor>>,
    markets: OnceCell<FxHashMap<u32, (Option<LocationIdx>, GpuColor)>>,
    owner_fill: OnceCell<LocationIndexedVec<Option<LocationIdx>>>,
    religion_fill: OnceCell<LocationIndexedVec<Option<LocationIdx>>>,
}

impl<'a> FrameValues<'a> {
    fn new(
        frame: &'a MapProjectionData<'a>,
        fill: &'a FillComponents,
        location_index: &'a OnceLock<FxHashMap<LocationId, LocationIdx>>,
    ) -> Self {
        let countries = frame
            .countries
            .as_chunks::<4>()
            .0
            .iter()
            .map(|p| (p[0], [p[1], p[2], p[3]]))
            .collect();
        Self {
            frame,
            fill,
            location_index,
            countries,
            religions: OnceCell::new(),
            markets: OnceCell::new(),
            owner_fill: OnceCell::new(),
            religion_fill: OnceCell::new(),
        }
    }

    fn column(values: &[u32], idx: LocationIdx) -> Option<u32> {
        Some(values[idx.value() as usize]).filter(|&id| id != u32::MAX)
    }

    fn country_color(&self, country: Option<u32>, column: usize) -> GpuColor {
        country
            .and_then(|id| self.countries.get(&id))
            .map_or(GpuColor::UNOWNED, |p| GpuColor::from_packed(p[column]))
    }

    fn religions(&self) -> &FxHashMap<u32, GpuColor> {
        self.religions.get_or_init(|| {
            self.frame
                .religion_colors
                .as_chunks::<2>()
                .0
                .iter()
                .map(|p| (p[0], GpuColor::from_packed(p[1])))
                .collect()
        })
    }

    fn markets(&self) -> &FxHashMap<u32, (Option<LocationIdx>, GpuColor)> {
        self.markets.get_or_init(|| {
            // Validation makes sure that the frame has the location IDs of
            // the layout, so one index serves every frame.
            let locations = self.location_index.get_or_init(|| {
                self.frame
                    .location_ids
                    .iter()
                    .enumerate()
                    .map(|(idx, &id)| (LocationId::new(id), LocationIdx::new(idx as u32)))
                    .collect()
            });
            self.frame
                .market_colors
                .as_chunks::<3>()
                .0
                .iter()
                .map(|p| {
                    let center = locations.get(&LocationId::new(p[1])).copied();
                    (p[0], (center, GpuColor::from_packed(p[2])))
                })
                .collect()
        })
    }
}

impl LocationValues for FrameValues<'_> {
    fn location_count(&self) -> usize {
        self.frame.location_ids.len()
    }

    fn owner(&self, idx: LocationIdx) -> Option<u32> {
        Self::column(self.frame.owners, idx)
    }

    fn controller(&self, idx: LocationIdx) -> Option<u32> {
        Self::column(self.frame.controllers, idx)
    }

    fn religion(&self, idx: LocationIdx) -> Option<u32> {
        Self::column(self.frame.religions, idx)
    }

    fn fraction(&self, idx: LocationIdx, fraction: Fraction) -> f64 {
        let column = idx.value() as usize * Fraction::ALL.len() + fraction as usize;
        f64::from(self.frame.fractions[column]) / crate::map_projection::FRACTION_SCALE
    }

    fn metric(&self, idx: LocationIdx, metric: Metric) -> f64 {
        let column = idx.value() as usize * Metric::ALL.len() + metric as usize;
        f64::from(self.frame.metrics[column])
    }

    fn owner_color(&self, idx: LocationIdx) -> GpuColor {
        self.country_color(self.owner(idx), 0)
    }

    fn controller_color(&self, idx: LocationIdx) -> GpuColor {
        self.country_color(self.controller(idx), 1)
    }

    fn religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let religion = self.religion(idx)?;
        Some(
            self.religions()
                .get(&religion)
                .copied()
                .unwrap_or(GpuColor::DEBUG),
        )
    }

    fn owner_religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let country = self.countries.get(&self.owner(idx)?)?;
        self.religions().get(&country[2]).copied()
    }

    fn market(&self, idx: LocationIdx) -> LocationMarket {
        let Some(market) = Self::column(self.frame.markets, idx) else {
            return LocationMarket::None;
        };
        match self.markets().get(&market) {
            Some(&(center, color)) => LocationMarket::Member { color, center },
            None => LocationMarket::Unknown,
        }
    }

    fn has_controllers(&self) -> bool {
        true
    }

    fn owner_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>> {
        self.owner_fill
            .get_or_init(|| map_painter::owner_fill(self.fill, self))
    }

    fn religion_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>> {
        self.religion_fill
            .get_or_init(|| map_painter::religion_fill(self.fill, self))
    }
}

/// A snapshot painted for the overlay. The loaded save's buffers stay as
/// they are.
pub struct ProjectionPaint {
    pub arrays: pdx_map::LocationArrays,
    /// The group of each GPU location, for box selection.
    pub groups: Vec<u32>,
    pub legend: crate::gradient::MapLegend,
}

impl Eu5Workspace<'_> {
    pub fn map_projection_layout_key(&self) -> &str {
        &self.map_layout_key
    }

    /// Paint a snapshot frame against the shared terrain, into a copy of the
    /// location buffers. All compatibility checks come before the paint.
    pub fn paint_map_projection(
        &self,
        frame: MapProjectionData<'_>,
        mode: MapMode,
    ) -> Result<ProjectionPaint, MapProjectionError> {
        frame.validate(&self.map_layout_key, &self.gamestate.locations)?;
        let values = FrameValues::new(
            &frame,
            &self.fill_components,
            &self.projection_location_index,
        );
        let layout = MapLayout {
            terrain: &self.location_terrain,
            fill: &self.fill_components,
        };
        let request = PaintRequest {
            mode,
            selection: None,
        };
        let painted = map_painter::paint(&values, &layout, &request);
        let mut arrays = self.location_arrays.clone();
        painted.write(&self.gpu_indices, &mut arrays);
        let mut groups = vec![u32::MAX; arrays.len()];
        for index in 0..values.location_count() {
            let idx = LocationIdx::new(index as u32);
            let Some(gpu) = self.gpu_indices[idx] else {
                continue;
            };
            let mut location = arrays.get_mut(gpu);
            location.set_border_color(map_painter::border_color(&values, &layout, idx));
            location.flags_mut().clear(LocationFlags::INTERACTION);
            if layout.terrain[idx].is_passable() {
                super::map_render::set_unowned_flag(
                    location.flags_mut(),
                    values.owner(idx).is_none(),
                );
            }
            groups[gpu.value() as usize] =
                map_painter::group_id(mode, frame.owners[index], frame.markets[index]);
        }
        Ok(ProjectionPaint {
            arrays,
            groups,
            legend: painted.legend,
        })
    }
}
