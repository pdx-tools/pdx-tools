//! The coloring rules of each map mode. The live save and a snapshot frame
//! supply the values through [`LocationValues`].
use super::terrain_fill::FillComponents;
use crate::gradient::{GradientClip, GradientScale, MapLegend, Ramp};
use crate::map_projection::{Fraction, Metric};
use crate::{MapMode, SelectionState, Terrain};
use eu5save::models::{LocationIdx, LocationIndexedVec};
use pdx_map::{GpuColor, GpuLocationIdx, LocationArrays};

/// The top of a sequential map is this percentile of its land, so that a few
/// places with very high values do not squeeze the rest into the bottom colors.
/// The key shows the land above the top.
const CLIP_PERCENTILE: f64 = 0.98;

/// A pop of a few hundred people that records a single birth has an annual
/// rate many times the median. More of such land is above the top of the
/// growth map.
const GROWTH_CLIP_PERCENTILE: f64 = 0.95;

/// The market of a location.
pub(crate) enum LocationMarket {
    None,
    /// The location names a market that has no record.
    Unknown,
    Member {
        color: GpuColor,
        center: Option<LocationIdx>,
    },
}

/// The values of each location on one date. Identities are only compared,
/// so their numbers have no other meaning.
pub(crate) trait LocationValues {
    fn location_count(&self) -> usize;
    /// `None` when no country owns the location.
    fn owner(&self, idx: LocationIdx) -> Option<u32>;
    fn controller(&self, idx: LocationIdx) -> Option<u32>;
    fn religion(&self, idx: LocationIdx) -> Option<u32>;
    fn fraction(&self, idx: LocationIdx, fraction: Fraction) -> f64;
    fn metric(&self, idx: LocationIdx, metric: Metric) -> f64;
    /// The map color of the owner, or `GpuColor::UNOWNED`.
    fn owner_color(&self, idx: LocationIdx) -> GpuColor;
    /// The map color of the controller, or `GpuColor::UNOWNED`.
    fn controller_color(&self, idx: LocationIdx) -> GpuColor;
    /// `None` when the location has no religion.
    fn religion_color(&self, idx: LocationIdx) -> Option<GpuColor>;
    /// The color of the primary religion of the owner.
    fn owner_religion_color(&self, idx: LocationIdx) -> Option<GpuColor>;
    fn market(&self, idx: LocationIdx) -> LocationMarket;
    /// The identity of the market, also when it has no record.
    fn market_id(&self, idx: LocationIdx) -> Option<u32>;
    /// False when the date has no record of occupation.
    fn has_controllers(&self) -> bool;
    /// The result of [`owner_fill`].
    fn owner_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>>;
    /// The result of [`religion_fill`].
    fn religion_fill(&self) -> &LocationIndexedVec<Option<LocationIdx>>;
}

/// The map resources that do not change with the date.
pub(crate) struct MapLayout<'a> {
    pub terrain: &'a LocationIndexedVec<Terrain>,
    pub fill: &'a FillComponents,
}

pub(crate) struct PaintRequest<'a> {
    pub mode: MapMode,
    /// `None` paints as if nothing is selected.
    pub selection: Option<&'a SelectionState>,
}

/// The colors of each location, by location index.
pub(crate) struct PaintedMap {
    primary: Vec<GpuColor>,
    /// `None` when the mode has no stripes.
    secondary: Option<Vec<GpuColor>>,
    pub legend: MapLegend,
}

impl PaintedMap {
    pub(crate) fn write(
        &self,
        gpu_indices: &LocationIndexedVec<Option<GpuLocationIdx>>,
        arrays: &mut LocationArrays,
    ) {
        for (idx, &primary) in self.primary.iter().enumerate() {
            let idx = LocationIdx::new(idx as u32);
            let Some(gpu) = gpu_indices[idx] else {
                continue;
            };
            let mut location = arrays.get_mut(gpu);
            location.set_primary_color(primary);
            if let Some(secondary) = &self.secondary {
                location.set_secondary_color(secondary[idx.value() as usize]);
            }
        }
        if self.secondary.is_none() {
            arrays.copy_primary_to_secondary();
        }
    }
}

/// The surrounded terrain that takes the color of one owner around it.
pub(crate) fn owner_fill(
    fill: &FillComponents,
    values: &(impl LocationValues + ?Sized),
) -> LocationIndexedVec<Option<LocationIdx>> {
    fill.resolve_all(|idx| values.owner(idx))
}

/// The surrounded terrain that takes the color of one religion around it.
/// The key holds the owner too, so that the donor's country is the one
/// country around the terrain.
pub(crate) fn religion_fill(
    fill: &FillComponents,
    values: &(impl LocationValues + ?Sized),
) -> LocationIndexedVec<Option<LocationIdx>> {
    fill.resolve_all(|idx| Some((values.owner(idx)?, values.religion(idx))))
}

pub(crate) fn terrain_color(layout: &MapLayout, idx: LocationIdx) -> Option<GpuColor> {
    let terrain = layout.terrain[idx];
    if terrain.is_water() {
        Some(GpuColor::WATER)
    } else if !terrain.is_passable() {
        Some(GpuColor::IMPASSABLE)
    } else {
        None
    }
}

/// The color of a market at full access: its own color blended toward the
/// color of the land at its center.
pub(crate) fn market_color(
    values: &(impl LocationValues + ?Sized),
    layout: &MapLayout,
    color: GpuColor,
    center: Option<LocationIdx>,
) -> GpuColor {
    let center = center
        .map(|center| political_color(values, layout, center))
        .unwrap_or(GpuColor::UNOWNED);
    let (r, g, b) = crate::subject_color::blend_color(color.rgb(), center.rgb());
    GpuColor::from_rgb(r, g, b)
}

/// The owner color of a location, without its fill.
pub(crate) fn political_color(
    values: &(impl LocationValues + ?Sized),
    layout: &MapLayout,
    idx: LocationIdx,
) -> GpuColor {
    terrain_color(layout, idx).unwrap_or_else(|| values.owner_color(idx))
}

/// The owner border color. Filled terrain merges with the country around it.
pub(crate) fn border_color(
    values: &(impl LocationValues + ?Sized),
    layout: &MapLayout,
    idx: LocationIdx,
) -> GpuColor {
    terrain_color(layout, idx)
        .unwrap_or_else(|| political_color(values, layout, values.owner_fill()[idx].unwrap_or(idx)))
}

/// The location whose color filled terrain shows in `mode`. `None` for
/// land, for terrain that no one color surrounds, and in the modes that do
/// not fill terrain.
pub(crate) fn fill_donor(
    values: &(impl LocationValues + ?Sized),
    mode: MapMode,
    idx: LocationIdx,
) -> Option<LocationIdx> {
    match mode {
        MapMode::Political => values.owner_fill()[idx],
        MapMode::Religion => values.religion_fill()[idx],
        _ => None,
    }
}

/// The group of a location for box selection: the owner, or the market in
/// the markets mode, of the land whose color it shows. `u32::MAX` when it
/// has none.
pub(crate) fn group(
    values: &(impl LocationValues + ?Sized),
    mode: MapMode,
    idx: LocationIdx,
) -> u32 {
    let source = fill_donor(values, mode, idx).unwrap_or(idx);
    let id = if mode == MapMode::Markets {
        values.market_id(source)
    } else {
        values.owner(source)
    };
    id.unwrap_or(u32::MAX)
}

enum Top {
    Fixed(f64),
    Percentile(f64),
}

struct Gradient {
    /// A log scale divides each value by a quarter of the median of the land
    /// above zero. Thus the middle of the land is near the middle of the
    /// gradient, and land far under the median is at the bottom.
    scale: GradientScale,
    top: Top,
}

impl Gradient {
    /// `softening` is used only by a log scale.
    fn ramp(&self, max: f64, softening: f64) -> Ramp {
        match self.scale {
            GradientScale::Linear => Ramp::Linear { max },
            GradientScale::Log => Ramp::Log { max, softening },
        }
    }
}

fn gradient(mode: MapMode) -> Option<Gradient> {
    let clipped = |scale| Gradient {
        scale,
        top: Top::Percentile(CLIP_PERCENTILE),
    };
    match mode {
        MapMode::Political | MapMode::Religion | MapMode::Markets => None,
        // A share has a true top.
        MapMode::Control => Some(Gradient {
            scale: GradientScale::Linear,
            top: Top::Fixed(1.0),
        }),
        MapMode::Development => Some(clipped(GradientScale::Linear)),
        MapMode::PopulationGrowth => Some(Gradient {
            scale: GradientScale::Linear,
            top: Top::Percentile(GROWTH_CLIP_PERCENTILE),
        }),
        // Most land has little of these, and a few places have very much.
        MapMode::Population
        | MapMode::Wealth
        | MapMode::UnrealizedTaxBase
        | MapMode::BuildingLevels
        | MapMode::StateEfficacy
        | MapMode::RgoLevel => Some(clipped(GradientScale::Log)),
    }
}

/// A quarter of the median of the values above zero, or 1 when there are none.
fn quarter_median(values: &[f64]) -> f64 {
    let mut positive: Vec<f64> = values.iter().copied().filter(|v| *v > 0.0).collect();
    if positive.is_empty() {
        return 1.0;
    }
    let middle = positive.len() / 2;
    let (_, median, _) = positive.select_nth_unstable_by(middle, f64::total_cmp);
    *median / 4.0
}

/// The top of the scale for some land, and the land above it. The values
/// change order.
fn fit(values: &mut [f64], top: &Top) -> (f64, Option<GradientClip>) {
    let percentile = match *top {
        Top::Fixed(top) => return (top, None),
        Top::Percentile(percentile) => percentile,
    };
    if values.is_empty() {
        return (0.0, None);
    }
    let at = ((values.len() - 1) as f64 * percentile).round() as usize;
    let (_, top, above) = values.select_nth_unstable_by(at, f64::total_cmp);
    // Land with no value above zero has no scale to show.
    let top = top.max(0.0);
    let highest = above.iter().copied().fold(top, f64::max);
    let above = above.iter().filter(|v| **v > top).count();
    let clip = (above > 0).then(|| GradientClip {
        share: above as f64 / values.len() as f64,
        highest,
    });
    (top, clip)
}

fn mode_value(values: &(impl LocationValues + ?Sized), idx: LocationIdx, mode: MapMode) -> f64 {
    match mode {
        MapMode::Control => values.fraction(idx, Fraction::Control),
        MapMode::Development => values.metric(idx, Metric::Development),
        MapMode::Population => values.metric(idx, Metric::Population),
        MapMode::BuildingLevels => values.metric(idx, Metric::BuildingLevels),
        MapMode::RgoLevel => values.metric(idx, Metric::RgoLevel),
        MapMode::Wealth => values.metric(idx, Metric::Wealth),
        MapMode::UnrealizedTaxBase => values.metric(idx, Metric::UnrealizedTaxBase),
        MapMode::PopulationGrowth => values.metric(idx, Metric::PopulationGrowth),
        MapMode::StateEfficacy => {
            values.fraction(idx, Fraction::Control) * values.metric(idx, Metric::Development)
        }
        MapMode::Political | MapMode::Religion | MapMode::Markets => 0.0,
    }
}

/// Paint every location in `request.mode`.
pub(crate) fn paint(
    values: &(impl LocationValues + ?Sized),
    layout: &MapLayout,
    request: &PaintRequest,
) -> PaintedMap {
    let count = values.location_count();
    let locations = (0..count).map(|idx| LocationIdx::new(idx as u32));
    match request.mode {
        MapMode::Political => {
            // Filled terrain shows stripes only when one controller holds all
            // the land around it. The key holds the owner too, so a location
            // has a control donor only when it has a fill donor.
            let owner_fill = values.owner_fill();
            let control_fill = values.has_controllers().then(|| {
                layout
                    .fill
                    .resolve_all(|idx| Some((values.owner(idx)?, values.controller(idx))))
            });
            let mut primary = Vec::with_capacity(count);
            let mut secondary = Vec::with_capacity(count);
            for idx in locations {
                let owner_color = political_color(values, layout, owner_fill[idx].unwrap_or(idx));
                let controller_color = match &control_fill {
                    Some(control_fill) => {
                        let source = if owner_fill[idx].is_none() {
                            Some(idx)
                        } else {
                            control_fill[idx]
                        };
                        source.map_or(owner_color, |source| {
                            terrain_color(layout, source)
                                .unwrap_or_else(|| values.controller_color(source))
                        })
                    }
                    None => owner_color,
                };
                primary.push(owner_color);
                secondary.push(controller_color);
            }
            PaintedMap {
                primary,
                secondary: Some(secondary),
                legend: MapLegend::Qualitative,
            }
        }
        MapMode::Religion => {
            let religion_fill = values.religion_fill();
            let mut primary = Vec::with_capacity(count);
            let mut secondary = Vec::with_capacity(count);
            for idx in locations {
                let source = religion_fill[idx].unwrap_or(idx);
                let religion = terrain_color(layout, source)
                    .unwrap_or_else(|| values.religion_color(source).unwrap_or(GpuColor::UNOWNED));
                primary.push(religion);
                secondary.push(values.owner_religion_color(source).unwrap_or(religion));
            }
            PaintedMap {
                primary,
                secondary: Some(secondary),
                legend: MapLegend::Qualitative,
            }
        }
        MapMode::Markets => {
            let primary = locations
                .map(|idx| match values.market(idx) {
                    LocationMarket::None => terrain_color(layout, idx).unwrap_or(GpuColor::UNOWNED),
                    LocationMarket::Unknown => GpuColor::DEBUG,
                    LocationMarket::Member { color, center } => {
                        let access = values.fraction(idx, Fraction::MarketAccess);
                        GpuColor::from_rgb(20, 5, 5).blend(
                            market_color(values, layout, color, center),
                            access.clamp(0.0, 1.0) as f32,
                        )
                    }
                })
                .collect();
            PaintedMap {
                primary,
                secondary: None,
                legend: MapLegend::Qualitative,
            }
        }
        mode => {
            let gradient = gradient(mode).expect("a quantitative map mode");
            let selection = request.selection.filter(|s| !s.is_empty());
            // Some values are expensive, so the domain and the colors share
            // one pass.
            let mode_values: Vec<Option<f64>> = locations
                .clone()
                .map(|idx| {
                    (terrain_color(layout, idx).is_none() && values.owner(idx).is_some())
                        .then(|| mode_value(values, idx, mode))
                })
                .collect();
            let mut land: Vec<f64> = mode_values.iter().flatten().copied().collect();
            let softening = match gradient.scale {
                GradientScale::Log => quarter_median(&land),
                GradientScale::Linear => 1.0,
            };
            let (top, clip) = fit(&mut land, &gradient.top);
            let world = gradient.ramp(top, softening);
            // Selected land has its own scale, with the same softening.
            let (selected, clip) = match selection {
                None => (world, clip),
                Some(selection) => {
                    let mut chosen: Vec<f64> = mode_values
                        .iter()
                        .enumerate()
                        .filter(|(idx, _)| selection.contains(LocationIdx::new(*idx as u32)))
                        .filter_map(|(_, value)| *value)
                        .collect();
                    let (top, clip) = fit(&mut chosen, &gradient.top);
                    (gradient.ramp(top, softening), clip)
                }
            };
            let primary = locations
                .zip(&mode_values)
                .map(|(idx, value)| {
                    terrain_color(layout, idx).unwrap_or_else(|| {
                        let Some(value) = *value else {
                            return GpuColor::UNOWNED;
                        };
                        if selection.is_some_and(|s| s.contains(idx)) {
                            selected.color(value)
                        } else {
                            world.color(value)
                        }
                    })
                })
                .collect();
            PaintedMap {
                primary,
                secondary: None,
                legend: MapLegend::Quantitative(selected.legend(clip)),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_clip_counts_only_the_land_above_the_top() {
        let mut values: Vec<f64> = (1..=100).map(f64::from).collect();
        let (top, clip) = fit(&mut values, &Top::Percentile(0.98));
        assert_eq!(top, 98.0);
        let clip = clip.expect("two values above the top");
        assert_eq!(clip.share, 0.02);
        assert_eq!(clip.highest, 100.0);

        // Land that ties with the top is not above it.
        let mut levels = vec![1.0; 50];
        levels.extend([5.0; 50]);
        assert_eq!(fit(&mut levels, &Top::Percentile(0.98)), (5.0, None));
    }

    #[test]
    fn land_without_values_has_a_scale_at_zero() {
        assert_eq!(fit(&mut [], &Top::Percentile(0.98)), (0.0, None));
        let mut shrinking = [-0.02, -0.01, -0.03];
        assert_eq!(fit(&mut shrinking, &Top::Percentile(0.98)).0, 0.0);
        assert_eq!(quarter_median(&[0.0, -1.0]), 1.0);
        assert_eq!(quarter_median(&[0.0, 4.0, 8.0, 12.0]), 2.0);
    }
}
