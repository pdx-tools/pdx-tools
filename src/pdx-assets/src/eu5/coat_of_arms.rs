//! EU5 wiring for the game-agnostic coat of arms compositor.
//!
//! Loads EU5's heraldry definitions and named colors from a game file provider,
//! decodes the BC7 `.dds` emblem/pattern textures (pure-Rust via `image_dds`,
//! since ImageMagick's DDS coder cannot read BC7), and renders country flags.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use image::RgbaImage;
use rayon::prelude::*;

use crate::coat_of_arms::{
    CoaDefinitions, CoatOfArms, FColor, GameCoaConfig, NamedColors, TextureSource,
    parse_named_colors, render,
};
use crate::file_provider::FileProvider;
use crate::images::Geometry;

const MAIN_MENU: &str = "game/main_menu";
const PATTERNS_DIR: &str = "game/main_menu/gfx/coat_of_arms/patterns";
const COLORED_DIR: &str = "game/main_menu/gfx/coat_of_arms/colored_emblems";
const TEXTURED_DIR: &str = "game/main_menu/gfx/coat_of_arms/textured_emblems";
const COA_DEFS_DIR: &str = "game/main_menu/common/coat_of_arms/coat_of_arms";

/// The coat of arms definition files whose keys we pre-render into the atlas.
const SCOPED_FILES: [&str; 2] = [
    "pre_scripted_countries.txt",
    "pre_scripted_countries_formable.txt",
];

/// EU5 flags are rendered at 1.5:1. This is the source resolution fed to the
/// montage step (which downsamples to the atlas tile sizes).
const RENDER_WIDTH: u32 = 384;
const RENDER_HEIGHT: u32 = 256;

/// EU5 render configuration (magenta stands in for missing colors, as in-game).
pub fn eu5_config() -> GameCoaConfig {
    GameCoaConfig {
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        missing_color: FColor::rgba(1.0, 0.0, 1.0, 1.0),
    }
}

/// The multi-resolution tile sizes for the EU5 flag atlas. Flags are 1.5:1;
/// tile sizes stay in that ratio (the game uses 72x48 / 144x96).
pub fn flag_montage_geometries() -> Vec<Geometry> {
    vec![Geometry::new(72, 48), Geometry::new(144, 96)]
}

/// Renders EU5 country flags from a game file provider: merged heraldry
/// definitions, resolved into render-ready models, plus an on-demand BC7 texture
/// cache. Load once, then [`trace`](Self::trace) or
/// [`render_to_pngs`](Self::render_to_pngs).
#[derive(Debug)]
pub struct Eu5FlagRenderer<'a, P: FileProvider + ?Sized> {
    textures: ProviderTextures<'a, P>,
    config: GameCoaConfig,
    /// Scoped keys resolved to color-resolved models, sorted by key.
    flags: Vec<(String, CoatOfArms)>,
}

impl<'a, P: FileProvider + ?Sized> Eu5FlagRenderer<'a, P> {
    /// Load and resolve every scoped flag from `provider`. Errors if the EU5
    /// coat of arms assets are not present.
    pub fn load(provider: &'a P) -> Result<Self> {
        let coa_marker = format!("{MAIN_MENU}/common/named_colors/01_coa.txt");
        anyhow::ensure!(
            provider.file_exists(&coa_marker),
            "EU5 coat of arms assets not found (expected {coa_marker})"
        );
        let (definitions, named_colors, render_keys) = load_definitions(provider)?;
        let config = eu5_config();

        // Resolve each scoped key to a fully composed, color-resolved model,
        // dropping unknown keys, and sort for deterministic atlas ordering.
        let mut flags: Vec<(String, CoatOfArms)> = render_keys
            .iter()
            .map(|key| {
                definitions
                    .resolve(key, &named_colors, config.missing_color)
                    .map(|coa| coa.map(|coa| (key.clone(), coa)))
            })
            .collect::<Result<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect();
        flags.sort_by(|a, b| a.0.cmp(&b.0));

        Ok(Self {
            textures: ProviderTextures::new(provider),
            config,
            flags,
        })
    }

    /// Load (and cache) every texture referenced by the resolved flags, without
    /// rendering. Used to register texture files during bundle tracing.
    pub fn trace(&self) {
        for (_, coa) in &self.flags {
            prewarm(&self.textures, coa);
        }
    }

    /// Render flags in parallel and write each PNG immediately, keeping only
    /// one full-resolution bitmap per Rayon worker alive at a time.
    pub fn render_to_pngs(&self, output_dir: &Path) -> Result<Vec<(String, PathBuf)>> {
        self.flags
            .par_iter()
            .map(|(key, coa)| {
                let image = render(coa, &self.textures, &self.config);
                let path = output_dir.join(format!("{key}.png"));
                image
                    .save(&path)
                    .with_context(|| format!("could not write rendered flag {key}"))?;
                Ok((key.clone(), path))
            })
            .collect()
    }
}

/// Load EU5 coat of arms definitions and named colors, returning the merged
/// definitions, the named-color palette, and the scoped render keys (in source
/// order, deduped across scoped files).
fn load_definitions<P: FileProvider + ?Sized>(
    provider: &P,
) -> Result<(CoaDefinitions, NamedColors, Vec<String>)> {
    // Named colors: base (jomini) first, then main_menu overrides.
    let mut named_colors = NamedColors::default();
    for dir in [
        "jomini/loading_screen/common/named_colors",
        "game/main_menu/common/named_colors",
    ] {
        for file in provider
            .walk_directory(dir, &[".txt"])
            .with_context(|| format!("could not list named colors in {dir}"))?
        {
            let text = provider
                .read_to_string(&file)
                .with_context(|| format!("could not read named colors from {file}"))?;
            for (name, rgb) in parse_named_colors(&text)
                .with_context(|| format!("could not parse named colors from {file}"))?
            {
                named_colors.insert(name, rgb);
            }
        }
    }

    // Merge every coat of arms definition file for `parent`/template resolution,
    // but only track keys from the scoped files as the render set.
    let mut definitions = CoaDefinitions::new();
    let mut scoped_keys: Vec<String> = Vec::new();
    let all_files = provider
        .walk_directory(COA_DEFS_DIR, &[".txt"])
        .context("could not list coat of arms definitions")?;
    let mut seen = std::collections::HashSet::new();
    for file in &all_files {
        let text = read_latin1(provider, file)?;
        let keys = definitions
            .add_file(&text)
            .with_context(|| format!("could not parse coat of arms definitions from {file}"))?;
        if SCOPED_FILES.iter().any(|f| file.ends_with(f)) {
            // Dedupe keys shared across scoped files (e.g. RUS is defined in both
            // the base and formable files); `resolve` returns the merged winner.
            for key in keys {
                if seen.insert(key.clone()) {
                    scoped_keys.push(key);
                }
            }
        }
    }

    Ok((definitions, named_colors, scoped_keys))
}

/// Read a game file as text, decoding bytes as Latin-1 so non-UTF-8 comment
/// bytes never fail the read (only ASCII structure matters downstream).
fn read_latin1<P: FileProvider + ?Sized>(provider: &P, path: &str) -> Result<String> {
    let bytes = provider
        .read_file(path)
        .with_context(|| format!("could not read {path}"))?;
    Ok(bytes.iter().map(|&b| b as char).collect())
}

/// A [`TextureSource`] backed by a file provider that decodes BC7 `.dds` on
/// demand and memoizes the results (emblems recur heavily across flags).
pub struct ProviderTextures<'a, P: ?Sized> {
    provider: &'a P,
    cache: Mutex<HashMap<String, Option<Arc<RgbaImage>>>>,
}

impl<P: FileProvider + ?Sized> std::fmt::Debug for ProviderTextures<'_, P> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ProviderTextures")
            .field("cached", &self.cache().len())
            .finish()
    }
}

impl<'a, P: FileProvider + ?Sized> ProviderTextures<'a, P> {
    pub fn new(provider: &'a P) -> Self {
        ProviderTextures {
            provider,
            cache: Mutex::new(HashMap::new()),
        }
    }

    fn load(&self, dir: &str, file: &str) -> Option<Arc<RgbaImage>> {
        let path = format!("{dir}/{file}");
        if let Some(cached) = self.cache().get(&path) {
            return cached.clone();
        }
        let decoded = self
            .provider
            .read_file(&path)
            .ok()
            .and_then(|bytes| decode_dds(&bytes))
            .map(Arc::new);
        self.cache().insert(path, decoded.clone());
        decoded
    }

    fn cache(&self) -> std::sync::MutexGuard<'_, HashMap<String, Option<Arc<RgbaImage>>>> {
        self.cache
            .lock()
            .expect("provider texture cache mutex poisoned")
    }
}

impl<P: FileProvider + ?Sized> TextureSource for ProviderTextures<'_, P> {
    fn pattern(&self, file: &str) -> Option<Arc<RgbaImage>> {
        self.load(PATTERNS_DIR, file)
    }
    fn colored_emblem(&self, file: &str) -> Option<Arc<RgbaImage>> {
        self.load(COLORED_DIR, file)
    }
    fn textured_emblem(&self, file: &str) -> Option<Arc<RgbaImage>> {
        self.load(TEXTURED_DIR, file)
    }
}

/// Decode BC7 (and other) DDS bytes into an RGBA image.
fn decode_dds(bytes: &[u8]) -> Option<RgbaImage> {
    let dds = image_dds::ddsfile::Dds::read(std::io::Cursor::new(bytes)).ok()?;
    image_dds::image_from_dds(&dds, 0).ok()
}

/// Load (and cache) every texture referenced by a resolved coat of arms, so it
/// is registered during bundle tracing and warm before rendering.
fn prewarm<P: FileProvider + ?Sized>(textures: &ProviderTextures<P>, coa: &CoatOfArms) {
    for sub in &coa.subs {
        if let Some(pattern) = &sub.pattern {
            let _ = textures.pattern(pattern);
        }
        for emblem in &sub.emblems {
            if let Some(file) = &emblem.file {
                if emblem.colors.is_some() {
                    let _ = textures.colored_emblem(file);
                } else {
                    let _ = textures.textured_emblem(file);
                }
            }
        }
    }
}
