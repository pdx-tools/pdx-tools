/// Convert a color with hue, saturation, and value in the range of 0 to 1 to
/// RGB.
pub fn hsv_to_rgb(h: f64, s: f64, v: f64) -> [u8; 3] {
    let h = (h.rem_euclid(1.0)) * 6.0;
    let s = s.clamp(0.0, 1.0);
    let v = v.clamp(0.0, 1.0);
    let c = v * s;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let m = v - c;
    let (r, g, b) = match h as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    let to_u8 = |x: f64| ((x + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    [to_u8(r), to_u8(g), to_u8(b)]
}

/// A stable color for a country tag that has no color in the game files (eg:
/// a tag from a mod).
pub fn fallback_color(key: &str) -> [u8; 3] {
    let hash = key.bytes().fold(0x811c_9dc5u32, |acc, x| {
        (acc ^ u32::from(x)).wrapping_mul(0x0100_0193)
    });
    let hue = f64::from(hash % 360) / 360.0;
    hsv_to_rgb(hue, 0.45, 0.65)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hsv_to_rgb() {
        assert_eq!(hsv_to_rgb(0.0, 0.0, 0.0), [0, 0, 0]);
        assert_eq!(hsv_to_rgb(0.0, 1.0, 1.0), [255, 0, 0]);
        assert_eq!(hsv_to_rgb(1.0 / 3.0, 1.0, 1.0), [0, 255, 0]);
        assert_eq!(hsv_to_rgb(2.0 / 3.0, 1.0, 1.0), [0, 0, 255]);
        assert_eq!(hsv_to_rgb(0.1, 0.15, 0.4), [102, 96, 87]);
    }

    #[test]
    fn test_fallback_color_is_stable() {
        assert_eq!(fallback_color("D01"), fallback_color("D01"));
        assert_ne!(fallback_color("D01"), fallback_color("D02"));
    }
}
