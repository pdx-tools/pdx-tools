use crate::{Eu5Date, Eu5Error, Eu5ErrorKind, Eu5Flavor};
use jomini::{
    TextWriterBuilder,
    binary::{self, BinaryFlavor, FailedResolveStrategy, Token, TokenReader, TokenResolver},
    common::PdsDate,
    envelope::{SaveHeader, SaveHeaderKind},
};
use std::{
    collections::HashSet,
    io::{Cursor, Read, Write},
};

/// Output from melting a binary save to plaintext
#[derive(Debug, Default)]
pub struct MeltedDocument {
    unknown_tokens: HashSet<u16>,
    unknown_lookups: HashSet<u32>,
}

impl MeltedDocument {
    pub fn new() -> Self {
        Self::default()
    }

    /// The list of unknown tokens that the provided resolver accumulated
    pub fn unknown_tokens(&self) -> &HashSet<u16> {
        &self.unknown_tokens
    }

    /// The list of unknown lookups that the provided resolver accumulated
    pub fn unknown_lookups(&self) -> &HashSet<u32> {
        &self.unknown_lookups
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeltOptions {
    verbatim: bool,
    on_failed_resolve: FailedResolveStrategy,
}

impl Default for MeltOptions {
    fn default() -> Self {
        Self::new()
    }
}

impl MeltOptions {
    pub fn new() -> Self {
        Self {
            verbatim: false,
            on_failed_resolve: FailedResolveStrategy::Ignore,
        }
    }

    pub fn verbatim(self, verbatim: bool) -> Self {
        MeltOptions { verbatim, ..self }
    }

    pub fn on_failed_resolve(self, on_failed_resolve: FailedResolveStrategy) -> Self {
        MeltOptions {
            on_failed_resolve,
            ..self
        }
    }
}

pub(crate) fn melt<Reader, Writer, Resolver>(
    input: Reader,
    mut output: Writer,
    resolver: Resolver,
    options: MeltOptions,
    mut header: SaveHeader,
) -> Result<MeltedDocument, Eu5Error>
where
    Reader: Read,
    Writer: Write,
    Resolver: TokenResolver,
{
    let mut reader = TokenReader::new(input);

    let header_sink = Vec::new();
    let mut wtr = TextWriterBuilder::new()
        .indent_char(b'\t')
        .indent_factor(1)
        .from_writer(Cursor::new(header_sink));

    let mut doc = MeltedDocument::new();

    inner_melt(&mut reader, &mut wtr, &resolver, options, &mut doc, true)?;

    let mut data = wtr.into_inner().into_inner();
    data.push(b'\n');
    header.set_kind(SaveHeaderKind::Text);
    header.set_metadata_len(data.len() as u64);

    header.write(&mut output)?;
    output.write_all(&data)?;

    let mut wtr = TextWriterBuilder::new()
        .indent_char(b'\t')
        .indent_factor(1)
        .from_writer(output);

    inner_melt(&mut reader, &mut wtr, &resolver, options, &mut doc, false)?;

    Ok(doc)
}

/// How to write the value that comes after a given key.
///
/// The binary format does not say if a value is a date, an integer, or a
/// quoted string, so the key gives the hint.
#[derive(Debug, Default, Clone, Copy)]
struct KeyHints {
    date: bool,
    number: bool,
    int: bool,
    quote: bool,
    unquote: bool,
}

impl KeyHints {
    fn for_key(key: &str) -> Self {
        Self {
            date: matches!(
                key,
                "creation_date" | "date" | "leader_date" | "end_date" | "death_date"
            ),
            number: matches!(key, "seed" | "random_count" | "random" | "name_index"),
            int: matches!(key, "resistance" | "percent" | "utility"),
            unquote: matches!(key, "locations"),
            quote: matches!(
                key,
                "Adjective"
                    | "adjective"
                    | "base"
                    | "bookmark_key"
                    | "coa"
                    | "country_name"
                    | "custom_name"
                    | "dna"
                    | "female_names"
                    | "first_name"
                    | "flags"
                    | "historical"
                    | "icon"
                    | "key"
                    | "last_name"
                    | "male_names"
                    | "name_key"
                    | "name"
                    | "nickname"
                    | "original_tag"
                    | "override_adj"
                    | "override_name"
                    | "province_definition"
                    | "regnal_name"
                    | "script"
                    | "tag"
                    | "title"
                    | "value"
            ),
        }
    }
}

fn inner_melt<Writer, Resolver>(
    reader: &mut TokenReader<'_>,
    wtr: &mut jomini::TextWriter<Writer>,
    resolver: Resolver,
    options: MeltOptions,
    doc: &mut MeltedDocument,
    header: bool,
) -> Result<(), Eu5Error>
where
    Writer: Write,
    Resolver: TokenResolver,
{
    let flavor = Eu5Flavor::new();
    let mut known_quote = false;
    let mut known_number = false;
    let mut known_unquote = false;
    let mut known_date = false;
    let mut known_int = false;

    // At the start of a container the writer cannot tell an object from an
    // array, so a string there can be a key or the first array value. Hold it
    // until the next token says which one it is.
    let mut pending_lookup: Option<&str> = None;

    let mut has_read = false;
    while let Some(token) = reader.next()? {
        has_read = true;
        if let Some(pending) = pending_lookup.take() {
            if matches!(token, Token::Equal) {
                let hints = KeyHints::for_key(pending);
                known_date = hints.date;
                known_number = hints.number;
                known_int = hints.int;
                known_unquote = hints.unquote;
                known_quote = hints.quote;
                wtr.write_unquoted(pending.as_bytes())?;
            } else if known_quote {
                wtr.write_quoted(pending.as_bytes())?;
            } else {
                wtr.write_unquoted(pending.as_bytes())?;
            }
        }

        match token {
            Token::Id(x) => match resolver.resolve(x) {
                Some(id) => {
                    // Skip ironman flag so the game doesn't re-enable it when
                    // loading the melted save
                    if id == "ironman" && !options.verbatim {
                        let mut next = reader.read()?;
                        if matches!(next, binary::Token::Equal) {
                            next = reader.read()?;
                        }

                        if matches!(next, binary::Token::Open) {
                            reader.skip_container()?;
                        }
                        continue;
                    }

                    let hints = KeyHints::for_key(id);
                    known_date = hints.date;
                    known_number = hints.number;
                    known_int = hints.int;
                    known_unquote = hints.unquote;
                    known_quote = hints.quote;
                    wtr.write_unquoted(id.as_bytes())?;
                }
                None => {
                    known_date = false;
                    known_number = false;
                    known_int = false;
                    known_quote = false;
                    known_unquote = false;
                    match options.on_failed_resolve {
                        FailedResolveStrategy::Error => {
                            return Err(Eu5ErrorKind::UnknownToken { token_id: x }.into());
                        }
                        FailedResolveStrategy::Ignore if wtr.expecting_key() => {
                            let mut next = reader.read()?;
                            if matches!(next, Token::Equal) {
                                next = reader.read()?;
                            }

                            if matches!(next, Token::Open) {
                                reader.skip_container()?;
                            }
                        }
                        _ => {
                            doc.unknown_tokens.insert(x);
                            let replacement = format!("__unknown_0x{x:x}");
                            wtr.write_unquoted(replacement.as_bytes())?;
                        }
                    }
                }
            },
            Token::Open => wtr.write_start()?,
            Token::Close => {
                known_date = false;
                known_number = false;
                known_int = false;
                known_quote = false;
                known_unquote = false;

                wtr.write_end()?;
                if header && wtr.depth() == 0 {
                    wtr.inner().write_all(b"\n")?;
                    return Ok(());
                }
            }
            Token::Equal => wtr.write_operator(jomini::text::Operator::Equal)?,
            Token::U32(value) => wtr.write_u32(value)?,
            Token::U64(value) => wtr.write_u64(value)?,
            Token::I32(value) => {
                if known_number {
                    known_number = false;
                    wtr.write_i32(value)?;
                } else if known_date {
                    known_date = false;
                    if let Some(date) = Eu5Date::from_binary(value) {
                        wtr.write_date(date.game_fmt())?;
                    } else {
                        wtr.write_i32(value)?;
                    }
                } else if let Some(date) = Eu5Date::from_binary_heuristic(value) {
                    wtr.write_date(date.game_fmt())?;
                } else {
                    wtr.write_i32(value)?;
                }
            }
            Token::Bool(value) => wtr.write_bool(value)?,
            Token::Quoted(scalar) => {
                if wtr.expecting_key() || known_unquote {
                    wtr.write_unquoted(scalar.as_bytes())?;
                } else {
                    wtr.write_quoted(scalar.as_bytes())?;
                }
            }
            Token::Unquoted(scalar) => wtr.write_unquoted(scalar.as_bytes())?,
            Token::F32(value) => {
                let converted = flavor.visit_f32(value);
                wtr.write_f32(converted)?;
            }
            Token::F64(value) => {
                let mut converted = flavor.visit_f64(value);
                if known_int {
                    converted = (converted * 100_000.0).round();
                    wtr.write_i64(converted as i64)?;
                } else {
                    wtr.write_f64(converted)?;
                }
            }
            Token::Rgb(rgb) => wtr.write_rgb(&rgb)?,
            Token::I64(value) => wtr.write_i64(value)?,
            Token::Lookup(x) => match resolver.lookup(x) {
                Some(s) => {
                    // Most keys in the body of a save come from the string
                    // lookup table and not from the token table, so a lookup in
                    // key position must set the same hints as a resolved token.
                    if wtr.at_unknown_start() {
                        pending_lookup = Some(s);
                    } else if wtr.expecting_key() {
                        let hints = KeyHints::for_key(s);
                        known_date = hints.date;
                        known_number = hints.number;
                        known_int = hints.int;
                        known_unquote = hints.unquote;
                        known_quote = hints.quote;
                        wtr.write_unquoted(s.as_bytes())?
                    } else if known_quote {
                        wtr.write_quoted(s.as_bytes())?
                    } else {
                        wtr.write_unquoted(s.as_bytes())?
                    }
                }
                None => match options.on_failed_resolve {
                    FailedResolveStrategy::Error => {
                        return Err(Eu5ErrorKind::UnknownLookup { lookup_id: x }.into());
                    }
                    _ => {
                        doc.unknown_lookups.insert(x);
                        let replacement = format!("__id_0x{x:x}");
                        wtr.write_unquoted(replacement.as_bytes())?;
                    }
                },
            },
        }
    }

    if has_read {
        wtr.inner().write_all(b"\n")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::binary::LexemeId;

    /// A resolver for the string lookup table only, like the body of a SAV03
    /// save, where nearly every key and string value is a lookup.
    struct LookupResolver(&'static [&'static str]);

    impl TokenResolver for LookupResolver {
        fn resolve(&self, _token: u16) -> Option<&str> {
            None
        }

        fn lookup(&self, index: u32) -> Option<&str> {
            self.0.get(index as usize).copied()
        }
    }

    fn lookup(index: u16) -> [u8; 4] {
        let id = LexemeId::LOOKUP_U16_SAV03.0.to_le_bytes();
        let index = index.to_le_bytes();
        [id[0], id[1], index[0], index[1]]
    }

    fn melt_body(data: &[u8], resolver: &LookupResolver) -> String {
        let mut reader = TokenReader::new(data);
        let mut wtr = TextWriterBuilder::new()
            .indent_char(b'\t')
            .indent_factor(1)
            .from_writer(Vec::new());
        let mut doc = MeltedDocument::new();
        inner_melt(
            &mut reader,
            &mut wtr,
            resolver,
            MeltOptions::new(),
            &mut doc,
            false,
        )
        .unwrap();
        String::from_utf8(wtr.into_inner()).unwrap()
    }

    /// A key at the start of a container is ambiguous, because an array value
    /// can be there too. The melter must still apply the hints of the key.
    #[test]
    fn test_lookup_key_hints_at_container_start() {
        let resolver = LookupResolver(&["timeline_notes", "key", "black_death", "location"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup(0));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&LexemeId::OPEN.0.to_le_bytes());
        data.extend_from_slice(&lookup(1));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&lookup(2));
        data.extend_from_slice(&lookup(3));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&LexemeId::U32.0.to_le_bytes());
        data.extend_from_slice(&4731u32.to_le_bytes());
        data.extend_from_slice(&LexemeId::CLOSE.0.to_le_bytes());

        let out = melt_body(&data, &resolver);
        assert_eq!(
            out,
            "timeline_notes={\n\tkey=\"black_death\"\n\tlocation=4731\n}\n"
        );
    }

    /// An array of strings must keep the hint of the key that opened it, and
    /// the first value must not become a key.
    #[test]
    fn test_lookup_array_values() {
        let resolver = LookupResolver(&["female_names", "anna", "berta"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup(0));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&LexemeId::OPEN.0.to_le_bytes());
        data.extend_from_slice(&lookup(1));
        data.extend_from_slice(&lookup(2));
        data.extend_from_slice(&LexemeId::CLOSE.0.to_le_bytes());

        let out = melt_body(&data, &resolver);
        assert_eq!(out, "female_names={\n\t\"anna\" \"berta\"\n}\n");
    }

    #[test]
    fn test_lookup_key_hints() {
        let resolver = LookupResolver(&["tag", "SWE", "last_stat_year"]);
        let mut data = Vec::new();
        data.extend_from_slice(&lookup(0));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&lookup(1));
        data.extend_from_slice(&lookup(2));
        data.extend_from_slice(&LexemeId::EQUAL.0.to_le_bytes());
        data.extend_from_slice(&LexemeId::I32.0.to_le_bytes());
        data.extend_from_slice(&1341i32.to_le_bytes());

        let out = melt_body(&data, &resolver);
        assert_eq!(out, "tag=\"SWE\"\nlast_stat_year=1341\n");
    }
}
