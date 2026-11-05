//! The coloring rules of each map mode. The live save and a snapshot frame
//! supply the values through [`LocationValues`].
use super::terrain_fill::FillComponents;
use crate::gradient::{self, GradientScale, MapLegend};
use crate::map_projection::{Fraction, Metric};
use crate::{MapMode, SelectionState, Terrain};
use eu5save::models::{LocationIdx, LocationIndexedVec};
use pdx_map::{GpuColor, GpuLocationIdx, LocationArrays};

/// How much of a market's color each band of market access shows. The map key
/// names the bands, so keep the two in step.
const MARKET_ACCESS_BANDS: [(f64, f32); 4] = [(0.25, 0.22), (0.5, 0.48), (0.75, 0.74), (1.0, 1.0)];

/// The share of a market's color that a location with this access shows. Four
/// flat bands can be read on a key, and a smooth fade reads as a blur.
fn market_access_strength(access: f64) -> f32 {
    MARKET_ACCESS_BANDS
        .iter()
        .find(|(upper, _)| access < *upper)
        .map_or(1.0, |(_, strength)| *strength)
}

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

pub(crate) fn group_id(mode: MapMode, owner: u32, market: u32) -> u32 {
    if mode == MapMode::Markets {
        market
    } else {
        owner
    }
}

enum Domain {
    Fixed(f64),
    Percentile(f64),
}

struct Gradient {
    scale: GradientScale,
    domain: Domain,
    /// The colors use the value and the domain divided by this number.
    softening: Softening,
}

enum Softening {
    Fixed(f64),
    /// A quarter of the middle value of the land that has any, so that the middle of the land
    /// is in the middle of the ramp, and little of it is near black.
    QuarterMedian,
}

/// One rule for each sequential map: the top of the scale stops at this share of the land,
/// the key marks it, and the key states the true highest value.
const CLIP_PERCENTILE: f64 = 0.98;

fn gradient(mode: MapMode) -> Option<Gradient> {
    let clipped = |scale, softening| Gradient {
        scale,
        domain: Domain::Percentile(CLIP_PERCENTILE),
        softening,
    };
    match mode {
        MapMode::Political | MapMode::Religion | MapMode::Markets => None,
        // A share has a true top.
        MapMode::Control => Some(Gradient {
            scale: GradientScale::Linear,
            domain: Domain::Fixed(1.0),
            softening: Softening::Fixed(1.0),
        }),
        // Most land holds little of these and a few places hold very much.
        MapMode::Population
        | MapMode::Wealth
        | MapMode::UnrealizedTaxBase
        | MapMode::BuildingLevels
        | MapMode::StateEfficacy
        | MapMode::RgoLevel => Some(clipped(GradientScale::Log, Softening::QuarterMedian)),
        MapMode::Development | MapMode::PopulationGrowth => {
            Some(clipped(GradientScale::Linear, Softening::Fixed(1.0)))
        }
    }
}

/// The middle of the values above zero
fn median_positive(values: &[Option<f64>]) -> f64 {
    let mut positive: Vec<f64> = values
        .iter()
        .flatten()
        .copied()
        .filter(|v| *v > 0.0)
        .collect();
    if positive.is_empty() {
        return 1.0;
    }
    positive.sort_by(f64::total_cmp);
    positive[positive.len() / 2]
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

/// The domain of all owned land and the domain of the selected land, which
/// is all land when nothing is selected. `mode_values` is `None` for each
/// location that is not owned land.
fn gradient_domains(
    mode_values: &[Option<f64>],
    selected: impl Fn(LocationIdx) -> bool,
    percentile: f64,
) -> (f64, f64) {
    let owned = mode_values
        .iter()
        .enumerate()
        .filter_map(|(idx, v)| Some((LocationIdx::new(idx as u32), (*v)?)));
    let (mut global, mut filtered) = (Vec::new(), Vec::new());
    for (idx, v) in owned {
        global.push(v);
        if selected(idx) {
            filtered.push(v);
        }
    }
    let at = |mut values: Vec<f64>| {
        if values.is_empty() {
            return 0.0;
        }
        values.sort_by(f64::total_cmp);
        values[((values.len() - 1) as f64 * percentile.clamp(0.0, 1.0)).round() as usize]
    };
    (at(global), at(filtered))
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
                    // The save gives sea locations a market. A map that paints them
                    // swells each coast past its shore.
                    _ if layout.terrain[idx].is_water() => GpuColor::WATER,
                    LocationMarket::None => terrain_color(layout, idx).unwrap_or(GpuColor::UNOWNED),
                    LocationMarket::Unknown => GpuColor::DEBUG,
                    LocationMarket::Member { color, center } => {
                        let owner = center
                            .map(|center| political_color(values, layout, center))
                            .unwrap_or(GpuColor::UNOWNED);
                        let (r, g, b) = crate::subject_color::blend_color(color.rgb(), owner.rgb());
                        let access = values.fraction(idx, Fraction::MarketAccess);
                        GpuColor::from_rgb(20, 5, 5)
                            .blend(GpuColor::from_rgb(r, g, b), market_access_strength(access))
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
            let selection = request.selection;
            // Some values are expensive, so the domain and the colors share
            // one pass.
            let mode_values: Vec<Option<f64>> = locations
                .clone()
                .map(|idx| {
                    (terrain_color(layout, idx).is_none() && values.owner(idx).is_some())
                        .then(|| mode_value(values, idx, mode))
                })
                .collect();
            let selected = |idx| selection.is_none_or(|s| s.is_empty() || s.contains(idx));
            let (global_max, filtered_max) = match gradient.domain {
                Domain::Fixed(domain) => (domain, domain),
                Domain::Percentile(percentile) => {
                    gradient_domains(&mode_values, selected, percentile)
                }
            };
            let divisor = match gradient.softening {
                Softening::Fixed(divisor) => divisor,
                Softening::QuarterMedian => median_positive(&mode_values) / 4.0,
            };
            let true_max = mode_values
                .iter()
                .enumerate()
                .filter(|(at, _)| selected(LocationIdx::new(*at as u32)))
                .filter_map(|(_, v)| *v)
                .fold(0.0_f64, f64::max);
            let primary = locations
                .zip(&mode_values)
                .map(|(idx, value)| {
                    terrain_color(layout, idx).unwrap_or_else(|| {
                        let Some(value) = *value else {
                            return GpuColor::UNOWNED;
                        };
                        let domain = if selection.is_some_and(|s| s.contains(idx)) {
                            filtered_max
                        } else {
                            global_max
                        };
                        gradient::interpolate_eu5_gradient(
                            value / divisor,
                            domain / divisor,
                            gradient.scale,
                        )
                    })
                })
                .collect();
            PaintedMap {
                primary,
                secondary: None,
                legend: MapLegend::Quantitative(gradient::sequential(
                    gradient.scale,
                    0.0,
                    filtered_max,
                    divisor,
                    matches!(gradient.domain, Domain::Percentile(_)),
                    true_max,
                )),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_access_has_four_bands() {
        assert_eq!(market_access_strength(0.0), 0.22);
        assert_eq!(market_access_strength(0.24), 0.22);
        assert_eq!(market_access_strength(0.25), 0.48);
        assert_eq!(market_access_strength(0.74), 0.74);
        assert_eq!(market_access_strength(1.0), 1.0);
    }
}
