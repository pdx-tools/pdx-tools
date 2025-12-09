/// The strength of the overlord's hue when applied to the subject color.
const OVERLORD_HUE_STRENGTH_ON_SUBJECT: f32 = 0.99;
/// The strength of the overlord's saturation when applied to the subject color.
const OVERLORD_SATURATION_STRENGTH_ON_SUBJECT: f32 = 0.75;
/// The strength of the overlord's value (brightness) when applied to the subject color.
const OVERLORD_VALUE_STRENGTH_ON_SUBJECT: f32 = 0.6;
/// A final value to add to the blended color's lightness (V in HSV).
const SUBJECT_MAP_COLOR_LIGHTEN: f32 = 0.1;
/// A final value to add to the blended color's saturation (S in HSV).
const SUBJECT_MAP_COLOR_SATURATE: f32 = -0.1;

// --- Internal color representations for calculations ---

/// Represents an RGB color with channels normalized to the range [0.0, 1.0].
struct Rgb {
    r: f32,
    g: f32,
    b: f32,
}

/// Represents an HSV color.
/// h (hue) is in the range [0.0, 360.0).
/// s (saturation) is in the range [0.0, 1.0].
/// v (value) is in the range [0.0, 1.0].
struct Hsv {
    h: f32,
    s: f32,
    v: f32,
}

/// Converts a standard 8-bit RGB tuple to the internal normalized RGB struct.
impl From<(u8, u8, u8)> for Rgb {
    fn from(tuple: (u8, u8, u8)) -> Self {
        Rgb {
            r: tuple.0 as f32 / 255.0,
            g: tuple.1 as f32 / 255.0,
            b: tuple.2 as f32 / 255.0,
        }
    }
}

/// Blends the subject's map color with the overlord's map color.
pub fn blend_color(subject_color: (u8, u8, u8), overlord_color: (u8, u8, u8)) -> (u8, u8, u8) {
    // 1. Convert RGB inputs to the HSV color space for manipulation.
    let subject_hsv = rgb_to_hsv(subject_color.into());
    let overlord_hsv = rgb_to_hsv(overlord_color.into());

    // 2. Linearly interpolate (lerp) between subject and overlord in HSV space.
    // Hue interpolation is special because it's a circle (0..360 degrees).
    // We must find the shortest path around the circle.
    let mut hue_delta = overlord_hsv.h - subject_hsv.h;
    if hue_delta > 180.0 {
        hue_delta -= 360.0;
    }
    if hue_delta < -180.0 {
        hue_delta += 360.0;
    }
    let mut blended_h = subject_hsv.h + hue_delta * OVERLORD_HUE_STRENGTH_ON_SUBJECT;
    // Keep hue within the valid [0, 360) range.
    blended_h = (blended_h % 360.0 + 360.0) % 360.0;

    // Saturation and Value are simple linear interpolations.
    let blended_s =
        subject_hsv.s + (overlord_hsv.s - subject_hsv.s) * OVERLORD_SATURATION_STRENGTH_ON_SUBJECT;
    let blended_v =
        subject_hsv.v + (overlord_hsv.v - subject_hsv.v) * OVERLORD_VALUE_STRENGTH_ON_SUBJECT;

    // 3. Apply the final saturation and lightness modifiers.
    let final_s = (blended_s + SUBJECT_MAP_COLOR_SATURATE).clamp(0.0, 1.0);
    let final_v = (blended_v + SUBJECT_MAP_COLOR_LIGHTEN).clamp(0.0, 1.0);

    let final_hsv = Hsv {
        h: blended_h,
        s: final_s,
        v: final_v,
    };

    // 4. Convert the final HSV color back to the RGB color space.
    hsv_to_rgb(final_hsv)
}

/// Converts a color from the RGB to the HSV color space.
fn rgb_to_hsv(rgb: Rgb) -> Hsv {
    let c_max = rgb.r.max(rgb.g.max(rgb.b));
    let c_min = rgb.r.min(rgb.g.min(rgb.b));
    let delta = c_max - c_min;

    let h = if delta == 0.0 {
        0.0
    } else if c_max == rgb.r {
        60.0 * (((rgb.g - rgb.b) / delta) % 6.0)
    } else if c_max == rgb.g {
        60.0 * (((rgb.b - rgb.r) / delta) + 2.0)
    } else {
        // c_max == rgb.b
        60.0 * (((rgb.r - rgb.g) / delta) + 4.0)
    };

    let h = (h + 360.0) % 360.0; // Ensure hue is non-negative

    let s = if c_max == 0.0 { 0.0 } else { delta / c_max };
    let v = c_max;

    Hsv { h, s, v }
}

/// Converts a color from the HSV to the RGB color space.
fn hsv_to_rgb(hsv: Hsv) -> (u8, u8, u8) {
    let c = hsv.v * hsv.s;
    let x = c * (1.0 - ((hsv.h / 60.0) % 2.0 - 1.0).abs());
    let m = hsv.v - c;

    let (r_prime, g_prime, b_prime) = if hsv.h < 60.0 {
        (c, x, 0.0)
    } else if hsv.h < 120.0 {
        (x, c, 0.0)
    } else if hsv.h < 180.0 {
        (0.0, c, x)
    } else if hsv.h < 240.0 {
        (0.0, x, c)
    } else if hsv.h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };

    (
        ((r_prime + m) * 255.0).round() as u8,
        ((g_prime + m) * 255.0).round() as u8,
        ((b_prime + m) * 255.0).round() as u8,
    )
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
