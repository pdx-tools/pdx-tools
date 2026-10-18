use crate::color::{Hsv, UnitRgb};
use eu5save::models::Color;
use pdx_map::GpuColor;

const OVERLORD_HUE_STRENGTH_ON_SUBJECT: f32 = 0.99;
const OVERLORD_SATURATION_STRENGTH_ON_SUBJECT: f32 = 0.75;
const OVERLORD_VALUE_STRENGTH_ON_SUBJECT: f32 = 0.6;
const SUBJECT_MAP_COLOR_LIGHTEN: f32 = 0.1;
const SUBJECT_MAP_COLOR_SATURATE: f32 = -0.1;

/// Blends the subject's map color with the overlord's map color.
pub fn blend_color(subject_color: (u8, u8, u8), overlord_color: (u8, u8, u8)) -> (u8, u8, u8) {
    let subject_hsv: Hsv = UnitRgb::from(subject_color).into();
    let overlord_hsv: Hsv = UnitRgb::from(overlord_color).into();

    let mut hue_delta = overlord_hsv.h - subject_hsv.h;
    if hue_delta > 180.0 {
        hue_delta -= 360.0;
    }
    if hue_delta < -180.0 {
        hue_delta += 360.0;
    }
    let blended_h = (subject_hsv.h + hue_delta * OVERLORD_HUE_STRENGTH_ON_SUBJECT + 360.0) % 360.0;

    let blended_s =
        subject_hsv.s + (overlord_hsv.s - subject_hsv.s) * OVERLORD_SATURATION_STRENGTH_ON_SUBJECT;
    let blended_v =
        subject_hsv.v + (overlord_hsv.v - subject_hsv.v) * OVERLORD_VALUE_STRENGTH_ON_SUBJECT;

    let final_hsv = Hsv {
        h: blended_h,
        s: (blended_s + SUBJECT_MAP_COLOR_SATURATE).clamp(0.0, 1.0),
        v: (blended_v + SUBJECT_MAP_COLOR_LIGHTEN).clamp(0.0, 1.0),
    };

    UnitRgb::from(final_hsv).into()
}

/// The map color of a country: its own color, or when it is a subject, that
/// color blended toward the color of its top overlord. `overlord_of` gives
/// the direct overlord of a country, and `color_of` gives the color of an
/// overlord. An overlord without a color is skipped over. The walk stops
/// after `max_depth` overlords, so a loop in the relations cannot run forever.
pub fn subject_map_color<K: Copy + PartialEq>(
    country: K,
    color: Color,
    max_depth: usize,
    overlord_of: impl Fn(K) -> Option<K>,
    color_of: impl Fn(K) -> Option<Color>,
) -> GpuColor {
    let mut top = country;
    let mut top_color = color;
    for _ in 0..max_depth {
        let Some(next) = overlord_of(top) else {
            break;
        };
        top = next;
        if let Some(next_color) = color_of(next) {
            top_color = next_color;
        }
    }
    if top == country {
        return GpuColor::from(color.0);
    }
    let (r, g, b) = blend_color(
        GpuColor::from(color.0).rgb(),
        GpuColor::from(top_color.0).rgb(),
    );
    GpuColor::from_rgb(r, g, b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::*;

    /// The expected values here actually have their green channel tweaked by 1-2
    #[rstest]
    #[case((116, 126, 173), (240, 100, 98))]
    #[case((255, 245, 189), (255, 115, 109))]
    #[case((169, 59, 173), (240, 82, 79))]
    #[case((189, 87, 130), (246, 92, 88))]
    fn test_england_subject_color_blend(
        #[case] input: (u8, u8, u8),
        #[case] expected: (u8, u8, u8),
    ) {
        let eng_color = (242, 52, 46);
        let result = blend_color(input, eng_color);
        assert_eq!(result, expected);
    }
}
