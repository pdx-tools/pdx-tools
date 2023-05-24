use crate::{flavor::Vic3Flavor, SaveHeader, SaveHeaderKind, Vic3Date, Vic3Error, Vic3ErrorKind};
use jomini::{
    binary::{BinaryFlavor, FailedResolveStrategy, TokenResolver},
    common::PdsDate,
    BinaryTape, BinaryToken, TextWriterBuilder,
};
use std::collections::HashSet;

#[derive(thiserror::Error, Debug)]
pub(crate) enum MelterError {
    #[error("{0}")]
    Write(#[from] jomini::Error),

    #[error("")]
    UnknownToken { token_id: u16 },

    #[error("")]
    InvalidDate(i32),
}

/// Output from melting a binary save to plaintext
pub struct MeltedDocument {
    data: Vec<u8>,
    unknown_tokens: HashSet<u16>,
}

impl MeltedDocument {
    /// The converted plaintext data
    pub fn into_data(self) -> Vec<u8> {
        self.data
    }

    /// The converted plaintext data
    pub fn data(&self) -> &[u8] {
        self.data.as_slice()
    }

    /// The list of unknown tokens that the provided resolver accumulated
    pub fn unknown_tokens(&self) -> &HashSet<u16> {
        &self.unknown_tokens
    }
}

/// Convert a binary save to plaintext
pub struct Vic3Melter<'a, 'b> {
    tape: &'b BinaryTape<'a>,
    header: &'b SaveHeader,
    verbatim: bool,
    on_failed_resolve: FailedResolveStrategy,
}

impl<'a, 'b> Vic3Melter<'a, 'b> {
    pub(crate) fn new(tape: &'b BinaryTape<'a>, header: &'b SaveHeader) -> Self {
        Vic3Melter {
            tape,
            header,
            verbatim: false,
            on_failed_resolve: FailedResolveStrategy::Ignore,
        }
    }

    pub fn verbatim(&mut self, verbatim: bool) -> &mut Self {
        self.verbatim = verbatim;
        self
    }

    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        self.on_failed_resolve = strategy;
        self
    }

    pub(crate) fn skip_value_idx(&self, token_idx: usize) -> usize {
        self.tape
            .tokens()
            .get(token_idx + 1)
            .map(|next_token| match next_token {
                BinaryToken::Object(end) | BinaryToken::Array(end) => end + 1,
                _ => token_idx + 2,
            })
            .unwrap_or(token_idx + 1)
    }

    pub fn melt<R>(&self, resolver: &R) -> Result<MeltedDocument, Vic3Error>
    where
        R: TokenResolver,
    {
        let out = melt(self, resolver).map_err(|e| match e {
            MelterError::Write(x) => Vic3ErrorKind::Writer(x),
            MelterError::UnknownToken { token_id } => Vic3ErrorKind::UnknownToken { token_id },
            MelterError::InvalidDate(x) => Vic3ErrorKind::InvalidDate(x),
        })?;
        Ok(out)
    }
}

fn update_header(data: &mut Vec<u8>, mut header: SaveHeader) {
    header.set_kind(SaveHeaderKind::Text);
    header.set_metadata_len((data.len() + 1 - header.header_len()) as u64);
    let _ = header.write(&mut data[..header.header_len()]);
}

pub(crate) fn melt<R>(melter: &Vic3Melter, resolver: &R) -> Result<MeltedDocument, MelterError>
where
    R: TokenResolver,
{
    let flavor = Vic3Flavor::new();
    let mut out = Vec::with_capacity(melter.tape.tokens().len() * 10);
    let _ = melter.header.write(&mut out);

    let mut unknown_tokens = HashSet::new();

    let mut wtr = TextWriterBuilder::new()
        .indent_char(b'\t')
        .indent_factor(1)
        .from_writer(out);
    let mut token_idx = 0;
    let mut known_number = false;
    let mut known_date = false;
    let mut reencode_float_token = false;
    let tokens = melter.tape.tokens();

    while let Some(token) = tokens.get(token_idx) {
        match token {
            BinaryToken::Object(_) => {
                wtr.write_object_start()?;
            }
            BinaryToken::MixedContainer => {
                wtr.start_mixed_mode();
            }
            BinaryToken::Equal => {
                wtr.write_operator(jomini::text::Operator::Equal)?;
            }
            BinaryToken::Array(_) => {
                wtr.write_array_start()?;
            }
            BinaryToken::End(_) => {
                wtr.write_end()?;
            }
            BinaryToken::Bool(x) => wtr.write_bool(*x)?,
            BinaryToken::U32(x) => wtr.write_u32(*x)?,
            BinaryToken::U64(x) => wtr.write_u64(*x)?,
            BinaryToken::I32(x) => {
                if known_number {
                    wtr.write_i32(*x)?;
                    known_number = false;
                } else if known_date {
                    if let Some(date) = Vic3Date::from_binary(*x) {
                        wtr.write_date(date.game_fmt())?;
                    } else if melter.on_failed_resolve != FailedResolveStrategy::Error {
                        wtr.write_i32(*x)?;
                    } else {
                        return Err(MelterError::InvalidDate(*x));
                    }
                    known_date = false;
                } else if let Some(date) = Vic3Date::from_binary_heuristic(*x) {
                    wtr.write_date(date.game_fmt())?;
                } else {
                    wtr.write_i32(*x)?;
                }
            }
            BinaryToken::Quoted(x) => {
                if wtr.expecting_key() {
                    wtr.write_unquoted(x.as_bytes())?;
                } else {
                    wtr.write_quoted(x.as_bytes())?;
                }
            }
            BinaryToken::Unquoted(x) => {
                wtr.write_unquoted(x.as_bytes())?;
            }
            BinaryToken::F32(x) => wtr.write_f32(flavor.visit_f32(*x))?,
            BinaryToken::F64(x) => {
                if !reencode_float_token {
                    wtr.write_f64(flavor.visit_f64(*x))?;
                } else {
                    wtr.write_f64((flavor.visit_f64(*x) * 100_000.0).round())?;
                    reencode_float_token = false;
                }
            }
            BinaryToken::Token(x) => match resolver.resolve(*x) {
                Some(id) => {
                    if !melter.verbatim && id == "is_ironman" && wtr.expecting_key() {
                        continue;
                    }

                    known_number = id == "seed";
                    known_date = id == "real_date";
                    reencode_float_token = matches!(
                        id,
                        "workforce"
                            | "dependents"
                            | "num_literate"
                            | "population_total"
                            | "population_incorporated"
                            | "current_manpower"
                            | "political_strength"
                            | "radicals_political_strength"
                            | "loyalists_political_strength"
                            | "population_total_coastal"
                            | "population_incorporated_coastal"
                            | "votes"
                    );
                    wtr.write_unquoted(id.as_bytes())?;
                }
                None => match melter.on_failed_resolve {
                    FailedResolveStrategy::Error => {
                        return Err(MelterError::UnknownToken { token_id: *x });
                    }
                    FailedResolveStrategy::Ignore if wtr.expecting_key() => {
                        token_idx = melter.skip_value_idx(token_idx);
                        continue;
                    }
                    _ => {
                        unknown_tokens.insert(*x);
                        write!(wtr, "__unknown_0x{:x}", x)?;
                    }
                },
            },
            BinaryToken::Rgb(color) => {
                wtr.write_header(b"rgb")?;
                wtr.write_array_start()?;
                wtr.write_u32(color.r)?;
                wtr.write_u32(color.g)?;
                wtr.write_u32(color.b)?;
                wtr.write_end()?;
            }
        }

        token_idx += 1;
    }

    let mut inner = wtr.into_inner();

    update_header(&mut inner, melter.header.clone());

    inner.push(b'\n');

    Ok(MeltedDocument {
        data: inner,
        unknown_tokens,
    })
}
