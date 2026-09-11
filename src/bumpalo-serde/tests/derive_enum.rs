use bumpalo::Bump;
use bumpalo_serde::{ArenaDeserialize, ArenaSeed};
use serde::de::DeserializeSeed;

fn parse<'bump, T: ArenaDeserialize<'bump>>(bump: &'bump Bump, json: &str) -> Result<T, String> {
    let mut de = serde_json::Deserializer::from_str(json);
    ArenaSeed::<T>::new(bump)
        .deserialize(&mut de)
        .map_err(|e| e.to_string())
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
enum Plain {
    Alpha,
    Beta,
}

#[test]
fn plain_variant_names() {
    let bump = Bump::new();
    assert_eq!(parse::<Plain>(&bump, r#""Alpha""#), Ok(Plain::Alpha));
    assert_eq!(parse::<Plain>(&bump, r#""Beta""#), Ok(Plain::Beta));
}

#[test]
fn unknown_variant_is_an_error() {
    let bump = Bump::new();
    let err = parse::<Plain>(&bump, r#""Gamma""#).unwrap_err();
    assert!(err.contains("unknown variant `Gamma`"), "{err}");
    assert!(err.contains("`Alpha`"), "{err}");
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
#[arena(rename_all = "snake_case")]
enum Snake {
    RuralSettlement,
    Town,
    #[arena(rename = "big-city")]
    City,
    #[arena(other)]
    Other,
}

#[test]
fn rename_all_and_rename() {
    let bump = Bump::new();
    assert_eq!(
        parse::<Snake>(&bump, r#""rural_settlement""#),
        Ok(Snake::RuralSettlement)
    );
    assert_eq!(parse::<Snake>(&bump, r#""town""#), Ok(Snake::Town));
    assert_eq!(parse::<Snake>(&bump, r#""big-city""#), Ok(Snake::City));
}

#[test]
fn other_receives_unknown_identifiers() {
    let bump = Bump::new();
    assert_eq!(parse::<Snake>(&bump, r#""megalopolis""#), Ok(Snake::Other));
    // The pre-rename name is not accepted once rename_all applies.
    assert_eq!(parse::<Snake>(&bump, r#""Town""#), Ok(Snake::Other));
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
#[arena(rename_all = "SCREAMING_SNAKE_CASE")]
enum Screaming {
    HalfLife,
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
#[arena(rename_all = "kebab-case")]
enum Kebab {
    HalfLife,
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
#[arena(rename_all = "camelCase")]
enum Camel {
    HalfLife,
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
#[arena(rename_all = "lowercase")]
enum Lower {
    HalfLife,
}

#[test]
fn other_rename_rules() {
    let bump = Bump::new();
    assert_eq!(
        parse::<Screaming>(&bump, r#""HALF_LIFE""#),
        Ok(Screaming::HalfLife)
    );
    assert_eq!(parse::<Kebab>(&bump, r#""half-life""#), Ok(Kebab::HalfLife));
    assert_eq!(parse::<Camel>(&bump, r#""halfLife""#), Ok(Camel::HalfLife));
    assert_eq!(parse::<Lower>(&bump, r#""halflife""#), Ok(Lower::HalfLife));
}

#[derive(Debug, PartialEq, ArenaDeserialize)]
struct Holder<'bump> {
    name: &'bump str,
    kind: Snake,
    #[arena(default)]
    fallback: Option<Plain>,
}

#[test]
fn enum_as_struct_field() {
    let bump = Bump::new();
    let holder = parse::<Holder>(&bump, r#"{"name": "x", "kind": "town"}"#).unwrap();
    assert_eq!(
        holder,
        Holder {
            name: "x",
            kind: Snake::Town,
            fallback: None
        }
    );
    let holder =
        parse::<Holder>(&bump, r#"{"name": "y", "kind": "?", "fallback": "Beta"}"#).unwrap();
    assert_eq!(holder.kind, Snake::Other);
    assert_eq!(holder.fallback, Some(Plain::Beta));
}
