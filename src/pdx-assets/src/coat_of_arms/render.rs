//! Composite a resolved [`CoatOfArms`] into an RGBA raster.
//!
//! Ported from pdx_unlimiter's `CoatOfArmsRenderer`: pattern channel recolor,
//! colored/textured emblems, per-instance affine placement, and channel-culling
//! masks.

use std::sync::Arc;

use image::{Rgba, RgbaImage};

use super::color::FColor;
use super::model::{CoatOfArms, Emblem, Instance, Sub};

/// Per-game configuration for the shared compositor.
#[derive(Debug, Clone)]
pub struct GameCoaConfig {
    /// Output canvas width in pixels.
    pub width: u32,
    /// Output canvas height in pixels.
    pub height: u32,
    /// Color substituted for missing/unknown colors (e.g. magenta for EU5).
    pub missing_color: FColor,
}

/// Provides decoded RGBA textures (patterns and emblems) by filename.
pub trait TextureSource: Sync {
    fn pattern(&self, file: &str) -> Option<Arc<RgbaImage>>;
    fn colored_emblem(&self, file: &str) -> Option<Arc<RgbaImage>>;
    fn textured_emblem(&self, file: &str) -> Option<Arc<RgbaImage>>;
}

/// Render a coat of arms (with colors already resolved) into an RGBA image.
pub fn render(coa: &CoatOfArms, textures: &dyn TextureSource, cfg: &GameCoaConfig) -> RgbaImage {
    let w = cfg.width;
    let h = cfg.height;
    let fill = cfg.missing_color.to_rgba8();
    let mut canvas = RgbaImage::from_pixel(w, h, Rgba(fill));

    for sub in &coa.subs {
        let raw_pattern = draw_pattern(&mut canvas, sub, textures, cfg);
        for emblem in &sub.emblems {
            draw_emblem(
                &mut canvas,
                raw_pattern.as_deref(),
                sub,
                emblem,
                textures,
                cfg,
            );
        }
    }

    canvas
}

/// Draw the sub's pattern, returning the raw (un-recolored) pattern for masks.
fn draw_pattern(
    canvas: &mut RgbaImage,
    sub: &Sub,
    textures: &dyn TextureSource,
    cfg: &GameCoaConfig,
) -> Option<Arc<RgbaImage>> {
    let pattern_file = sub.pattern.as_deref()?;
    let raw = textures.pattern(pattern_file)?;

    let c1 = sub.colors[0].unwrap_or(cfg.missing_color);
    let c2 = sub.colors[1].unwrap_or(cfg.missing_color);
    let c3 = sub.colors[2].unwrap_or(cfg.missing_color);

    // Recolor: overlay color1/2/3 weighted by the pattern's R/G/B channels.
    let mut recolored = (*raw).clone();
    for px in recolored.pixels_mut() {
        let [r, g, b, a] = px.0;
        let mut nc = c1.with_alpha(r as f64 / 255.0);
        nc = nc.over(c2.with_alpha(g as f64 / 255.0));
        nc = nc.over(c3.with_alpha(b as f64 / 255.0));
        let rgb = nc.to_rgb8();
        px.0 = [rgb[0], rgb[1], rgb[2], a];
    }

    let dst_x = sub.x * cfg.width as f64;
    let dst_y = sub.y * cfg.height as f64;
    let dst_w = sub.scale_x * cfg.width as f64;
    let dst_h = sub.scale_y * cfg.height as f64;
    blit_scaled(canvas, &recolored, dst_x, dst_y, dst_w, dst_h);

    Some(raw)
}

/// Scale `src` to `dst_w`x`dst_h` at `(dst_x, dst_y)` and composite over canvas.
fn blit_scaled(
    canvas: &mut RgbaImage,
    src: &RgbaImage,
    dst_x: f64,
    dst_y: f64,
    dst_w: f64,
    dst_h: f64,
) {
    if dst_w <= 0.0 || dst_h <= 0.0 {
        return;
    }
    let (cw, ch) = (canvas.width() as i64, canvas.height() as i64);
    let x0 = dst_x.floor() as i64;
    let y0 = dst_y.floor() as i64;
    let x1 = (dst_x + dst_w).ceil() as i64;
    let y1 = (dst_y + dst_h).ceil() as i64;

    for py in y0.max(0)..y1.min(ch) {
        for px in x0.max(0)..x1.min(cw) {
            let u = (px as f64 + 0.5 - dst_x) / dst_w;
            let v = (py as f64 + 0.5 - dst_y) / dst_h;
            if !(0.0..1.0).contains(&u) || !(0.0..1.0).contains(&v) {
                continue;
            }
            let sample = sample_bilinear(
                src,
                u * src.width() as f64 - 0.5,
                v * src.height() as f64 - 0.5,
            );
            composite_pixel(canvas, px as u32, py as u32, sample);
        }
    }
}

fn draw_emblem(
    canvas: &mut RgbaImage,
    raw_pattern: Option<&RgbaImage>,
    sub: &Sub,
    emblem: &Emblem,
    textures: &dyn TextureSource,
    cfg: &GameCoaConfig,
) {
    let Some(file) = emblem.file.as_deref() else {
        return;
    };

    // Colored emblems are recolored into an owned buffer; textured emblems are
    // used straight from the (shared) cache without copying.
    let colored;
    let textured;
    let emblem_img: &RgbaImage = match &emblem.colors {
        Some(colors) => {
            let Some(src) = textures.colored_emblem(file) else {
                return;
            };
            let e1 = colors[0].unwrap_or(cfg.missing_color);
            let e2 = colors[1].unwrap_or(cfg.missing_color);
            let e3 = colors[2].unwrap_or(cfg.missing_color);
            let mut img = (*src).clone();
            for px in img.pixels_mut() {
                let [r, g, b, a] = px.0;
                let mut nc = e1.with_alpha(1.0);
                // Paradox colored-emblem masks intentionally map green to
                // color2 and red to color3 (unlike pattern RGB slots). This
                // matches pdx_unlimiter's CoatOfArmsRenderer.
                nc = nc.over(e2.with_alpha(g as f64 / 255.0));
                nc = nc.over(e3.with_alpha(r as f64 / 255.0));
                let dark = 255 - (b as i32 * 2).min(255);
                nc = nc.over(FColor::rgba(0.0, 0.0, 0.0, dark as f64 / 255.0));
                let light = ((b as i32 - 127) * 2).clamp(0, 255);
                nc = nc.over(FColor::rgba(1.0, 1.0, 1.0, light as f64 / 255.0));
                let rgb = nc.to_rgb8();
                px.0 = [rgb[0], rgb[1], rgb[2], a];
            }
            colored = img;
            &colored
        }
        None => {
            let Some(img) = textures.textured_emblem(file) else {
                return;
            };
            textured = img;
            &textured
        }
    };

    let has_mask = emblem.mask.iter().any(|&i| i != 0);
    let clip = sub_clip(sub, cfg);

    // With a mask, accumulate all instances into a scratch buffer, cull against
    // the raw pattern, then composite. Without, composite instances directly.
    if has_mask {
        let mut scratch = RgbaImage::new(cfg.width, cfg.height);
        for instance in sorted_instances(emblem) {
            draw_instance(&mut scratch, emblem_img, sub, instance, cfg, None);
        }
        if let Some(pattern) = raw_pattern {
            apply_culling_mask(&mut scratch, pattern, sub, &emblem.mask);
        }
        composite_buffer(canvas, &scratch, &clip);
    } else {
        for instance in sorted_instances(emblem) {
            draw_instance(canvas, emblem_img, sub, instance, cfg, Some(&clip));
        }
    }
}

fn sorted_instances(emblem: &Emblem) -> Vec<&Instance> {
    let mut instances: Vec<&Instance> = emblem.instances.iter().collect();
    instances.sort_by(|a, b| {
        a.depth
            .partial_cmp(&b.depth)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    instances
}

/// A clip rectangle in canvas pixel coordinates.
#[derive(Debug, Clone, Copy)]
struct Rect {
    x0: i64,
    y0: i64,
    x1: i64,
    y1: i64,
}

fn sub_clip(sub: &Sub, cfg: &GameCoaConfig) -> Rect {
    let x = (sub.x * cfg.width as f64).floor() as i64;
    let y = (sub.y * cfg.height as f64).floor() as i64;
    let w = (sub.scale_x * cfg.width as f64).ceil() as i64;
    let h = (sub.scale_y * cfg.height as f64).ceil() as i64;
    Rect {
        x0: x.max(0),
        y0: y.max(0),
        x1: (x + w).min(cfg.width as i64),
        y1: (y + h).min(cfg.height as i64),
    }
}

/// Place one emblem instance via its affine transform.
fn draw_instance(
    target: &mut RgbaImage,
    src: &RgbaImage,
    sub: &Sub,
    instance: &Instance,
    cfg: &GameCoaConfig,
    clip: Option<&Rect>,
) {
    let (w, h) = (cfg.width as f64, cfg.height as f64);
    let (iw, ih) = (src.width() as f64, src.height() as f64);
    if iw == 0.0 || ih == 0.0 {
        return;
    }

    let scale_x = (w / iw) * instance.scale_x * sub.scale_x;
    let scale_y = (h / ih) * instance.scale_y * sub.scale_y;
    let tx = w * (sub.x + sub.scale_x * instance.x);
    let ty = h * (sub.y + sub.scale_y * instance.y);

    // Compose source->dest transform in the same order as pdxu (each op is
    // right-multiplied, i.e. applied to the point first-to-last bottom-up).
    let mut m = Mat::translate(tx, ty);
    m = m.mul(&Mat::scale(iw / ih, 1.0));
    m = m.mul(&Mat::scale(scale_x.abs(), scale_y.abs()));
    if instance.rotation != 0.0 {
        m = m.mul(&Mat::rotate(instance.rotation.to_radians()));
    }
    if instance.scale_x < 0.0 {
        m = m.mul(&Mat::scale(-1.0, 1.0));
    }
    if instance.scale_y < 0.0 {
        m = m.mul(&Mat::scale(1.0, -1.0));
    }
    m = m.mul(&Mat::scale(ih / iw, 1.0));
    m = m.mul(&Mat::translate(-iw / 2.0, -ih / 2.0));

    let Some(inv) = m.inverse() else {
        return;
    };

    // Destination bounding box from the forward-transformed source corners.
    let corners = [(0.0, 0.0), (iw, 0.0), (0.0, ih), (iw, ih)];
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for (sx, sy) in corners {
        let (dx, dy) = m.apply(sx, sy);
        min_x = min_x.min(dx);
        min_y = min_y.min(dy);
        max_x = max_x.max(dx);
        max_y = max_y.max(dy);
    }

    let mut bx0 = min_x.floor() as i64;
    let mut by0 = min_y.floor() as i64;
    let mut bx1 = max_x.ceil() as i64;
    let mut by1 = max_y.ceil() as i64;
    if let Some(c) = clip {
        bx0 = bx0.max(c.x0);
        by0 = by0.max(c.y0);
        bx1 = bx1.min(c.x1);
        by1 = by1.min(c.y1);
    }
    bx0 = bx0.max(0);
    by0 = by0.max(0);
    bx1 = bx1.min(target.width() as i64);
    by1 = by1.min(target.height() as i64);

    for py in by0..by1 {
        for px in bx0..bx1 {
            let (sx, sy) = inv.apply(px as f64 + 0.5, py as f64 + 0.5);
            if sx < 0.0 || sy < 0.0 || sx >= iw || sy >= ih {
                continue;
            }
            let sample = sample_bilinear(src, sx - 0.5, sy - 0.5);
            composite_pixel(target, px as u32, py as u32, sample);
        }
    }
}

/// Cull the emblem scratch buffer's alpha against the raw pattern channels.
fn apply_culling_mask(emblem: &mut RgbaImage, pattern: &RgbaImage, sub: &Sub, indices: &[i64]) {
    let (pw, ph) = (pattern.width() as f64, pattern.height() as f64);
    let (ew, eh) = (emblem.width() as f64, emblem.height() as f64);
    let x_f = pw / ew;
    let y_f = ph / eh;
    let mask_r = if indices.contains(&1) { 1.0 } else { 0.0 };
    let mask_g = if indices.contains(&2) { 1.0 } else { 0.0 };
    let mask_b = if indices.contains(&3) { 1.0 } else { 0.0 };

    for y in 0..emblem.height() {
        for x in 0..emblem.width() {
            let cx = ((x_f * x as f64 - pw * sub.x) / sub.scale_x).floor();
            let cy = ((y_f * y as f64 - ph * sub.y) / sub.scale_y).floor();
            if cx < 0.0 || cy < 0.0 || cx >= pw || cy >= ph {
                continue;
            }
            let p = pattern.get_pixel(cx as u32, cy as u32).0;
            let (pr, pg, pb) = (
                p[0] as f64 / 255.0,
                p[1] as f64 / 255.0,
                p[2] as f64 / 255.0,
            );
            let mr = (pr - pg - pb).clamp(0.0, 1.0);
            let mg = (pg - pb).clamp(0.0, 1.0);
            let mb = pb;
            let t = (mr * mask_r + mg * mask_g + mb * mask_b).clamp(0.0, 1.0);
            let px = emblem.get_pixel_mut(x, y);
            px.0[3] = (px.0[3] as f64 * t).round() as u8;
        }
    }
}

/// Composite an entire buffer over the canvas within a clip rectangle.
fn composite_buffer(canvas: &mut RgbaImage, src: &RgbaImage, clip: &Rect) {
    for py in clip.y0..clip.y1 {
        for px in clip.x0..clip.x1 {
            let s = src.get_pixel(px as u32, py as u32).0;
            if s[3] == 0 {
                continue;
            }
            let sample = FColor::rgba(
                s[0] as f64 / 255.0,
                s[1] as f64 / 255.0,
                s[2] as f64 / 255.0,
                s[3] as f64 / 255.0,
            );
            composite_pixel(canvas, px as u32, py as u32, sample);
        }
    }
}

/// Alpha-composite `top` over the canvas pixel at `(x, y)`.
fn composite_pixel(canvas: &mut RgbaImage, x: u32, y: u32, top: FColor) {
    if top.a <= 0.0 {
        return;
    }
    let px = canvas.get_pixel_mut(x, y);
    let bottom = FColor::rgba(
        px.0[0] as f64 / 255.0,
        px.0[1] as f64 / 255.0,
        px.0[2] as f64 / 255.0,
        px.0[3] as f64 / 255.0,
    );
    px.0 = bottom.over(top).to_rgba8();
}

/// Bilinearly sample `src` at pixel-center coordinates `(x, y)`.
fn sample_bilinear(src: &RgbaImage, x: f64, y: f64) -> FColor {
    let x0 = x.floor();
    let y0 = y.floor();
    let fx = x - x0;
    let fy = y - y0;
    let sample = |ix: f64, iy: f64| -> FColor {
        let cx = (ix as i64).clamp(0, src.width() as i64 - 1) as u32;
        let cy = (iy as i64).clamp(0, src.height() as i64 - 1) as u32;
        let p = src.get_pixel(cx, cy).0;
        FColor::rgba(
            p[0] as f64 / 255.0,
            p[1] as f64 / 255.0,
            p[2] as f64 / 255.0,
            p[3] as f64 / 255.0,
        )
    };
    let c00 = sample(x0, y0);
    let c10 = sample(x0 + 1.0, y0);
    let c01 = sample(x0, y0 + 1.0);
    let c11 = sample(x0 + 1.0, y0 + 1.0);
    let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
    FColor {
        r: lerp(lerp(c00.r, c10.r, fx), lerp(c01.r, c11.r, fx), fy),
        g: lerp(lerp(c00.g, c10.g, fx), lerp(c01.g, c11.g, fx), fy),
        b: lerp(lerp(c00.b, c10.b, fx), lerp(c01.b, c11.b, fx), fy),
        a: lerp(lerp(c00.a, c10.a, fx), lerp(c01.a, c11.a, fx), fy),
    }
}

/// A 2D affine transform (`dest = M * src`).
#[derive(Debug, Clone, Copy)]
struct Mat {
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    e: f64,
    f: f64,
}

impl Mat {
    fn translate(tx: f64, ty: f64) -> Self {
        Mat {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: tx,
            f: ty,
        }
    }
    fn scale(sx: f64, sy: f64) -> Self {
        Mat {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            e: 0.0,
            f: 0.0,
        }
    }
    fn rotate(theta: f64) -> Self {
        let (s, c) = theta.sin_cos();
        Mat {
            a: c,
            b: s,
            c: -s,
            d: c,
            e: 0.0,
            f: 0.0,
        }
    }

    /// `self * other` (apply `other` to the point first).
    fn mul(&self, o: &Mat) -> Mat {
        Mat {
            a: self.a * o.a + self.c * o.b,
            b: self.b * o.a + self.d * o.b,
            c: self.a * o.c + self.c * o.d,
            d: self.b * o.c + self.d * o.d,
            e: self.a * o.e + self.c * o.f + self.e,
            f: self.b * o.e + self.d * o.f + self.f,
        }
    }

    fn apply(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    fn inverse(&self) -> Option<Mat> {
        let det = self.a * self.d - self.b * self.c;
        if det.abs() < 1e-12 {
            return None;
        }
        let inv_det = 1.0 / det;
        let a = self.d * inv_det;
        let b = -self.b * inv_det;
        let c = -self.c * inv_det;
        let d = self.a * inv_det;
        Some(Mat {
            a,
            b,
            c,
            d,
            e: -(a * self.e + c * self.f),
            f: -(b * self.e + d * self.f),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeTextures {
        pattern: Option<Arc<RgbaImage>>,
        colored: Option<Arc<RgbaImage>>,
        textured: Option<Arc<RgbaImage>>,
    }

    impl TextureSource for FakeTextures {
        fn pattern(&self, _: &str) -> Option<Arc<RgbaImage>> {
            self.pattern.clone()
        }

        fn colored_emblem(&self, _: &str) -> Option<Arc<RgbaImage>> {
            self.colored.clone()
        }

        fn textured_emblem(&self, _: &str) -> Option<Arc<RgbaImage>> {
            self.textured.clone()
        }
    }

    fn cfg() -> GameCoaConfig {
        GameCoaConfig {
            width: 4,
            height: 4,
            missing_color: FColor::rgba(1.0, 0.0, 1.0, 1.0),
        }
    }

    #[test]
    fn renders_pattern_with_named_slot_colors() {
        let mut pattern = RgbaImage::new(1, 1);
        pattern.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        let textures = FakeTextures {
            pattern: Some(Arc::new(pattern)),
            ..Default::default()
        };
        let coa = CoatOfArms {
            subs: vec![Sub {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                pattern: Some("pattern.dds".to_string()),
                colors: [
                    Some(FColor::opaque([255, 0, 0])),
                    Some(FColor::opaque([0, 255, 0])),
                    Some(FColor::opaque([0, 0, 255])),
                    None,
                    None,
                ],
                emblems: Vec::new(),
            }],
        };

        let image = render(&coa, &textures, &cfg());
        assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(image.get_pixel(3, 3).0, [255, 0, 0, 255]);
    }

    #[test]
    fn textured_emblems_are_layered_by_depth() {
        let mut red = RgbaImage::new(1, 1);
        red.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        let textures = FakeTextures {
            textured: Some(Arc::new(red)),
            ..Default::default()
        };
        let coa = CoatOfArms {
            subs: vec![Sub {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                pattern: None,
                colors: Default::default(),
                emblems: vec![Emblem {
                    file: Some("emblem.dds".to_string()),
                    colors: None,
                    mask: Vec::new(),
                    instances: vec![Instance {
                        scale_x: 0.5,
                        scale_y: 0.5,
                        depth: 10.0,
                        ..Default::default()
                    }],
                }],
            }],
        };

        let image = render(&coa, &textures, &cfg());
        assert_eq!(image.get_pixel(1, 1).0, [255, 0, 0, 255]);
        assert_eq!(image.get_pixel(0, 0).0, [255, 0, 255, 255]);
    }
}
