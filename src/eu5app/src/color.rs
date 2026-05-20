use eu5save::models::Color;
use pdx_map::Rgb;
use serde::{Deserialize, Serialize, Serializer};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[cfg_attr(feature = "tsify", tsify(type = "string"))]
pub struct Srgb(pub [u8; 3]);

impl std::fmt::Display for Srgb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "#{:02x}{:02x}{:02x}", self.0[0], self.0[1], self.0[2])
    }
}

impl From<Srgb> for Rgb {
    fn from(color: Srgb) -> Rgb {
        Rgb::new(color.0[0], color.0[1], color.0[2])
    }
}

impl From<Color> for Srgb {
    fn from(color: Color) -> Srgb {
        Srgb(color.0)
    }
}

impl Serialize for Srgb {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // serde-wasm-bindgen is true, postcard is false
        if serializer.is_human_readable() {
            serializer.collect_str(self)
        } else {
            self.0.serialize(serializer)
        }
    }
}

pub(crate) struct UnitRgb {
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

/// HSV color: h in [0, 360), s and v in [0, 1].
pub(crate) struct Hsv {
    pub h: f32,
    pub s: f32,
    pub v: f32,
}

impl From<(u8, u8, u8)> for UnitRgb {
    fn from((r, g, b): (u8, u8, u8)) -> Self {
        UnitRgb {
            r: r as f32 / 255.0,
            g: g as f32 / 255.0,
            b: b as f32 / 255.0,
        }
    }
}

impl From<UnitRgb> for (u8, u8, u8) {
    fn from(rgb: UnitRgb) -> Self {
        (
            (rgb.r * 255.0).round() as u8,
            (rgb.g * 255.0).round() as u8,
            (rgb.b * 255.0).round() as u8,
        )
    }
}

impl From<UnitRgb> for Hsv {
    fn from(rgb: UnitRgb) -> Self {
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
            60.0 * (((rgb.r - rgb.g) / delta) + 4.0)
        };

        let h = (h + 360.0) % 360.0;
        let s = if c_max == 0.0 { 0.0 } else { delta / c_max };

        Hsv { h, s, v: c_max }
    }
}

impl From<Hsv> for UnitRgb {
    fn from(hsv: Hsv) -> Self {
        let c = hsv.v * hsv.s;
        let x = c * (1.0 - ((hsv.h / 60.0) % 2.0 - 1.0).abs());
        let m = hsv.v - c;

        let (r, g, b) = if hsv.h < 60.0 {
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

        UnitRgb {
            r: r + m,
            g: g + m,
            b: b + m,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn srgb_serializes_human_readable_as_css_hex() {
        let color = Srgb([0x14, 0x96, 0x2d]);
        let json = serde_json::to_string(&color).unwrap();
        assert_eq!(json, "\"#14962d\"");
    }

    #[test]
    fn srgb_serializes_binary_as_three_bytes() {
        let color = Srgb([0x14, 0x96, 0x2d]);
        let bytes = postcard::to_allocvec(&color).unwrap();
        assert_eq!(bytes, [0x14, 0x96, 0x2d]);
        assert_eq!(postcard::from_bytes::<Srgb>(&bytes).unwrap(), color);
    }
}
