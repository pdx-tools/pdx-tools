pub(crate) struct Rgb {
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

impl From<(u8, u8, u8)> for Rgb {
    fn from((r, g, b): (u8, u8, u8)) -> Self {
        Rgb {
            r: r as f32 / 255.0,
            g: g as f32 / 255.0,
            b: b as f32 / 255.0,
        }
    }
}

impl From<Rgb> for (u8, u8, u8) {
    fn from(rgb: Rgb) -> Self {
        (
            (rgb.r * 255.0).round() as u8,
            (rgb.g * 255.0).round() as u8,
            (rgb.b * 255.0).round() as u8,
        )
    }
}

impl From<Rgb> for Hsv {
    fn from(rgb: Rgb) -> Self {
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

impl From<Hsv> for Rgb {
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

        Rgb {
            r: r + m,
            g: g + m,
            b: b + m,
        }
    }
}
