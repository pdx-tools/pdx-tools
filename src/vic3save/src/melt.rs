use crate::{
    file::Vic3Zip, flavor::Vic3Flavor, Encoding, SaveHeader, SaveHeaderKind, Vic3Error,
    Vic3ErrorKind,
};
use jomini::{
    binary::{BinaryFlavor, FailedResolveStrategy, Token, TokenReader, TokenResolver},
    common::PdsDate,
    TextWriterBuilder,
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

#[derive(Debug)]
enum MeltInput<'data> {
    Text(&'data [u8]),
    Binary(&'data [u8]),
    Zip(Vic3Zip<'data>),
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
}

#[derive(Debug, Clone, Copy)]
enum FormatKind {
    Inactive,
    F64EncodeAll,
}

#[derive(Debug, Default)]
struct Formatter {
    queued: Option<FormatKind>,
    depth: Vec<FormatKind>,
}

impl Formatter {
    #[inline]
    pub fn push(&mut self) {
        let next = match self.queued.take() {
            Some(x @ FormatKind::F64EncodeAll) => x,
            _ => FormatKind::Inactive,
        };

        self.depth.push(next);
    }

    #[inline]
    pub fn pop(&mut self) {
        let _ = self.depth.pop();
    }

    #[inline]
    pub fn take_scalar(&mut self) -> FormatKind {
        match self.queued.take() {
            Some(x) => x,
            None => self.depth.last().copied().unwrap_or(FormatKind::Inactive),
        }
    }

    #[inline]
    fn queue(&mut self, mode: FormatKind) {
        self.queued = Some(mode);
    }

    #[inline]
    fn clear_queued(&mut self) {
        self.queued = None;
    }
}

/// Convert a binary save to plaintext
pub struct Vic3Melter<'data> {
    input: MeltInput<'data>,
    header: SaveHeader,
    options: MeltOptions,
}

impl<'data> Vic3Melter<'data> {
    pub(crate) fn new_text(x: &'data [u8], header: SaveHeader) -> Self {
        Self {
            input: MeltInput::Text(x),
            options: MeltOptions::default(),
            header,
        }
    }

    pub(crate) fn new_binary(x: &'data [u8], header: SaveHeader) -> Self {
        Self {
            input: MeltInput::Binary(x),
            options: MeltOptions::default(),
            header,
        }
    }

    pub(crate) fn new_zip(x: Vic3Zip<'data>, header: SaveHeader) -> Self {
        Self {
            input: MeltInput::Zip(x),
            options: MeltOptions::default(),
            header,
        }
    }

    pub fn verbatim(&mut self, verbatim: bool) -> &mut Self {
        self.options.verbatim = verbatim;
        self
    }

    pub fn on_failed_resolve(&mut self, strategy: FailedResolveStrategy) -> &mut Self {
        self.options.on_failed_resolve = strategy;
        self
    }

    pub fn input_encoding(&self) -> Encoding {
        match &self.input {
            MeltInput::Text(_) => Encoding::Text,
            MeltInput::Binary(_) => Encoding::Binary,
            MeltInput::Zip(z) if z.is_text => Encoding::TextZip,
            MeltInput::Zip(_) => Encoding::BinaryZip,
        }
    }

    pub fn melt<Writer, R>(
        &mut self,
        mut output: Writer,
        resolver: &R,
    ) -> Result<MeltedDocument, Vic3Error>
    where
        Writer: Write,
        R: TokenResolver,
    {
        match &mut self.input {
            MeltInput::Text(x) => {
                self.header.write(&mut output)?;
                output.write_all(x)?;
                Ok(MeltedDocument::new())
            }
            MeltInput::Binary(x) => melt(x, output, resolver, self.options, self.header.clone()),
            MeltInput::Zip(zip) => {
                let file = zip.archive.retrieve_file(zip.gamestate);
                melt(
                    file.reader(),
                    &mut output,
                    resolver,
                    self.options,
                    self.header.clone(),
                )
            }
        }
    }
}

pub(crate) fn melt<Reader, Writer, Resolver>(
    input: Reader,
    mut output: Writer,
    resolver: Resolver,
    options: MeltOptions,
    mut header: SaveHeader,
) -> Result<MeltedDocument, Vic3Error>
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
) -> Result<(), Vic3Error>
where
    Reader: Read,
    Writer: Write,
    Resolver: TokenResolver,
{
    let flavor = Vic3Flavor::new();
    let mut known_number = false;
    let mut known_date = false;
    let mut quoted_buffer_enabled = false;
    let mut quoted_buffer: Vec<u8> = Vec::new();
    let mut formatter = Formatter::default();

    let mut has_read = false;
    while let Some(token) = reader.next()? {
        has_read = true;
        if quoted_buffer_enabled {
            if matches!(token, Token::Equal) {
                wtr.write_unquoted(&quoted_buffer)?;
            } else {
                wtr.write_quoted(&quoted_buffer)?;
            }
            quoted_buffer.clear();
            quoted_buffer_enabled = false;
        }

        match token {
            Token::Open => {
                formatter.push();
                wtr.write_start()?;
            }
            Token::Close => {
                formatter.pop();
                wtr.write_end()?;
                if header && wtr.depth() == 0 {
                    return Ok(());
                }
            }
            Token::I32(x) => {
                if known_number {
                    wtr.write_i32(x)?;
                    known_number = false;
                } else if known_date {
                    if let Some(date) = crate::Vic3Date::from_binary(x) {
                        wtr.write_date(date.game_fmt())?;
                    } else if options.on_failed_resolve != FailedResolveStrategy::Error {
                        wtr.write_i32(x)?;
                    } else {
                        return Err(Vic3Error::new(Vic3ErrorKind::InvalidDate(x)));
                    }
                    known_date = false;
                } else if let Some(date) = crate::Vic3Date::from_binary_heuristic(x) {
                    wtr.write_date(date.game_fmt())?;
                } else {
                    wtr.write_i32(x)?;
                }
            }
            Token::Quoted(x) => {
                if wtr.at_unknown_start() {
                    quoted_buffer_enabled = true;
                    quoted_buffer.extend_from_slice(x.as_bytes());
                } else if wtr.expecting_key() {
                    wtr.write_unquoted(x.as_bytes())?;
                } else {
                    wtr.write_quoted(x.as_bytes())?;
                }
            }
            Token::Unquoted(x) => {
                wtr.write_unquoted(x.as_bytes())?;
            }
            Token::F32(x) => wtr.write_f32(flavor.visit_f32(x))?,
            Token::F64(x) => {
                if !matches!(formatter.take_scalar(), FormatKind::F64EncodeAll) {
                    wtr.write_f64(flavor.visit_f64(x))?;
                } else {
                    wtr.write_f64((flavor.visit_f64(x) * 100_000.0).round())?;
                }
            }
            Token::Id(x) => match resolver.resolve(x) {
                Some(id) => {
                    if !options.verbatim && id == "is_ironman" && wtr.expecting_key() {
                        continue;
                    }

                    formatter.clear_queued();
                    known_number = id == "seed";
                    known_date = id == "real_date";
                    if matches!(
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
                            | "lower_strata_pops"
                            | "middle_strata_pops"
                            | "population_by_profession"
                            | "population_by_strata"
                            | "population_employable_qualifications"
                            | "population_government_workforce"
                            | "population_laborer_workforce"
                            | "population_lower_strata"
                            | "population_loyalists"
                            | "population_middle_strata"
                            | "population_military_workforce"
                            | "population_political_participants"
                            | "population_qualifications"
                            | "population_radicals"
                            | "population_salaried_workforce"
                            | "population_unemployed_workforce"
                            | "population_upper_strata"
                            | "population_workforce_by_profession"
                            | "salaried_working_adults"
                            | "trend_loyalists"
                            | "trend_population"
                            | "trend_population_lower_strata"
                            | "trend_population_middle_strata"
                            | "trend_population_upper_strata"
                            | "trend_radicals"
                            | "unemployed_working_adults"
                            | "upper_strata_pops"
                    ) {
                        formatter.queue(FormatKind::F64EncodeAll);
                    }
                    wtr.write_unquoted(id.as_bytes())?;
                }
                None => match options.on_failed_resolve {
                    FailedResolveStrategy::Error => {
                        return Err(Vic3ErrorKind::UnknownToken { token_id: x }.into());
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
                        write!(wtr, "__unknown_0x{:x}", x)?;
                    }
                },
            },
            Token::Equal => {
                if wtr.at_array_value() {
                    wtr.start_mixed_mode();
                }

                wtr.write_operator(jomini::text::Operator::Equal)?
            }
            Token::U32(x) => wtr.write_u32(x)?,
            Token::U64(x) => wtr.write_u64(x)?,
            Token::Bool(x) => wtr.write_bool(x)?,
            Token::Rgb(x) => wtr.write_rgb(&x)?,
            Token::I64(x) => wtr.write_i64(x)?,
        }
    }

    if has_read {
        wtr.inner().write_all(b"\n")?;
    }
    Ok(())
}
