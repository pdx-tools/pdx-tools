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
    /// The land below the bottom of the scale. The bottom color also shows
    /// this land.
    pub clip_below: Option<GradientClip>,
    /// The land above the top of the scale. The top color also shows this land.
    pub clip_above: Option<GradientClip>,
}

/// The land that a scale does not reach at one end, because the end is a
/// percentile.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct GradientClip {
    /// The share of the land past the end, from 0 to 1.
    pub share: f64,
    /// The value of that land that is farthest from the scale.
    pub extreme: f64,
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

/// How a map puts a value on the gradient, from `min` at the bottom to `max`
/// at the top.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Ramp {
    Linear {
        min: f64,
        max: f64,
    },
    /// Values far more than `softening` above `min` are spaced by their
    /// ratios, and values nearer than that are spaced evenly and near the
    /// bottom.
    Log {
        min: f64,
        max: f64,
        softening: f64,
    },
}

impl Ramp {
    fn min(&self) -> f64 {
        match *self {
            Ramp::Linear { min, .. } | Ramp::Log { min, .. } => min,
        }
    }

    fn max(&self) -> f64 {
        match *self {
            Ramp::Linear { max, .. } | Ramp::Log { max, .. } => max,
        }
    }

    /// The place of `value` on the gradient, from 0 to 1.
    fn position(&self, value: f64) -> f64 {
        let span = self.max() - self.min();
        // With no room between the ends, all land above them is at the top.
        if span <= 0.0 {
            return if value > self.max() { 1.0 } else { 0.0 };
        }
        let above = (value - self.min()).max(0.0);
        let at = match *self {
            Ramp::Linear { .. } => above / span,
            Ramp::Log { softening, .. } => (above / softening).ln_1p() / (span / softening).ln_1p(),
        };
        if at.is_finite() {
            at.clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    /// The value at the middle of the gradient.
    ///
    /// The log middle uses a square root, which gives the same answer on
    /// every platform. Logarithms and exponentials do not.
    fn middle(&self) -> f64 {
        let span = self.max() - self.min();
        match *self {
            Ramp::Linear { min, .. } => min + span / 2.0,
            Ramp::Log { min, softening, .. } => {
                min + span / ((1.0 + span / softening).sqrt() + 1.0)
            }
        }
    }

    pub fn color(&self, value: f64) -> GpuColor {
        eu5_gradient_at(self.position(value))
    }

    /// The legend of this ramp. Its middle value is at the middle of the
    /// gradient.
    pub fn legend(
        &self,
        clip_below: Option<GradientClip>,
        clip_above: Option<GradientClip>,
    ) -> GradientConfig {
        GradientConfig {
            scale: match self {
                Ramp::Linear { .. } => GradientScale::Linear,
                Ramp::Log { .. } => GradientScale::Log,
            },
            palette: GradientPalette::Eu5,
            min_value: self.min(),
            mid_value: self.middle(),
            max_value: self.max(),
            clip_below,
            clip_above,
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
        let linear = Ramp::Linear { min: 0.0, max: 1.0 };
        assert_eq!(linear.color(-1.0), linear.color(0.0));
        assert_eq!(linear.color(2.0), linear.color(1.0));
        let log = Ramp::Log {
            min: 1.0,
            max: 100.0,
            softening: 5.0,
        };
        assert_eq!(log.position(-3.0), 0.0);
        assert_eq!(log.position(1.0), 0.0);
        assert!(log.position(2.0) > 0.0);
        assert_eq!(log.position(250.0), 1.0);
    }

    #[test]
    fn a_ramp_without_room_puts_land_above_it_at_the_top() {
        let linear = Ramp::Linear { min: 0.0, max: 0.0 };
        assert_eq!(linear.color(0.0).rgb(), (4, 1, 1));
        assert_eq!(linear.color(10.0).rgb(), (0, 255, 240));
        let log = Ramp::Log {
            min: 0.0,
            max: 0.0,
            softening: 1.0,
        };
        assert_eq!(log.color(0.0).rgb(), (4, 1, 1));
        assert_eq!(log.color(10.0).rgb(), (0, 255, 240));
    }

    #[test]
    fn legend_middle_is_the_middle_of_the_gradient() {
        let linear = Ramp::Linear {
            min: 2.0,
            max: 10.0,
        }
        .legend(None, None);
        assert_eq!(linear.palette, GradientPalette::Eu5);
        assert_eq!(linear.min_value, 2.0);
        assert_eq!(linear.mid_value, 6.0);
        assert_eq!(linear.max_value, 10.0);

        for min in [0.0, 300.0] {
            let log = Ramp::Log {
                min,
                max: 99_000.0,
                softening: 250.0,
            };
            let legend = log.legend(None, None);
            assert_eq!(legend.scale, GradientScale::Log);
            assert_eq!(legend.min_value, min);
            assert!((log.position(legend.mid_value) - 0.5).abs() < 1e-12);
        }
    }
}
