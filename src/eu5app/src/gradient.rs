use pdx_map::GpuColor;

use crate::color::{Hsv, Rgb};

pub(crate) enum GradientScale {
    Linear,
    Log,
}

/// Interpolates the EU5 6-stop HSV gradient.
///
/// Stops from EU5 game\loading_screen\common\defines\graphic\00_graphics.txt
/// HSV: h in degrees (0–360), s and v in 0–1; evenly spaced at positions 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
pub(crate) fn interpolate_eu5_gradient(
    value: f64,
    max_value: f64,
    scale: GradientScale,
) -> GpuColor {
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

pub(crate) fn interpolate_tax_gap(value: f64, max_abs_value: f64) -> GpuColor {
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
