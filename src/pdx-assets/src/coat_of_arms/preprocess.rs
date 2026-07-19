//! Textual preprocessing of Paradox coat of arms script into plain jomini text.
//!
//! jomini does not evaluate Paradox's `@variable` / `@[math]` preprocessor
//! macros, and its generic value reader does not expose the body of tagged
//! colors (`hsv360 { .. }`). We resolve both here so the downstream parser only
//! ever sees plain scalars, arrays, and objects:
//!
//! * `@name = <number|@[expr]>` definitions are collected and dropped.
//! * `@name` references and `@[expr]` expressions are substituted with numbers.
//! * inline `hsv360|hsv|rgb|hex { .. }` colors become `"#rrggbb"` string values.

use std::collections::HashMap;
use std::sync::LazyLock;

use anyhow::{Result, bail};
use regex::{Captures, Regex};

use super::color::parse_tagged_color;

static DEF_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^[ \t]*@([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*([^#\r\n]*)").unwrap()
});
static EXPR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@\[([^\]]*)\]").unwrap());
static VAR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@([A-Za-z_][A-Za-z0-9_]*)").unwrap());
static COLOR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(hsv360|hsv|rgb|hex)\s*\{\s*([^}]*)\}").unwrap());

/// Resolve `@` macros and inline colors in a coat of arms script file.
pub fn preprocess(input: &str) -> Result<String> {
    let vars = collect_vars(input)?;

    // Drop the `@name = ...` definition lines; they are not real keys.
    let without_defs = DEF_RE.replace_all(input, "");

    // Substitute `@[expr]` then bare `@name` references with numbers.
    let mut invalid_expr = None;
    let expr_subbed = EXPR_RE.replace_all(&without_defs, |caps: &Captures| {
        match eval_expr(&caps[1], &vars) {
            Some(value) => format_num(value),
            None => {
                invalid_expr = Some(caps[1].to_string());
                caps[0].to_string()
            }
        }
    });
    if let Some(expr) = invalid_expr {
        bail!("could not evaluate coat of arms expression `@[{expr}]`");
    }
    let var_subbed = VAR_RE.replace_all(&expr_subbed, |caps: &Captures| match vars.get(&caps[1]) {
        Some(v) => format_num(*v),
        None => caps[0].to_string(),
    });

    // Resolve inline tagged colors to `"#rrggbb"` literals.
    Ok(COLOR_RE
        .replace_all(&var_subbed, |caps: &Captures| {
            match parse_tagged_color(&caps[1].to_lowercase(), &caps[2]) {
                Some(rgb) => format!("\"#{:02x}{:02x}{:02x}\"", rgb[0], rgb[1], rgb[2]),
                None => caps[0].to_string(),
            }
        })
        .into_owned())
}

/// Build the `@name -> value` map, evaluating definitions in source order so
/// later definitions can reference earlier ones.
fn collect_vars(input: &str) -> Result<HashMap<String, f64>> {
    let mut vars: HashMap<String, f64> = HashMap::new();
    for caps in DEF_RE.captures_iter(input) {
        let name = caps[1].to_string();
        let rhs = caps[2].trim();
        let Some(value) = eval_rhs(rhs, &vars) else {
            bail!("could not evaluate coat of arms variable `@{name} = {rhs}`");
        };
        vars.insert(name, value);
    }
    Ok(vars)
}

/// Evaluate the right-hand side of an `@name = ...` definition.
fn eval_rhs(rhs: &str, vars: &HashMap<String, f64>) -> Option<f64> {
    let rhs = rhs.trim();
    if let Some(inner) = rhs.strip_prefix("@[").and_then(|s| s.strip_suffix(']')) {
        return eval_expr(inner, vars);
    }
    if let Some(name) = rhs.strip_prefix('@') {
        return vars.get(name).copied();
    }
    rhs.parse::<f64>().ok()
}

/// Format a number for substitution back into the script.
fn format_num(v: f64) -> String {
    // `{}` gives a shortest round-trippable decimal without exponents for the
    // magnitudes used here (normalized 0..1 coordinates and small constants).
    let s = format!("{v}");
    if s.contains('e') || s.contains('E') {
        format!("{v:.6}")
    } else {
        s
    }
}

/// Evaluate a `@[..]` arithmetic expression: `+ - * /`, parentheses, numeric
/// literals, and bare variable names (resolved against `vars`).
fn eval_expr(expr: &str, vars: &HashMap<String, f64>) -> Option<f64> {
    let mut parser = ExprParser { expr, pos: 0, vars };
    let value = parser.parse_expr()?;
    parser.skip_ws();
    (parser.pos == parser.expr.len() && value.is_finite()).then_some(value)
}

struct ExprParser<'a> {
    expr: &'a str,
    pos: usize,
    vars: &'a HashMap<String, f64>,
}

impl ExprParser<'_> {
    fn peek(&self) -> Option<u8> {
        self.expr.as_bytes().get(self.pos).copied()
    }

    fn bump(&mut self) {
        self.pos += 1;
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\r' | b'\n')) {
            self.bump();
        }
    }

    fn consume(&mut self, byte: u8) -> bool {
        self.skip_ws();
        if self.peek() == Some(byte) {
            self.bump();
            true
        } else {
            false
        }
    }

    fn parse_expr(&mut self) -> Option<f64> {
        let mut value = self.parse_term()?;
        loop {
            if self.consume(b'+') {
                value += self.parse_term()?;
            } else if self.consume(b'-') {
                value -= self.parse_term()?;
            } else {
                break;
            }
        }
        Some(value)
    }

    fn parse_term(&mut self) -> Option<f64> {
        let mut value = self.parse_factor()?;
        loop {
            if self.consume(b'*') {
                value *= self.parse_factor()?;
            } else if self.consume(b'/') {
                value /= self.parse_factor()?;
            } else {
                break;
            }
        }
        Some(value)
    }

    fn parse_factor(&mut self) -> Option<f64> {
        self.skip_ws();
        match self.peek()? {
            b'0'..=b'9' | b'.' => self.parse_number(),
            b'a'..=b'z' | b'A'..=b'Z' | b'_' => self.parse_ident(),
            b'-' => {
                self.bump();
                Some(-self.parse_factor()?)
            }
            b'(' => {
                self.bump();
                let value = self.parse_expr()?;
                self.consume(b')').then_some(value)
            }
            _ => None,
        }
    }

    fn parse_number(&mut self) -> Option<f64> {
        let start = self.pos;
        while matches!(self.peek(), Some(b'0'..=b'9' | b'.')) {
            self.bump();
        }
        self.expr[start..self.pos].parse().ok()
    }

    fn parse_ident(&mut self) -> Option<f64> {
        let start = self.pos;
        while matches!(
            self.peek(),
            Some(b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_')
        ) {
            self.bump();
        }
        self.vars.get(&self.expr[start..self.pos]).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_header_vars_and_math() {
        let input = "@half = @[1/2]\n@semy = 0.27\nX = { scale = { @half @semy } }";
        let out = preprocess(input).unwrap();
        assert!(out.contains("scale = { 0.5 0.27 }"), "got: {out}");
        assert!(!out.contains('@'));
    }

    #[test]
    fn resolves_nested_math_with_vars() {
        let input = "@o = 0.1\nX = { position = { @[0.5 + (o*2)] 0.5 } }";
        let out = preprocess(input).unwrap();
        assert!(out.contains("position = { 0.7 0.5 }"), "got: {out}");
    }

    #[test]
    fn resolves_inline_colors_to_hex() {
        let input = "X = { color1 = rgb { 255 0 0 } color2 = hsv360 { 0 0 15 } }";
        let out = preprocess(input).unwrap();
        assert!(out.contains("color1 = \"#ff0000\""), "got: {out}");
        assert!(out.to_lowercase().contains("color2 = \"#"), "got: {out}");
    }

    #[test]
    fn preserves_color_references_and_names() {
        let input = "X = { color1 = \"red\" color2 = color1 }";
        let out = preprocess(input).unwrap();
        assert!(out.contains("color1 = \"red\""));
        assert!(out.contains("color2 = color1"));
    }

    #[test]
    fn rejects_unsupported_or_non_finite_expressions() {
        preprocess("X = { x = @[min(1, 2)] }").unwrap_err();
        preprocess("X = { x = @[1 / 0] }").unwrap_err();
        preprocess("@x = nope\nX = { x = @x }").unwrap_err();
    }
}
