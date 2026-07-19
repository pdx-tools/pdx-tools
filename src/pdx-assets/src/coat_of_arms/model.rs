//! Parse preprocessed coat of arms script into an owned model.
//!
//! Ported from pdx_unlimiter's `CoatOfArms`/`Emblem` model. Input text must have
//! already been run through [`super::preprocess::preprocess`], so every value is
//! a plain scalar, number array, or object (no `@` macros or tagged colors).

use std::collections::HashMap;

use super::color::{COLOR_SLOTS, FColor, NamedColors, resolve_color, resolve_named};
use super::preprocess::preprocess;
use anyhow::{Context, Result, bail};

/// The color environment used to resolve `colorN` slots at model-build time, so
/// the rendered model carries [`FColor`]s rather than unresolved name strings.
#[derive(Debug, Clone, Copy)]
pub struct ColorEnv<'a> {
    pub named: &'a NamedColors,
    /// Substituted for unknown/unspecified colors (e.g. magenta for EU5).
    pub missing: FColor,
}

/// Parse a game's `named_colors` coat of arms file into a name -> sRGB map.
///
/// Accepts raw (un-preprocessed) file text; inline `hsv360`/`rgb`/`hex` colors
/// are resolved during preprocessing to `#rrggbb` scalars.
pub fn parse_named_colors(raw: &str) -> Result<NamedColors> {
    let text = preprocess(raw)?;
    let mut colors = NamedColors::default();
    for (key, node) in parse_entries(&text)? {
        if key != "colors" {
            continue;
        }
        if let Node::Object(fields) = node {
            for (name, value) in fields {
                if let Some(rgb) = value.as_str().and_then(|s| resolve_named(s, &colors)) {
                    colors.insert(name, rgb);
                }
            }
        }
    }
    Ok(colors)
}

/// A generic owned node parsed from jomini text.
#[derive(Debug, Clone)]
pub enum Node {
    Scalar(String),
    Array(Vec<Node>),
    Object(Vec<(String, Node)>),
}

impl Node {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Node::Scalar(s) => Some(s.as_str()),
            _ => None,
        }
    }

    fn as_f64(&self) -> Option<f64> {
        self.as_str()?.parse().ok()
    }

    /// The values of the first array/object matching a numeric list.
    fn num_list(&self) -> Vec<f64> {
        match self {
            Node::Array(items) => items.iter().filter_map(Node::as_f64).collect(),
            _ => Vec::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<&Node> {
        match self {
            Node::Object(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn get_all(&self, key: &str) -> Vec<&Node> {
        match self {
            Node::Object(fields) => fields
                .iter()
                .filter(|(k, _)| k == key)
                .map(|(_, v)| v)
                .collect(),
            _ => Vec::new(),
        }
    }
}

/// Parse a preprocessed file into ordered top-level `(key, node)` entries.
pub fn parse_entries(text: &str) -> Result<Vec<(String, Node)>> {
    let tape = jomini::TextTape::from_slice(text.as_bytes())
        .context("could not parse preprocessed coat of arms script")?;
    let reader = tape.utf8_reader();
    let mut entries = Vec::new();
    for (key, _, value) in reader.fields() {
        entries.push((key.read_string(), build_node(&value)));
    }
    Ok(entries)
}

fn build_node<'data, 'tokens, E>(value: &jomini::text::ValueReader<'data, 'tokens, E>) -> Node
where
    E: jomini::Encoding + Clone,
{
    if let Ok(scalar) = value.read_str() {
        return Node::Scalar(scalar.into_owned());
    }
    if let Ok(obj) = value.read_object()
        && obj.fields_len() > 0
    {
        let mut fields = Vec::new();
        for (key, _, val) in obj.fields() {
            fields.push((key.read_string(), build_node(&val)));
        }
        return Node::Object(fields);
    }
    if let Ok(arr) = value.read_array() {
        let mut items = Vec::new();
        for val in arr.values() {
            items.push(build_node(&val));
        }
        return Node::Array(items);
    }
    Node::Object(Vec::new())
}

/// A fully resolved coat of arms: a list of layered subs.
#[derive(Debug, Clone)]
pub struct CoatOfArms {
    pub subs: Vec<Sub>,
}

#[derive(Debug, Clone)]
pub struct Sub {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub pattern: Option<String>,
    /// `color1`..`color5`, resolved to sRGB (`None` for unspecified slots).
    pub colors: [Option<FColor>; 5],
    pub emblems: Vec<Emblem>,
}

#[derive(Debug, Clone)]
pub struct Emblem {
    pub file: Option<String>,
    /// `Some` for colored emblems (recolored), `None` for textured (as-is).
    pub colors: Option<[Option<FColor>; 3]>,
    pub mask: Vec<i64>,
    pub instances: Vec<Instance>,
}

#[derive(Debug, Clone)]
pub struct Instance {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
    pub depth: f64,
}

impl Default for Instance {
    fn default() -> Self {
        Instance {
            x: 0.5,
            y: 0.5,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            depth: 0.0,
        }
    }
}

/// Resolves a `parent`/template key to its definition node.
pub type ParentResolver<'a> = dyn Fn(&str) -> Option<&'a Node> + 'a;

impl CoatOfArms {
    /// Build a coat of arms from a definition node, resolving `parent`
    /// templates and nested `sub` blocks (ported from pdxu `CoatOfArms.fromNode`).
    pub fn from_node(node: &Node, resolver: &ParentResolver, env: ColorEnv) -> Result<CoatOfArms> {
        let mut parent_stack = Vec::new();
        let mut subs = Sub::from_node(node, resolver, env, &mut parent_stack)?;
        for sub_node in node.get_all("sub") {
            subs.extend(Sub::from_node(sub_node, resolver, env, &mut parent_stack)?);
        }
        Ok(CoatOfArms { subs })
    }
}

impl Sub {
    fn from_node(
        node: &Node,
        resolver: &ParentResolver,
        env: ColorEnv,
        parent_stack: &mut Vec<String>,
    ) -> Result<Vec<Sub>> {
        if !matches!(node, Node::Object(_)) {
            return Ok(Vec::new());
        }
        let instances = node.get_all("instance");
        if instances.is_empty() {
            Ok(vec![Self::sub_instance(
                node,
                None,
                resolver,
                env,
                parent_stack,
            )?])
        } else {
            instances
                .into_iter()
                .map(|inst| Self::sub_instance(node, Some(inst), resolver, env, parent_stack))
                .collect()
        }
    }

    fn sub_instance(
        node: &Node,
        instance: Option<&Node>,
        resolver: &ParentResolver,
        env: ColorEnv,
        parent_stack: &mut Vec<String>,
    ) -> Result<Sub> {
        // Resolve the parent template first, then override.
        let parent_name = node.get("parent").and_then(Node::as_str);
        let parent_node = parent_name.and_then(resolver);
        let mut sub = match (parent_name, parent_node) {
            (Some(name), Some(parent)) => {
                if let Some(cycle_start) = parent_stack.iter().position(|item| item == name) {
                    let mut cycle = parent_stack[cycle_start..].to_vec();
                    cycle.push(name.to_string());
                    bail!("coat of arms parent cycle: {}", cycle.join(" -> "));
                }
                parent_stack.push(name.to_string());
                let result = Self::sub_instance(parent, None, resolver, env, parent_stack);
                parent_stack.pop();
                result?
            }
            (None, _) => Sub {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                pattern: None,
                colors: Default::default(),
                emblems: Vec::new(),
            },
            (Some(_), None) => Sub {
                x: 0.0,
                y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                pattern: None,
                colors: Default::default(),
                emblems: Vec::new(),
            },
        };

        // Resolve `color1..color5`: literals override the inherited palette,
        // then references (`color2 = color1`) resolve against this sub's colors.
        apply_color_literals(node, &mut sub.colors, env);
        let palette = sub.colors;
        apply_color_refs(node, &mut sub.colors, &palette);

        // Inherit the parent's emblems, then replace with our own if present.
        if let Some(parent) = parent_node {
            let mut inherited: Vec<Emblem> = parent
                .get_all("colored_emblem")
                .into_iter()
                .map(|n| Emblem::from_colored(n, &sub, env))
                .collect();
            inherited.extend(
                parent
                    .get_all("textured_emblem")
                    .into_iter()
                    .map(Emblem::from_textured),
            );
            sub.emblems = inherited;
        }

        if let Some(pattern) = node.get("pattern").and_then(Node::as_str) {
            sub.pattern = Some(pattern.to_string());
        }

        let mut emblems: Vec<Emblem> = node
            .get_all("colored_emblem")
            .into_iter()
            .map(|n| Emblem::from_colored(n, &sub, env))
            .collect();
        emblems.extend(
            node.get_all("textured_emblem")
                .into_iter()
                .map(Emblem::from_textured),
        );
        if !emblems.is_empty() {
            sub.emblems = emblems;
        }

        if let Some(instance) = instance {
            if let Some(offset) = instance.get("offset") {
                let nums = offset.num_list();
                if nums.len() >= 2 {
                    sub.x = nums[0];
                    sub.y = nums[1];
                }
            }
            if let Some(scale) = instance.get("scale") {
                let nums = scale.num_list();
                if nums.len() >= 2 {
                    sub.scale_x = nums[0].min(1.0 - sub.x);
                    sub.scale_y = nums[1].min(1.0 - sub.y);
                }
            }
        }

        Ok(sub)
    }
}

impl Emblem {
    fn from_textured(node: &Node) -> Emblem {
        Emblem {
            file: node.get("texture").and_then(Node::as_str).map(String::from),
            colors: None,
            mask: parse_mask(node),
            instances: parse_instances(node),
        }
    }

    fn from_colored(node: &Node, sub: &Sub, env: ColorEnv) -> Emblem {
        // Emblem literals live on the emblem, but references resolve against the
        // enclosing sub's palette (`color2 = color1` == the sub's color1).
        let mut colors: [Option<FColor>; 3] = Default::default();
        apply_color_literals(node, &mut colors, env);
        apply_color_refs(node, &mut colors, &sub.colors);
        Emblem {
            file: node.get("texture").and_then(Node::as_str).map(String::from),
            colors: Some(colors),
            mask: parse_mask(node),
            instances: parse_instances(node),
        }
    }
}

/// Resolve the literal color-slot values on `node` (a named color or `#hex`) to
/// sRGB, leaving slots that are absent or reference another slot untouched.
fn apply_color_literals(node: &Node, out: &mut [Option<FColor>], env: ColorEnv) {
    for (i, slot) in COLOR_SLOTS.iter().take(out.len()).enumerate() {
        if let Some(value) = node.get(slot).and_then(Node::as_str)
            && !COLOR_SLOTS.contains(&value)
        {
            out[i] = Some(resolve_color(value, env.named, env.missing));
        }
    }
}

/// Resolve color-slot references (`color2 = color1`) on `node`, pulling each
/// referenced slot's value from `palette`.
fn apply_color_refs(node: &Node, out: &mut [Option<FColor>], palette: &[Option<FColor>]) {
    for (i, slot) in COLOR_SLOTS.iter().take(out.len()).enumerate() {
        if let Some(value) = node.get(slot).and_then(Node::as_str)
            && let Some(idx) = COLOR_SLOTS.iter().position(|s| *s == value)
        {
            out[i] = palette.get(idx).cloned().flatten();
        }
    }
}

fn parse_mask(node: &Node) -> Vec<i64> {
    match node.get("mask") {
        Some(n) => n.num_list().into_iter().map(|v| v as i64).collect(),
        None => Vec::new(),
    }
}

fn parse_instances(node: &Node) -> Vec<Instance> {
    let mut instances: Vec<Instance> = node
        .get_all("instance")
        .into_iter()
        .map(|inst| {
            let mut instance = Instance::default();
            if let Some(pos) = inst.get("position") {
                let nums = pos.num_list();
                if nums.len() >= 2 {
                    instance.x = nums[0];
                    instance.y = nums[1];
                }
            }
            if let Some(scale) = inst.get("scale") {
                let nums = scale.num_list();
                if nums.len() == 1 {
                    instance.scale_x = nums[0];
                    instance.scale_y = 1.0;
                } else if nums.len() >= 2 {
                    instance.scale_x = nums[0];
                    instance.scale_y = nums[1];
                }
            }
            if let Some(rot) = inst.get("rotation").and_then(Node::as_f64) {
                instance.rotation = rot;
            }
            if let Some(depth) = inst.get("depth").and_then(Node::as_f64) {
                instance.depth = depth;
            }
            instance
        })
        .collect();
    if instances.is_empty() {
        instances.push(Instance::default());
    }
    instances
}

/// A merged library of coat of arms definitions keyed by tag/template name.
#[derive(Debug)]
pub struct CoaDefinitions {
    map: HashMap<String, Node>,
}

impl CoaDefinitions {
    pub fn new() -> Self {
        CoaDefinitions {
            map: HashMap::new(),
        }
    }

    /// Merge a coat of arms definition file's entries. Accepts raw text; later
    /// inserts win for duplicate keys. Returns the top-level keys added, in
    /// source order, so callers can track which keys a given file contributes.
    pub fn add_file(&mut self, raw: &str) -> Result<Vec<String>> {
        let text = preprocess(raw)?;
        let entries = parse_entries(&text)?;
        let keys: Vec<String> = entries.iter().map(|(k, _)| k.clone()).collect();
        for (key, node) in entries {
            self.map.insert(key, node);
        }
        Ok(keys)
    }

    pub fn get(&self, key: &str) -> Option<&Node> {
        self.map.get(key)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.map.contains_key(key)
    }

    /// Resolve a key to a fully composed, color-resolved coat of arms model.
    pub fn resolve(
        &self,
        key: &str,
        named: &NamedColors,
        missing: FColor,
    ) -> Result<Option<CoatOfArms>> {
        let Some(node) = self.map.get(key) else {
            return Ok(None);
        };
        let resolver = |name: &str| self.map.get(name);
        let env = ColorEnv { named, missing };
        CoatOfArms::from_node(node, &resolver, env).map(Some)
    }
}

impl Default for CoaDefinitions {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_palette() -> NamedColors {
        let mut named = NamedColors::default();
        named.insert("red".to_string(), [255, 0, 0]);
        named.insert("green".to_string(), [0, 255, 0]);
        named.insert("blue".to_string(), [0, 0, 255]);
        named
    }

    const MISSING: FColor = FColor {
        r: 1.0,
        g: 0.0,
        b: 1.0,
        a: 1.0,
    };

    #[test]
    fn named_colors_resolve_inline_tags_and_references() {
        let colors = parse_named_colors(
            r##"
            colors = {
                red = rgb { 255 0 0 }
                green = hsv360 { 120 100 50 }
                blue = hex { #0000ff }
            }
            "##,
        )
        .unwrap();

        assert_eq!(colors.get("red"), Some(&[255, 0, 0]));
        assert_eq!(colors.get("green"), Some(&[0, 128, 0]));
        assert_eq!(colors.get("blue"), Some(&[0, 0, 255]));
    }

    #[test]
    fn definitions_return_keys_in_source_order_and_later_files_win() {
        let mut definitions = CoaDefinitions::new();
        assert_eq!(
            definitions
                .add_file("AAA = { color1 = red }\nBBB = { color1 = blue }")
                .unwrap(),
            ["AAA", "BBB"]
        );
        assert_eq!(
            definitions.add_file("AAA = { color1 = green }").unwrap(),
            ["AAA"]
        );

        let coa = definitions
            .resolve("AAA", &test_palette(), MISSING)
            .unwrap()
            .expect("AAA should resolve");
        assert_eq!(coa.subs[0].colors[0], Some(FColor::opaque([0, 255, 0])));
    }

    #[test]
    fn resolve_inherits_parent_colors_patterns_and_emblems() {
        let mut definitions = CoaDefinitions::new();
        definitions
            .add_file(
                r#"
            template = {
                pattern = "pattern.dds"
                color1 = red
                color2 = color1
                colored_emblem = {
                    texture = "emblem.dds"
                    color1 = color2
                    mask = { 1 3 }
                    instance = { position = { 0.25 0.75 } scale = { 0.4 0.5 } depth = 7 }
                }
            }
            CHILD = {
                parent = template
                color1 = blue
                color2 = color1
                instance = { offset = { 0.25 0.5 } scale = { 0.25 0.25 } }
            }
            "#,
            )
            .unwrap();

        let coa = definitions
            .resolve("CHILD", &test_palette(), MISSING)
            .unwrap()
            .expect("CHILD should resolve");
        let sub = &coa.subs[0];
        let blue = FColor::opaque([0, 0, 255]);
        assert_eq!(sub.pattern.as_deref(), Some("pattern.dds"));
        assert_eq!(sub.colors[0], Some(blue));
        assert_eq!(sub.colors[1], Some(blue));
        assert_eq!(
            (sub.x, sub.y, sub.scale_x, sub.scale_y),
            (0.25, 0.5, 0.25, 0.25)
        );
        assert_eq!(sub.emblems.len(), 1);
        assert_eq!(sub.emblems[0].file.as_deref(), Some("emblem.dds"));
        assert_eq!(sub.emblems[0].colors.as_ref().unwrap()[0], Some(blue));
        assert_eq!(sub.emblems[0].mask, [1, 3]);
        assert_eq!(
            (sub.emblems[0].instances[0].x, sub.emblems[0].instances[0].y),
            (0.25, 0.75)
        );
    }

    #[test]
    fn rejects_parent_cycles() {
        let mut definitions = CoaDefinitions::new();
        definitions
            .add_file("A = { parent = B }\nB = { parent = A }")
            .unwrap();

        let error = definitions
            .resolve("A", &test_palette(), MISSING)
            .unwrap_err();
        assert!(error.to_string().contains("parent cycle"));
    }

    #[test]
    fn rejects_malformed_definition_files() {
        let mut definitions = CoaDefinitions::new();
        definitions.add_file("A = {").unwrap_err();
        definitions
            .add_file("A = { x = @[unknown(1)] }")
            .unwrap_err();
    }
}
