//! Game-agnostic coat of arms (heraldry) compositor.
//!
//! Paradox's Clausewitz engine composes flags procedurally from a `pattern`
//! background, recolorable `colored_emblem`s / full-color `textured_emblem`s,
//! and named color slots. The same system is shared across CK3, Imperator,
//! Victoria 3, and EU5. This module ports the parse + composite pipeline from
//! pdx_unlimiter so an asset build can pre-render flags into a sprite atlas.
//!
//! Pipeline:
//! 1. [`parse_named_colors`] loads the `name -> sRGB` palette.
//! 2. [`CoaDefinitions`] parses the definition files (resolving `@` macros,
//!    inline colors, color references and `parent` templates).
//! 3. [`render`] composites a resolved [`CoatOfArms`] into an RGBA raster.
//!
//! Callers supply a [`TextureSource`] (decoded emblem/pattern images) and a
//! [`GameCoaConfig`] (canvas size, texture directories, missing color).

pub mod color;
mod model;
mod preprocess;
mod render;

pub use color::{FColor, NamedColors, hsv_to_rgb};
pub use model::{CoaDefinitions, CoatOfArms, Node, parse_entries, parse_named_colors};
pub use preprocess::preprocess;
pub use render::{GameCoaConfig, TextureSource, render};
