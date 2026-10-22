use super::map_painter::{self, LocationMarket, LocationValues, MapLayout, PaintRequest};
use super::terrain_fill::FillComponents;
use super::*;
use crate::map_projection::{
    Fraction, MapProjectionData, MapProjectionError, Metric, NO_ROW, UNKNOWN_ROW,
};
use std::cell::OnceCell;
use std::sync::OnceLock;

/// The values of a snapshot frame. They do not depend on the loaded save.
struct FrameValues<'a> {
    frame: &'a MapProjectionData<'a>,
    fill: &'a FillComponents,
    /// The index of each location ID. It is the same for every frame of the
    /// layout, so the workspace keeps it.
    location_index: &'a OnceLock<FxHashMap<LocationId, LocationIdx>>,
    /// [country ID, historical owner color, current controller color, primary religion ID]
    countries: &'a [[u32; 4]],
    /// [religion ID, color]
    religions: &'a [[u32; 2]],
    /// The color of each religion ID, for the primary religion of a country.
    religion_ids: OnceCell<FxHashMap<u32, GpuColor>>,
    /// The center and color of each market row.
    markets: OnceCell<Vec<(Option<LocationIdx>, GpuColor)>>,
    owner_fill: OnceCell<LocationIndexedVec<Option<LocationIdx>>>,
    religion_fill: OnceCell<LocationIndexedVec<Option<LocationIdx>>>,
}

impl<'a> FrameValues<'a> {
    fn new(
        frame: &'a MapProjectionData<'a>,
        fill: &'a FillComponents,
        location_index: &'a OnceLock<FxHashMap<LocationId, LocationIdx>>,
    ) -> Self {
        Self {
            frame,
            fill,
            location_index,
            countries: frame.countries.as_chunks::<4>().0,
            religions: frame.religion_colors.as_chunks::<2>().0,
            religion_ids: OnceCell::new(),
            markets: OnceCell::new(),
            owner_fill: OnceCell::new(),
            religion_fill: OnceCell::new(),
        }
    }

    /// The table row of a location. Validation makes sure that the row is
    /// in the table.
    fn row(values: &[u16], idx: LocationIdx) -> Option<usize> {
        Some(values[idx.value() as usize])
            .filter(|&row| row != NO_ROW && row != UNKNOWN_ROW)
            .map(usize::from)
    }

    fn country_color(&self, row: Option<usize>, column: usize) -> GpuColor {
        row.map_or(GpuColor::UNOWNED, |row| {
            GpuColor::from_packed(self.countries[row][column])
        })
    }

    fn markets(&self) -> &[(Option<LocationIdx>, GpuColor)] {
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
                    (center, GpuColor::from_packed(p[2]))
                })
                .collect()
        })
    }

    /// The group of a location for box selection: the ID of its owner, or
    /// of its market in the markets mode.
    fn group(&self, mode: MapMode, idx: LocationIdx) -> u32 {
        let owner = self.owner(idx).unwrap_or(u32::MAX);
        let market = Self::row(self.frame.markets, idx)
            .map_or(u32::MAX, |row| self.frame.market_colors[row * 3]);
        map_painter::group_id(mode, owner, market)
    }
}

impl LocationValues for FrameValues<'_> {
    fn location_count(&self) -> usize {
        self.frame.location_ids.len()
    }

    fn owner(&self, idx: LocationIdx) -> Option<u32> {
        Self::row(self.frame.owners, idx).map(|row| self.countries[row][0])
    }

    fn controller(&self, idx: LocationIdx) -> Option<u32> {
        Self::row(self.frame.controllers, idx).map(|row| self.countries[row][0])
    }

    fn religion(&self, idx: LocationIdx) -> Option<u32> {
        Self::row(self.frame.religions, idx).map(|row| self.religions[row][0])
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
        self.country_color(Self::row(self.frame.owners, idx), 1)
    }

    fn controller_color(&self, idx: LocationIdx) -> GpuColor {
        self.country_color(Self::row(self.frame.controllers, idx), 2)
    }

    fn religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let row = Self::row(self.frame.religions, idx)?;
        Some(GpuColor::from_packed(self.religions[row][1]))
    }

    fn owner_religion_color(&self, idx: LocationIdx) -> Option<GpuColor> {
        let country = self.countries[Self::row(self.frame.owners, idx)?];
        let colors = self.religion_ids.get_or_init(|| {
            self.religions
                .iter()
                .map(|[id, color]| (*id, GpuColor::from_packed(*color)))
                .collect()
        });
        colors.get(&country[3]).copied()
    }

    fn market(&self, idx: LocationIdx) -> LocationMarket {
        match self.frame.markets[idx.value() as usize] {
            NO_ROW => LocationMarket::None,
            UNKNOWN_ROW => LocationMarket::Unknown,
            row => {
                let (center, color) = self.markets()[usize::from(row)];
                LocationMarket::Member { color, center }
            }
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
            groups[gpu.value() as usize] = values.group(mode, idx);
        }
        Ok(ProjectionPaint {
            arrays,
            groups,
            legend: painted.legend,
        })
    }
}
