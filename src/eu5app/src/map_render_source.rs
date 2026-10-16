//! Shared colour and scale rules for live saves and validated observed columns.
use crate::{
    MapMode, Terrain,
    gradient::{self, GradientScale},
};
use eu5save::models::LocationIdx;
use pdx_map::GpuColor;

pub(crate) trait MapRenderSource {
    fn location_count(&self) -> usize;
    fn terrain(&self, index: LocationIdx) -> Terrain;
    fn owned(&self, index: LocationIdx) -> bool;
}
pub(crate) fn terrain_color(source: &dyn MapRenderSource, index: LocationIdx) -> Option<GpuColor> {
    let terrain = source.terrain(index);
    if terrain.is_water() {
        Some(GpuColor::WATER)
    } else if !terrain.is_passable() {
        Some(GpuColor::IMPASSABLE)
    } else {
        None
    }
}
pub(crate) fn quantitative_color(
    source: &dyn MapRenderSource,
    index: LocationIdx,
    value: f64,
    domain: f64,
    scale: GradientScale,
) -> GpuColor {
    terrain_color(source, index).unwrap_or_else(|| {
        if !source.owned(index) {
            GpuColor::UNOWNED
        } else {
            gradient::interpolate_eu5_gradient(value, domain, scale)
        }
    })
}
pub(crate) fn gradient_domains(
    source: &dyn MapRenderSource,
    value: &dyn Fn(LocationIdx) -> f64,
    selected: &dyn Fn(LocationIdx) -> bool,
    percentile: Option<f64>,
) -> (f64, f64) {
    let (mut global_max, mut selected_max) = (0.0_f64, 0.0_f64);
    let (mut global, mut filtered) = (Vec::new(), Vec::new());
    for index in 0..source.location_count() {
        let index = LocationIdx::new(index as u32);
        if terrain_color(source, index).is_some() || !source.owned(index) {
            continue;
        }
        let v = value(index);
        if percentile.is_some() {
            global.push(v);
            if selected(index) {
                filtered.push(v);
            }
        } else {
            global_max = global_max.max(v);
            if selected(index) {
                selected_max = selected_max.max(v);
            }
        }
    }
    let at = |mut values: Vec<f64>, percentile: f64| {
        if values.is_empty() {
            return 0.0;
        }
        values.sort_by(f64::total_cmp);
        values[((values.len() - 1) as f64 * percentile.clamp(0.0, 1.0)).round() as usize]
    };
    match percentile {
        Some(p) => (at(global, p), at(filtered, p)),
        None => (global_max, selected_max),
    }
}
pub(crate) fn market_center_color(market: GpuColor, owner: GpuColor) -> GpuColor {
    let (r, g, b) = crate::subject_color::blend_color(market.rgb(), owner.rgb());
    GpuColor::from_rgb(r, g, b)
}
pub(crate) fn market_access_color(color: GpuColor, access: f64) -> GpuColor {
    GpuColor::from_rgb(20, 5, 5).blend(color, access.clamp(0.0, 1.0) as f32)
}
pub(crate) fn group_id(mode: MapMode, owner: u32, market: u32) -> u32 {
    if mode == MapMode::Markets {
        market
    } else {
        owner
    }
}
