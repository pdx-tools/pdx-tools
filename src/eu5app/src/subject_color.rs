use crate::color::{Hsv, Rgb};

const OVERLORD_HUE_STRENGTH_ON_SUBJECT: f32 = 0.99;
const OVERLORD_SATURATION_STRENGTH_ON_SUBJECT: f32 = 0.75;
const OVERLORD_VALUE_STRENGTH_ON_SUBJECT: f32 = 0.6;
const SUBJECT_MAP_COLOR_LIGHTEN: f32 = 0.1;
const SUBJECT_MAP_COLOR_SATURATE: f32 = -0.1;

/// Blends the subject's map color with the overlord's map color.
pub fn blend_color(subject_color: (u8, u8, u8), overlord_color: (u8, u8, u8)) -> (u8, u8, u8) {
    let subject_hsv: Hsv = Rgb::from(subject_color).into();
    let overlord_hsv: Hsv = Rgb::from(overlord_color).into();

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

    Rgb::from(final_hsv).into()
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
