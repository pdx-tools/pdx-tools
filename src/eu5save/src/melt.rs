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
}

impl MeltedDocument {
    pub fn new() -> Self {
        Self::default()
    }

    /// The list of unknown tokens that the provided resolver accumulated
    pub fn unknown_tokens(&self) -> &HashSet<u16> {
        &self.unknown_tokens
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

    let mut unknown_tokens = HashSet::new();

    inner_melt(
        &mut reader,
        &mut wtr,
        &resolver,
        options,
        &mut unknown_tokens,
        true,
    )?;

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

    inner_melt(
        &mut reader,
        &mut wtr,
        &resolver,
        options,
        &mut unknown_tokens,
        false,
    )?;

    Ok(MeltedDocument { unknown_tokens })
}

fn inner_melt<Reader, Writer, Resolver>(
    reader: &mut TokenReader<Reader>,
    wtr: &mut jomini::TextWriter<Writer>,
    resolver: Resolver,
    options: MeltOptions,
    unknown_tokens: &mut HashSet<u16>,
    header: bool,
) -> Result<(), Eu5Error>
where
    Reader: Read,
    Writer: Write,
    Resolver: TokenResolver,
{
    let flavor = Eu5Flavor::new();
    let mut known_number = false;
    let mut known_date = false;

    let mut has_read = false;
    while let Some(token) = reader.next()? {
        has_read = true;
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

                    known_date = id == "date";
                    known_number = id == "seed";
                    wtr.write_unquoted(id.as_bytes())?;
                }
                None => {
                    known_date = false;
                    known_number = false;
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
                            unknown_tokens.insert(x);
                            let replacement = format!("__unknown_0x{x:x}");
                            wtr.write_unquoted(replacement.as_bytes())?;
                        }
                    }
                }
            },
            Token::Open => wtr.write_start()?,
            Token::Close => {
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
                if wtr.expecting_key() {
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
                let converted = flavor.visit_f64(value);
                wtr.write_f64(converted)?;
            }
            Token::Rgb(rgb) => wtr.write_rgb(&rgb)?,
            Token::I64(value) => wtr.write_i64(value)?,
            Token::LookupU8(_) | Token::LookupU16(_) => {
                let x = match token {
                    Token::LookupU8(v) => v as u16,
                    Token::LookupU16(v) => v,
                    _ => unreachable!(),
                };

                match resolver.lookup(x) {
                    Some(s) => wtr.write_unquoted(s.as_bytes())?,
                    None => match options.on_failed_resolve {
                        FailedResolveStrategy::Error => {
                            return Err(Eu5ErrorKind::UnknownToken { token_id: x }.into());
                        }
                        _ => {
                            unknown_tokens.insert(x);
                            let replacement = format!("__id_0x{x:x}");
                            wtr.write_unquoted(replacement.as_bytes())?;
                        }
                    },
                }
            }
        }
    }

    if has_read {
        wtr.inner().write_all(b"\n")?;
    }
    Ok(())
}
