use pdx_map::GpuColor;
use serde::{Deserialize, Serialize};

use crate::color::{Hsv, Rgb};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum GradientScale {
    Linear,
    Log,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum GradientKind {
    Sequential,
    Diverging,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi, from_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub enum GradientPalette {
    Eu5,
    TaxGap,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(into_wasm_abi))]
#[serde(rename_all = "camelCase")]
pub struct GradientConfig {
    pub kind: GradientKind,
    pub scale: GradientScale,
    pub palette: GradientPalette,
    pub min_value: f64,
    pub mid_value: f64,
    pub max_value: f64,
}

/// Interpolates the EU5 6-stop HSV gradient.
///
/// Stops from EU5 game\loading_screen\common\defines\graphic\00_graphics.txt
/// HSV: h in degrees (0–360), s and v in 0–1; evenly spaced at positions 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
pub fn interpolate_eu5_gradient(value: f64, max_value: f64, scale: GradientScale) -> GpuColor {
    const STOPS: [(f32, f32, f32); 6] = [
        (0.0, 0.85, 0.015),  // MAP_COLOR_MIN - near black
        (0.0, 0.85, 0.34),   // MAP_COLOR_LOW - dark red
        (46.8, 0.95, 0.75),  // MAP_COLOR_MID - golden yellow
        (111.6, 0.90, 0.60), // MAP_COLOR_HIGH - muted green
        (111.6, 1.00, 1.00), // MAP_COLOR_MAX - bright green
        (176.4, 1.00, 1.00), // MAP_COLOR_TOP - cyan
    ];

    if max_value == 0.0 {
        let (h, s, v) = STOPS[0];
        let rgb: Rgb = Hsv { h, s, v }.into();
        let (r, g, b) = rgb.into();
        return GpuColor::from_rgb(r, g, b);
    }

    let normalized = match scale {
        GradientScale::Linear => (value / max_value).clamp(0.0, 1.0) as f32,
        GradientScale::Log => (value.ln_1p() / max_value.ln_1p()).clamp(0.0, 1.0) as f32,
    };

    let segment = (normalized * 5.0).min(4.999) as usize;
    let local_t = normalized * 5.0 - segment as f32;

    let (h0, s0, v0) = STOPS[segment];
    let (h1, s1, v1) = STOPS[segment + 1];

    let mut hue_delta = h1 - h0;
    if hue_delta > 180.0 {
        hue_delta -= 360.0;
    }
    if hue_delta < -180.0 {
        hue_delta += 360.0;
    }
    let h = ((h0 + hue_delta * local_t) + 360.0) % 360.0;
    let s = s0 + (s1 - s0) * local_t;
    let v = v0 + (v1 - v0) * local_t;

    let rgb: Rgb = Hsv { h, s, v }.into();
    let (r, g, b) = rgb.into();
    GpuColor::from_rgb(r, g, b)
}

/// Mirrors the population color path's `ln_1p((value/1000)) / ln_1p(max/1000)`
/// normalization: returns the value in original units that lands at the
/// half-way point of the gradient. Only valid for the population log scale.
fn population_log_midpoint(max: f64) -> f64 {
    ((max / 1000.0).ln_1p() * 0.5).exp_m1() * 1000.0
}

/// Build a sequential EU5-palette config. The midpoint is derived from the
/// scale so callers cannot pass an inconsistent value:
/// - Linear → arithmetic mean of `min` and `max`
/// - Log    → population log midpoint (assumes the /1000 softening that the
///   population coloring path applies)
pub fn sequential(scale: GradientScale, min_value: f64, max_value: f64) -> GradientConfig {
    let mid_value = match scale {
        GradientScale::Linear => (min_value + max_value) / 2.0,
        GradientScale::Log => population_log_midpoint(max_value),
    };
    GradientConfig {
        kind: GradientKind::Sequential,
        scale,
        palette: GradientPalette::Eu5,
        min_value,
        mid_value,
        max_value,
    }
}

pub fn interpolate_tax_gap(value: f64, max_abs_value: f64) -> GpuColor {
    let neutral = GpuColor::from_rgb(101, 67, 33);
    if max_abs_value == 0.0 {
        return neutral;
    }

    let overperforming = GpuColor::from_rgb(20, 5, 5);
    let untapped = GpuColor::from_rgb(34, 139, 34);
    let normalized = (value.abs() / max_abs_value).clamp(0.0, 1.0) as f32;

    if value < 0.0 {
        neutral.blend(overperforming, normalized)
    } else {
        neutral.blend(untapped, normalized)
    }
}

/// Sample a palette as `(offset, rgb)` pairs suitable for rendering as a CSS
/// gradient. The EU5 palette is sampled densely so that sRGB interpolation
/// between adjacent stops closely approximates the shader's HSV interpolation;
/// the diverging tax-gap palette only has three perceptual anchors so it ships
/// those directly.
pub fn palette_stops(palette: GradientPalette) -> Vec<(f64, (u8, u8, u8))> {
    match palette {
        GradientPalette::Eu5 => {
            const SAMPLES: usize = 33;
            (0..SAMPLES)
                .map(|i| {
                    let offset = i as f64 / (SAMPLES - 1) as f64;
                    let color = interpolate_eu5_gradient(offset, 1.0, GradientScale::Linear).rgb();
                    (offset, color)
                })
                .collect()
        }
        GradientPalette::TaxGap => vec![
            (0.0, interpolate_tax_gap(-1.0, 1.0).rgb()),
            (0.5, interpolate_tax_gap(0.0, 1.0).rgb()),
            (1.0, interpolate_tax_gap(1.0, 1.0).rgb()),
        ],
    }
}

/// The legend state produced by a map mode coloring pass.
pub enum MapLegend {
    /// Color encodes identity
    Qualitative,

    /// Color encodes a numeric value
    Quantitative(GradientConfig),
}

pub fn tax_gap(min_value: f64, max_value: f64) -> GradientConfig {
    GradientConfig {
        kind: GradientKind::Diverging,
        scale: GradientScale::Linear,
        palette: GradientPalette::TaxGap,
        min_value,
        mid_value: 0.0,
        max_value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgb(color: GpuColor) -> (u8, u8, u8) {
        color.rgb()
    }

    #[test]
    fn eu5_gradient_hits_expected_stops() {
        let expected = [
            (0.0, (4, 1, 1)),
            (0.2, (87, 13, 13)),
            (0.4, (191, 151, 10)),
            (0.6, (35, 153, 15)),
            (0.8, (36, 255, 0)),
            (1.0, (0, 255, 240)),
        ];

        for (value, expected_rgb) in expected {
            assert_eq!(
                rgb(interpolate_eu5_gradient(value, 1.0, GradientScale::Linear)),
                expected_rgb
            );
        }
    }

    #[test]
    fn eu5_gradient_clamps_to_domain() {
        assert_eq!(
            rgb(interpolate_eu5_gradient(-1.0, 1.0, GradientScale::Linear)),
            rgb(interpolate_eu5_gradient(0.0, 1.0, GradientScale::Linear))
        );
        assert_eq!(
            rgb(interpolate_eu5_gradient(2.0, 1.0, GradientScale::Linear)),
            rgb(interpolate_eu5_gradient(1.0, 1.0, GradientScale::Linear))
        );
    }

    #[test]
    fn eu5_gradient_zero_domain_uses_minimum_stop() {
        assert_eq!(
            rgb(interpolate_eu5_gradient(10.0, 0.0, GradientScale::Linear)),
            (4, 1, 1)
        );
    }

    #[test]
    fn eu5_gradient_log_midpoint_matches_half_normalization() {
        let max = 99.0_f64;
        let midpoint = (0.5_f64 * max.ln_1p()).exp_m1();
        assert_eq!(
            rgb(interpolate_eu5_gradient(midpoint, max, GradientScale::Log)),
            rgb(interpolate_eu5_gradient(0.5, 1.0, GradientScale::Linear))
        );
    }

    #[test]
    fn sequential_linear_uses_arithmetic_midpoint() {
        let config = sequential(GradientScale::Linear, 0.0, 10.0);
        assert_eq!(config.kind, GradientKind::Sequential);
        assert_eq!(config.palette, GradientPalette::Eu5);
        assert_eq!(config.min_value, 0.0);
        assert_eq!(config.mid_value, 5.0);
        assert_eq!(config.max_value, 10.0);
    }

    #[test]
    fn sequential_log_midpoint_matches_half_normalization() {
        let max = 99_000.0;
        let config = sequential(GradientScale::Log, 0.0, max);
        let normalized = (config.mid_value / 1000.0).ln_1p() / (max / 1000.0).ln_1p();
        assert!((normalized - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn tax_gap_config_is_diverging_at_zero() {
        let config = tax_gap(-50.0, 50.0);
        assert_eq!(config.kind, GradientKind::Diverging);
        assert_eq!(config.palette, GradientPalette::TaxGap);
        assert_eq!(config.mid_value, 0.0);
    }
}
