//! Color model for coat of arms compositing.
//!
//! Colors are resolved to sRGB and composited using the same straight-alpha
//! "over" math as the game (ported from pdx_unlimiter's `CoatOfArmsRenderer`).

use std::collections::HashMap;

/// A floating point sRGB color with straight (non-premultiplied) alpha, all
/// channels in `[0, 1]`. Mirrors JavaFX `Color` semantics used by pdx_unlimiter.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

impl FColor {
    pub fn opaque(rgb: [u8; 3]) -> Self {
        FColor {
            r: rgb[0] as f64 / 255.0,
            g: rgb[1] as f64 / 255.0,
            b: rgb[2] as f64 / 255.0,
            a: 1.0,
        }
    }

    pub fn rgba(r: f64, g: f64, b: f64, a: f64) -> Self {
        FColor { r, g, b, a }
    }

    /// Returns this color with a replaced alpha (game `withAlpha`).
    pub fn with_alpha(self, a: f64) -> Self {
        FColor { a, ..self }
    }

    /// Alpha-composites `top` over `self` (`self` is the bottom layer), matching
    /// pdx_unlimiter's `overlayColors`.
    pub fn over(self, top: FColor) -> FColor {
        let alpha = top.a + self.a * (1.0 - top.a);
        if alpha == 0.0 {
            return FColor::rgba(0.0, 0.0, 0.0, 0.0);
        }
        let blend = |t: f64, b: f64| (t * top.a + b * self.a * (1.0 - top.a)) / alpha;
        FColor {
            r: blend(top.r, self.r),
            g: blend(top.g, self.g),
            b: blend(top.b, self.b),
            a: alpha,
        }
    }

    /// Truncating conversion to 8-bit sRGB, matching the game's `intFromColor`
    /// (`(int)(channel * 0xFF)`).
    pub fn to_rgb8(self) -> [u8; 3] {
        let c = |v: f64| (v.clamp(0.0, 1.0) * 255.0) as u8;
        [c(self.r), c(self.g), c(self.b)]
    }

    /// Like [`Self::to_rgb8`] but carries the alpha channel through as well.
    pub fn to_rgba8(self) -> [u8; 4] {
        let rgb = self.to_rgb8();
        [
            rgb[0],
            rgb[1],
            rgb[2],
            (self.a.clamp(0.0, 1.0) * 255.0).round() as u8,
        ]
    }
}

/// Convert an HSV color to sRGB. `h` in `[0, 360)`, `s`/`v` in `[0, 1]`.
/// Matches the standard formula used across the codebase (`eu5app::color`).
pub fn hsv_to_rgb(h: f32, s: f32, v: f32) -> [u8; 3] {
    let s = s.clamp(0.0, 1.0);
    let v = v.clamp(0.0, 1.0);
    let c = v * s;
    let h = h.rem_euclid(360.0);
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = v - c;
    let (r, g, b) = if h < 60.0 {
        (c, x, 0.0)
    } else if h < 120.0 {
        (x, c, 0.0)
    } else if h < 180.0 {
        (0.0, c, x)
    } else if h < 240.0 {
        (0.0, x, c)
    } else if h < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    [
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    ]
}

/// Parse an inline Paradox color tag body, e.g. `rgb { 1 0 1 }` or
/// `hsv360 { 42 85 72 }`, returning sRGB. `tag` is the keyword and `body` the
/// whitespace-separated values inside the braces.
pub fn parse_tagged_color(tag: &str, body: &str) -> Option<[u8; 3]> {
    let nums: Vec<f32> = body
        .split_whitespace()
        .filter_map(|s| s.parse::<f32>().ok())
        .collect();
    let (a, b, c) = (
        nums.first().copied().unwrap_or(0.0),
        nums.get(1).copied().unwrap_or(0.0),
        nums.get(2).copied().unwrap_or(0.0),
    );
    match tag {
        "rgb" => {
            // Values <= 1 across the board are treated as unit floats.
            let unit = nums.iter().all(|&v| v <= 1.0);
            let d = if unit { 255.0 } else { 1.0 };
            Some([
                (a * d).clamp(0.0, 255.0).round() as u8,
                (b * d).clamp(0.0, 255.0).round() as u8,
                (c * d).clamp(0.0, 255.0).round() as u8,
            ])
        }
        "hsv" => Some(hsv_to_rgb(a * 360.0, b, c)),
        "hsv360" => Some(hsv_to_rgb(a, b / 100.0, c / 100.0)),
        "hex" => hex_to_rgb(body.trim()),
        _ => None,
    }
}

/// Decode a `#rrggbb` (or bare `rrggbb`) hex string to sRGB.
fn hex_to_rgb(value: &str) -> Option<[u8; 3]> {
    let hex = value.trim_start_matches('#');
    let n = u32::from_str_radix(hex, 16).ok()?;
    Some([
        ((n >> 16) & 0xFF) as u8,
        ((n >> 8) & 0xFF) as u8,
        (n & 0xFF) as u8,
    ])
}

/// Map of named colors (e.g. `red`) to sRGB, loaded from a game's
/// `named_colors` file.
pub type NamedColors = HashMap<String, [u8; 3]>;

/// The five color slots (`color1`..`color5`) that a sub/emblem can reference.
pub const COLOR_SLOTS: [&str; 5] = ["color1", "color2", "color3", "color4", "color5"];

/// Resolve a color slot string to sRGB.
///
/// The value is either a `#rrggbb` literal (inline colors are pre-resolved to
/// hex during preprocessing) or a named color. Color *references* (`color1`..)
/// are resolved earlier during model parsing and never reach here. Returns
/// `None` for unknown names so the caller can substitute the missing color.
pub fn resolve_named(value: &str, named: &NamedColors) -> Option<[u8; 3]> {
    if value.starts_with('#') {
        return hex_to_rgb(value);
    }
    named.get(value).copied()
}

/// Resolve a color slot value (a named color or `#rrggbb` literal) to an opaque
/// [`FColor`], substituting `missing` for unknown names.
pub fn resolve_color(value: &str, named: &NamedColors, missing: FColor) -> FColor {
    resolve_named(value, named)
        .map(FColor::opaque)
        .unwrap_or(missing)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_color_tags() {
        assert_eq!(parse_tagged_color("rgb", "1 0.5 0"), Some([255, 128, 0]));
        assert_eq!(parse_tagged_color("rgb", "12 34 56"), Some([12, 34, 56]));
        assert_eq!(parse_tagged_color("hex", "#0c2238"), Some([12, 34, 56]));
        assert_eq!(
            parse_tagged_color("hsv360", "120 100 50"),
            Some([0, 128, 0])
        );
    }

    #[test]
    fn resolves_hex_and_named_colors() {
        let mut named = NamedColors::default();
        named.insert("cloth_red".to_string(), [180, 20, 30]);

        assert_eq!(resolve_named("#abcdef", &named), Some([171, 205, 239]));
        assert_eq!(resolve_named("cloth_red", &named), Some([180, 20, 30]));
        assert_eq!(resolve_named("missing", &named), None);
    }

    #[test]
    fn alpha_composition_matches_straight_over() {
        let bottom = FColor::rgba(0.0, 0.0, 1.0, 1.0);
        let top = FColor::rgba(1.0, 0.0, 0.0, 0.5);

        assert_eq!(bottom.over(top).to_rgba8(), [127, 0, 127, 255]);
    }
}
