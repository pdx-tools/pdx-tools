use pdx_map::GpuColor;
use serde::{Deserialize, Serialize};

use crate::color::{Hsv, UnitRgb};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum GradientScale {
    Linear,
    Log,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub enum GradientPalette {
    Eu5,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct GradientConfig {
    pub scale: GradientScale,
    pub palette: GradientPalette,
    pub min_value: f64,
    pub mid_value: f64,
    pub max_value: f64,
    /// The land above the top of the scale. The top color also shows this land.
    pub clip: Option<GradientClip>,
}

/// The land that a scale does not reach, because its top is a percentile.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct GradientClip {
    /// The share of the land above the top, from 0 to 1.
    pub share: f64,
    /// The highest value of the land.
    pub highest: f64,
}

/// The color at a place on the EU5 6-stop HSV gradient, from 0 to 1.
///
/// Stops from EU5 game\loading_screen\common\defines\graphic\00_graphics.txt
/// HSV: h in degrees (0–360), s and v in 0–1; evenly spaced at positions 0.0, 0.2, 0.4, 0.6, 0.8, 1.0.
fn eu5_gradient_at(position: f64) -> GpuColor {
    const STOPS: [(f32, f32, f32); 6] = [
        (0.0, 0.85, 0.015),  // MAP_COLOR_MIN - near black
        (0.0, 0.85, 0.34),   // MAP_COLOR_LOW - dark red
        (46.8, 0.95, 0.75),  // MAP_COLOR_MID - golden yellow
        (111.6, 0.90, 0.60), // MAP_COLOR_HIGH - muted green
        (111.6, 1.00, 1.00), // MAP_COLOR_MAX - bright green
        (176.4, 1.00, 1.00), // MAP_COLOR_TOP - cyan
    ];

    let normalized = position.clamp(0.0, 1.0) as f32;
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

    let rgb: UnitRgb = Hsv { h, s, v }.into();
    let (r, g, b) = rgb.into();
    GpuColor::from_rgb(r, g, b)
}

/// How a map puts a value on the gradient, from zero at the bottom to `max`
/// at the top.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Ramp {
    Linear {
        max: f64,
    },
    /// Values far above `softening` are spaced by their ratios, and values
    /// far below it are spaced evenly and near the bottom.
    Log {
        max: f64,
        softening: f64,
    },
}

impl Ramp {
    fn max(&self) -> f64 {
        match *self {
            Ramp::Linear { max } | Ramp::Log { max, .. } => max,
        }
    }

    /// The place of `value` on the gradient, from 0 to 1.
    fn position(&self, value: f64) -> f64 {
        // With no top, all land above zero is above the top.
        if self.max() <= 0.0 {
            return if value > 0.0 { 1.0 } else { 0.0 };
        }
        let at = match *self {
            Ramp::Linear { max } => value / max,
            Ramp::Log { max, softening } => {
                (value.max(0.0) / softening).ln_1p() / (max / softening).ln_1p()
            }
        };
        if at.is_finite() {
            at.clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    /// The value at `position` on the gradient.
    fn value_at(&self, position: f64) -> f64 {
        match *self {
            Ramp::Linear { max } => max * position,
            Ramp::Log { max, softening } => {
                ((max / softening).ln_1p() * position).exp_m1() * softening
            }
        }
    }

    pub fn color(&self, value: f64) -> GpuColor {
        eu5_gradient_at(self.position(value))
    }

    /// The legend of this ramp. Its middle value is at the middle of the
    /// gradient.
    pub fn legend(&self, clip: Option<GradientClip>) -> GradientConfig {
        GradientConfig {
            scale: match self {
                Ramp::Linear { .. } => GradientScale::Linear,
                Ramp::Log { .. } => GradientScale::Log,
            },
            palette: GradientPalette::Eu5,
            min_value: 0.0,
            mid_value: self.value_at(0.5),
            max_value: self.max(),
            clip,
        }
    }
}

/// Sample a palette as `(offset, rgb)` pairs suitable for rendering as a CSS
/// gradient. The EU5 palette is sampled densely so that sRGB interpolation
/// between adjacent stops closely approximates the shader's HSV interpolation.
pub fn palette_stops(palette: GradientPalette) -> Vec<(f64, (u8, u8, u8))> {
    match palette {
        GradientPalette::Eu5 => {
            const SAMPLES: usize = 33;
            (0..SAMPLES)
                .map(|i| {
                    let offset = i as f64 / (SAMPLES - 1) as f64;
                    let color = eu5_gradient_at(offset).rgb();
                    (offset, color)
                })
                .collect()
        }
    }
}

/// The legend state produced by a map mode coloring pass.
#[derive(Clone, Copy, Debug)]
pub enum MapLegend {
    /// Color encodes identity
    Qualitative,

    /// Color encodes a numeric value
    Quantitative(GradientConfig),
}

#[cfg(test)]
mod tests {
    use super::*;

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
            assert_eq!(eu5_gradient_at(value).rgb(), expected_rgb);
        }
    }

    #[test]
    fn ramps_clamp_to_their_domain() {
        let linear = Ramp::Linear { max: 1.0 };
        assert_eq!(linear.color(-1.0), linear.color(0.0));
        assert_eq!(linear.color(2.0), linear.color(1.0));
        let log = Ramp::Log {
            max: 100.0,
            softening: 5.0,
        };
        assert_eq!(log.position(-3.0), 0.0);
        assert_eq!(log.position(250.0), 1.0);
    }

    #[test]
    fn a_ramp_without_a_top_puts_land_above_zero_at_the_top() {
        let linear = Ramp::Linear { max: 0.0 };
        assert_eq!(linear.color(0.0).rgb(), (4, 1, 1));
        assert_eq!(linear.color(10.0).rgb(), (0, 255, 240));
        let log = Ramp::Log {
            max: 0.0,
            softening: 1.0,
        };
        assert_eq!(log.color(0.0).rgb(), (4, 1, 1));
        assert_eq!(log.color(10.0).rgb(), (0, 255, 240));
    }

    #[test]
    fn legend_middle_is_the_middle_of_the_gradient() {
        let linear = Ramp::Linear { max: 10.0 }.legend(None);
        assert_eq!(linear.palette, GradientPalette::Eu5);
        assert_eq!(linear.min_value, 0.0);
        assert_eq!(linear.mid_value, 5.0);
        assert_eq!(linear.max_value, 10.0);

        let log = Ramp::Log {
            max: 99_000.0,
            softening: 250.0,
        };
        let legend = log.legend(None);
        assert_eq!(legend.scale, GradientScale::Log);
        assert!((log.position(legend.mid_value) - 0.5).abs() < 1e-12);
    }
}
